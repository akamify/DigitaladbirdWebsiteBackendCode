import { z } from "zod";

export const webinarRegistrationSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  email: z.email("Please enter a valid email address.").trim(),
  phone: z.string().trim().min(1, "Phone number is required."),
  business: z.string().trim().min(1, "Business is required."),
  city: z.string().trim().optional().default(""),
  state: z.string().trim().optional().default(""),
  about: z.string().trim().min(1, "Please write about your business."),
});
