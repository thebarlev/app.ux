import { expect, test } from "@playwright/test";

import { resolveStartingNumberOutcome } from "@/lib/documents/starting-number-outcome";

/**
 * The case under test: a sequence is already locked, the user confirms a different
 * number, and they must be told rather than shown a success.
 *
 * This used to be `if (already locked) onSuccess()` in StartingNumberModal — the
 * dialog closed and the typed number was discarded in silence.
 */

const LOCKED = { ok: false, message: "sequence_already_locked" };

test("a locked sequence and a different number produces a message, not a success", () => {
  const outcome = resolveStartingNumberOutcome({
    result: LOCKED,
    attempted: 5000,
    inForce: { currentNumber: 1014, nextNumber: 1015 },
  });

  expect(outcome.kind).toBe("already-locked");
  expect(outcome.kind).not.toBe("success");
});

test("the message states the typed number was not saved, and what is in force", () => {
  const outcome = resolveStartingNumberOutcome({
    result: LOCKED,
    attempted: 5000,
    inForce: { currentNumber: 1014, nextNumber: 1015 },
  });

  if (outcome.kind === "success") throw new Error("expected a message");

  // The number the user typed, named, and said not to have been saved.
  expect(outcome.message).toContain("5000");
  expect(outcome.message).toContain("לא נשמר");
  // The number actually in force — what the next document will take.
  expect(outcome.message).toContain("1015");
  // And that a locked sequence cannot be changed.
  expect(outcome.message).toContain("רצף נעול אינו ניתן לשינוי");
});

test("the in-force number shown is the one that will be used, not the one already consumed", () => {
  const outcome = resolveStartingNumberOutcome({
    result: LOCKED,
    attempted: 1,
    inForce: { currentNumber: 1014, nextNumber: 1015 },
  });

  if (outcome.kind === "success") throw new Error("expected a message");
  // 1015 is what the next document gets; 1014 is spent. Showing 1014 as "the
  // number in force" would be wrong by one.
  expect(outcome.message).toContain("המסמך הבא יקבל 1015");
});

test("when the sequence cannot be read, the message says so instead of inventing a number", () => {
  const outcome = resolveStartingNumberOutcome({
    result: LOCKED,
    attempted: 5000,
    inForce: null,
  });

  if (outcome.kind === "success") throw new Error("expected a message");
  expect(outcome.message).toContain("לא ניתן לקרוא כרגע את המספר שבתוקף");
  expect(outcome.message).toContain("5000");
  expect(outcome.message).not.toMatch(/יקבל \d/);
});

test("a sequence with a current number but no next number still reports the truth", () => {
  const outcome = resolveStartingNumberOutcome({
    result: LOCKED,
    attempted: 77,
    inForce: { currentNumber: 1014, nextNumber: null },
  });

  if (outcome.kind === "success") throw new Error("expected a message");
  expect(outcome.message).toContain("המספר האחרון שהונפק הוא 1014");
});

test("zero is a real current number and is not mistaken for missing", () => {
  const outcome = resolveStartingNumberOutcome({
    result: LOCKED,
    attempted: 9,
    inForce: { currentNumber: 0, nextNumber: 0 },
  });

  if (outcome.kind === "success") throw new Error("expected a message");
  expect(outcome.message).toContain("המסמך הבא יקבל 0");
  expect(outcome.message).not.toContain("לא ניתן לקרוא");
});

test("a successful lock is still a success", () => {
  expect(resolveStartingNumberOutcome({ result: { ok: true }, attempted: 1000, inForce: null })).toEqual({
    kind: "success",
  });
});

test("any other failure keeps its own message and is not turned into a lock notice", () => {
  const outcome = resolveStartingNumberOutcome({
    result: { ok: false, message: "הפקת חשבונית זיכוי אינה זמינה כרגע" },
    attempted: 1000,
    inForce: null,
  });

  expect(outcome.kind).toBe("error");
  if (outcome.kind === "success") throw new Error("expected a message");
  expect(outcome.message).toBe("הפקת חשבונית זיכוי אינה זמינה כרגע");
});

test("a missing or empty result falls back to the generic error, not to success", () => {
  for (const result of [null, undefined, { ok: false }]) {
    const outcome = resolveStartingNumberOutcome({ result, attempted: 1, inForce: null });
    expect(outcome.kind, JSON.stringify(result)).toBe("error");
  }
});
