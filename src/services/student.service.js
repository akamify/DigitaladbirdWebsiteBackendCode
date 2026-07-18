import Course from "../models/Course.js";
import Enrollment from "../models/Enrollment.js";
import Notification from "../models/Notification.js";
import Payment from "../models/Payment.js";
import Progress from "../models/Progress.js";
import AppError from "../utils/appError.js";
import { safeJsonParse } from "../utils/common.js";
import { buildStreamUrl, canAccessLesson, findLesson, getLessonAccessErrorMessage, listLessons } from "./core.service.js";

export const getDashboard = async (user) => {
  const [enrollments, notifications, payments] = await Promise.all([
    Enrollment.find({ user: user._id }).populate("course").sort({ updatedAt: -1 }),
    Notification.find({ user: user._id }).sort({ createdAt: -1 }).limit(10),
    Payment.find({ user: user._id }).populate("course").sort({ createdAt: -1 }).limit(20),
  ]);

  return {
    stats: {
      totalCourses: enrollments.length,
      completedCourses: enrollments.filter((item) => item.progressPercent >= 100).length,
      activeCourses: enrollments.filter((item) => item.progressPercent < 100).length,
      totalSpentAmount: payments.filter((item) => item.status === "PAID").reduce((sum, item) => sum + item.totalAmount, 0),
    },
    courses: enrollments.map((item) => {
      const totalLessons = listLessons(item.course).length;
      return {
        id: item.course._id,
        title: item.course.title,
        slug: item.course.slug,
        category: item.course.category,
        bannerUrl: item.course.bannerUrl,
        thumbnailUrl: item.course.thumbnailUrl,
        accessType: item.course.accessType,
        progressPercent: item.progressPercent,
        completedLessons: item.completedLessons,
        totalLessons,
        lastLessonId: item.lastLessonId,
      };
    }),
    notifications,
    payments: payments.map((payment) => ({
      id: payment._id,
      orderNumber: payment.orderNumber,
      invoiceNumber: payment.invoiceNumber,
      status: payment.status,
      totalAmount: payment.totalAmount,
      currency: payment.currency,
      createdAt: payment.createdAt,
      course: payment.course
        ? {
            id: payment.course._id,
            title: payment.course.title,
            slug: payment.course.slug,
          }
        : null,
    })),
  };
};

export const listNotifications = async (userId) => ({
  items: await Notification.find({ user: userId }).sort({ createdAt: -1 }).limit(50),
});

export const markNotificationRead = async ({ notificationId, userId }) => {
  const notification = await Notification.findOne({
    _id: notificationId,
    user: userId,
  });

  if (!notification) {
    throw new AppError(404, "Notification not found.");
  }

  notification.isRead = true;
  await notification.save();

  return {
    message: "Notification marked as read.",
  };
};

