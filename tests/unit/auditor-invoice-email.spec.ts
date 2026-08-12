import { test, expect } from "@playwright/test"
import { buildInvoiceEmailHtml, invoiceSubject } from "@/lib/email/auditorInvoiceEmail"

const TOKEN = "9f8e7d6c5b4a392817069f8e7d6c5b4a"
const ID = "203458179"

function F(isTest: boolean) {
  return { isTest, invoiceNumber: "1002", planName: "מורחב", amount: 295, currency: "ILS" }
}

test("1 ⛔ [בדיקה] is in the SUBJECT when is_test", () => {
  expect(invoiceSubject(true, "1002")).toBe("[בדיקה] חשבונית מס/קבלה 1002")
})

test("2 · a real invoice carries no marker", () => {
  expect(invoiceSubject(false, "1002")).toBe("חשבונית מס/קבלה 1002")
})

test("3 ⛔ a test invoice says in the body that it is not a tax document", () => {
  const t = buildInvoiceEmailHtml(F(true))
  expect(t).toContain("אינו מסמך מס")
  expect(t).toContain("אין להזין אותו בספרים")
  expect(buildInvoiceEmailHtml(F(false))).not.toContain("אינו מסמך מס")
})

test("4 · the three requested facts appear", () => {
  const html = buildInvoiceEmailHtml(F(false))
  expect(html).toContain("1002")
  expect(html).toContain("מורחב")
  expect(html).toContain("295")
})

test("5 · USD renders a dollar sign rather than a shekel", () => {
  expect(buildInvoiceEmailHtml({ ...F(false), currency: "USD" })).toContain("$")
})

test("6 · a missing plan or amount renders a dash, never 'null'", () => {
  const html = buildInvoiceEmailHtml({
    isTest: false, invoiceNumber: "1002", planName: null, amount: null, currency: null,
  })
  expect(html).not.toContain("null")
  expect(html).not.toContain("undefined")
})

test("7 ⛔ nothing sensitive can appear — the type has no field for it", () => {
  const html = buildInvoiceEmailHtml(F(false))
  expect(html).not.toContain(TOKEN)
  expect(html).not.toContain(ID)
})

test("8 · a plan name containing markup cannot inject", () => {
  const html = buildInvoiceEmailHtml({ ...F(false), planName: '<script>x</script>' })
  expect(html).not.toContain("<script>")
  expect(html).toContain("&lt;script&gt;")
})

test("9 · it tells the customer the document is attached", () => {
  expect(buildInvoiceEmailHtml(F(false))).toContain("מצורפת")
})
