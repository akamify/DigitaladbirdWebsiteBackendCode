import express from "express";
import * as publicController from "../controllers/public.controller.js";
import { optionalAuth, protect } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import catchAsync from "../utils/catchAsync.js";
import { checkoutPreviewSchema, listCoursesQuerySchema } from "../validators/course.validator.js";
import { webinarRegistrationSchema } from "../validators/public.validator.js";

const router = express.Router();

router.get("/courses", optionalAuth, validate(listCoursesQuerySchema, "query"), catchAsync(publicController.listCourses));
router.get("/courses/:slug", optionalAuth, catchAsync(publicController.getCourse));
router.post("/courses/:slug/enroll-free", protect, catchAsync(publicController.enrollFree));
router.post("/courses/:slug/checkout-preview", protect, validate(checkoutPreviewSchema), catchAsync(publicController.checkoutPreview));
router.post("/webinar-register", validate(webinarRegistrationSchema), catchAsync(publicController.submitWebinarRegistration));

export default router;
