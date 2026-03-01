import { z } from "zod"

export const auditorLeadSchema = z.object({
  url: z.string().min(1).max(2000),
  full_name: z.string().min(2).max(200),
  email: z.string().email().max(320),
  phone: z.string().min(6).max(40),
  consent_terms: z.boolean(),
  consent_contact: z.boolean(),
})

export function normalizeEmail(email: string): string {
  return String(email || "").trim().toLowerCase()
}

