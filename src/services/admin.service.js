import fs from "node:fs/promises";
import path from "node:path";
import AuditLog from "../models/AuditLog.js";
import Coupon from "../models/Coupon.js";
import Course from "../models/Course.js";
import Enrollment from "../models/Enrollment.js";
import Media from "../models/Media.js";
import Payment from "../models/Payment.js";
import Progress from "../models/Progress.js";
import Setting from "../models/Setting.js";
import User from "../models/User.js";
import WhatsAppMessageLog from "../models/WhatsAppMessageLog.js";
import { env } from "../config/env.js";
import AppError from "../utils/appError.js";
import { buildStreamUrl, createAuditLog, findChapter, findLesson } from "./core.service.js";
import { getPagination, toCsv, toSlug } from "../utils/common.js";
import { WHATSAPP_MESSAGE_TYPES } from "../constants/whatsapp.constants.js";

const serializeAdminCourse = (course, analytics = {}, userId = "admin") => ({
  id: course._id,
  title: course.title,
  slug: course.slug,
  topic: course.topic,
  description: course.description,
  shortDescription: course.shortDescription,
  category: course.category,
  difficulty: course.difficulty,
  durationLabel: course.durationLabel,
  durationMinutes: course.durationMinutes,
  language: course.language,
  tags: course.tags,
  seoTitle: course.seoTitle,
  seoDescription: course.seoDescription,
  prerequisites: course.prerequisites,
  instructor: course.instructor,
  bannerUrl: course.bannerUrl,
  thumbnailUrl: course.thumbnailUrl,
  introLessonId: course.introLessonId,
  status: course.status,
  accessType: course.accessType,
  price: course.price,
  featured: course.featured,
  scheduledAt: course.scheduledAt,
  publishedAt: course.publishedAt,
  views: course.views,
  isDeleted: course.isDeleted,
  createdAt: course.createdAt,
  updatedAt: course.updatedAt,
  analytics: {
    views: course.views,
    enrollments: analytics.enrollments || 0,
    revenueAmount: analytics.revenueAmount || 0,
    couponUsage: analytics.couponUsage || 0,
    completionRate: analytics.completionRate || 0,
  },
  chapters: course.chapters
    .sort((left, right) => left.position - right.position)
    .map((chapter) => ({
      id: chapter._id,
      title: chapter.title,
      slug: chapter.slug,
      description: chapter.description,
      position: chapter.position,
      isDeleted: chapter.isDeleted,
      lessons: chapter.lessons
        .sort((left, right) => left.position - right.position)
        .map((lesson) => ({
          id: lesson._id,
          title: lesson.title,
          slug: lesson.slug,
          description: lesson.description,
          topic: lesson.topic,
          content: lesson.content,
          durationMinutes: lesson.durationMinutes,
          visibility: lesson.visibility,
          isFreeIntro: lesson.isFreeIntro,
          isPublished: lesson.isPublished,
          position: lesson.position,
          posterUrl: lesson.posterUrl,
          thumbnailUrl: lesson.thumbnailUrl,
          videoMediaId: lesson.videoMediaId,
          videoStreamUrl: lesson.videoMediaId
            ? buildStreamUrl({
                mediaId: lesson.videoMediaId.toString(),
                courseId: course._id.toString(),
                lessonId: lesson._id.toString(),
                userId,
              })
            : null,
          resourceMediaIds: lesson.resourceMediaIds,
          isDeleted: lesson.isDeleted,
        })),
    })),
});

const serializeAdminMedia = (media, userId = "admin") => {
  const previewUrl =
    media.visibility === "PROTECTED" && media.course && media.lessonId
      ? buildStreamUrl({
          mediaId: media._id.toString(),
          courseId: media.course.toString(),
          lessonId: media.lessonId.toString(),
          userId,
        })
      : media.publicUrl || null;

  return {
    ...media.toObject(),
    previewUrl,
  };
};

const lessonAssetPurposes = new Set(["lessonPoster", "lessonThumbnail", "lessonVideo", "lessonResource"]);
const courseAssetPurposes = new Set(["courseBanner", "courseThumbnail"]);
const imageAssetPurposes = new Set(["courseBanner", "courseThumbnail", "lessonPoster", "lessonThumbnail"]);
const knownMediaPurposes = new Set([
  "general",
  "courseBanner",
  "courseThumbnail",
  "instructorImage",
  "lessonPoster",
  "lessonThumbnail",
  "lessonVideo",
  "lessonResource",
]);

