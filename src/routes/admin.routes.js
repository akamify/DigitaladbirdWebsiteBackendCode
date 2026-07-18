import express from "express";
import * as adminController from "../controllers/admin.controller.js";
import { authorize, protect } from "../middlewares/auth.middleware.js";
import { upload } from "../utils/fileStorage.js";
import { validate } from "../middlewares/validate.middleware.js";
import catchAsync from "../utils/catchAsync.js";
import {
  chapterPayloadSchema,
  couponPayloadSchema,
  coursePayloadSchema,
  lessonPayloadSchema,
  reorderSchema,
} from "../validators/admin.validator.js";

const router = express.Router();

router.use(protect);
router.use(authorize("SUPER_ADMIN", "ADMIN", "INSTRUCTOR"));

router.get("/overview", catchAsync(adminController.overview));
router.get("/courses", catchAsync(adminController.listCourses));
router.get("/courses/:courseId", catchAsync(adminController.getCourse));
router.post("/courses", validate(coursePayloadSchema), catchAsync(adminController.createCourse));
router.put("/courses/:courseId", validate(coursePayloadSchema.partial()), catchAsync(adminController.updateCourse));
router.delete("/courses/:courseId", catchAsync(adminController.archiveCourse));
router.post("/courses/:courseId/restore", catchAsync(adminController.restoreCourse));
router.post("/courses/:courseId/publish", catchAsync(adminController.publishCourse));
router.post("/courses/:courseId/unpublish", catchAsync(adminController.unpublishCourse));

router.post("/courses/:courseId/chapters", validate(chapterPayloadSchema), catchAsync(adminController.addChapter));
router.put("/chapters/:chapterId", validate(chapterPayloadSchema.partial()), catchAsync(adminController.updateChapter));
router.delete("/chapters/:chapterId", catchAsync(adminController.removeChapter));
router.post("/courses/:courseId/chapters/reorder", validate(reorderSchema), catchAsync(adminController.reorderChapters));

router.post("/chapters/:chapterId/lessons", validate(lessonPayloadSchema), catchAsync(adminController.addLesson));
router.put("/lessons/:lessonId", validate(lessonPayloadSchema.partial()), catchAsync(adminController.updateLesson));
router.delete("/lessons/:lessonId", catchAsync(adminController.removeLesson));
router.post("/chapters/:chapterId/lessons/reorder", validate(reorderSchema), catchAsync(adminController.reorderLessons));

router.post("/media/upload", upload.single("file"), catchAsync(adminController.uploadMedia));
router.get("/media", catchAsync(adminController.listMedia));
router.delete("/media/:mediaId", catchAsync(adminController.deleteMedia));
router.get("/audit-logs", catchAsync(adminController.auditLogs));
router.get("/users", catchAsync(adminController.listUsers));
router.get("/payments", catchAsync(adminController.listPayments));

router.get("/coupons", catchAsync(adminController.listCoupons));
router.post("/coupons", validate(couponPayloadSchema), catchAsync(adminController.createCoupon));
router.put("/coupons/:couponId", validate(couponPayloadSchema.partial()), catchAsync(adminController.updateCoupon));
router.delete("/coupons/:couponId", catchAsync(adminController.disableCoupon));

router.get("/settings", catchAsync(adminController.listSettings));
router.put("/settings/:key", catchAsync(adminController.updateSetting));

router.get("/reports/sales.csv", catchAsync(adminController.salesReport));
router.get("/reports/enrollments.csv", catchAsync(adminController.enrollmentsReport));

export default router;
