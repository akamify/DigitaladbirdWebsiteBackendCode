import crypto from "node:crypto";
import AuditLog from "../models/AuditLog.js";
import Coupon from "../models/Coupon.js";
import Media from "../models/Media.js";
import Notification from "../models/Notification.js";
import { env } from "../config/env.js";
import { formatCurrency, matchesPublishedState } from "../utils/common.js";
import { signMediaToken } from "../utils/jwt.js";

export const createAuditLog = async ({ actor, action, entityType, entityId, details = {} }) =>
  AuditLog.create({
    actor: actor?._id || null,
    actorName: actor?.name || "System",
    action,
    entityType,
    entityId,
    details,
  });

export const createNotification = async ({ user, type, title, message, actionUrl }) =>
  Notification.create({
    user,
    type,
    title,
    message,
    actionUrl,
  });

export const validateCouponForCourse = ({ coupon, course, subtotalAmount }) => {
  if (!coupon || coupon.deletedAt || !coupon.isActive) {
    return { valid: false, reason: "Coupon is inactive." };
  }

  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    return { valid: false, reason: "Coupon has expired." };
  }

  if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
    return { valid: false, reason: "Coupon usage limit reached." };
  }

  if (subtotalAmount < coupon.minOrderAmount) {
    return { valid: false, reason: "Minimum order amount not met." };
  }

  if (!coupon.appliesToAll) {
    const matchesCourse = coupon.applicableCourseIds.some((item) => item.toString() === course._id.toString());
    const matchesCategory = coupon.applicableCategory && coupon.applicableCategory === course.category;

    if (!matchesCourse && !matchesCategory) {
      return { valid: false, reason: "Coupon does not apply to this course." };
    }
  }

  const discountAmount =
    coupon.type === "PERCENTAGE" ? Math.round((subtotalAmount * coupon.amount) / 100) : Math.min(coupon.amount, subtotalAmount);

  return {
    valid: true,
    discountAmount,
  };
};

export const findChapter = (course, chapterId) => course.chapters.id(chapterId);

export const findLesson = (course, lessonId) => {
  for (const chapter of course.chapters) {
    const lesson = chapter.lessons.id(lessonId);
    if (lesson) {
      return { chapter, lesson };
    }
  }

  return { chapter: null, lesson: null };
};

export const listLessons = (course) =>
  course.chapters
    .filter((chapter) => !chapter.isDeleted)
    .sort((left, right) => left.position - right.position)
    .flatMap((chapter) =>
      chapter.lessons
        .filter((lesson) => !lesson.isDeleted && lesson.isPublished)
        .sort((left, right) => left.position - right.position)
        .map((lesson) => ({ chapter, lesson })),
    );

export const canAccessCourse = ({ user, course, enrollment }) => {
  if (!user) {
    return false;
  }

  if (course.accessType === "FREE") {
    return true;
  }

  return Boolean(enrollment && enrollment.status === "ACTIVE");
};

export const canAccessLesson = ({ user, course, lesson, enrollment }) => {
  if (!user) {
    return false;
  }

  if (lesson.visibility === "COMING_SOON") {
    return false;
  }

  if (lesson.visibility === "LOCKED") {
    return false;
  }

  if (lesson.isFreeIntro || lesson.visibility === "PREVIEW") {
    return true;
  }

  if (course.accessType === "FREE") {
    return true;
  }

  if (lesson.visibility === "PAID_ONLY") {
    return Boolean(enrollment && enrollment.status === "ACTIVE");
  }

  return Boolean(enrollment && enrollment.status === "ACTIVE");
};

export const getLessonAccessErrorMessage = (lesson) => {
  if (lesson.visibility === "COMING_SOON") {
    return "This lesson is marked as coming soon and is not playable yet.";
  }

  if (lesson.visibility === "LOCKED") {
    return "This lesson is locked by the instructor and is not available right now.";
  }

  if (lesson.visibility === "PAID_ONLY") {
    return "This lesson unlocks after the course payment is completed.";
  }

  return "This lesson is not available right now.";
};

