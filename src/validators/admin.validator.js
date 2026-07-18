import { z } from "zod";

export const coursePayloadSchema = z.object({
  title: z.string().min(3),
  slug: z.string().trim().optional(),
  topic: z.string().trim().optional(),
  description: z.string().min(20),
  shortDescription: z.string().trim().optional(),
  category: z.string().min(2),
  difficulty: z.string().trim().optional(),
  durationLabel: z.string().trim().optional(),
  durationMinutes: z.coerce.number().int().min(0).optional(),
  language: z.string().trim().optional(),
  tags: z.array(z.string()).optional(),
  seoTitle: z.string().trim().optional(),
  seoDescription: z.string().trim().optional(),
  prerequisites: z.array(z.string()).optional(),
  instructorName: z.string().min(2),
  instructorBio: z.string().trim().optional(),
  instructorImageUrl: z.union([z.string().url(), z.literal("")]).optional(),
  bannerUrl: z.union([z.string().url(), z.literal("")]).optional(),
  thumbnailUrl: z.union([z.string().url(), z.literal("")]).optional(),
  status: z.enum(["DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"]).optional(),
  accessType: z.enum(["FREE", "PAID"]).optional(),
  priceAmount: z.coerce.number().int().min(0).optional(),
  featured: z.boolean().optional(),
  scheduledAt: z.union([z.string().datetime(), z.literal("")]).optional(),
});

export const chapterPayloadSchema = z.object({
  title: z.string().min(2),
  description: z.string().trim().optional(),
});

export const lessonPayloadSchema = z.object({
  title: z.string().min(2),
  description: z.string().trim().optional(),
  topic: z.string().trim().optional(),
  content: z.string().trim().optional(),
  durationMinutes: z.coerce.number().int().min(0).optional(),
  visibility: z.enum(["PREVIEW", "LOCKED", "PAID_ONLY", "COMING_SOON"]).optional(),
  isFreeIntro: z.boolean().optional(),
  isPublished: z.boolean().optional(),
  posterUrl: z.union([z.string().url(), z.literal("")]).optional(),
  thumbnailUrl: z.union([z.string().url(), z.literal("")]).optional(),
});

export const reorderSchema = z.object({
  ids: z.array(z.string()).min(1),
});

export const couponPayloadSchema = z.object({
  code: z.string().min(3),
  title: z.string().trim().optional(),
  description: z.string().trim().optional(),
  type: z.enum(["FLAT", "PERCENTAGE"]),
  amount: z.coerce.number().int().min(1),
  minOrderAmount: z.coerce.number().int().min(0).optional(),
  usageLimit: z.coerce.number().int().min(1).optional().nullable(),
  expiresAt: z.union([z.string().datetime(), z.null()]).optional(),
  isActive: z.boolean().optional(),
  appliesToAll: z.boolean().optional(),
  applicableCourseIds: z.array(z.string()).optional(),
  applicableCategory: z.string().trim().optional().nullable(),
});
