import mongoose from "mongoose";

const progressSchema = new mongoose.Schema(
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
    lessonId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    watchedSeconds: {
      type: Number,
      default: 0,
    },
    durationSeconds: {
      type: Number,
      default: 0,
    },
    completionPercent: {
      type: Number,
      default: 0,
    },
    isCompleted: {
      type: Boolean,
      default: false,
    },
    lastPlaybackRate: {
      type: Number,
      default: 1,
    },
    completedAt: Date,
  },
  { timestamps: true },
);

progressSchema.index({ user: 1, lessonId: 1 }, { unique: true });

export default mongoose.model("Progress", progressSchema);

