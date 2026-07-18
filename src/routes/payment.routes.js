import express from "express";
import * as paymentController from "../controllers/payment.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { checkoutLimiter } from "../middlewares/rate-limit.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import catchAsync from "../utils/catchAsync.js";
import { createOrderSchema, verifyPaymentSchema } from "../validators/payment.validator.js";

const router = express.Router();

router.post("/checkout/:slug", protect, checkoutLimiter, validate(createOrderSchema), catchAsync(paymentController.createOrder));
router.post("/verify", protect, checkoutLimiter, validate(verifyPaymentSchema), catchAsync(paymentController.verifyPayment));
router.get("/:paymentId", protect, catchAsync(paymentController.paymentStatus));
router.get("/:paymentId/invoice", protect, catchAsync(paymentController.invoice));
router.post("/webhook", catchAsync(paymentController.webhook));

export default router;

