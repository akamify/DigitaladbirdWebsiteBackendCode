import { z } from "zod";

export const createOrderSchema = z.object({
  couponCode: z.string().trim().optional(),
  notes: z.record(z.string(), z.any()).optional(),
});

export const verifyPaymentSchema = z.object({
  paymentId: z.string().min(6),
  razorpayOrderId: z.string().min(6),
  razorpayPaymentId: z.string().min(6),
  razorpaySignature: z.string().min(6),
});

