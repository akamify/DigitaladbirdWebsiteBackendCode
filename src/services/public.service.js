import Course from "../models/Course.js";
import Enrollment from "../models/Enrollment.js";
import Progress from "../models/Progress.js";
import { env } from "../config/env.js";
import AppError from "../utils/appError.js";
import { getPagination, matchesPublishedState } from "../utils/common.js";
import { sendEmail } from "../utils/email.js";
import { buildCourseSummary, canAccessCourse, createNotification, serializeCourseDetail } from "./core.service.js";

export const listCourses = async ({ query, user }) => {
  const { page, pageSize, skip } = getPagination(query);
  const filter = {
    isDeleted: false,
  };

  if (query.category) {
    filter.category = query.category;
  }

  if (query.difficulty) {
    filter.difficulty = query.difficulty;
  }

  if (query.accessType) {
    filter.accessType = query.accessType;
  }

  if (query.featured) {
    filter.featured = query.featured === "true";
  }

  if (query.q) {
    filter.$or = [
      { title: new RegExp(query.q, "i") },
      { shortDescription: new RegExp(query.q, "i") },
      { category: new RegExp(query.q, "i") },
      { topic: new RegExp(query.q, "i") },
    ];
  }

  const allMatching = await Course.find(filter).sort({ featured: -1, publishedAt: -1, createdAt: -1 });
  const courses = allMatching.filter(matchesPublishedState);
  const pageItems = courses.slice(skip, skip + pageSize);

  const enrollments = user
    ? await Enrollment.find({
        user: user._id,
        course: { $in: pageItems.map((course) => course._id) },
      })
    : [];

  const enrollmentMap = Object.fromEntries(enrollments.map((item) => [item.course.toString(), item]));

  return {
    items: pageItems.map((course) =>
      buildCourseSummary({
        course,
        enrollment: enrollmentMap[course._id.toString()],
        user,
      }),
    ),
    pagination: {
      page,
      pageSize,
      total: courses.length,
      totalPages: Math.ceil(courses.length / pageSize),
    },
  };
};

export const getCourseBySlug = async ({ slug, user }) => {
  const course = await Course.findOne({ slug });

  if (!course) {
    throw new AppError(404, "Course not found.");
  }

  if (!matchesPublishedState(course) && !(user && ["SUPER_ADMIN", "ADMIN", "INSTRUCTOR"].includes(user.role))) {
    throw new AppError(404, "Course not found.");
  }

  const [enrollment, progressEntries] = user
    ? await Promise.all([
        Enrollment.findOne({
          user: user._id,
          course: course._id,
        }),
        Progress.find({
          user: user._id,
          course: course._id,
        }),
      ])
    : [null, []];

  course.views += 1;
  await course.save();

  return {
    course: await serializeCourseDetail({
      course,
      user,
      enrollment,
      progressMap: Object.fromEntries(progressEntries.map((entry) => [entry.lessonId.toString(), entry])),
    }),
  };
};

export const enrollInFreeCourse = async ({ slug, user }) => {
  const course = await Course.findOne({ slug });

  if (!course || !matchesPublishedState(course)) {
    throw new AppError(404, "Course not found.");
  }

  if (course.accessType !== "FREE") {
    throw new AppError(400, "This course requires payment.");
  }

  const enrollment = await Enrollment.findOneAndUpdate(
    {
      user: user._id,
      course: course._id,
    },
    {
      $set: {
        user: user._id,
        course: course._id,
        status: "ACTIVE",
        type: "FREE",
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );

  await createNotification({
    user: user._id,
    type: "ENROLLMENT",
    title: "Free enrollment confirmed",
    message: `You are now enrolled in ${course.title}.`,
    actionUrl: "/dashboard",
  });

  return {
    message: "Enrollment successful.",
    enrollment,
  };
};

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const submitWebinarRegistration = async ({ payload }) => {
  const { name, email, phone, business, city, state, about } = payload;
  const toEmails = [...new Set(env.enquiryToEmails.filter(Boolean))];

  if (!toEmails.length) {
    throw new AppError(500, "Enquiry email is not configured.");
  }

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111111; line-height: 1.6;">
      <h2 style="margin: 0 0 16px;">New Webinar Registration</h2>
      <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 10px 0; border-bottom: 1px solid #e6e6e6;"><strong>Name</strong></td><td style="padding: 10px 0; border-bottom: 1px solid #e6e6e6;">${escapeHtml(name)}</td></tr>
        <tr><td style="padding: 10px 0; border-bottom: 1px solid #e6e6e6;"><strong>Email</strong></td><td style="padding: 10px 0; border-bottom: 1px solid #e6e6e6;">${escapeHtml(email)}</td></tr>
        <tr><td style="padding: 10px 0; border-bottom: 1px solid #e6e6e6;"><strong>Phone</strong></td><td style="padding: 10px 0; border-bottom: 1px solid #e6e6e6;">${escapeHtml(phone)}</td></tr>
        <tr><td style="padding: 10px 0; border-bottom: 1px solid #e6e6e6;"><strong>Business</strong></td><td style="padding: 10px 0; border-bottom: 1px solid #e6e6e6;">${escapeHtml(business)}</td></tr>
        <tr><td style="padding: 10px 0; border-bottom: 1px solid #e6e6e6;"><strong>City</strong></td><td style="padding: 10px 0; border-bottom: 1px solid #e6e6e6;">${escapeHtml(city || "-")}</td></tr>
        <tr><td style="padding: 10px 0; border-bottom: 1px solid #e6e6e6;"><strong>State</strong></td><td style="padding: 10px 0; border-bottom: 1px solid #e6e6e6;">${escapeHtml(state || "-")}</td></tr>
      </table>
      <div style="margin-top: 18px;">
        <strong>About the business</strong>
        <p style="margin: 8px 0 0;">${escapeHtml(about)}</p>
      </div>
    </div>
  `;

  const text = [
    "New Webinar Registration",
    `Name: ${name}`,
    `Email: ${email}`,
    `Phone: ${phone}`,
    `Business: ${business}`,
    `City: ${city || "-"}`,
    `State: ${state || "-"}`,
    `About: ${about}`,
  ].join("\n");

  await sendEmail({
    to: toEmails.join(", "),
    replyTo: email,
    subject: `New webinar registration from ${name}`,
    text,
    html,
  });

  return {
    ok: true,
    message: "Registration submitted successfully. We have received your details.",
  };
};
