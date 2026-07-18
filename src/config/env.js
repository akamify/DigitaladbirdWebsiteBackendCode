import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..", "..");
const uploadsRoot = path.join(rootDir, "uploads");
const publicUploadsDir = path.join(uploadsRoot, "public");
const protectedUploadsDir = path.join(uploadsRoot, "protected");

[uploadsRoot, publicUploadsDir, protectedUploadsDir].forEach((directory) => {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
});

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 5000),
  clientUrl: process.env.CLIENT_URL || "http://localhost:3000",
  clientUrls: (
    process.env.CLIENT_URLS ||
    process.env.CLIENT_URL ||
    "http://localhost:3000,http://localhost:4028,https://digitaladbird.com,https://www.digitaladbird.com"
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  mongodbUri: process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017/courseforge",
  jwtSecret: process.env.JWT_SECRET || "replace-with-a-secret",
  mediaTokenSecret: process.env.MEDIA_TOKEN_SECRET || "replace-with-media-secret",
  siteBaseUrl:
    process.env.SITE_BASE_URL ||
    (process.env.NODE_ENV === "production"
      ? "https://api.digitaladbird.com"
      : `http://localhost:${process.env.PORT || 5000}`),
  smtpHost: process.env.SMTP_HOST || process.env.DEFAULT_SMTP_HOST || "",
  smtpPort: process.env.SMTP_PORT
    ? Number(process.env.SMTP_PORT)
    : process.env.DEFAULT_SMTP_PORT
      ? Number(process.env.DEFAULT_SMTP_PORT)
      : 587,
  smtpUser: process.env.SMTP_USER || process.env.DEFAULT_SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || process.env.DEFAULT_SMTP_PASS || "",
  mailFrom:
    process.env.MAIL_FROM ||
    (process.env.DEFAULT_FROM_EMAIL
      ? `${process.env.DEFAULT_FROM_NAME || "Digital Adbird"} <${process.env.DEFAULT_FROM_EMAIL}>`
      : "CourseForge <noreply@example.com>"),
  enquiryToEmails: [
    process.env.ENQUIRY_TO_EMAIL,
    process.env.DEFAULT_TO_EMAIL,
    process.env.DEFAULT_FROM_EMAIL,
    process.env.DEFAULT_SMTP_USER,
    process.env.SMTP_USER,
  ].filter(Boolean),
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || "",
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || "",
  razorpayCurrency: process.env.RAZORPAY_CURRENCY || "INR",
  defaultSuperAdminEmail: process.env.DEFAULT_SUPER_ADMIN_EMAIL || "owner@courseforge.dev",
  defaultSuperAdminPassword: process.env.DEFAULT_SUPER_ADMIN_PASSWORD || "Admin@12345",
  uploadsRoot,
  publicUploadsDir,
  protectedUploadsDir,
};
