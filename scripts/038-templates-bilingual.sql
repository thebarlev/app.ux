-- ====================================================
-- Templates Table - Add bilingual HTML/CSS variants (HE/EN)
-- ====================================================
-- Date: January 12, 2026
-- Purpose:
--   - Add html_he/css_he/html_en/css_en to support bilingual templates under a single template id
--   - Backfill HE fields from legacy html_template/css
--   - Keep legacy columns for backward compatibility only (NOT source of truth)
-- ====================================================

ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS html_he TEXT,
  ADD COLUMN IF NOT EXISTS css_he TEXT,
  ADD COLUMN IF NOT EXISTS html_en TEXT,
  ADD COLUMN IF NOT EXISTS css_en TEXT;

COMMENT ON COLUMN public.templates.html_he IS 'Hebrew (RTL) HTML template. Source of truth after 2026-01-12.';
COMMENT ON COLUMN public.templates.css_he IS 'Hebrew (RTL) CSS for template. Source of truth after 2026-01-12.';
COMMENT ON COLUMN public.templates.html_en IS 'English (LTR) HTML template. Source of truth after 2026-01-12.';
COMMENT ON COLUMN public.templates.css_en IS 'English (LTR) CSS for template. Source of truth after 2026-01-12.';

-- Backfill: copy legacy to HE where missing.
-- NOTE: We intentionally do NOT auto-fill EN from legacy to avoid accidental Hebrew-in-English.
UPDATE public.templates
SET
  html_he = COALESCE(html_he, html_template),
  css_he = COALESCE(css_he, css)
WHERE
  (html_he IS NULL OR css_he IS NULL);

-- Success message
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Added bilingual template columns + backfilled HE from legacy';
  RAISE NOTICE '========================================';
END $$;