const isImageMime = (mimeType = "") => mimeType.startsWith("image/");
const isVideoMime = (mimeType = "") => mimeType.startsWith("video/");

const cleanupUploadedFile = async (file) => {
  if (!file?.path) {
    return;
  }

  try {
    await fs.unlink(file.path);
  } catch {
    // Ignore cleanup failures for already-removed temp files.
  }
};

const validateMediaUpload = async ({ file, payload }) => {
  if (!file) {
    throw new AppError(400, "Choose a file before uploading.");
  }

  const purpose = payload.purpose || "general";
  if (!knownMediaPurposes.has(purpose)) {
    await cleanupUploadedFile(file);
    throw new AppError(400, "Unsupported media purpose.");
  }

  if (payload.lessonId && !payload.courseId) {
    await cleanupUploadedFile(file);
    throw new AppError(400, "Select a course before linking a lesson asset.");
  }

  if (courseAssetPurposes.has(purpose) && !payload.courseId) {
    await cleanupUploadedFile(file);
    throw new AppError(400, "Course banner and thumbnail uploads require a course.");
  }

  if (lessonAssetPurposes.has(purpose) && (!payload.courseId || !payload.lessonId)) {
    await cleanupUploadedFile(file);
    throw new AppError(400, "Lesson uploads require both a course and a lesson.");
  }

  if (imageAssetPurposes.has(purpose) && !isImageMime(file.mimetype)) {
    await cleanupUploadedFile(file);
    throw new AppError(400, "This asset purpose only accepts image files.");
  }

  if (purpose === "lessonVideo" && !isVideoMime(file.mimetype)) {
    await cleanupUploadedFile(file);
    throw new AppError(400, "Lesson video uploads only accept video files.");
  }

  if (purpose === "lessonResource" && (isImageMime(file.mimetype) || isVideoMime(file.mimetype))) {
    await cleanupUploadedFile(file);
    throw new AppError(400, "Lesson resources must be document or download files.");
  }

  const course = payload.courseId ? await Course.findById(payload.courseId) : null;
  if (payload.courseId && !course) {
    await cleanupUploadedFile(file);
    throw new AppError(404, "Course not found.");
  }

  let lesson = null;
  if (payload.lessonId && course) {
    const lessonResult = findLesson(course, payload.lessonId);
    lesson = lessonResult.lesson;

    if (!lesson || lesson.isDeleted) {
      await cleanupUploadedFile(file);
      throw new AppError(404, "Lesson not found.");
    }
  }

  const visibility =
    purpose === "lessonVideo" || purpose === "lessonResource"
      ? "PROTECTED"
      : imageAssetPurposes.has(purpose)
        ? "PUBLIC"
        : payload.visibility || (isImageMime(file.mimetype) ? "PUBLIC" : "PROTECTED");

  return {
    course,
    lesson,
    purpose,
    visibility,
    kind: isImageMime(file.mimetype) ? "IMAGE" : isVideoMime(file.mimetype) ? "VIDEO" : "DOCUMENT",
  };
};

const ensureUniqueCourseSlug = async (value, currentId = null) => {
  const base = toSlug(value) || `course-${Date.now()}`;
  let slug = base;
  let counter = 1;

  while (true) {
    const existing = await Course.findOne({
      slug,
      ...(currentId ? { _id: { $ne: currentId } } : {}),
    });

    if (!existing) {
      return slug;
    }

    counter += 1;
    slug = `${base}-${counter}`;
  }
};

const ensureUniqueSubdocSlug = (items, title, currentId = null) => {
  const base = toSlug(title) || `item-${Date.now()}`;
  let slug = base;
  let counter = 1;

  while (items.some((item) => item.slug === slug && item._id.toString() !== String(currentId || ""))) {
    counter += 1;
    slug = `${base}-${counter}`;
  }

  return slug;
};

const buildCourseAnalyticsMap = async (courseIds) => {
  const [enrollments, payments, progressEntries] = await Promise.all([
    Enrollment.find({ course: { $in: courseIds } }),
    Payment.find({ course: { $in: courseIds }, status: "PAID" }),
    Progress.find({ course: { $in: courseIds } }),
  ]);

  return courseIds.reduce((accumulator, courseId) => {
    const id = courseId.toString();
    const courseEnrollments = enrollments.filter((item) => item.course.toString() === id);
    const coursePayments = payments.filter((item) => item.course.toString() === id);
    const courseProgress = progressEntries.filter((item) => item.course.toString() === id);

    accumulator[id] = {
      enrollments: courseEnrollments.length,
      revenueAmount: coursePayments.reduce((sum, item) => sum + item.totalAmount, 0),
      couponUsage: coursePayments.filter((item) => item.coupon).length,
      completionRate: courseProgress.length
        ? Math.round(courseProgress.reduce((sum, item) => sum + item.completionPercent, 0) / courseProgress.length)
        : 0,
    };

    return accumulator;
  }, {});
};

