import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
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
    coupon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      default: null,
    },
    orderNumber: {
      type: String,
      required: true,
      unique: true,
    },
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
    },
    provider: {
      type: String,
      default: "RAZORPAY",
    },
    status: {
      type: String,
      enum: ["PENDING", "PAID", "FAILED", "REFUNDED"],
      default: "PENDING",
    },
    currency: {
      type: String,
      default: "INR",
    },
    subtotalAmount: { type: Number, required: true },
    discountAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    transactionReference: String,
    razorpayOrderId: String,
    razorpayPaymentId: String,
    razorpaySignature: String,
    couponCode: String,
    notes: mongoose.Schema.Types.Mixed,
    failureReason: String,
    refundedAt: Date,
  },
  { timestamps: true },
);

paymentSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("Payment", paymentSchema);