export const buildStreamUrl = ({ mediaId, courseId, lessonId, userId }) => {
  const token = signMediaToken({
    mediaId,
    courseId,
    lessonId,
    userId,
    scope: "lesson-stream",
  });

  return `${env.siteBaseUrl}/api/media/${mediaId}/stream?token=${token}`;
};

export const buildCourseSummary = ({ course, enrollment, user }) => ({
  id: course._id,
  title: course.title,
  slug: course.slug,
  topic: course.topic,
  shortDescription: course.shortDescription,
  description: course.description,
  category: course.category,
  difficulty: course.difficulty,
  durationLabel: course.durationLabel,
  durationMinutes: course.durationMinutes,
  language: course.language,
  tags: course.tags,
  accessType: course.accessType,
  priceAmount: course.price.amount,
  currency: course.price.currency,
  bannerUrl: course.bannerUrl,
  thumbnailUrl: course.thumbnailUrl,
  status: course.status,
  featured: course.featured,
  instructor: course.instructor,
  lessonsCount: listLessons(course).length,
  chaptersCount: course.chapters.filter((chapter) => !chapter.isDeleted).length,
  user: {
    enrolled: Boolean(enrollment),
    canAccess: canAccessCourse({ user, course, enrollment }),
    progressPercent: enrollment?.progressPercent || 0,
  },
});

export const serializeCourseDetail = async ({ course, user, enrollment, progressMap = {} }) => ({
  ...buildCourseSummary({ course, enrollment, user }),
  seoTitle: course.seoTitle,
  seoDescription: course.seoDescription,
  prerequisites: course.prerequisites,
  chapters: (
    await Promise.all(
      course.chapters
        .filter((chapter) => !chapter.isDeleted)
        .sort((left, right) => left.position - right.position)
        .map(async (chapter) => ({
          id: chapter._id,
          title: chapter.title,
          slug: chapter.slug,
          description: chapter.description,
          position: chapter.position,
          lessons: await Promise.all(
            chapter.lessons
              .filter((lesson) => !lesson.isDeleted && lesson.isPublished)
              .sort((left, right) => left.position - right.position)
              .map(async (lesson) => {
                const unlocked = canAccessLesson({ user, course, lesson, enrollment });
                const streamUrl =
                  unlocked && lesson.videoMediaId
                    ? buildStreamUrl({
                        mediaId: lesson.videoMediaId.toString(),
                        courseId: course._id.toString(),
                        lessonId: lesson._id.toString(),
                        userId: user?._id?.toString() || "guest",
                      })
                    : null;

                const resources = lesson.resourceMediaIds?.length
                  ? await Media.find({ _id: { $in: lesson.resourceMediaIds } }).select("kind purpose publicUrl")
                  : [];

                return {
                  id: lesson._id,
                  title: lesson.title,
                  slug: lesson.slug,
                  description: lesson.description,
                  topic: lesson.topic,
                  content: lesson.content,
                  durationMinutes: lesson.durationMinutes,
                  visibility: lesson.visibility,
                  isFreeIntro: lesson.isFreeIntro,
                  unlocked,
                  posterUrl: lesson.posterUrl,
                  thumbnailUrl: lesson.thumbnailUrl,
                  videoMediaId: lesson.videoMediaId,
                  streamUrl,
                  progress: progressMap[lesson._id.toString()] || null,
                  resources,
                };
              }),
          ),
        })),
    )
  ).filter(Boolean),
});

export const assertPublishedOrPrivileged = ({ course, user }) => {
  if (matchesPublishedState(course)) {
    return;
  }

  if (user && isAdminRole(user.role)) {
    return;
  }

  throw new Error("Course is not available.");
};

export const randomToken = () => crypto.randomBytes(24).toString("hex");

export const amountLabel = (amount, currency = "INR") => formatCurrency(amount, currency);

export const loadCouponByCode = (code) =>
  Coupon.findOne({
    code: code.toUpperCase(),
    deletedAt: null,
  });
