import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import PricingCheckout from "../models/PricingCheckout.js";
import User from "../models/User.js";
import { env } from "../config/env.js";
import AppError from "../utils/appError.js";
import { maskPhone, normalizePhone } from "../utils/phone.js";
import { signAccessToken } from "../utils/jwt.js";
import { sendEmail } from "../utils/email.js";
import { createAuditLog, randomToken } from "./core.service.js";
import { sendCampaignMessage, validateAiwizchatTransportConfig } from "./aiwizchat.service.js";

const OTP_TTL_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;
const INTERNAL_WHATSAPP_EMAIL_DOMAIN = "whatsapp.local";

const hashOtp = (otp, checkoutId) =>
  crypto.createHash("sha256").update(`${checkoutId}:${otp}:${env.jwtSecret}`).digest("hex");

const maskError = (message = "") => message.replace(/\+?\d[\d\s-]{7,}\d/g, "[phone]");

const serializeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  avatarUrl: user.avatarUrl,
  bio: user.bio,
  createdAt: user.createdAt,
});

const serializeCheckout = (checkout) => ({
  id: checkout._id,
  user: checkout.user || null,
  planSnapshot: checkout.planSnapshot,
  selectedDuration: checkout.selectedDuration || "",
  selectedAddons: checkout.selectedAddons || [],
  estimatedAmount: checkout.estimatedAmount || 0,
  currency: checkout.currency || "INR",
  fullName: checkout.fullName || "",
  brandName: checkout.brandName || "",
  city: checkout.city || "",
  email: checkout.email || "",
  whatsappNumber: checkout.whatsappNumber || "",
  callNumber: checkout.callNumber || "",
  gstRegistered: Boolean(checkout.gstRegistered),
  gstNumber: checkout.gstNumber || "",
  aboutBusiness: checkout.aboutBusiness || "",
  requirementNotes: checkout.requirementNotes || "",
  status: checkout.status,
  lastStep: checkout.lastStep,
  resumeToken: checkout.resumeToken,
  emailVerified: Boolean(checkout.emailVerifiedAt),
  emailVerifiedAt: checkout.emailVerifiedAt || null,
  whatsappVerified: Boolean(checkout.whatsappVerifiedAt),
  whatsappVerifiedAt: checkout.whatsappVerifiedAt || null,
  submittedAt: checkout.submittedAt || null,
});

const refreshVerificationStatus = (checkout) => {
  if (checkout.status === "SUBMITTED" || checkout.status === "ABANDONED") {
    return;
  }
  if (checkout.emailVerifiedAt && checkout.whatsappVerifiedAt) {
    checkout.status = "READY";
    return;
  }
  if (checkout.whatsappVerifiedAt) {
    checkout.status = "WHATSAPP_VERIFIED";
    return;
  }
  if (checkout.emailVerifiedAt) {
    checkout.status = "EMAIL_VERIFIED";
    return;
  }
  if (checkout.fullName || checkout.email || checkout.whatsappNumberNormalized) {
    checkout.status = "DETAILS_STARTED";
  }
};

const loadCheckout = async (checkoutId) => {
  const checkout = await PricingCheckout.findById(checkoutId);
  if (!checkout) {
    throw new AppError(404, "Pricing checkout not found.");
  }
  return checkout;
};

const formatAmount = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.round((amount || 0) / 100));

const sendPricingCampaign = async ({ checkout, campaignName, variables, event }) => {
  const phone = normalizePhone(checkout.whatsappNumberNormalized || checkout.whatsappNumber);
  if (!phone) {
    return { ok: false, skipped: true, reason: "No valid WhatsApp number." };
  }

  const result = await sendCampaignMessage({
    to: phone,
    campaignName,
    variables,
    correlation: {
      event,
      pricingCheckoutId: checkout._id.toString(),
      phone: maskPhone(phone),
    },
  });

  if (!result.ok) {
    console.log(
      JSON.stringify({
        event: "pricingCheckout.whatsapp.failed",
        pricingCheckoutId: checkout._id.toString(),
        errorCode: result.errorCode,
        errorMessage: maskError(result.errorMessage),
      }),
    );
  }

  return result;
};

