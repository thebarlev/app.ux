import { test, expect } from "@playwright/test"
import { sanitiseIndicatorForStorage } from "@/lib/auditor/billing/cardcom"

/**
 * A redaction nobody watched refuse is a redaction you do not have.
 *
 * This is an allow-list: named fields are kept, everything else is dropped and its NAME
 * recorded in dropped_keys. The tests observe both halves — that secrets leave, and that
 * what a reconciliation needs stays.
 *
 * Tests 3 and 4 exist because the first version of this was a deny-list of two names
 * while Cardcom returns the token under four. They are the specific way this nearly
 * shipped broken.
 */

const TOKEN = "9f8e7d6c5b4a39281706"
const ID = "203458179"

test("1 · the plain Token key does not survive", () => {
  const out = sanitiseIndicatorForStorage({ Token: TOKEN })
  expect("Token" in out).toBe(false)
  expect(out.dropped_keys).toContain("Token")
})

test("2 · ExtShvaParams.CardToken does not survive", () => {
  const out = sanitiseIndicatorForStorage({ "ExtShvaParams.CardToken": TOKEN })
  expect("ExtShvaParams.CardToken" in out).toBe(false)
})

test("3 ⚠ ExtShvaParams.CardToken_15 does not survive — missing from the first key list", () => {
  const out = sanitiseIndicatorForStorage({ "ExtShvaParams.CardToken_15": TOKEN })
  expect("ExtShvaParams.CardToken_15" in out).toBe(false)
})

test("4 ⚠ TokenToCharge.Token does not survive — also missing from the first key list", () => {
  const out = sanitiseIndicatorForStorage({ "TokenToCharge.Token": TOKEN })
  expect("TokenToCharge.Token" in out).toBe(false)
})

test("5 · none of the six personal fields survives", () => {
  const personal = {
    CardOwnerID: ID,
    "ExtShvaParams.CardHolderIdentityNumber": ID,
    CardOwnerName: "ישראל ישראלי",
    "ExtShvaParams.CardOwnerName": "ישראל ישראלי",
    CardOwnerEmail: "a@b.co.il",
    CardOwnerPhone: "0501234567",
    "ExtShvaParams.CardOwnerPhone": "0501234567",
  }
  const out = sanitiseIndicatorForStorage(personal)
  for (const k of Object.keys(personal)) expect(k in out).toBe(false)
})

test("6 · no secret value survives anywhere in the serialised output", () => {
  const out = sanitiseIndicatorForStorage({
    Token: TOKEN,
    "ExtShvaParams.CardToken": TOKEN,
    "ExtShvaParams.CardToken_15": TOKEN,
    "TokenToCharge.Token": TOKEN,
    CardOwnerID: ID,
    CardOwnerName: "ישראל ישראלי",
  })
  // Grep the whole JSON, not the keys we remembered.
  expect(JSON.stringify(out)).not.toContain(TOKEN)
  expect(JSON.stringify(out)).not.toContain(ID)
  expect(JSON.stringify(out)).not.toContain("ישראל")
})

test("7 · what a reconciliation needs is kept — real key names, from the database", () => {
  // Every name below was measured in the stored responses. The first version of this
  // test used "ApprovalNumber" and "DealDate", which I had invented; Cardcom actually
  // sends ExtShvaParams.ApprovalNumber71 and ExtShvaParams.DealDate. A test written
  // against guessed field names cannot catch a keep list built from guessed field names.
  const out = sanitiseIndicatorForStorage({
    Token: TOKEN,
    InternalDealNumber: "1000123456",
    ResponseCode: "0",
    OperationResponse: "0",
    OperationResponseText: "OK",
    DealResponse: "0",
    DealRespone: "0",
    terminalnumber: "1000",
    lowprofilecode: "abc-123",
    ReturnValue: "3f2a",
    TokenExDate: "0930",
    TokenApprovalNumber: "0012345",
    TokenResponse: "0",
    NumOfPayments: "1",
    Is3DS: "false",
    CardValidityMonth: "09",
    CardValidityYear: "30",
    "ExtShvaParams.ApprovalNumber71": "0012345",
    "ExtShvaParams.CardNumber5": "4580",
    "ExtShvaParams.FirstCardDigits": "458012",
    "ExtShvaParams.BinId": "458012",
    "ExtShvaParams.Mutag24": "2",
    "ExtShvaParams.Sum36": "11800",
    "ExtShvaParams.Tokef30": "0930",
    "ExtShvaParams.DealDate": "2026-08-11",
    "ExtShvaParams.Uid": "u-1",
    "ExtShvaParams.SapakMutav": "s-1",
  })
  expect(out.InternalDealNumber).toBe("1000123456")
  expect(out.TokenApprovalNumber).toBe("0012345")
  expect(out.TokenResponse).toBe("0")
  expect(out.DealRespone).toBe("0")
  expect(out.CardValidityMonth).toBe("09")
  expect(out["ExtShvaParams.ApprovalNumber71"]).toBe("0012345")
  expect(out["ExtShvaParams.BinId"]).toBe("458012")
  expect(out["ExtShvaParams.DealDate"]).toBe("2026-08-11")
  expect(out["ExtShvaParams.Uid"]).toBe("u-1")
  expect(out["ExtShvaParams.SapakMutav"]).toBe("s-1")
  // Only the token was dropped from this set.
  expect(out.dropped_keys).toEqual(["Token"])
})

