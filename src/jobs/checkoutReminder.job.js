import { env } from "../config/env.js";
import Enrollment from "../models/Enrollment.js";
import Payment from "../models/Payment.js";
import WhatsAppMessageLog from "../models/WhatsAppMessageLog.js";
import { WHATSAPP_MESSAGE_TYPES } from "../constants/whatsapp.constants.js";
import { sendAbandonedCheckoutWhatsApp, retryDueWhatsAppMessages } from "../services/whatsappNotification.service.js";
import { validateAiwizchatConfig } from "../services/aiwizchat.service.js";

const SCAN_LIMIT = 25;

let timer = null;
let running = false;

const logEvent = (event, details = {}) => {
  console.log(JSON.stringify({ event, ...details }));
};

const getCutoffDate = () => new Date(Date.now() - env.checkoutAbandonedDelayMinutes * 60 * 1000);

const loadEligibleCandidates = async () => {
  return Payment.find({
    status: "PENDING",
    createdAt: { $lte: getCutoffDate() },
  })
    .populate("user course")
    .sort({ createdAt: 1 })
    .limit(SCAN_LIMIT);
};

export const runCheckoutReminderScan = async () => {
  if (!env.whatsappEnabled || running) {
    return { scanned: 0, sent: 0, skipped: 0 };
  }

  running = true;
  const startedAt = Date.now();
  let sent = 0;
  let skipped = 0;

  try {
    logEvent("checkoutReminder.scan.started");
    const candidates = await loadEligibleCandidates();
    const existingLogs = await WhatsAppMessageLog.find({
      type: WHATSAPP_MESSAGE_TYPES.CHECKOUT_ABANDONED,
      payment: { $in: candidates.map((payment) => payment._id) },
    }).select("payment");
    const loggedPaymentIds = new Set(existingLogs.map((log) => log.payment.toString()));
    const enrollments = await Enrollment.find({
      status: "ACTIVE",
      user: { $in: candidates.map((payment) => payment.user?._id).filter(Boolean) },
      course: { $in: candidates.map((payment) => payment.course?._id).filter(Boolean) },
    }).select("user course");
    const activeEnrollmentKeys = new Set(enrollments.map((enrollment) => `${enrollment.user.toString()}:${enrollment.course.toString()}`));

    for (const payment of candidates) {
      if (loggedPaymentIds.has(payment._id.toString())) {
        skipped += 1;
        continue;
      }

      const user = payment.user;
      const course = payment.course;

      if (!user || !course) {
        skipped += 1;
        continue;
      }

      if (activeEnrollmentKeys.has(`${user._id.toString()}:${course._id.toString()}`) || payment.status !== "PENDING") {
        skipped += 1;
        continue;
      }

      await sendAbandonedCheckoutWhatsApp({ payment, course, user });
      sent += 1;
    }

    await retryDueWhatsAppMessages({ limit: SCAN_LIMIT });

    logEvent("checkoutReminder.scan.completed", {
      scanned: candidates.length,
      sent,
      skipped,
      durationMs: Date.now() - startedAt,
    });

    return { scanned: candidates.length, sent, skipped };
  } catch (error) {
    logEvent("checkoutReminder.scan.failed", {
      errorMessage: error?.message || "Checkout reminder scan failed.",
      durationMs: Date.now() - startedAt,
    });
    return { scanned: 0, sent, skipped, error };
  } finally {
    running = false;
  }
};

export const startCheckoutReminderJob = () => {
  if (!env.whatsappEnabled) {
    logEvent("checkoutReminder.disabled");
    return { stop: () => {} };
  }

  const config = validateAiwizchatConfig();
  if (!config.valid) {
    logEvent("checkoutReminder.config_invalid", { missing: config.missing });
    return { stop: () => {} };
  }

  void runCheckoutReminderScan();
  timer = setInterval(() => {
    void runCheckoutReminderScan();
  }, env.checkoutReminderScanIntervalMs);

  timer.unref?.();
  logEvent("checkoutReminder.started", {
    intervalMs: env.checkoutReminderScanIntervalMs,
    abandonedDelayMinutes: env.checkoutAbandonedDelayMinutes,
  });

  return {
    stop: () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
};
