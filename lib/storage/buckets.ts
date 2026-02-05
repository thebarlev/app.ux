/**
 * Storage buckets used by the VOW system.
 *
 * IMPORTANT:
 * - `business-assets` is historically configured as PUBLIC for logos/thumbnails.
 * - PDFs and signatures MUST live in a PRIVATE bucket to avoid public access.
 */

export const PUBLIC_ASSETS_BUCKET = "business-assets"

// Must be created as **private** in Supabase Storage.
export const SECURE_ASSETS_BUCKET = "business-secure"

