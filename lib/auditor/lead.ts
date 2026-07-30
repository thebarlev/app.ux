import { z } from "zod"

export const auditorLeadSchema = z.object({
  url: z.string().min(1).max(2000),
  full_name: z.string().min(2).max(200),
  email: z.string().email().max(320),
  phone: z.string().min(6).max(40),
  consent_terms: z.boolean(),
  consent_contact: z.boolean(),
  /**
   * Which wording the gate rendered, so the route can record that exact sentence.
   * Optional and defaulted: an older client that does not send it still submits,
   * and Hebrew is the primary flow. The value only selects between two sentences
   * this codebase wrote, so a forged locale files the wrong one of the two and
   * cannot inject text of its own.
   */
  locale: z.enum(["he", "en"]).optional().default("he"),
})

export function normalizeEmail(email: string): string {
  return String(email || "").trim().toLowerCase()
}

