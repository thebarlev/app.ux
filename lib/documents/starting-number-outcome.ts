/**
 * What to tell the user after they confirm a starting number.
 *
 * Pure, and separate from the modal, for one reason: the case this exists for used
 * to be handled as a success. `StartingNumberModal` saw `sequence_already_locked`,
 * called `onSuccess()` and closed — so a user who typed 5000 into a sequence that
 * was already locked at 1000 watched the dialog close and carried on believing
 * their number had been taken. It had been discarded, silently.
 *
 * Keeping the decision here means it can be tested without rendering React, and
 * that "already locked" can never again be collapsed into "success" by an
 * `if` in a component.
 */

/** The sequence as it actually stands, from `getSequenceInfoAction`. */
export type InForceSequence = {
  /** `document_sequences.current_number` — the last number consumed. */
  currentNumber: number | null;
  /** `current_number + 1` — the number the next document will take. */
  nextNumber: number | null;
};

export type StartingNumberOutcome =
  | { kind: "success" }
  /** The sequence was already locked. The typed number was NOT saved. */
  | { kind: "already-locked"; message: string }
  | { kind: "error"; message: string };

/**
 * Builds the sentence the user sees when the sequence is already locked.
 *
 * It says three things, in this order, because that is the order the user needs
 * them: the number was not saved, what is actually in force, and that a locked
 * sequence cannot be changed. If the real number cannot be read, it says so rather
 * than inventing one — a wrong number here is worse than an absent one.
 */
function alreadyLockedMessage(attempted: number, inForce: InForceSequence | null): string {
  const head = `המספור לסוג מסמך זה כבר נקבע ונעול. המספר שהקלדת (${attempted}) לא נשמר.`;

  if (inForce?.nextNumber != null) {
    return `${head} המספר שבתוקף: המסמך הבא יקבל ${inForce.nextNumber}. רצף נעול אינו ניתן לשינוי.`;
  }
  if (inForce?.currentNumber != null) {
    return `${head} המספר האחרון שהונפק הוא ${inForce.currentNumber}. רצף נעול אינו ניתן לשינוי.`;
  }
  return `${head} לא ניתן לקרוא כרגע את המספר שבתוקף. רצף נעול אינו ניתן לשינוי.`;
}

export function resolveStartingNumberOutcome(params: {
  /** What `lockStartingNumberAction` returned. */
  result: { ok: boolean; message?: string } | null | undefined;
  /** The number the user typed. */
  attempted: number;
  /** The sequence as read back, or null if it could not be read. */
  inForce: InForceSequence | null;
}): StartingNumberOutcome {
  const { result, attempted, inForce } = params;

  if (result?.ok) return { kind: "success" };

  // The marker comes from initializeSequence in lib/document-helpers.ts:94 — the
  // TypeScript, not the database function. `includes` rather than equality because
  // that is how the modal has always matched it.
  if (result?.message?.includes("sequence_already_locked")) {
    return { kind: "already-locked", message: alreadyLockedMessage(attempted, inForce) };
  }

  return { kind: "error", message: result?.message || "אירעה שגיאה. נסה שוב." };
}
