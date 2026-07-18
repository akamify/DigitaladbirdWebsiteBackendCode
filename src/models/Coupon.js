import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    title: String,
    description: String,
    type: {
      type: String,
      enum: ["FLAT", "PERCENTAGE"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    minOrderAmount: {
      type: Number,
      default: 0,
    },
    usageLimit: Number,
    usageCount: {
      type: Number,
      default: 0,
    },
    expiresAt: Date,
    isActive: {
      type: Boolean,
      default: true,
    },
    appliesToAll: {
      type: Boolean,
      default: true,
    },
    applicableCourseIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
      },
    ],
    applicableCategory: String,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    deletedAt: Date,
  },
  { timestamps: true },
);

export default mongoose.model("Coupon", couponSchema);