const maybeAttachUserDetails = async (checkout, user) => {
  if (!user) {
    return;
  }

  checkout.user = user._id;
  if (!checkout.fullName && user.name) {
    checkout.fullName = user.name;
  }
  if (!checkout.email && !user.email.endsWith(`@${INTERNAL_WHATSAPP_EMAIL_DOMAIN}`)) {
    checkout.email = user.email;
    checkout.emailVerifiedAt = checkout.emailVerifiedAt || new Date();
  }
  if (!checkout.whatsappNumber && user.phone) {
    checkout.whatsappNumber = user.phone;
    checkout.whatsappNumberNormalized = user.phoneNormalized || normalizePhone(user.phone);
    checkout.whatsappVerifiedAt = checkout.whatsappVerifiedAt || new Date();
  }
  refreshVerificationStatus(checkout);
};

export const startCheckout = async ({ payload, user }) => {
  if (payload.resumeToken) {
    const existing = await PricingCheckout.findOne({ resumeToken: payload.resumeToken });
    if (existing) {
      await maybeAttachUserDetails(existing, user);
      await existing.save();
      return { checkout: serializeCheckout(existing) };
    }
  }

  if (!payload.planSnapshot) {
    throw new AppError(400, "Plan details are required.");
  }

  const checkout = new PricingCheckout({
    user: user?._id || null,
    planSnapshot: payload.planSnapshot,
    selectedDuration: payload.selectedDuration || "",
    selectedAddons: payload.selectedAddons || [],
    estimatedAmount: payload.estimatedAmount || 0,
    resumeToken: randomToken(),
    status: "STARTED",
    lastStep: "PLAN",
  });

  await maybeAttachUserDetails(checkout, user);
  await checkout.save();

  return { checkout: serializeCheckout(checkout) };
};

export const resumeCheckout = async (resumeToken) => {
  const checkout = await PricingCheckout.findOne({ resumeToken });
  if (!checkout) {
    throw new AppError(404, "Pricing checkout not found.");
  }
  return { checkout: serializeCheckout(checkout) };
};

export const updateSelection = async ({ checkoutId, payload, user }) => {
  const checkout = await loadCheckout(checkoutId);
  await maybeAttachUserDetails(checkout, user);
  checkout.selectedDuration = payload.selectedDuration;
  checkout.selectedAddons = payload.selectedAddons || [];
  checkout.estimatedAmount = payload.estimatedAmount || 0;
  checkout.lastStep = "ADDONS";
  if (checkout.status === "STARTED") {
    checkout.status = "DETAILS_STARTED";
  }
  await checkout.save();
  return { checkout: serializeCheckout(checkout) };
};

export const updateDetails = async ({ checkoutId, payload, user }) => {
  const checkout = await loadCheckout(checkoutId);
  const whatsappNumberNormalized = normalizePhone(payload.whatsappNumber);
  const callNumber = payload.callNumber || payload.whatsappNumber;
  const callNumberNormalized = normalizePhone(callNumber);

  if (!whatsappNumberNormalized) {
    throw new AppError(400, "Enter a valid WhatsApp number.");
  }
  if (!callNumberNormalized) {
    throw new AppError(400, "Enter a valid phone number.");
  }

  await maybeAttachUserDetails(checkout, user);
  const nextEmail = payload.email.toLowerCase();
  if (checkout.email && checkout.email !== nextEmail) {
    checkout.emailVerifiedAt = undefined;
    checkout.emailOtpHash = undefined;
    checkout.emailOtpExpiresAt = undefined;
  }
  if (checkout.whatsappNumberNormalized && checkout.whatsappNumberNormalized !== whatsappNumberNormalized) {
    checkout.whatsappVerifiedAt = undefined;
    checkout.otpHash = undefined;
    checkout.otpExpiresAt = undefined;
  }
  checkout.fullName = payload.fullName;
  checkout.brandName = payload.brandName;
  checkout.city = payload.city;
  checkout.email = nextEmail;
  checkout.whatsappNumber = payload.whatsappNumber;
  checkout.whatsappNumberNormalized = whatsappNumberNormalized;
  checkout.callNumber = callNumber;
  checkout.callNumberNormalized = callNumberNormalized;
  checkout.gstRegistered = payload.gstRegistered;
  checkout.gstNumber = payload.gstRegistered ? payload.gstNumber || "" : "";
  checkout.aboutBusiness = payload.aboutBusiness;
  checkout.requirementNotes = payload.requirementNotes || "";
  refreshVerificationStatus(checkout);
  checkout.lastStep = "DETAILS";
  await checkout.save();

  if (checkout.user) {
    const existingEmailUser = await User.findOne({ email: checkout.email, _id: { $ne: checkout.user } });
    const update = {
      name: checkout.fullName,
    };
    const linkedUser = await User.findById(checkout.user);
    if (linkedUser && linkedUser.email.endsWith(`@${INTERNAL_WHATSAPP_EMAIL_DOMAIN}`) && !existingEmailUser) {
      update.email = checkout.email;
    }
    await User.findByIdAndUpdate(checkout.user, { $set: update });
  }

  return { checkout: serializeCheckout(checkout) };
};

