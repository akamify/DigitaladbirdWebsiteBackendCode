import Enrollment from "../models/Enrollment.js";
import Payment from "../models/Payment.js";
import User from "../models/User.js";
import Course from "../models/Course.js";
import WhatsAppMessageLog from "../models/WhatsAppMessageLog.js";
import { env } from "../config/env.js";
import {
  WHATSAPP_MESSAGE_STATUSES,
  WHATSAPP_MESSAGE_TYPES,
  WHATSAPP_PROVIDER,
} from "../constants/whatsapp.constants.js";
import { maskPhone, normalizePhone } from "../utils/phone.js";
import { amountLabel, createAuditLog } from "./core.service.js";
import { sendCampaignMessage, validateAiwizchatConfig } from "./aiwizchat.service.js";

const CIRCUIT_FAILURE_LIMIT = 5;
const CIRCUIT_OPEN_MS = 5 * 60 * 1000;

let providerFailureCount = 0;
let circuitOpenUntil = 0;

const logEvent = (event, details = {}) => {
  console.log(JSON.stringify({ event, provider: WHATSAPP_PROVIDER, ...details }));
};

const getBackoffDate = (attempts) => {
  const delayMs = Math.min(60 * 60 * 1000, 60000 * 2 ** Math.max(attempts - 1, 0));
  return new Date(Date.now() + delayMs);
};

const recordProviderFailure = () => {
  providerFailureCount += 1;
  if (providerFailureCount >= CIRCUIT_FAILURE_LIMIT) {
    circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS;
    providerFailureCount = 0;
    logEvent("whatsapp.circuit.opened", { openUntil: new Date(circuitOpenUntil).toISOString() });
  }
};

const recordProviderSuccess = () => {
  providerFailureCount = 0;
  circuitOpenUntil = 0;
};

const isCircuitOpen = () => Date.now() < circuitOpenUntil;

