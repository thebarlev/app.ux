import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * The precondition that replaced the credit-note block.
 *
 * ── WHAT CHANGED, AND WHY IT IS NOT A REMOVAL ───────────────────────────────
 *
 * `security/credit-note-block` refused credit-note issuance outright, in three layers. Its
 * surviving justification was precise and still holds: issuing a credit note on a company with
 * no credit sequence makes `initializeSequence` insert a row with `is_locked = true`
 * (lib/document-helpers.ts:111-121), and since migration 118 that lock is enforced — so a
 * single click permanently fixes a regulatory starting number that no accountant chose, and
 * `initializeSequence` then refuses to change it (`sequence_already_locked`). An irreversible
 * database change from a misclick.
 *
 * ⛔ A block prevents that by deleting the capability. A precondition prevents it and keeps the
 * capability. The rule is now:
 *
 *   the starting number of the credit sequence must already have been decided, deliberately,
 *   before any credit note can be issued
 *
 * so the failure mode is gone while credit notes remain possible. What is NOT allowed is the
 * thing that caused the harm: the issuance path creating the sequence as a side effect. This
 * module never creates anything — it only reports whether the decision has been made.
 *
 * ── ⛔ FAILS CLOSED ─────────────────────────────────────────────────────────
 *
 * An unreadable `document_sequences` returns not-ready. The whole point is to refuse when we
 * cannot prove the number was chosen, and "the query failed" is not proof that it was.
 */

export type CreditNoteReadiness =
  | {
      ready: true;
      startingNumber: number;
      currentNumber: number;
    }
  | {
      ready: false;
      reason: "no_sequence" | "unreadable";
      /** Shown to the person, and it names both what is missing and who decides. */
      message: string;
    };

/** The database spelling. The app-level type is `creditNote`; the column holds this. */
export const CREDIT_NOTE_DB_TYPE = "credit_note";

const NOT_DECIDED_MESSAGE =
  "לא ניתן להפיק חשבונית זיכוי עד שייקבע מספר המסמך הראשון של רצף הזיכויים. " +
  "זו החלטה חד-פעמית ובלתי הפיכה, ורואה החשבון של העסק הוא שמכריע בה — " +
  "לא ניתן לשנותה אחרי ההפקה הראשונה. פנו אליו, ולאחר שייקבע המספר ההפקה תיפתח.";

const UNREADABLE_MESSAGE =
  "לא ניתן לאמת שמספר ההתחלה של רצף הזיכויים נקבע, ולכן ההפקה נעצרה. " +
  "זו עצירה זמנית — נסו שוב בעוד רגע.";

export async function creditNoteSequenceReadiness(
  companyId: string
): Promise<CreditNoteReadiness> {
  const service = createServiceRoleClient();

  const { data, error } = await service
    .from("document_sequences")
    .select("starting_number, current_number, is_locked")
    .eq("company_id", companyId)
    .eq("document_type", CREDIT_NOTE_DB_TYPE)
    .maybeSingle();

  if (error) {
    console.error("[CREDIT_NOTE] could not read document_sequences", {
      companyId,
      reason: String((error as any)?.message || error),
    });
    return { ready: false, reason: "unreadable", message: UNREADABLE_MESSAGE };
  }

  if (!data) {
    return { ready: false, reason: "no_sequence", message: NOT_DECIDED_MESSAGE };
  }

  /*
   * A row exists, so the number was chosen. `is_locked` is not an extra condition here —
   * `initializeSequence` writes every row locked, so an unlocked credit row would be a state
   * this system does not produce. It is read only to be reported.
   */
  return {
    ready: true,
    startingNumber: Number((data as any).starting_number ?? 0),
    currentNumber: Number((data as any).current_number ?? 0),
  };
}
