import mongoose from "mongoose";

const lessonSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    description: String,
    topic: String,
    content: String,
    durationMinutes: { type: Number, default: 0 },
    visibility: {
      type: String,
      enum: ["PREVIEW", "LOCKED", "PAID_ONLY", "COMING_SOON"],
      default: "LOCKED",
    },
    isFreeIntro: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: true },
    position: { type: Number, default: 0 },
    posterUrl: String,
    thumbnailUrl: String,
    videoMediaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Media",
      default: null,
    },
    resourceMediaIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Media",
      },
    ],
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

const chapterSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    description: String,
    position: { type: Number, default: 0 },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    lessons: [lessonSchema],
  },
  { timestamps: true },
);

const courseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    topic: String,
    description: { type: String, required: true },
    shortDescription: String,
    category: { type: String, required: true },
    difficulty: String,
    durationLabel: String,
    durationMinutes: { type: Number, default: 0 },
    language: { type: String, default: "English" },
    tags: [{ type: String }],
    seoTitle: String,
    seoDescription: String,
    prerequisites: [{ type: String }],
    instructor: {
      name: { type: String, required: true },
      bio: String,
      imageUrl: String,
    },
    bannerUrl: String,
    thumbnailUrl: String,
    introLessonId: mongoose.Schema.Types.ObjectId,
    status: {
      type: String,
      enum: ["DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"],
      default: "DRAFT",
    },
    accessType: {
      type: String,
      enum: ["FREE", "PAID"],
      default: "FREE",
    },
    price: {
      amount: { type: Number, default: 0 },
      currency: { type: String, default: "INR" },
    },
    featured: { type: Boolean, default: false },
    scheduledAt: Date,
    publishedAt: Date,
    views: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
    chapters: [chapterSchema],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

courseSchema.index({ status: 1, isDeleted: 1 });
courseSchema.index({ category: 1, accessType: 1 });

export default mongoose.model("Course", courseSchema);
