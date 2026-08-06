import { z } from "zod";

const addonSchema = z.object({
  label: z.string().trim().min(1),
  price: z.string().trim().optional().default(""),
  amount: z.number().int().min(0).optional().default(0),
});

const planSnapshotSchema = z.object({
  planId: z.string().trim().min(1),
  planName: z.string().trim().min(1),
  category: z.string().trim().optional().default(""),
  billingTab: z.string().trim().min(1),
  priceLabel: z.string().trim().optional().default(""),
  priceSuffix: z.string().trim().optional().default(""),
  billingNote: z.string().trim().optional().default(""),
});

export const startPricingCheckoutSchema = z.object({
  resumeToken: z.string().trim().optional(),
  planSnapshot: planSnapshotSchema.optional(),
  selectedDuration: z.string().trim().optional().default(""),
  selectedAddons: z.array(addonSchema).optional().default([]),
  estimatedAmount: z.number().int().min(0).optional().default(0),
});

export const pricingSelectionSchema = z.object({
  selectedDuration: z.string().trim().min(1),
  selectedAddons: z.array(addonSchema).optional().default([]),
  estimatedAmount: z.number().int().min(0).optional().default(0),
});

export const pricingDetailsSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required."),
  brandName: z.string().trim().min(1, "Brand name is required."),
  city: z.string().trim().min(1, "City is required."),
  email: z.email("Enter a valid email address.").trim(),
  whatsappNumber: z.string().trim().min(10, "Phone is required."),
  callNumber: z.string().trim().optional().default(""),
  gstRegistered: z.boolean().optional().default(false),
  gstNumber: z.string().trim().optional().default(""),
  aboutBusiness: z.string().trim().min(1, "About business is required."),
  requirementNotes: z.string().trim().optional().default(""),
}).superRefine((value, context) => {
  if (value.gstRegistered && !value.gstNumber) {
    context.addIssue({
      code: "custom",
      path: ["gstNumber"],
      message: "GST number is required when GST is registered.",
    });
  }

  if (value.gstRegistered && value.gstNumber && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value.gstNumber)) {
    context.addIssue({
      code: "custom",
      path: ["gstNumber"],
      message: "Enter a valid GST number.",
    });
  }
});

export const sendPricingOtpSchema = z.object({
  whatsappNumber: z.string().trim().min(10, "Phone is required."),
  fullName: z.string().trim().optional().default("Customer"),
});

export const sendPricingEmailOtpSchema = z.object({
  email: z.email("Enter a valid email address.").trim(),
  fullName: z.string().trim().optional().default("Customer"),
});

export const validatePricingWhatsappNumberSchema = z.object({
  whatsappNumber: z.string().trim().min(10, "Phone is required."),
});

export const verifyPricingOtpSchema = z.object({
  otp: z.string().trim().regex(/^\d{6}$/, "Enter the 6 digit OTP."),
});

export const verifyPricingEmailOtpSchema = z.object({
  otp: z.string().trim().regex(/^\d{6}$/, "Enter the 6 digit OTP."),
});
