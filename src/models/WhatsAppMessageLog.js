import mongoose from "mongoose";
import {
  WHATSAPP_MESSAGE_STATUSES,
  WHATSAPP_MESSAGE_TYPES,
  WHATSAPP_PROVIDER,
} from "../constants/whatsapp.constants.js";

const whatsappMessageLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      required: true,
    },
    type: {
      type: String,
      enum: Object.values(WHATSAPP_MESSAGE_TYPES),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(WHATSAPP_MESSAGE_STATUSES),
      default: WHATSAPP_MESSAGE_STATUSES.PENDING,
    },
    provider: {
      type: String,
      default: WHATSAPP_PROVIDER,
    },
    phone: String,
    campaignName: String,
    providerMessageId: String,
    providerStatus: String,
    payloadSummary: mongoose.Schema.Types.Mixed,
    errorCode: String,
    errorMessage: String,
    attempts: {
      type: Number,
      default: 0,
    },
    nextAttemptAt: Date,
    claimedAt: Date,
    sentAt: Date,
    skippedAt: Date,
  },
  { timestamps: true },
);

whatsappMessageLogSchema.index({ payment: 1, type: 1 }, { unique: true });
whatsappMessageLogSchema.index({ status: 1, nextAttemptAt: 1 });
whatsappMessageLogSchema.index({ type: 1, createdAt: -1 });
whatsappMessageLogSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model("WhatsAppMessageLog", whatsappMessageLogSchema);
