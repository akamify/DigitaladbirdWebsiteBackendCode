import express from "express";
import * as studentController from "../controllers/student.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import catchAsync from "../utils/catchAsync.js";
import { progressSchema } from "../validators/course.validator.js";

const router = express.Router();

router.use(protect);

router.get("/dashboard", catchAsync(studentController.dashboard));
router.get("/notifications", catchAsync(studentController.notifications));
router.post("/notifications/:notificationId/read", catchAsync(studentController.markNotificationRead));
router.get("/learn/:courseSlug/:lessonSlug", catchAsync(studentController.lessonPlayer));
router.post("/lessons/:lessonId/progress", validate(progressSchema), catchAsync(studentController.updateProgress));

export default router;

