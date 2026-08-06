import mongoose from "mongoose";

const addonSchema = new mongoose.Schema(
  {
    label: String,
    price: String,
    amount: {
      type: Number,
      default: 0,
    },
  },
  { _id: false },
);

const pricingCheckoutSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    planSnapshot: {
      planId: String,
      planName: String,
      category: String,
      billingTab: String,
      priceLabel: String,
      priceSuffix: String,
      billingNote: String,
    },
    selectedDuration: String,
    selectedAddons: [addonSchema],
    estimatedAmount: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      default: "INR",
    },
    fullName: String,
    brandName: String,
    city: String,
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    whatsappNumber: String,
    whatsappNumberNormalized: String,
    callNumber: String,
    callNumberNormalized: String,
    gstRegistered: {
      type: Boolean,
      default: false,
    },
    gstNumber: String,
    aboutBusiness: String,
    requirementNotes: String,
    status: {
      type: String,
      enum: ["STARTED", "DETAILS_STARTED", "EMAIL_VERIFIED", "WHATSAPP_VERIFIED", "READY", "SUBMITTED", "ABANDONED"],
      default: "STARTED",
    },
    lastStep: {
      type: String,
      enum: ["PLAN", "ADDONS", "DETAILS", "VERIFY"],
      default: "PLAN",
    },
    resumeToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    emailVerifiedAt: Date,
    emailOtpHash: String,
    emailOtpExpiresAt: Date,
    emailOtpAttempts: {
      type: Number,
      default: 0,
    },
    emailOtpSentAt: Date,
    whatsappVerifiedAt: Date,
    otpHash: String,
    otpExpiresAt: Date,
    otpAttempts: {
      type: Number,
      default: 0,
    },
    otpSentAt: Date,
    submittedAt: Date,
    abandonedAt: Date,
    abandonedMessageSentAt: Date,
    submittedMessageSentAt: Date,
  },
  { timestamps: true },
);

pricingCheckoutSchema.index({ status: 1, updatedAt: -1 });
pricingCheckoutSchema.index({ whatsappNumberNormalized: 1, updatedAt: -1 });
pricingCheckoutSchema.index({ user: 1, updatedAt: -1 });

export default mongoose.model("PricingCheckout", pricingCheckoutSchema);
