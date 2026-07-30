import type { AuditorLocale } from "@/lib/auditor/locale"

/**
 * The consent sentences, in one place, because two things need the same words.
 *
 * The lead gate renders them. The lead route records them into
 * consent_terms_text and consent_contact_text, whose whole purpose per migration
 * 113 is to hold "the sentence exactly as it was rendered" — a boolean set to
 * true proves nothing about the wording above the box, and that wording changes
 * as the product does.
 *
 * Deliberately NOT sent up from the client with the form.
 *
 * That would be the most literal reading of "as rendered", and it would make the
 * evidence worthless: a record the submitter can author is not evidence of what
 * they were shown. Rendering and recording from the same constant gets both
 * properties at once — the text is exactly what was on screen, and it is not the
 * client's to choose. What the client does send is which locale it rendered, and
 * the worst a forged locale can do is file the wrong one of two sentences we
 * wrote ourselves.
 *
 * The consequence to keep in mind: edit these strings and the wording on screen
 * changes together with the wording recorded from then on. Rows already written
 * keep the sentence their lead actually saw, which is the point of storing it.
 */

export type AuditorConsentText = {
  /** The mandatory terms line. */
  terms: string
  /** The marketing line's bolded opening, as rendered. */
  contactBold: string
  /** The rest of the marketing line, as rendered, including its leading comma. */
  contactRest: string
}

export const AUDITOR_CONSENT_TEXT: Record<AuditorLocale, AuditorConsentText> = {
  he: {
    terms: "אני מאשר/ת את תנאי השימוש ומדיניות הפרטיות",
    contactBold: "שלחו לי עותק של הדוח למייל",
    contactRest: ", וגם עדכונים ותכנים שיווקיים. בלי אישור הדוח יוצג כאן על המסך בלבד.",
  },
  en: {
    terms: "I accept the terms of use and privacy policy",
    contactBold: "Email me a copy of the report",
    contactRest:
      ", plus updates and marketing content. Without this approval the report is shown here on screen only.",
  },
}

/**
 * The marketing line as one sentence, which is how it reads on screen and so how
 * it is recorded. The gate splits it in two only to bold the opening.
 */
export function auditorContactConsentSentence(locale: AuditorLocale): string {
  const t = AUDITOR_CONSENT_TEXT[locale] ?? AUDITOR_CONSENT_TEXT.he
  return `${t.contactBold}${t.contactRest}`
}

/**
 * The terms line as recorded. The red asterisk beside it on screen is a
 * required-field marker rather than part of the sentence, so it is not stored.
 */
export function auditorTermsConsentSentence(locale: AuditorLocale): string {
  return (AUDITOR_CONSENT_TEXT[locale] ?? AUDITOR_CONSENT_TEXT.he).terms
}
