import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      default: null,
    },
    lessonId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    kind: {
      type: String,
      enum: ["IMAGE", "VIDEO", "DOCUMENT"],
      required: true,
    },
    purpose: {
      type: String,
      required: true,
    },
    visibility: {
      type: String,
      enum: ["PUBLIC", "PROTECTED"],
      default: "PUBLIC",
    },
    originalName: String,
    mimeType: String,
    size: Number,
    storagePath: String,
    publicUrl: String,
  },
  { timestamps: true },
);

export default mongoose.model("Media", mediaSchema);