export const getOverview = async () => {
  const [coursesCount, usersCount, mediaCount, couponsCount, payments, enrollmentsCount, freeEnrollments] = await Promise.all([
    Course.countDocuments({ isDeleted: false }),
    User.countDocuments(),
    Media.countDocuments(),
    Coupon.countDocuments({ deletedAt: null, isActive: true }),
    Payment.find({ status: "PAID" }),
    Enrollment.countDocuments(),
    Enrollment.countDocuments({ type: "FREE" }),
  ]);

  const monthlySales = Array.from({ length: 6 }, (_, offset) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - offset));
    const month = date.getMonth();
    const year = date.getFullYear();

    return {
      label: date.toLocaleString("en-US", { month: "short" }),
      totalAmount: payments
        .filter((item) => {
          const paidAt = new Date(item.createdAt);
          return paidAt.getMonth() === month && paidAt.getFullYear() === year;
        })
        .reduce((sum, item) => sum + item.totalAmount, 0),
    };
  });

  return {
    cards: {
      totalCourses: coursesCount,
      totalUsers: usersCount,
      paidSalesAmount: payments.reduce((sum, item) => sum + item.totalAmount, 0),
      freeEnrollments,
      activeCoupons: couponsCount,
      totalVideos: mediaCount,
      totalEnrollments: enrollmentsCount,
    },
    monthlySales,
  };
};