export const getPlayerData = async ({ courseSlug, lessonSlug, user }) => {
  const course = await Course.findOne({ slug: courseSlug });

  if (!course || course.isDeleted) {
    throw new AppError(404, "Course not found.");
  }

  let enrollment = await Enrollment.findOne({ user: user._id, course: course._id });

  if (!enrollment && course.accessType === "FREE") {
    enrollment = await Enrollment.create({
      user: user._id,
      course: course._id,
      status: "ACTIVE",
      type: "FREE",
    });
  }

  const orderedLessons = listLessons(course);
  const lessonEntry = orderedLessons.find((item) => item.lesson.slug === lessonSlug);

  if (!lessonEntry) {
    throw new AppError(404, "Lesson not found.");
  }

  if (!canAccessLesson({ user, course, lesson: lessonEntry.lesson, enrollment })) {
    throw new AppError(403, getLessonAccessErrorMessage(lessonEntry.lesson));
  }

  const progressEntries = await Progress.find({
    user: user._id,
    course: course._id,
  });

  const progressMap = Object.fromEntries(progressEntries.map((entry) => [entry.lessonId.toString(), entry]));
  const currentIndex = orderedLessons.findIndex((item) => item.lesson._id.toString() === lessonEntry.lesson._id.toString());
  const previous =
    currentIndex > 0
      ? [...orderedLessons.slice(0, currentIndex)]
          .reverse()
          .find((item) => canAccessLesson({ user, course, lesson: item.lesson, enrollment })) || null
      : null;
  const next =
    currentIndex < orderedLessons.length - 1
      ? orderedLessons
          .slice(currentIndex + 1)
          .find((item) => canAccessLesson({ user, course, lesson: item.lesson, enrollment })) || null
      : null;

  return {
    course: {
      id: course._id,
      title: course.title,
      slug: course.slug,
      accessType: course.accessType,
      category: course.category,
      instructor: course.instructor,
      prerequisites: course.prerequisites,
    },
    lesson: {
      id: lessonEntry.lesson._id,
      title: lessonEntry.lesson.title,
      slug: lessonEntry.lesson.slug,
      description: lessonEntry.lesson.description,
      topic: lessonEntry.lesson.topic,
      content: lessonEntry.lesson.content,
      durationMinutes: lessonEntry.lesson.durationMinutes,
      posterUrl: lessonEntry.lesson.posterUrl,
      thumbnailUrl: lessonEntry.lesson.thumbnailUrl,
      streamUrl: lessonEntry.lesson.videoMediaId
        ? buildStreamUrl({
            mediaId: lessonEntry.lesson.videoMediaId.toString(),
            courseId: course._id.toString(),
            lessonId: lessonEntry.lesson._id.toString(),
            userId: user._id.toString(),
          })
        : null,
      progress: progressMap[lessonEntry.lesson._id.toString()] || null,
    },
    navigation: {
      previousLesson: previous
        ? { id: previous.lesson._id, slug: previous.lesson.slug, title: previous.lesson.title }
        : null,
      nextLesson: next ? { id: next.lesson._id, slug: next.lesson.slug, title: next.lesson.title } : null,
    },
    chapters: course.chapters
      .filter((chapter) => !chapter.isDeleted)
      .sort((left, right) => left.position - right.position)
      .map((chapter) => ({
        id: chapter._id,
        title: chapter.title,
        lessons: chapter.lessons
          .filter((lesson) => !lesson.isDeleted && lesson.isPublished)
          .sort((left, right) => left.position - right.position)
          .map((lesson) => ({
            id: lesson._id,
            slug: lesson.slug,
            title: lesson.title,
            visibility: lesson.visibility,
            isFreeIntro: lesson.isFreeIntro,
            unlocked: canAccessLesson({ user, course, lesson, enrollment }),
            progress: progressMap[lesson._id.toString()] || null,
          })),
      })),
  };
};

export const updateLessonProgress = async ({ lessonId, payload, user }) => {
  const course = await Course.findOne({
    "chapters.lessons._id": lessonId,
  });

  if (!course) {
    throw new AppError(404, "Lesson not found.");
  }

  const { lesson } = findLesson(course, lessonId);

  let enrollment = await Enrollment.findOne({
    user: user._id,
    course: course._id,
  });

  if (!enrollment && course.accessType === "FREE") {
    enrollment = await Enrollment.create({
      user: user._id,
      course: course._id,
      status: "ACTIVE",
      type: "FREE",
    });
  }

  if (!canAccessLesson({ user, course, lesson, enrollment })) {
    throw new AppError(403, getLessonAccessErrorMessage(lesson));
  }

  const durationSeconds = Math.max(payload.durationSeconds, 1);
  const completionPercent = Math.min(Math.round((payload.watchedSeconds / durationSeconds) * 100), 100);
  const isCompleted = payload.isCompleted ?? completionPercent >= 90;

  const progress = await Progress.findOneAndUpdate(
    {
      user: user._id,
      lessonId,
    },
    {
      $set: {
        user: user._id,
        course: course._id,
        lessonId,
        watchedSeconds: payload.watchedSeconds,
        durationSeconds,
        completionPercent,
        isCompleted,
        lastPlaybackRate: payload.lastPlaybackRate || 1,
        completedAt: isCompleted ? new Date() : null,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );

  if (enrollment) {
    const courseLessons = listLessons(course);
    const progressEntries = await Progress.find({
      user: user._id,
      course: course._id,
    });
    const completedLessons = progressEntries.filter((entry) => entry.isCompleted).length;
    const progressPercent = courseLessons.length ? Math.round((completedLessons / courseLessons.length) * 100) : 0;

    enrollment.completedLessons = completedLessons;
    enrollment.progressPercent = progressPercent;
    enrollment.lastLessonId = lesson._id;
    await enrollment.save();

    return {
      progress,
      courseProgress: {
        completedLessons,
        progressPercent,
      },
    };
  }

  return {
    progress,
    courseProgress: {
      completedLessons: 0,
      progressPercent: 0,
    },
  };
};
