import { test, expect } from "@playwright/test"
import { sanitiseIndicatorForStorage } from "@/lib/auditor/billing/cardcom"

/**
 * A redaction nobody watched refuse is a redaction you do not have.
 *
 * The token was written in clear text into three columns while simultaneously being
 * encrypted in a fourth, so the encryption protected nothing. These tests observe the
 * redaction actually happening — including for the two token aliases the first version
 * of the key list missed, which is the specific way this fix nearly shipped broken.
 */

const TOKEN = "9f8e7d6c5b4a39281706"
const ID = "203458179"

test("1 · the plain Token key is redacted", () => {
  expect(sanitiseIndicatorForStorage({ Token: TOKEN }).Token).toBe("[redacted]")
})

test("2 · ExtShvaParams.CardToken is redacted", () => {
  const out = sanitiseIndicatorForStorage({ "ExtShvaParams.CardToken": TOKEN })
  expect(out["ExtShvaParams.CardToken"]).toBe("[redacted]")
})

test("3 ⚠ ExtShvaParams.CardToken_15 is redacted — missing from the first key list", () => {
  const out = sanitiseIndicatorForStorage({ "ExtShvaParams.CardToken_15": TOKEN })
  expect(out["ExtShvaParams.CardToken_15"]).toBe("[redacted]")
})

test("4 ⚠ TokenToCharge.Token is redacted — also missing from the first key list", () => {
  const out = sanitiseIndicatorForStorage({ "TokenToCharge.Token": TOKEN })
  expect(out["TokenToCharge.Token"]).toBe("[redacted]")
})

test("5 · the cardholder ID number is redacted under both spellings", () => {
  const out = sanitiseIndicatorForStorage({
    CardOwnerID: ID,
    "ExtShvaParams.CardHolderIdentityNumber": ID,
  })
  expect(out.CardOwnerID).toBe("[redacted]")
  expect(out["ExtShvaParams.CardHolderIdentityNumber"]).toBe("[redacted]")
})

test("6 · no token value survives anywhere in the serialised output", () => {
  const out = sanitiseIndicatorForStorage({
    Token: TOKEN,
    "ExtShvaParams.CardToken": TOKEN,
    "ExtShvaParams.CardToken_15": TOKEN,
    "TokenToCharge.Token": TOKEN,
    CardOwnerID: ID,
    "ExtShvaParams.CardHolderIdentityNumber": ID,
  })
  // The assertion that matters: grep the whole JSON, not the keys we remembered.
  expect(JSON.stringify(out)).not.toContain(TOKEN)
  expect(JSON.stringify(out)).not.toContain(ID)
})

test("7 · what a reconciliation needs is kept, not scrubbed", () => {
  const out = sanitiseIndicatorForStorage({
    Token: TOKEN,
    InternalDealNumber: "1000123456",
    "ExtShvaParams.CardNumber5": "4580",
    "ExtShvaParams.Mutag24": "2",
    "ExtShvaParams.Sum36": "11800",
    ResponseCode: "0",
  })
  expect(out.InternalDealNumber).toBe("1000123456")
  expect(out["ExtShvaParams.CardNumber5"]).toBe("4580")
  expect(out["ExtShvaParams.Mutag24"]).toBe("2")
  expect(out["ExtShvaParams.Sum36"]).toBe("11800")
  expect(out.ResponseCode).toBe("0")
})

test("8 · it does not mutate the caller's object", () => {
  // The live object is still used after this call — for the token extraction that
  // stores the ENCRYPTED copy. Mutating it in place would redact the token before it
  // could be encrypted, and the subscription would be unchargeable.
  const input: Record<string, any> = { Token: TOKEN }
  sanitiseIndicatorForStorage(input)
  expect(input.Token).toBe(TOKEN)
})

test("9 · running it twice changes nothing further", () => {
  const once = sanitiseIndicatorForStorage({ Token: TOKEN })
  expect(sanitiseIndicatorForStorage(once)).toEqual(once)
})
