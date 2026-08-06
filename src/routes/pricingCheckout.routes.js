import express from "express";
import * as pricingCheckoutController from "../controllers/pricingCheckout.controller.js";
import { optionalAuth } from "../middlewares/auth.middleware.js";
import { checkoutLimiter } from "../middlewares/rate-limit.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import catchAsync from "../utils/catchAsync.js";
import {
  pricingDetailsSchema,
  pricingSelectionSchema,
  sendPricingEmailOtpSchema,
  sendPricingOtpSchema,
  startPricingCheckoutSchema,
  validatePricingWhatsappNumberSchema,
  verifyPricingEmailOtpSchema,
  verifyPricingOtpSchema,
} from "../validators/pricingCheckout.validator.js";

const router = express.Router();

router.use(optionalAuth);
router.post("/start", checkoutLimiter, validate(startPricingCheckoutSchema), catchAsync(pricingCheckoutController.start));
router.get("/resume/:token", checkoutLimiter, catchAsync(pricingCheckoutController.resume));
router.post("/whatsapp-number/validate", checkoutLimiter, validate(validatePricingWhatsappNumberSchema), catchAsync(pricingCheckoutController.validateWhatsappNumber));
router.patch("/:id/selection", checkoutLimiter, validate(pricingSelectionSchema), catchAsync(pricingCheckoutController.updateSelection));
router.patch("/:id/details", checkoutLimiter, validate(pricingDetailsSchema), catchAsync(pricingCheckoutController.updateDetails));
router.post("/:id/email-otp/send", checkoutLimiter, validate(sendPricingEmailOtpSchema), catchAsync(pricingCheckoutController.sendEmailOtp));
router.post("/:id/email-otp/verify", checkoutLimiter, validate(verifyPricingEmailOtpSchema), catchAsync(pricingCheckoutController.verifyEmailOtp));
router.post("/:id/whatsapp-otp/send", checkoutLimiter, validate(sendPricingOtpSchema), catchAsync(pricingCheckoutController.sendWhatsappOtp));
router.post("/:id/whatsapp-otp/verify", checkoutLimiter, validate(verifyPricingOtpSchema), catchAsync(pricingCheckoutController.verifyWhatsappOtp));
router.post("/:id/submit", checkoutLimiter, catchAsync(pricingCheckoutController.submit));
router.post("/:id/abandon", checkoutLimiter, catchAsync(pricingCheckoutController.abandon));

export default router;
