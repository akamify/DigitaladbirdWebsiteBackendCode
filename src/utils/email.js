import nodemailer from "nodemailer";
import { env } from "../config/env.js";

let transporter = null;

if (env.smtpHost && env.smtpUser && env.smtpPass) {
  transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
  });
}

export const sendEmail = async ({ to, subject, html, text, replyTo }) => {
  if (!transporter) {
    console.log(`[mail:dev] ${subject} -> ${to}`);
    console.log(text || html);
    return { delivered: false };
  }

  await transporter.sendMail({
    from: env.mailFrom,
    to,
    subject,
    html,
    text,
    ...(replyTo ? { replyTo } : {}),
  });

  return { delivered: true };
};

export const buildResetEmail = ({ name, resetUrl }) => ({
  subject: "Reset your CourseForge password",
  text: `Hi ${name},\n\nReset your password using this link:\n${resetUrl}`,
  html: `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e7d8bf;border-radius:18px;background:#fffaf3">
      <h2 style="margin-top:0">Reset your password</h2>
      <p>Hi ${name},</p>
      <p>Use the button below to reset your CourseForge password.</p>
      <p style="margin:24px 0">
        <a href="${resetUrl}" style="background:#d97706;color:white;padding:12px 18px;border-radius:999px;text-decoration:none">Reset password</a>
      </p>
      <p>${resetUrl}</p>
    </div>
  `,
});

export const buildEnrollmentEmail = ({ name, courseTitle, dashboardUrl, amountLabel }) => ({
  subject: `Your access to ${courseTitle} is ready`,
  text: `Hi ${name},\n\nYour access to ${courseTitle} is active.\nAmount: ${amountLabel}\nDashboard: ${dashboardUrl}`,
  html: `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #d4e8f7;border-radius:18px;background:#f8fcff">
      <h2 style="margin-top:0">Enrollment confirmed</h2>
      <p>Hi ${name},</p>
      <p>Your course access for <strong>${courseTitle}</strong> is now active.</p>
      <p>Amount paid: <strong>${amountLabel}</strong></p>
      <p style="margin:24px 0">
        <a href="${dashboardUrl}" style="background:#0f766e;color:white;padding:12px 18px;border-radius:999px;text-decoration:none">Open dashboard</a>
      </p>
    </div>
  `,
});
