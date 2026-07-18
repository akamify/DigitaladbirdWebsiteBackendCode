import Payment from "../models/Payment.js";
import { buildInvoicePdf } from "../utils/invoice.js";
import AppError from "../utils/appError.js";
import * as paymentService from "../services/payment.service.js";

export const createOrder = async (req, res) => {
  res.status(201).json(await paymentService.createPaymentOrder({ slug: req.params.slug, payload: req.body, user: req.user }));
};

export const verifyPayment = async (req, res) => {
  res.json(await paymentService.verifyPayment({ payload: req.body, user: req.user }));
};

export const paymentStatus = async (req, res) => {
  res.json(await paymentService.getPaymentById({ paymentId: req.params.paymentId, userId: req.user._id, role: req.user.role }));
};

export const invoice = async (req, res) => {
  const { payment } = await paymentService.getPaymentById({ paymentId: req.params.paymentId, userId: req.user._id, role: req.user.role });

  if (payment.status !== "PAID") {
    throw new AppError(400, "Invoice is available after successful payment.");
  }

  const pdf = await buildInvoicePdf({
    payment,
    course: payment.course,
    user: payment.user,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${payment.invoiceNumber}.pdf"`);
  res.send(pdf);
};

export const webhook = async (req, res) => {
  res.json(await paymentService.handleRazorpayWebhook({ signature: req.headers["x-razorpay-signature"], rawBody: req.body }));
};

