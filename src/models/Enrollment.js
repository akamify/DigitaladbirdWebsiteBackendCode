import mongoose from "mongoose";

const enrollmentSchema = new mongoose.Schema(
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
      default: null,
    },
    status: {
      type: String,
      default: "ACTIVE",
    },
    type: {
      type: String,
      enum: ["FREE", "PAID"],
      required: true,
    },
    pricePaid: {
      type: Number,
      default: 0,
    },
    progressPercent: {
      type: Number,
      default: 0,
    },
    completedLessons: {
      type: Number,
      default: 0,
    },
    lastLessonId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  { timestamps: true },
);

enrollmentSchema.index({ user: 1, course: 1 }, { unique: true });

export default mongoose.model("Enrollment", enrollmentSchema);

