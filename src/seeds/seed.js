import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { env } from "../config/env.js";
import Course from "../models/Course.js";
import Coupon from "../models/Coupon.js";
import Enrollment from "../models/Enrollment.js";
import Notification from "../models/Notification.js";
import Payment from "../models/Payment.js";
import Progress from "../models/Progress.js";
import Setting from "../models/Setting.js";
import User from "../models/User.js";
import { toSlug } from "../utils/common.js";

const createUser = async ({ name, email, password, role, bio }) =>
  User.create({
    name,
    email,
    password: await bcrypt.hash(password, 10),
    role,
    bio,
  });

const buildCourse = ({ title, category, accessType, priceAmount, instructorName, description, shortDescription }) => ({
  title,
  slug: toSlug(title),
  topic: category,
  description,
  shortDescription,
  category,
  difficulty: accessType === "FREE" ? "Beginner" : "Intermediate",
  durationLabel: "6 hours",
  durationMinutes: 360,
  language: "English",
  tags: ["lms", category.toLowerCase(), "courseforge"],
  seoTitle: `${title} | CourseForge`,
  seoDescription: shortDescription,
  prerequisites: ["Laptop or phone", "Internet access"],
  instructor: {
    name: instructorName,
    bio: `${instructorName} teaches with live workflows and practical execution plans.`,
    imageUrl: "",
  },
  bannerUrl: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1400&q=80",
  thumbnailUrl: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1000&q=80",
  status: "PUBLISHED",
  accessType,
  price: {
    amount: priceAmount,
    currency: env.razorpayCurrency,
  },
  featured: true,
  publishedAt: new Date(),
  chapters: [
    {
      title: "Orientation and Strategy",
      slug: toSlug("Orientation and Strategy"),
      description: "Set expectations, goals, and the delivery model.",
      position: 1,
      lessons: [
        {
          title: "Course Welcome",
          slug: toSlug("Course Welcome"),
          description: "See the learning roadmap and platform flow.",
          topic: "Orientation",
          content: "This lesson explains the learning roadmap, resources, and dashboard flow.",
          durationMinutes: 9,
          visibility: "PREVIEW",
          isFreeIntro: true,
          isPublished: true,
          position: 1,
        },
        {
          title: "Building a Repeatable System",
          slug: toSlug("Building a Repeatable System"),
          description: "Turn ad-hoc effort into a reliable workflow.",
          topic: "Systems",
          content: "Map outcomes, milestones, and review checkpoints into one repeatable system.",
          durationMinutes: 24,
          visibility: accessType === "FREE" ? "PAID_ONLY" : "PAID_ONLY",
          isPublished: true,
          position: 2,
        },
      ],
    },
    {
      title: "Execution and Optimization",
      slug: toSlug("Execution and Optimization"),
      description: "Ship, measure, and improve learner outcomes.",
      position: 2,
      lessons: [
        {
          title: "Operational Dashboard",
          slug: toSlug("Operational Dashboard"),
          description: "Track enrollments, completion, and growth.",
          topic: "Analytics",
          content: "Use dashboards, cohorts, and leading metrics to improve performance.",
          durationMinutes: 21,
          visibility: "PAID_ONLY",
          isPublished: true,
          position: 1,
        },
        {
          title: "Growth Review Loop",
          slug: toSlug("Growth Review Loop"),
          description: "Keep course content fresh and commercially strong.",
          topic: "Optimization",
          content: "Review feedback, performance, and conversion data in one weekly cycle.",
          durationMinutes: 20,
          visibility: "PAID_ONLY",
          isPublished: true,
          position: 2,
        },
      ],
    },
  ],
});

const run = async () => {
  await connectDatabase();

  await Promise.all([
    User.deleteMany({}),
    Course.deleteMany({}),
    Coupon.deleteMany({}),
    Enrollment.deleteMany({}),
    Payment.deleteMany({}),
    Progress.deleteMany({}),
    Notification.deleteMany({}),
    Setting.deleteMany({}),
  ]);

  const superAdmin = await createUser({
    name: "CourseForge Owner",
    email: env.defaultSuperAdminEmail,
    password: env.defaultSuperAdminPassword,
    role: "SUPER_ADMIN",
    bio: "Platform owner",
  });

  const admin = await createUser({
    name: "Ava Stone",
    email: "admin@courseforge.dev",
    password: "Admin@12345",
    role: "ADMIN",
    bio: "Operations admin",
  });

  const instructor = await createUser({
    name: "Miles Carter",
    email: "instructor@courseforge.dev",
    password: "Instructor@12345",
    role: "INSTRUCTOR",
    bio: "Growth and systems instructor",
  });

  const student = await createUser({
    name: "Lena Brooks",
    email: "student@courseforge.dev",
    password: "Student@12345",
    role: "USER",
    bio: "Demo student",
  });

  const freeCourse = await Course.create({
    ...buildCourse({
      title: "Modern Content Systems Bootcamp",
      category: "Content",
      accessType: "FREE",
      priceAmount: 0,
      instructorName: instructor.name,
      description: "A practical system for creators who want to structure, publish, and improve educational content.",
      shortDescription: "Build a repeatable content engine from idea to delivery.",
    }),
    createdBy: admin._id,
    updatedBy: admin._id,
  });

  freeCourse.introLessonId = freeCourse.chapters[0].lessons[0]._id;
  await freeCourse.save();

  const paidCourse = await Course.create({
    ...buildCourse({
      title: "Course Revenue Engine Masterclass",
      category: "Growth",
      accessType: "PAID",
      priceAmount: 149900,
      instructorName: instructor.name,
      description: "A premium course on launching, selling, and optimizing paid learning products.",
      shortDescription: "Launch and scale paid courses with stronger checkout and retention systems.",
    }),
    createdBy: superAdmin._id,
    updatedBy: superAdmin._id,
  });

  paidCourse.introLessonId = paidCourse.chapters[0].lessons[0]._id;
  await paidCourse.save();

  await Enrollment.create({
    user: student._id,
    course: freeCourse._id,
    status: "ACTIVE",
    type: "FREE",
  });

  await Coupon.create({
    code: "WELCOME10",
    title: "Welcome 10% Off",
    description: "Applies 10% off to premium courses",
    type: "PERCENTAGE",
    amount: 10,
    minOrderAmount: 100000,
    usageLimit: 100,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90),
    isActive: true,
    appliesToAll: true,
    createdBy: superAdmin._id,
  });

  await Coupon.create({
    code: "GROWTH500",
    title: "Flat 500 Off",
    description: "Flat INR 500 discount on the paid growth course",
    type: "FLAT",
    amount: 50000,
    minOrderAmount: 100000,
    usageLimit: 40,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 45),
    isActive: true,
    appliesToAll: false,
    applicableCourseIds: [paidCourse._id],
    createdBy: admin._id,
  });

  await Setting.create({
    key: "site",
    value: {
      siteName: "CourseForge",
      tagline: "Build, sell, and deliver premium learning experiences.",
      supportEmail: "support@courseforge.dev",
      logoText: "CourseForge",
    },
  });

  await Setting.create({
    key: "payment",
    value: {
      provider: "razorpay",
      currency: env.razorpayCurrency,
      keyId: env.razorpayKeyId || "",
    },
  });

  console.log("Seed complete");
  console.log("Super admin:", env.defaultSuperAdminEmail, env.defaultSuperAdminPassword);
  console.log("Admin: admin@courseforge.dev / Admin@12345");
  console.log("Instructor: instructor@courseforge.dev / Instructor@12345");
  console.log("Student: student@courseforge.dev / Student@12345");

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
