import { z } from "zod";

export const listCoursesQuerySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  difficulty: z.string().optional(),
  accessType: z.enum(["FREE", "PAID"]).optional(),
  featured: z.union([z.literal("true"), z.literal("false")]).optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
});

export const enrollFreeSchema = z.object({});

export const checkoutPreviewSchema = z.object({
  couponCode: z.string().trim().optional(),
});

export const progressSchema = z.object({
  watchedSeconds: z.number().min(0),
  durationSeconds: z.number().min(0),
  isCompleted: z.boolean().optional(),
  lastPlaybackRate: z.number().min(0.25).max(3).optional(),
});