export const listCourses = async ({ query, user }) => {
  const { page, pageSize, skip } = getPagination(query);
  const filter = {};

  if (query.status) {
    filter.status = query.status;
  }

  if (query.accessType) {
    filter.accessType = query.accessType;
  }

  if (query.includeDeleted !== "true") {
    filter.isDeleted = false;
  }

  if (query.q) {
    filter.$or = [
      { title: new RegExp(query.q, "i") },
      { slug: new RegExp(query.q, "i") },
      { category: new RegExp(query.q, "i") },
      { "instructor.name": new RegExp(query.q, "i") },
    ];
  }

  const [allCourses, total] = await Promise.all([
    Course.find(filter).sort({ updatedAt: -1 }),
    Course.countDocuments(filter),
  ]);

  const pageItems = allCourses.slice(skip, skip + pageSize);
  const analyticsMap = await buildCourseAnalyticsMap(pageItems.map((course) => course._id));

  return {
    items: pageItems.map((course) => serializeAdminCourse(course, analyticsMap[course._id.toString()], user?._id?.toString() || "admin")),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
};

export const getCourse = async ({ courseId, user }) => {
  const course = await Course.findById(courseId);

  if (!course) {
    throw new AppError(404, "Course not found.");
  }

  const analyticsMap = await buildCourseAnalyticsMap([course._id]);
  return {
    course: serializeAdminCourse(course, analyticsMap[course._id.toString()], user?._id?.toString() || "admin"),
  };
};

export const createCourse = async ({ payload, user }) => {
  const course = await Course.create({
    title: payload.title,
    slug: await ensureUniqueCourseSlug(payload.slug || payload.title),
    topic: payload.topic,
    description: payload.description,
    shortDescription: payload.shortDescription,
    category: payload.category,
    difficulty: payload.difficulty,
    durationLabel: payload.durationLabel,
    durationMinutes: payload.durationMinutes || 0,
    language: payload.language || "English",
    tags: payload.tags || [],
    seoTitle: payload.seoTitle,
    seoDescription: payload.seoDescription,
    prerequisites: payload.prerequisites || [],
    instructor: {
      name: payload.instructorName,
      bio: payload.instructorBio,
      imageUrl: payload.instructorImageUrl || null,
    },
    bannerUrl: payload.bannerUrl || null,
    thumbnailUrl: payload.thumbnailUrl || null,
    status: payload.status || "DRAFT",
    accessType: payload.accessType || "FREE",
    price: {
      amount: payload.accessType === "PAID" ? payload.priceAmount || 0 : 0,
      currency: env.razorpayCurrency,
    },
    featured: payload.featured || false,
    scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : null,
    publishedAt: payload.status === "PUBLISHED" ? new Date() : null,
    createdBy: user._id,
    updatedBy: user._id,
  });

  await createAuditLog({
    actor: user,
    action: "course.created",
    entityType: "course",
    entityId: course._id.toString(),
    details: { title: course.title, slug: course.slug },
  });

  return {
    course: serializeAdminCourse(course, {}, user._id.toString()),
  };
};

export const updateCourse = async ({ courseId, payload, user }) => {
  const course = await Course.findById(courseId);

  if (!course) {
    throw new AppError(404, "Course not found.");
  }

  course.title = payload.title ?? course.title;
  course.slug = payload.slug || payload.title ? await ensureUniqueCourseSlug(payload.slug || payload.title, course._id) : course.slug;
  course.topic = payload.topic ?? course.topic;
  course.description = payload.description ?? course.description;
  course.shortDescription = payload.shortDescription ?? course.shortDescription;
  course.category = payload.category ?? course.category;
  course.difficulty = payload.difficulty ?? course.difficulty;
  course.durationLabel = payload.durationLabel ?? course.durationLabel;
  course.durationMinutes = payload.durationMinutes ?? course.durationMinutes;
  course.language = payload.language ?? course.language;
  course.tags = payload.tags ?? course.tags;
  course.seoTitle = payload.seoTitle ?? course.seoTitle;
  course.seoDescription = payload.seoDescription ?? course.seoDescription;
  course.prerequisites = payload.prerequisites ?? course.prerequisites;
  course.instructor.name = payload.instructorName ?? course.instructor.name;
  course.instructor.bio = payload.instructorBio ?? course.instructor.bio;
  course.instructor.imageUrl = payload.instructorImageUrl !== undefined ? payload.instructorImageUrl || null : course.instructor.imageUrl;
  course.bannerUrl = payload.bannerUrl !== undefined ? payload.bannerUrl || null : course.bannerUrl;
  course.thumbnailUrl = payload.thumbnailUrl !== undefined ? payload.thumbnailUrl || null : course.thumbnailUrl;
  course.status = payload.status ?? course.status;
  course.accessType = payload.accessType ?? course.accessType;
  course.price.amount = payload.accessType === "FREE" ? 0 : payload.priceAmount ?? course.price.amount;
  course.featured = payload.featured ?? course.featured;
  course.scheduledAt = payload.scheduledAt === "" ? null : payload.scheduledAt ? new Date(payload.scheduledAt) : course.scheduledAt;
  if (course.status === "PUBLISHED" && !course.publishedAt) {
    course.publishedAt = new Date();
  }
  course.updatedBy = user._id;
  await course.save();

  await createAuditLog({
    actor: user,
    action: "course.updated",
    entityType: "course",
    entityId: course._id.toString(),
    details: payload,
  });

  return {
    course: serializeAdminCourse(course, {}, user._id.toString()),
  };
};

export const archiveCourse = async ({ courseId, user }) => {
  const course = await Course.findById(courseId);

  if (!course) {
    throw new AppError(404, "Course not found.");
  }

  course.isDeleted = true;
  course.deletedAt = new Date();
  course.status = "ARCHIVED";
  course.updatedBy = user._id;
  await course.save();

  await createAuditLog({
    actor: user,
    action: "course.archived",
    entityType: "course",
    entityId: course._id.toString(),
  });

  return { message: "Course archived." };
};

export const restoreCourse = async ({ courseId, user }) => {
  const course = await Course.findById(courseId);

  if (!course) {
    throw new AppError(404, "Course not found.");
  }

  course.isDeleted = false;
  course.deletedAt = null;
  course.status = "DRAFT";
  course.updatedBy = user._id;
  await course.save();

  await createAuditLog({
    actor: user,
    action: "course.restored",
    entityType: "course",
    entityId: course._id.toString(),
  });

  return { course: serializeAdminCourse(course, {}, user._id.toString()) };
};

export const changeCourseStatus = async ({ courseId, status, user }) => {
  const course = await Course.findById(courseId);

  if (!course) {
    throw new AppError(404, "Course not found.");
  }

  course.status = status;
  if (status === "PUBLISHED") {
    course.publishedAt = new Date();
  }
  course.updatedBy = user._id;
  await course.save();

  await createAuditLog({
    actor: user,
    action: `course.${status.toLowerCase()}`,
    entityType: "course",
    entityId: course._id.toString(),
  });

  return { course: serializeAdminCourse(course, {}, user._id.toString()) };
};

export const addChapter = async ({ courseId, payload, user }) => {
  const course = await Course.findById(courseId);

  if (!course) {
    throw new AppError(404, "Course not found.");
  }

  course.chapters.push({
    title: payload.title,
    slug: ensureUniqueSubdocSlug(course.chapters, payload.title),
    description: payload.description,
    position: course.chapters.length + 1,
  });

  course.updatedBy = user._id;
  await course.save();

  const chapter = course.chapters.at(-1);
  await createAuditLog({
    actor: user,
    action: "chapter.created",
    entityType: "chapter",
    entityId: chapter._id.toString(),
    details: { courseId: course._id.toString() },
  });

  return { chapter };
};

export const updateChapter = async ({ chapterId, payload, user }) => {
  const course = await Course.findOne({ "chapters._id": chapterId });

  if (!course) {
    throw new AppError(404, "Chapter not found.");
  }

  const chapter = findChapter(course, chapterId);
  chapter.title = payload.title ?? chapter.title;
  chapter.slug = payload.title ? ensureUniqueSubdocSlug(course.chapters, payload.title, chapter._id) : chapter.slug;
  chapter.description = payload.description ?? chapter.description;
  course.updatedBy = user._id;
  await course.save();

  await createAuditLog({
    actor: user,
    action: "chapter.updated",
    entityType: "chapter",
    entityId: chapter._id.toString(),
    details: payload,
  });

  return { chapter };
};

export const removeChapter = async ({ chapterId, user }) => {
  const course = await Course.findOne({ "chapters._id": chapterId });

  if (!course) {
    throw new AppError(404, "Chapter not found.");
  }

  const chapter = findChapter(course, chapterId);
  chapter.isDeleted = true;
  chapter.lessons.forEach((lesson) => {
    lesson.isDeleted = true;
  });
  course.updatedBy = user._id;
  await course.save();

  await createAuditLog({
    actor: user,
    action: "chapter.archived",
    entityType: "chapter",
    entityId: chapter._id.toString(),
  });

  return { message: "Chapter archived." };
};

export const reorderChapters = async ({ courseId, ids, user }) => {
  const course = await Course.findById(courseId);

  if (!course) {
    throw new AppError(404, "Course not found.");
  }

  ids.forEach((id, index) => {
    const chapter = findChapter(course, id);
    if (chapter) {
      chapter.position = index + 1;
    }
  });

  course.updatedBy = user._id;
  await course.save();

  await createAuditLog({
    actor: user,
    action: "chapter.reordered",
    entityType: "course",
    entityId: course._id.toString(),
    details: { ids },
  });

  return { message: "Chapters reordered." };
};

export const addLesson = async ({ chapterId, payload, user }) => {
  const course = await Course.findOne({ "chapters._id": chapterId });

  if (!course) {
    throw new AppError(404, "Chapter not found.");
  }

  const chapter = findChapter(course, chapterId);
  chapter.lessons.push({
    title: payload.title,
    slug: ensureUniqueSubdocSlug(chapter.lessons, payload.title),
    description: payload.description,
    topic: payload.topic,
    content: payload.content,
    durationMinutes: payload.durationMinutes || 0,
    visibility: payload.visibility || "LOCKED",
    isFreeIntro: payload.isFreeIntro || false,
    isPublished: payload.isPublished ?? true,
    position: chapter.lessons.length + 1,
    posterUrl: payload.posterUrl || null,
    thumbnailUrl: payload.thumbnailUrl || null,
  });

  const lesson = chapter.lessons.at(-1);

  if (lesson.isFreeIntro) {
    course.chapters.forEach((existingChapter) => {
      existingChapter.lessons.forEach((existingLesson) => {
        existingLesson.isFreeIntro = existingLesson._id.toString() === lesson._id.toString();
      });
    });
    course.introLessonId = lesson._id;
  }

  course.updatedBy = user._id;
  await course.save();

  await createAuditLog({
    actor: user,
    action: "lesson.created",
    entityType: "lesson",
    entityId: lesson._id.toString(),
    details: { chapterId },
  });

  return { lesson };
};

export const updateLesson = async ({ lessonId, payload, user }) => {
  const course = await Course.findOne({ "chapters.lessons._id": lessonId });

  if (!course) {
    throw new AppError(404, "Lesson not found.");
  }

  const { lesson } = findLesson(course, lessonId);
  lesson.title = payload.title ?? lesson.title;
  lesson.slug = payload.title ? ensureUniqueSubdocSlug(listLessonsForSlug(course), payload.title, lesson._id) : lesson.slug;
  lesson.description = payload.description ?? lesson.description;
  lesson.topic = payload.topic ?? lesson.topic;
  lesson.content = payload.content ?? lesson.content;
  lesson.durationMinutes = payload.durationMinutes ?? lesson.durationMinutes;
  lesson.visibility = payload.visibility ?? lesson.visibility;
  lesson.isPublished = payload.isPublished ?? lesson.isPublished;
  lesson.posterUrl = payload.posterUrl !== undefined ? payload.posterUrl || null : lesson.posterUrl;
  lesson.thumbnailUrl = payload.thumbnailUrl !== undefined ? payload.thumbnailUrl || null : lesson.thumbnailUrl;

  if (payload.isFreeIntro === true) {
    course.chapters.forEach((chapter) => {
      chapter.lessons.forEach((existingLesson) => {
        existingLesson.isFreeIntro = existingLesson._id.toString() === lesson._id.toString();
      });
    });
    course.introLessonId = lesson._id;
  } else if (payload.isFreeIntro === false && course.introLessonId?.toString() === lesson._id.toString()) {
    lesson.isFreeIntro = false;
    course.introLessonId = null;
  }

  course.updatedBy = user._id;
  await course.save();

  await createAuditLog({
    actor: user,
    action: "lesson.updated",
    entityType: "lesson",
    entityId: lesson._id.toString(),
    details: payload,
  });

  return { lesson };
};

const listLessonsForSlug = (course) =>
  course.chapters.flatMap((chapter) => chapter.lessons.map((lesson) => ({ _id: lesson._id, slug: lesson.slug })));

export const removeLesson = async ({ lessonId, user }) => {
  const course = await Course.findOne({ "chapters.lessons._id": lessonId });

  if (!course) {
    throw new AppError(404, "Lesson not found.");
  }

  const { lesson } = findLesson(course, lessonId);
  lesson.isDeleted = true;
  course.updatedBy = user._id;
  await course.save();

  await createAuditLog({
    actor: user,
    action: "lesson.archived",
    entityType: "lesson",
    entityId: lesson._id.toString(),
  });

  return { message: "Lesson archived." };
};

export const reorderLessons = async ({ chapterId, ids, user }) => {
  const course = await Course.findOne({ "chapters._id": chapterId });

  if (!course) {
    throw new AppError(404, "Chapter not found.");
  }

  const chapter = findChapter(course, chapterId);
  ids.forEach((id, index) => {
    const lesson = chapter.lessons.id(id);
    if (lesson) {
      lesson.position = index + 1;
    }
  });

  course.updatedBy = user._id;
  await course.save();

  await createAuditLog({
    actor: user,
    action: "lesson.reordered",
    entityType: "chapter",
    entityId: chapter._id.toString(),
    details: { ids },
  });

  return { message: "Lessons reordered." };
};

export const saveMediaRecord = async ({ file, payload, user }) => {
  const { course, lesson, purpose, visibility, kind } = await validateMediaUpload({ file, payload });
  const filename = path.basename(file.path);
  const publicUrl = visibility === "PUBLIC" ? `${env.siteBaseUrl}/uploads/public/${filename}` : null;

  const media = await Media.create({
    owner: user._id,
    course: payload.courseId || null,
    lessonId: payload.lessonId || null,
    kind,
    purpose,
    visibility,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    storagePath: file.path,
    publicUrl,
  });

  if (course) {
    if (purpose === "courseBanner") {
      course.bannerUrl = publicUrl;
    }
    if (purpose === "courseThumbnail") {
      course.thumbnailUrl = publicUrl;
    }
    if (purpose === "instructorImage") {
      course.instructor.imageUrl = publicUrl;
    }
    if (lesson) {
      if (purpose === "lessonPoster") {
        lesson.posterUrl = publicUrl;
      }
      if (purpose === "lessonThumbnail") {
        lesson.thumbnailUrl = publicUrl;
      }
      if (purpose === "lessonVideo") {
        lesson.videoMediaId = media._id;
      }
      if (purpose === "lessonResource") {
        lesson.resourceMediaIds.push(media._id);
      }
    }
    course.updatedBy = user._id;
    await course.save();
  }

  await createAuditLog({
    actor: user,
    action: "media.uploaded",
    entityType: "media",
    entityId: media._id.toString(),
    details: payload,
  });

  return { media };
};

export const removeMediaRecord = async ({ mediaId, user }) => {
  const media = await Media.findById(mediaId);

  if (!media) {
    throw new AppError(404, "Media not found.");
  }

  if (media.course) {
    const course = await Course.findById(media.course);

    if (course) {
      if (media.purpose === "courseBanner" && course.bannerUrl === media.publicUrl) {
        course.bannerUrl = null;
      }
      if (media.purpose === "courseThumbnail" && course.thumbnailUrl === media.publicUrl) {
        course.thumbnailUrl = null;
      }
      if (media.purpose === "instructorImage" && course.instructor.imageUrl === media.publicUrl) {
        course.instructor.imageUrl = null;
      }

      if (media.lessonId) {
        const { lesson } = findLesson(course, media.lessonId);

        if (lesson) {
          if (media.purpose === "lessonPoster" && lesson.posterUrl === media.publicUrl) {
            lesson.posterUrl = null;
          }
          if (media.purpose === "lessonThumbnail" && lesson.thumbnailUrl === media.publicUrl) {
            lesson.thumbnailUrl = null;
          }
          if (media.purpose === "lessonVideo" && lesson.videoMediaId?.toString() === media._id.toString()) {
            lesson.videoMediaId = null;
          }
          if (media.purpose === "lessonResource") {
            lesson.resourceMediaIds = lesson.resourceMediaIds.filter((id) => id.toString() !== media._id.toString());
          }
        }
      }

      course.updatedBy = user._id;
      await course.save();
    }
  }

  await cleanupUploadedFile({ path: media.storagePath });
  await Media.findByIdAndDelete(mediaId);

  await createAuditLog({
    actor: user,
    action: "media.deleted",
    entityType: "media",
    entityId: media._id.toString(),
    details: {
      purpose: media.purpose,
      courseId: media.course?.toString() || null,
      lessonId: media.lessonId?.toString() || null,
    },
  });

  return { message: "Media deleted." };
};

export const listMedia = async ({ query, user }) => {
  const filter = {};
  if (query.q) {
    filter.$or = [{ originalName: new RegExp(query.q, "i") }, { purpose: new RegExp(query.q, "i") }];
  }

  return {
    items: (await Media.find(filter).sort({ createdAt: -1 })).map((item) => serializeAdminMedia(item, user?._id?.toString() || "admin")),
  };
};

export const listAuditLogs = async (query) => {
  const { page, pageSize, skip } = getPagination(query);
  const [items, total] = await Promise.all([
    AuditLog.find().populate("actor", "name email role").sort({ createdAt: -1 }).skip(skip).limit(pageSize),
    AuditLog.countDocuments(),
  ]);

  return {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
};

export const listUsers = async (query) => {
  const { page, pageSize, skip } = getPagination(query);
  const filter = query.q
    ? {
        $or: [{ name: new RegExp(query.q, "i") }, { email: new RegExp(query.q, "i") }, { role: query.q }],
      }
    : {};

  const [items, total] = await Promise.all([
    User.find(filter).select("name email role isActive createdAt").sort({ createdAt: -1 }).skip(skip).limit(pageSize),
    User.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
};

const summarizeWhatsAppLog = (log) =>
  log
    ? {
        status: log.status,
        providerStatus: log.providerStatus || null,
        providerMessageId: log.providerMessageId || null,
        sentAt: log.sentAt || null,
        errorCode: log.errorCode || null,
        errorMessage: log.errorMessage || null,
        attempts: log.attempts || 0,
      }
    : null;

export const listPayments = async () => {
  const items = await Payment.find()
    .populate("user", "name email")
    .populate("course", "title slug")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  const logs = await WhatsAppMessageLog.find({
    payment: { $in: items.map((payment) => payment._id) },
  }).lean();

  const logsByPayment = logs.reduce((accumulator, log) => {
    const paymentId = log.payment.toString();
    accumulator[paymentId] = accumulator[paymentId] || {};
    accumulator[paymentId][log.type] = log;
    return accumulator;
  }, {});

  return {
    items: items.map((payment) => {
      const paymentLogs = logsByPayment[payment._id.toString()] || {};
      return {
        ...payment,
        whatsAppMessages: {
          purchase: summarizeWhatsAppLog(paymentLogs[WHATSAPP_MESSAGE_TYPES.PURCHASE_SUCCESS]),
          abandoned: summarizeWhatsAppLog(paymentLogs[WHATSAPP_MESSAGE_TYPES.CHECKOUT_ABANDONED]),
        },
      };
    }),
  };
};

export const listCoupons = async () => ({
  items: await Coupon.find({ deletedAt: null }).sort({ createdAt: -1 }),
});

export const createCoupon = async ({ payload, user }) => {
  const coupon = await Coupon.create({
    code: payload.code.toUpperCase(),
    title: payload.title,
    description: payload.description,
    type: payload.type,
    amount: payload.amount,
    minOrderAmount: payload.minOrderAmount || 0,
    usageLimit: payload.usageLimit ?? null,
    expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
    isActive: payload.isActive ?? true,
    appliesToAll: payload.appliesToAll ?? true,
    applicableCourseIds: payload.applicableCourseIds || [],
    applicableCategory: payload.applicableCategory || null,
    createdBy: user._id,
  });

  await createAuditLog({
    actor: user,
    action: "coupon.created",
    entityType: "coupon",
    entityId: coupon._id.toString(),
    details: payload,
  });

  return { coupon };
};

export const updateCoupon = async ({ couponId, payload, user }) => {
  const coupon = await Coupon.findById(couponId);

  if (!coupon) {
    throw new AppError(404, "Coupon not found.");
  }

  coupon.code = payload.code ? payload.code.toUpperCase() : coupon.code;
  coupon.title = payload.title ?? coupon.title;
  coupon.description = payload.description ?? coupon.description;
  coupon.type = payload.type ?? coupon.type;
  coupon.amount = payload.amount ?? coupon.amount;
  coupon.minOrderAmount = payload.minOrderAmount ?? coupon.minOrderAmount;
  coupon.usageLimit = payload.usageLimit ?? coupon.usageLimit;
  coupon.expiresAt = payload.expiresAt === null ? null : payload.expiresAt ? new Date(payload.expiresAt) : coupon.expiresAt;
  coupon.isActive = payload.isActive ?? coupon.isActive;
  coupon.appliesToAll = payload.appliesToAll ?? coupon.appliesToAll;
  coupon.applicableCourseIds = payload.applicableCourseIds ?? coupon.applicableCourseIds;
  coupon.applicableCategory = payload.applicableCategory ?? coupon.applicableCategory;
  await coupon.save();

  await createAuditLog({
    actor: user,
    action: "coupon.updated",
    entityType: "coupon",
    entityId: coupon._id.toString(),
    details: payload,
  });

  return { coupon };
};

export const disableCoupon = async ({ couponId, user }) => {
  const coupon = await Coupon.findById(couponId);

  if (!coupon) {
    throw new AppError(404, "Coupon not found.");
  }

  coupon.isActive = false;
  coupon.deletedAt = new Date();
  await coupon.save();

  await createAuditLog({
    actor: user,
    action: "coupon.disabled",
    entityType: "coupon",
    entityId: coupon._id.toString(),
  });

  return { message: "Coupon disabled." };
};

export const listSettings = async () => ({
  items: await Setting.find().sort({ key: 1 }),
});

export const updateSetting = async ({ key, value, user }) => {
  const setting = await Setting.findOneAndUpdate(
    { key },
    { $set: { value } },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );

  await createAuditLog({
    actor: user,
    action: "setting.updated",
    entityType: "setting",
    entityId: setting._id.toString(),
    details: { key, value },
  });

  return { setting };
};

export const getSalesCsv = async () => {
  const payments = await Payment.find({ status: "PAID" }).populate("user course").sort({ createdAt: -1 });

  return toCsv(
    payments.map((payment) => ({
      invoiceNumber: payment.invoiceNumber,
      orderNumber: payment.orderNumber,
      customerName: payment.user?.name || "",
      customerEmail: payment.user?.email || "",
      courseTitle: payment.course?.title || "",
      totalAmount: payment.totalAmount,
      discountAmount: payment.discountAmount,
      status: payment.status,
      createdAt: payment.createdAt.toISOString(),
    })),
  );
};

export const getEnrollmentsCsv = async () => {
  const enrollments = await Enrollment.find().populate("user course").sort({ createdAt: -1 });

  return toCsv(
    enrollments.map((enrollment) => ({
      studentName: enrollment.user?.name || "",
      studentEmail: enrollment.user?.email || "",
      courseTitle: enrollment.course?.title || "",
      type: enrollment.type,
      status: enrollment.status,
      progressPercent: enrollment.progressPercent,
      createdAt: enrollment.createdAt.toISOString(),
    })),
  );
};