export const sendEmailOtp = async ({ checkoutId, payload, user }) => {
  const checkout = await loadCheckout(checkoutId);
  await maybeAttachUserDetails(checkout, user);

  const otp = String(crypto.randomInt(100000, 1000000));
  checkout.email = payload.email.toLowerCase();
  checkout.fullName = checkout.fullName || payload.fullName || "Customer";
  checkout.emailOtpHash = hashOtp(otp, checkout._id.toString());
  checkout.emailOtpExpiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  checkout.emailOtpAttempts = 0;
  checkout.emailOtpSentAt = new Date();
  checkout.lastStep = "DETAILS";
  refreshVerificationStatus(checkout);
  await checkout.save();

  await sendEmail({
    to: checkout.email,
    subject: "Verify your Digital AdBird checkout email",
    text: `Hi ${checkout.fullName || "Customer"},\n\nYour Digital AdBird checkout OTP is ${otp}. It expires in ${OTP_TTL_MINUTES} minutes.`,
  });

  return {
    checkout: serializeCheckout(checkout),
    message: "OTP sent on email.",
    ...(env.nodeEnv === "production" ? {} : { devOtp: otp }),
  };
};

export const sendWhatsappOtp = async ({ checkoutId, payload, user }) => {
  const checkout = await loadCheckout(checkoutId);
  const phone = normalizePhone(payload.whatsappNumber);
  if (!phone) {
    throw new AppError(400, "Enter a valid WhatsApp number.");
  }

  const config = validateAiwizchatTransportConfig();
  if (!config.valid) {
    throw new AppError(503, config.message);
  }
  const campaignName = env.aiwizchatPricingAuthCampaignName || env.aiwizchatPricingOtpCampaignName;
  if (!campaignName) {
    throw new AppError(500, "AiWizChat pricing authentication campaign is not configured.");
  }

  await maybeAttachUserDetails(checkout, user);
  const otp = String(crypto.randomInt(100000, 1000000));
  checkout.whatsappNumber = payload.whatsappNumber;
  checkout.whatsappNumberNormalized = phone;
  checkout.otpHash = hashOtp(otp, checkout._id.toString());
  checkout.otpExpiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  checkout.otpAttempts = 0;
  checkout.otpSentAt = new Date();
  checkout.lastStep = "VERIFY";
  await checkout.save();

  const result = await sendPricingCampaign({
    checkout,
    campaignName,
    variables: [payload.fullName || checkout.fullName || "Customer", otp, String(OTP_TTL_MINUTES)],
    event: "pricingCheckout.otp",
  });

  if (!result.ok) {
    throw new AppError(result.retryable ? 503 : 400, result.errorMessage || "Unable to send WhatsApp OTP.");
  }

  return {
    checkout: serializeCheckout(checkout),
    message: "OTP sent on WhatsApp.",
    ...(env.nodeEnv === "production" ? {} : { devOtp: otp }),
  };
};

const loadOrCreateEmailUser = async ({ checkout, user }) => {
  if (user) {
    if (user.email !== checkout.email) {
      const existingEmailUser = await User.findOne({ email: checkout.email, _id: { $ne: user._id } });
      if (!existingEmailUser && user.email.endsWith(`@${INTERNAL_WHATSAPP_EMAIL_DOMAIN}`)) {
        user.email = checkout.email;
        await user.save();
      }
    }
    return user;
  }

  let linkedUser = await User.findOne({ email: checkout.email });
  if (!linkedUser) {
    linkedUser = await User.create({
      name: checkout.fullName || "Email User",
      email: checkout.email,
      phone: checkout.whatsappNumber || undefined,
      phoneNormalized: checkout.whatsappNumberNormalized || undefined,
      password: await bcrypt.hash(randomToken(), 10),
    });
  }
  return linkedUser;
};

