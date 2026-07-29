-- 113 · consent evidence on auditor_leads
--
-- The two booleans record *what* was agreed to. They cannot show *what was on
-- screen* when it was agreed to, and that is the part that matters if a consent
-- is ever challenged: a checkbox set to true proves nothing about the sentence
-- above it, and that sentence changes as the product does.
--
-- Four columns, all additive:
--   consent_recorded_at  when the form was submitted
--   consent_terms_text   the terms line exactly as rendered
--   consent_contact_text the marketing line exactly as rendered
--   consent_ip           the submitting address
--
-- consent_recorded_at is kept separate from created_at on purpose. created_at
-- is a row-creation artifact — it moves if a row is ever re-created, and it is
-- the same moment only by coincidence. A consent record should carry its own
-- timestamp rather than borrow one.
--
-- consent_ip is text, not inet. Behind Vercel the address arrives in
-- x-forwarded-for, which is a comma-separated chain and occasionally malformed;
-- inet would reject a bad value and take the whole insert down with it. This
-- codebase already holds the line that ancillary capture must never break a
-- signup, and losing a lead to save a type is the wrong trade. Callers write a
-- single parsed address.
--
-- Nullable, no defaults, no NOT NULL, no backfill. Every existing row predates
-- the capture, so null is the honest value: we do not know what wording those
-- leads saw, and inventing one would be worse than admitting it. The existing
-- consent_terms and consent_contact booleans are NOT touched by this migration.
--
-- Inert on apply — nothing writes these columns until the lead route is
-- updated, which is not part of this change.

alter table public.auditor_leads
  add column if not exists consent_recorded_at  timestamptz,
  add column if not exists consent_terms_text   text,
  add column if not exists consent_contact_text text,
  add column if not exists consent_ip           text;

comment on column public.auditor_leads.consent_recorded_at is
  'When the consent form was submitted. Null for leads captured before evidence was recorded; never backfilled.';

comment on column public.auditor_leads.consent_terms_text is
  'The terms-consent sentence exactly as it was rendered to this lead. Null for leads captured before evidence was recorded.';

comment on column public.auditor_leads.consent_contact_text is
  'The marketing-consent sentence exactly as it was rendered to this lead. Null for leads captured before evidence was recorded.';

comment on column public.auditor_leads.consent_ip is
  'Submitting IP as a single parsed address. Text rather than inet so a malformed x-forwarded-for cannot fail the insert and lose the lead.';