test("7b ⛔ TokenApprovalNumber and TokenResponse survive while Token does not", () => {
  // The deny check is exact, never substring. If it ever became a substring match these
  // two acquirer fields would vanish and nobody would notice until a chargeback.
  const out = sanitiseIndicatorForStorage({
    Token: TOKEN,
    TokenApprovalNumber: "0012345",
    TokenResponse: "0",
    TokenExDate: "0930",
  })
  expect("Token" in out).toBe(false)
  expect(out.TokenApprovalNumber).toBe("0012345")
  expect(out.TokenResponse).toBe("0")
  expect(out.TokenExDate).toBe("0930")
})

test("7c ⛔ a field ending in ResponseCode that nobody named is dropped", () => {
  // The old list kept anything matching /ResponseCode$/. That hedge would keep a field
  // Cardcom invents next year under a rule no one reviewed, which is exactly what an
  // allow-list is supposed to prevent.
  const out = sanitiseIndicatorForStorage({ SomeNewResponseCode: "7", ResponseCode: "0" })
  expect("SomeNewResponseCode" in out).toBe(false)
  expect(out.ResponseCode).toBe("0")
})

test("8 ⛔ an unknown field Cardcom adds later is dropped by default, and its name recorded", () => {
  // The entire reason this is an allow-list. A deny-list would have kept this.
  const out = sanitiseIndicatorForStorage({
    SomeFieldInventedNextYear: "whatever it holds",
    ResponseCode: "0",
  })
  expect("SomeFieldInventedNextYear" in out).toBe(false)
  expect(out.dropped_keys).toContain("SomeFieldInventedNextYear")
  expect(out.ResponseCode).toBe("0")
})

test("9 · dropped_keys carries names only, never values", () => {
  const out = sanitiseIndicatorForStorage({ Token: TOKEN, CardOwnerID: ID })
  expect(out.dropped_keys).toEqual(["CardOwnerID", "Token"])
  expect(JSON.stringify(out.dropped_keys)).not.toContain(TOKEN)
  expect(JSON.stringify(out.dropped_keys)).not.toContain(ID)
})

test("10 · dropped_keys is absent when nothing was dropped, so its presence always means something", () => {
  const out = sanitiseIndicatorForStorage({ ResponseCode: "0", InternalDealNumber: "1" })
  expect("dropped_keys" in out).toBe(false)
})

test("11 · the nested {indicator:{...}} shape is reached, not just the top level", () => {
  const out = sanitiseIndicatorForStorage({ indicator: { Token: TOKEN, ResponseCode: "0" } })
  expect("Token" in (out.indicator as any)).toBe(false)
  expect((out.indicator as any).ResponseCode).toBe("0")
  expect(JSON.stringify(out)).not.toContain(TOKEN)
})

test("12 · our own {error:...} shape is preserved", () => {
  const out = sanitiseIndicatorForStorage({ error: "charge_request_failed" })
  expect(out.error).toBe("charge_request_failed")
})

test("13 · it does not mutate the caller's object", () => {
  // The live object is used AFTER this call, for the token extraction that stores the
  // ENCRYPTED copy. Mutating it would redact the token before it could be encrypted and
  // the subscription would be unchargeable.
  const input: Record<string, any> = { Token: TOKEN }
  sanitiseIndicatorForStorage(input)
  expect(input.Token).toBe(TOKEN)
})

test("14 · running it twice changes nothing further", () => {
  const once = sanitiseIndicatorForStorage({ Token: TOKEN, ResponseCode: "0" })
  const twice = sanitiseIndicatorForStorage(once)
  expect(twice).toEqual(once)
})
