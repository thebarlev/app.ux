-- ====================================================
-- Migration 025: Add English template columns
-- ====================================================
-- Adds optional English HTML/CSS to public.templates.
-- No backfill: leave NULL until explicitly filled in /admin/templates UI.

ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS html_en TEXT;

ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS css_en TEXT;

COMMENT ON COLUMN public.templates.html_en IS 'Optional English HTML template variant. Used only when document language is en.';
COMMENT ON COLUMN public.templates.css_en IS 'Optional English CSS variant. Used only when document language is en.';

