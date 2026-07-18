import crypto from "node:crypto";
import Course from "../models/Course.js";
import Coupon from "../models/Coupon.js";
import Enrollment from "../models/Enrollment.js";
import Payment from "../models/Payment.js";
import User from "../models/User.js";
import { razorpay } from "../config/razorpay.js";
import { env } from "../config/env.js";
import AppError from "../utils/appError.js";
import { buildEnrollmentEmail, sendEmail } from "../utils/email.js";
import { buildCourseSummary, createAuditLog, createNotification, loadCouponByCode, validateCouponForCourse } from "./core.service.js";
import { amountLabel } from "./core.service.js";
import { buildInvoiceNumber, buildOrderNumber, matchesPublishedState } from "../utils/common.js";

const markEnrollmentPaid = async ({ payment, course, user }) => {
  const enrollment = await Enrollment.findOneAndUpdate(
    {
      user: user._id,
      course: course._id,
    },
    {
      $set: {
        payment: payment._id,
        status: "ACTIVE",
        type: "PAID",
        pricePaid: payment.totalAmount,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );

  if (payment.coupon) {
    await Coupon.findByIdAndUpdate(payment.coupon, {
      $inc: { usageCount: 1 },
    });
  }

  await createNotification({
    user: user._id,
    type: "PAYMENT_SUCCESS",
    title: "Payment successful",
    message: `Your access to ${course.title} is now unlocked.`,
    actionUrl: "/dashboard",
  });

  await createAuditLog({
    actor: user,
    action: "payment.completed",
    entityType: "payment",
    entityId: payment._id.toString(),
    details: {
      courseId: course._id.toString(),
      transactionReference: payment.transactionReference,
      totalAmount: payment.totalAmount,
    },
  });

  await sendEmail({
    to: user.email,
    ...buildEnrollmentEmail({
      name: user.name,
      courseTitle: course.title,
      dashboardUrl: `${env.clientUrl}/dashboard`,
      amountLabel: amountLabel(payment.totalAmount, payment.currency),
    }),
  });

  return enrollment;
};

export const previewCheckout = async ({ slug, couponCode, user }) => {
  const course = await Course.findOne({ slug });

  if (!course || !matchesPublishedState(course)) {
    throw new AppError(404, "Course not found.");
  }

  if (course.accessType !== "PAID") {
    throw new AppError(400, "This course is free and does not need checkout.");
  }

  const enrollment = await Enrollment.findOne({
    user: user._id,
    course: course._id,
  });

  if (enrollment?.status === "ACTIVE") {
    throw new AppError(400, "You already have access to this course.");
  }

  let coupon = null;
  let discountAmount = 0;

  if (couponCode) {
    coupon = await loadCouponByCode(couponCode);
    const validation = validateCouponForCourse({
      coupon,
      course,
      subtotalAmount: course.price.amount,
    });

    if (!validation.valid) {
      throw new AppError(400, validation.reason);
    }

    discountAmount = validation.discountAmount;
  }

  return {
    course: buildCourseSummary({ course, enrollment, user }),
    pricing: {
      subtotalAmount: course.price.amount,
      discountAmount,
      totalAmount: Math.max(course.price.amount - discountAmount, 0),
      currency: course.price.currency,
    },
    coupon: coupon
      ? {
          id: coupon._id,
          code: coupon.code,
          type: coupon.type,
          amount: coupon.amount,
        }
      : null,
  };
};

export const createPaymentOrder = async ({ slug, payload, user }) => {
  const preview = await previewCheckout({
    slug,
    couponCode: payload.couponCode,
    user,
  });

  const course = await Course.findOne({ slug });
  const coupon = payload.couponCode ? await loadCouponByCode(payload.couponCode) : null;

  const payment = await Payment.create({
    user: user._id,
    course: course._id,
    coupon: coupon?._id || null,
    orderNumber: buildOrderNumber(),
    invoiceNumber: buildInvoiceNumber(),
    provider: "RAZORPAY",
    status: "PENDING",
    currency: preview.pricing.currency,
    subtotalAmount: preview.pricing.subtotalAmount,
    discountAmount: preview.pricing.discountAmount,
    totalAmount: preview.pricing.totalAmount,
    couponCode: coupon?.code || null,
    notes: payload.notes || {},
  });

  if (preview.pricing.totalAmount === 0) {
    payment.status = "PAID";
    payment.transactionReference = `FREE-${Date.now()}`;
    await payment.save();
    await markEnrollmentPaid({ payment, course, user });

    return {
      paymentId: payment._id,
      orderId: null,
      keyId: null,
      amount: 0,
      currency: preview.pricing.currency,
      course: buildCourseSummary({ course, enrollment: null, user }),
      pricing: preview.pricing,
      instantAccess: true,
    };
  }

  if (!razorpay) {
    throw new AppError(500, "Razorpay is not configured yet. Add your Razorpay keys to continue.");
  }

  const order = await razorpay.orders.create({
    amount: preview.pricing.totalAmount,
    currency: preview.pricing.currency,
    receipt: payment.orderNumber,
    notes: {
      paymentRecordId: payment._id.toString(),
      courseId: course._id.toString(),
      userId: user._id.toString(),
      courseSlug: course.slug,
    },
  });

  payment.razorpayOrderId = order.id;
  await payment.save();

  return {
    paymentId: payment._id,
    orderId: order.id,
    keyId: env.razorpayKeyId,
    amount: order.amount,
    currency: order.currency,
    course: buildCourseSummary({ course, enrollment: null, user }),
    pricing: preview.pricing,
  };
};

export const verifyPayment = async ({ payload, user }) => {
  const payment = await Payment.findOne({
    _id: payload.paymentId,
    user: user._id,
  });

  if (!payment) {
    throw new AppError(404, "Payment not found.");
  }

  if (!payment.razorpayOrderId || payment.razorpayOrderId !== payload.razorpayOrderId) {
    throw new AppError(400, "Order reference mismatch.");
  }

  if (payment.status === "PAID") {
    return {
      message: "Payment already verified.",
      payment,
    };
  }

  const generatedSignature = crypto
    .createHmac("sha256", env.razorpayKeySecret)
    .update(`${payload.razorpayOrderId}|${payload.razorpayPaymentId}`)
    .digest("hex");

  if (generatedSignature !== payload.razorpaySignature) {
    throw new AppError(400, "Invalid payment signature.");
  }

  payment.status = "PAID";
  payment.transactionReference = payload.razorpayPaymentId;
  payment.razorpayPaymentId = payload.razorpayPaymentId;
  payment.razorpaySignature = payload.razorpaySignature;
  await payment.save();

  const [course, fullUser] = await Promise.all([Course.findById(payment.course), User.findById(payment.user)]);
  await markEnrollmentPaid({ payment, course, user: fullUser });

  return {
    message: "Payment verified successfully.",
    payment,
  };
};

export const getPaymentById = async ({ paymentId, userId, role }) => {
  const query = { _id: paymentId };

  if (!["SUPER_ADMIN", "ADMIN", "INSTRUCTOR"].includes(role)) {
    query.user = userId;
  }

  const payment = await Payment.findOne(query).populate("course user");

  if (!payment) {
    throw new AppError(404, "Payment not found.");
  }

  return { payment };
};

export const handleRazorpayWebhook = async ({ signature, rawBody }) => {
  if (!env.razorpayWebhookSecret) {
    return { received: true, mode: "disabled" };
  }

  const expectedSignature = crypto.createHmac("sha256", env.razorpayWebhookSecret).update(rawBody).digest("hex");

  if (expectedSignature !== signature) {
    throw new AppError(400, "Invalid Razorpay webhook signature.");
  }

  const event = JSON.parse(rawBody.toString("utf8"));
  const paymentEntity = event.payload?.payment?.entity;

  if (paymentEntity?.order_id) {
    const payment = await Payment.findOne({ razorpayOrderId: paymentEntity.order_id });

    if (payment && event.event === "payment.failed") {
      payment.status = "FAILED";
      payment.failureReason = paymentEntity.error_description || "Payment failed";
      await payment.save();
    }

    if (payment && event.event === "payment.captured" && payment.status !== "PAID") {
      payment.status = "PAID";
      payment.transactionReference = paymentEntity.id;
      payment.razorpayPaymentId = paymentEntity.id;
      await payment.save();

      const [course, user] = await Promise.all([Course.findById(payment.course), User.findById(payment.user)]);
      await markEnrollmentPaid({ payment, course, user });
    }
  }

  return { received: true };
};