export const verifyEmailOtp = async ({ checkoutId, payload, user }) => {
  const checkout = await loadCheckout(checkoutId);

  if (!checkout.emailOtpHash || !checkout.emailOtpExpiresAt || checkout.emailOtpExpiresAt < new Date()) {
    throw new AppError(400, "Email OTP expired. Please request a new OTP.");
  }
  if (checkout.emailOtpAttempts >= MAX_OTP_ATTEMPTS) {
    throw new AppError(429, "Too many email OTP attempts. Please request a new OTP.");
  }

  const otpHash = hashOtp(payload.otp, checkout._id.toString());
  if (otpHash !== checkout.emailOtpHash) {
    checkout.emailOtpAttempts += 1;
    await checkout.save();
    throw new AppError(400, "Invalid email OTP.");
  }

  const linkedUser = await loadOrCreateEmailUser({ checkout, user });
  if (!linkedUser.isActive) {
    throw new AppError(403, "Your account has been disabled.");
  }

  checkout.user = linkedUser._id;
  checkout.emailVerifiedAt = new Date();
  checkout.emailOtpHash = undefined;
  checkout.emailOtpExpiresAt = undefined;
  refreshVerificationStatus(checkout);
  await checkout.save();

  await createAuditLog({
    actor: linkedUser,
    action: "pricing_checkout.email_verified",
    entityType: "pricing_checkout",
    entityId: checkout._id.toString(),
    details: { email: checkout.email, planName: checkout.planSnapshot?.planName },
  });

  return {
    checkout: serializeCheckout(checkout),
    token: signAccessToken(linkedUser),
    user: serializeUser(linkedUser),
  };
};

export const validateWhatsappNumber = (payload) => {
  const phone = normalizePhone(payload.whatsappNumber);
  if (!phone) {
    throw new AppError(400, "Enter a valid WhatsApp number.");
  }

  return {
    valid: true,
    normalized: phone,
    masked: maskPhone(phone),
    verificationMethod: "OTP",
  };
};

export const verifyWhatsappOtp = async ({ checkoutId, payload, user }) => {
  const checkout = await loadCheckout(checkoutId);

  if (!checkout.otpHash || !checkout.otpExpiresAt || checkout.otpExpiresAt < new Date()) {
    throw new AppError(400, "OTP expired. Please request a new OTP.");
  }
  if (checkout.otpAttempts >= MAX_OTP_ATTEMPTS) {
    throw new AppError(429, "Too many OTP attempts. Please request a new OTP.");
  }

  const otpHash = hashOtp(payload.otp, checkout._id.toString());
  if (otpHash !== checkout.otpHash) {
    checkout.otpAttempts += 1;
    await checkout.save();
    throw new AppError(400, "Invalid OTP.");
  }

  const phone = checkout.whatsappNumberNormalized;
  let linkedUser = user || (await User.findOne({ phoneNormalized: phone }));

  if (!linkedUser) {
    const fallbackEmail = checkout.email || `wa-${phone.replace(/\D/g, "")}@${INTERNAL_WHATSAPP_EMAIL_DOMAIN}`;
    const existingEmailUser = await User.findOne({ email: fallbackEmail.toLowerCase() });
    linkedUser =
      existingEmailUser ||
      (await User.create({
        name: checkout.fullName || "WhatsApp User",
        email: fallbackEmail.toLowerCase(),
        phone: checkout.whatsappNumber,
        phoneNormalized: phone,
        password: await bcrypt.hash(randomToken(), 10),
      }));
  }

  if (!linkedUser.isActive) {
    throw new AppError(403, "Your account has been disabled.");
  }

  checkout.user = linkedUser._id;
  linkedUser.phone = checkout.whatsappNumber;
  linkedUser.phoneNormalized = phone;
  if (checkout.fullName && !linkedUser.name) {
    linkedUser.name = checkout.fullName;
  }
  await linkedUser.save();
  checkout.whatsappVerifiedAt = new Date();
  checkout.lastStep = checkout.fullName ? "DETAILS" : "VERIFY";
  checkout.otpHash = undefined;
  checkout.otpExpiresAt = undefined;
  refreshVerificationStatus(checkout);
  await checkout.save();

  await createAuditLog({
    actor: linkedUser,
    action: "pricing_checkout.whatsapp_verified",
    entityType: "pricing_checkout",
    entityId: checkout._id.toString(),
    details: { phone: maskPhone(phone), planName: checkout.planSnapshot?.planName },
  });

  return {
    checkout: serializeCheckout(checkout),
    token: signAccessToken(linkedUser),
    user: serializeUser(linkedUser),
  };
};

