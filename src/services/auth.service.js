import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Enrollment from "../models/Enrollment.js";
import Notification from "../models/Notification.js";
import { env } from "../config/env.js";
import AppError from "../utils/appError.js";
import { signAccessToken } from "../utils/jwt.js";
import { buildResetEmail, sendEmail } from "../utils/email.js";
import { maskPhone, normalizePhone } from "../utils/phone.js";
import { createAuditLog, randomToken } from "./core.service.js";

const serializeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  avatarUrl: user.avatarUrl,
  bio: user.bio,
  createdAt: user.createdAt,
});

export const signup = async ({ name, email, phone, password }) => {
  const existingUser = await User.findOne({ email: email.toLowerCase() });

  if (existingUser) {
    throw new AppError(409, "An account with this email already exists.");
  }

  const phoneNormalized = normalizePhone(phone);
  if (!phoneNormalized) {
    throw new AppError(400, "Enter a valid phone number.");
  }

  const user = await User.create({
    name,
    email: email.toLowerCase(),
    phone,
    phoneNormalized,
    password: await bcrypt.hash(password, 10),
  });

  await createAuditLog({
    actor: user,
    action: "auth.signup",
    entityType: "user",
    entityId: user._id.toString(),
    details: { email: user.email },
  });

  return {
    token: signAccessToken(user),
    user: serializeUser(user),
  };
};

export const login = async ({ email, password }) => {
  const user = await User.findOne({ email: email.toLowerCase() });

  if (!user) {
    throw new AppError(401, "Invalid email or password.");
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    throw new AppError(401, "Invalid email or password.");
  }

  if (!user.isActive) {
    throw new AppError(403, "Your account has been disabled.");
  }

  await createAuditLog({
    actor: user,
    action: "auth.login",
    entityType: "user",
    entityId: user._id.toString(),
    details: {},
  });

  return {
    token: signAccessToken(user),
    user: serializeUser(user),
  };
};

export const me = async (userId) => {
  const [user, enrollmentsCount, unreadNotifications] = await Promise.all([
    User.findById(userId),
    Enrollment.countDocuments({ user: userId }),
    Notification.countDocuments({ user: userId, isRead: false }),
  ]);

  return {
    user: serializeUser(user),
    meta: {
      enrollmentsCount,
      unreadNotifications,
    },
  };
};

export const updateProfile = async (userId, payload) => {
  const phoneNormalized = payload.phone !== undefined && payload.phone !== "" ? normalizePhone(payload.phone) : null;
  if (payload.phone && !phoneNormalized) {
    throw new AppError(400, "Enter a valid phone number.");
  }

  const user = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        ...(payload.name ? { name: payload.name } : {}),
        ...(payload.bio !== undefined ? { bio: payload.bio } : {}),
        ...(payload.avatarUrl !== undefined ? { avatarUrl: payload.avatarUrl || null } : {}),
        ...(payload.phone !== undefined ? { phone: payload.phone || null, phoneNormalized } : {}),
      },
    },
    { new: true },
  );

  await createAuditLog({
    actor: user,
    action: "auth.profile.updated",
    entityType: "user",
    entityId: user._id.toString(),
    details: {
      ...payload,
      ...(payload.phone !== undefined ? { phone: payload.phone ? maskPhone(payload.phone) : null } : {}),
    },
  });

  return {
    user: serializeUser(user),
  };
};

export const forgotPassword = async ({ email }) => {
  const user = await User.findOne({ email: email.toLowerCase() });

  if (!user) {
    return {
      message: "If this email exists, a reset link has been sent.",
    };
  }

  const token = randomToken();
  const resetUrl = `${env.clientUrl}/auth/reset-password?token=${token}`;

  user.resetPasswordToken = token;
  user.resetPasswordExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await user.save();

  await sendEmail({
    to: user.email,
    ...buildResetEmail({
      name: user.name,
      resetUrl,
    }),
  });

  return {
    message: "If this email exists, a reset link has been sent.",
    ...(env.nodeEnv === "production" ? {} : { devResetUrl: resetUrl }),
  };
};

export const resetPassword = async ({ token, password }) => {
  const user = await User.findOne({
    resetPasswordToken: token,
    resetPasswordExpiresAt: { $gt: new Date() },
  });

  if (!user) {
    throw new AppError(400, "This reset link is invalid or expired.");
  }

  user.password = await bcrypt.hash(password, 10);
  user.resetPasswordToken = undefined;
  user.resetPasswordExpiresAt = undefined;
  await user.save();

  await createAuditLog({
    actor: user,
    action: "auth.password.reset",
    entityType: "user",
    entityId: user._id.toString(),
    details: {},
  });

  return {
    message: "Password reset successful.",
  };
};
