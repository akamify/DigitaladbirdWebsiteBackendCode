import express from "express";
import * as authController from "../controllers/auth.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { authLimiter } from "../middlewares/rate-limit.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import catchAsync from "../utils/catchAsync.js";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  updateProfileSchema,
} from "../validators/auth.validator.js";

const router = express.Router();

router.post("/signup", authLimiter, validate(signupSchema), catchAsync(authController.signup));
router.post("/login", authLimiter, validate(loginSchema), catchAsync(authController.login));
router.get("/me", protect, catchAsync(authController.me));
router.patch("/profile", protect, validate(updateProfileSchema), catchAsync(authController.updateProfile));
router.post("/forgot-password", authLimiter, validate(forgotPasswordSchema), catchAsync(authController.forgotPassword));
router.post("/reset-password", authLimiter, validate(resetPasswordSchema), catchAsync(authController.resetPassword));
router.post("/logout", protect, catchAsync(authController.logout));

export default router;