const buildSubmittedEmail = (checkout) => {
  const addons = (checkout.selectedAddons || []).map((addon) => `${addon.label} (${addon.price || "Custom"})`).join(", ") || "-";
  const lines = [
    "New Pricing Checkout",
    `Plan: ${checkout.planSnapshot?.planName || "-"}`,
    `Duration: ${checkout.selectedDuration || "-"}`,
    `Estimated: ${formatAmount(checkout.estimatedAmount)}`,
    `Addons: ${addons}`,
    `Name: ${checkout.fullName || "-"}`,
    `Brand: ${checkout.brandName || "-"}`,
    `City: ${checkout.city || "-"}`,
    `Email: ${checkout.email || "-"}`,
    `WhatsApp: ${checkout.whatsappNumber || checkout.whatsappNumberNormalized || "-"}`,
    `Call: ${checkout.callNumber || checkout.callNumberNormalized || "-"}`,
    `GST: ${checkout.gstRegistered ? checkout.gstNumber || "Yes" : "No"}`,
    `About: ${checkout.aboutBusiness || "-"}`,
    `Notes: ${checkout.requirementNotes || "-"}`,
  ];

  return lines.join("\n");
};

export const submitCheckout = async ({ checkoutId, user }) => {
  const checkout = await loadCheckout(checkoutId);
  await maybeAttachUserDetails(checkout, user);

  if (!checkout.fullName || !checkout.email || !checkout.whatsappNumberNormalized) {
    throw new AppError(400, "Complete business details before submitting.");
  }
  if (!checkout.emailVerifiedAt) {
    throw new AppError(400, "Verify your email before submitting.");
  }
  if (!checkout.whatsappVerifiedAt) {
    throw new AppError(400, "Verify your phone before submitting.");
  }

  checkout.status = "SUBMITTED";
  checkout.submittedAt = new Date();
  await checkout.save();

  const toEmails = [...new Set(env.enquiryToEmails.filter(Boolean))];
  if (toEmails.length) {
    await sendEmail({
      to: toEmails.join(", "),
      replyTo: checkout.email,
      subject: `New pricing checkout: ${checkout.planSnapshot?.planName || "Plan"}`,
      text: buildSubmittedEmail(checkout),
    });
  }

  if (checkout.whatsappVerifiedAt && env.aiwizchatPricingSubmittedCampaignName && !checkout.submittedMessageSentAt) {
    const result = await sendPricingCampaign({
      checkout,
      campaignName: env.aiwizchatPricingSubmittedCampaignName,
      variables: [
        checkout.fullName || "Customer",
        checkout.planSnapshot?.planName || "Selected plan",
        checkout.selectedDuration || "Selected duration",
        formatAmount(checkout.estimatedAmount),
        "Digital AdBird team will contact you shortly.",
      ],
      event: "pricingCheckout.submitted",
    });
    if (result.ok) {
      checkout.submittedMessageSentAt = new Date();
      await checkout.save();
    }
  }

  return { checkout: serializeCheckout(checkout), message: "Checkout details submitted successfully." };
};

export const abandonCheckout = async ({ checkoutId, user }) => {
  const checkout = await loadCheckout(checkoutId);
  await maybeAttachUserDetails(checkout, user);

  if (checkout.status === "SUBMITTED") {
    return { checkout: serializeCheckout(checkout), skipped: true };
  }
  if (checkout.abandonedMessageSentAt) {
    return { checkout: serializeCheckout(checkout), skipped: true };
  }
  if (!checkout.whatsappVerifiedAt && !user?.phoneNormalized) {
    return { checkout: serializeCheckout(checkout), skipped: true };
  }
  if (user?.phoneNormalized && !checkout.whatsappNumberNormalized) {
    checkout.whatsappNumber = user.phone;
    checkout.whatsappNumberNormalized = user.phoneNormalized;
    checkout.whatsappVerifiedAt = checkout.whatsappVerifiedAt || new Date();
  }
  if (!env.aiwizchatPricingAbandonedCampaignName) {
    return { checkout: serializeCheckout(checkout), skipped: true };
  }

  const resumeUrl = `${env.clientUrl}/pricing/checkout?checkout=${checkout.resumeToken}`;
  const result = await sendPricingCampaign({
    checkout,
    campaignName: env.aiwizchatPricingAbandonedCampaignName,
    variables: [
      checkout.fullName || user?.name || "Customer",
      checkout.planSnapshot?.planName || "Selected plan",
      checkout.selectedDuration || "Selected duration",
      formatAmount(checkout.estimatedAmount),
      resumeUrl,
    ],
    event: "pricingCheckout.abandoned",
  });

  if (result.ok) {
    checkout.status = "ABANDONED";
    checkout.abandonedAt = new Date();
    checkout.abandonedMessageSentAt = new Date();
    await checkout.save();
  }

  return { checkout: serializeCheckout(checkout), sent: Boolean(result.ok) };
};