const createSkippedLog = async ({ payment, course, user, type, reason, errorCode = "SKIPPED" }) => {
  const log = await WhatsAppMessageLog.findOneAndUpdate(
    { payment: payment._id, type },
    {
      $setOnInsert: {
        user: user._id,
        course: course._id,
        payment: payment._id,
        type,
        provider: WHATSAPP_PROVIDER,
        status: WHATSAPP_MESSAGE_STATUSES.SKIPPED,
        phone: user.phoneNormalized || null,
        errorCode,
        errorMessage: reason,
        skippedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await createAuditLog({
    actor: user,
    action: "whatsapp.send.skipped",
    entityType: "payment",
    entityId: payment._id.toString(),
    details: { type, reason, phone: maskPhone(user.phoneNormalized) },
  });

  logEvent("whatsapp.message.skipped", {
    paymentId: payment._id.toString(),
    userId: user._id.toString(),
    courseId: course._id.toString(),
    messageLogId: log._id.toString(),
    type,
    reason,
  });

  return log;
};

const getCampaignConfig = (type) => {
  if (type === WHATSAPP_MESSAGE_TYPES.PURCHASE_SUCCESS) {
    return {
      campaignName: env.aiwizchatPurchaseCampaignName,
    };
  }

  return {
    campaignName: env.aiwizchatAbandonedCampaignName,
  };
};

const buildVariables = ({ type, payment, course, user }) => {
  if (type === WHATSAPP_MESSAGE_TYPES.PURCHASE_SUCCESS) {
    return [
      user.name || "Student",
      course.title,
      payment.orderNumber,
      amountLabel(payment.totalAmount, payment.currency),
      `${env.clientUrl}/dashboard`,
    ];
  }

  return [
    user.name || "Student",
    course.title,
    payment.orderNumber,
    amountLabel(payment.totalAmount, payment.currency),
    `${env.clientUrl}/courses/${course.slug}/checkout`,
  ];
};

const createOrLoadLog = async ({ payment, course, user, type, phone, campaignName, variables }) => {
  try {
    return await WhatsAppMessageLog.findOneAndUpdate(
      { payment: payment._id, type },
      {
        $setOnInsert: {
          user: user._id,
          course: course._id,
          payment: payment._id,
          type,
          provider: WHATSAPP_PROVIDER,
          status: WHATSAPP_MESSAGE_STATUSES.PENDING,
          phone,
          campaignName,
          payloadSummary: {
            variableCount: variables.length,
            phone: maskPhone(phone),
          },
          nextAttemptAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (error?.code === 11000) {
      return WhatsAppMessageLog.findOne({ payment: payment._id, type });
    }
    throw error;
  }
};

export const sendPaymentWhatsAppNotification = async ({ payment, course, user, type }) => {
  if (!env.whatsappEnabled) {
    return { skipped: true, reason: "WhatsApp automation is disabled." };
  }

  const config = validateAiwizchatConfig();
  if (!config.valid) {
    return createSkippedLog({ payment, course, user, type, reason: config.message, errorCode: "AIWIZCHAT_CONFIG_MISSING" });
  }

  const phone = normalizePhone(user.phoneNormalized || user.phone);
  if (!phone) {
    return createSkippedLog({ payment, course, user, type, reason: "User has no valid WhatsApp phone number.", errorCode: "INVALID_PHONE" });
  }

  const { campaignName } = getCampaignConfig(type);
  const variables = buildVariables({ type, payment, course, user });
  const log = await createOrLoadLog({ payment, course, user, type, phone, campaignName, variables });

  if (!log || [WHATSAPP_MESSAGE_STATUSES.SENT, WHATSAPP_MESSAGE_STATUSES.DEAD, WHATSAPP_MESSAGE_STATUSES.SKIPPED].includes(log.status)) {
    return log;
  }

  if (isCircuitOpen()) {
    log.status = WHATSAPP_MESSAGE_STATUSES.FAILED;
    log.errorCode = "AIWIZCHAT_CIRCUIT_OPEN";
    log.errorMessage = "AiWizChat circuit breaker is temporarily open.";
    log.nextAttemptAt = new Date(circuitOpenUntil);
    await log.save();
    return log;
  }

  const claimed = await WhatsAppMessageLog.findOneAndUpdate(
    {
      _id: log._id,
      status: { $in: [WHATSAPP_MESSAGE_STATUSES.PENDING, WHATSAPP_MESSAGE_STATUSES.FAILED] },
      $or: [{ nextAttemptAt: { $lte: new Date() } }, { nextAttemptAt: null }],
    },
    {
      $set: {
        status: WHATSAPP_MESSAGE_STATUSES.SENDING,
        claimedAt: new Date(),
        errorCode: null,
        errorMessage: null,
      },
      $inc: { attempts: 1 },
    },
    { new: true },
  );

  if (!claimed) {
    return log;
  }

  logEvent("whatsapp.message.claimed", {
    paymentId: payment._id.toString(),
    userId: user._id.toString(),
    courseId: course._id.toString(),
    messageLogId: claimed._id.toString(),
    type,
  });

  const result = await sendCampaignMessage({
    to: phone,
    campaignName,
    variables,
    correlation: {
      paymentId: payment._id.toString(),
      userId: user._id.toString(),
      courseId: course._id.toString(),
      messageLogId: claimed._id.toString(),
      type,
    },
  });

  if (result.ok) {
    recordProviderSuccess();
    claimed.status = WHATSAPP_MESSAGE_STATUSES.SENT;
    claimed.providerMessageId = result.providerMessageId;
    claimed.providerStatus = result.providerStatus;
    claimed.sentAt = new Date();
    claimed.nextAttemptAt = null;
    await claimed.save();

    await createAuditLog({
      actor: user,
      action: type === WHATSAPP_MESSAGE_TYPES.PURCHASE_SUCCESS ? "whatsapp.purchase.sent" : "whatsapp.abandoned.sent",
      entityType: "payment",
      entityId: payment._id.toString(),
      details: { type, providerMessageId: result.providerMessageId, providerStatus: result.providerStatus, phone: maskPhone(phone) },
    });

    logEvent("whatsapp.message.sent", {
      paymentId: payment._id.toString(),
      userId: user._id.toString(),
      courseId: course._id.toString(),
      messageLogId: claimed._id.toString(),
      providerMessageId: result.providerMessageId,
      providerStatus: result.providerStatus,
      type,
    });

    return claimed;
  }

  if (result.retryable) {
    recordProviderFailure();
  }

  const exhausted = !result.retryable || claimed.attempts >= env.whatsappMaxAttempts;
  claimed.status = exhausted ? WHATSAPP_MESSAGE_STATUSES.DEAD : WHATSAPP_MESSAGE_STATUSES.FAILED;
  claimed.errorCode = result.errorCode;
  claimed.errorMessage = result.errorMessage;
  claimed.nextAttemptAt = exhausted ? null : getBackoffDate(claimed.attempts);
  await claimed.save();

  await createAuditLog({
    actor: user,
    action: "whatsapp.send.failed",
    entityType: "payment",
    entityId: payment._id.toString(),
    details: {
      type,
      status: claimed.status,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      phone: maskPhone(phone),
    },
  });

  logEvent(exhausted ? "whatsapp.message.dead" : "whatsapp.message.failed", {
    paymentId: payment._id.toString(),
    userId: user._id.toString(),
    courseId: course._id.toString(),
    messageLogId: claimed._id.toString(),
    type,
    errorCode: result.errorCode,
  });

  return claimed;
};

export const sendPurchaseSuccessWhatsApp = async ({ payment, course, user }) =>
  sendPaymentWhatsAppNotification({
    payment,
    course,
    user,
    type: WHATSAPP_MESSAGE_TYPES.PURCHASE_SUCCESS,
  });

export const sendAbandonedCheckoutWhatsApp = async ({ payment, course, user }) => {
  const existingEnrollment = await Enrollment.findOne({
    user: user._id,
    course: course._id,
    status: "ACTIVE",
  });

  if (existingEnrollment || payment.status !== "PENDING") {
    return { skipped: true, reason: "Payment is no longer abandoned." };
  }

  return sendPaymentWhatsAppNotification({
    payment,
    course,
    user,
    type: WHATSAPP_MESSAGE_TYPES.CHECKOUT_ABANDONED,
  });
};

export const retryDueWhatsAppMessages = async ({ limit = 25 } = {}) => {
  if (!env.whatsappEnabled) {
    return { scanned: 0 };
  }

  const logs = await WhatsAppMessageLog.find({
    status: WHATSAPP_MESSAGE_STATUSES.FAILED,
    nextAttemptAt: { $lte: new Date() },
    attempts: { $lt: env.whatsappMaxAttempts },
  })
    .sort({ nextAttemptAt: 1 })
    .limit(limit);

  const [payments, courses, users] = await Promise.all([
    Payment.find({ _id: { $in: logs.map((log) => log.payment) } }),
    Course.find({ _id: { $in: logs.map((log) => log.course) } }),
    User.find({ _id: { $in: logs.map((log) => log.user) } }),
  ]);

  const paymentsById = new Map(payments.map((payment) => [payment._id.toString(), payment]));
  const coursesById = new Map(courses.map((course) => [course._id.toString(), course]));
  const usersById = new Map(users.map((user) => [user._id.toString(), user]));

  for (const log of logs) {
    const payment = paymentsById.get(log.payment.toString());
    const course = coursesById.get(log.course.toString());
    const user = usersById.get(log.user.toString());

    if (payment && course && user) {
      await sendPaymentWhatsAppNotification({ payment, course, user, type: log.type });
    }
  }

  return { scanned: logs.length };
};
