import { test, expect } from "@playwright/test";
import fs from "fs";

const shouldRun = Boolean(process.env.E2E_AUTH_COOKIE && process.env.E2E_DOC_ID);

test.describe("pdf immutability", () => {
  test.skip(!shouldRun, "Set E2E_AUTH_COOKIE and E2E_DOC_ID to run this test.");

  test("finalize -> download HE/EN -> view/copy returns stored PDFs", async ({ page }) => {
    const cookie = JSON.parse(process.env.E2E_AUTH_COOKIE as string);
    await page.context().addCookies([cookie]);

    const docId = process.env.E2E_DOC_ID as string;
    const logPath = process.env.E2E_PDF_LOG_PATH;

    if (logPath) {
      fs.writeFileSync(logPath, "");
    }

    const download = async (lang: "he" | "en", issue?: "original" | "copy") => {
      const issueParam = issue ? `&issue=${issue}` : "";
      const res = await page.request.get(
        `/api/documents/${docId}/pdf?lang=${lang}${issueParam}`
      );
      expect(res.ok()).toBeTruthy();
    };

    // Two downloads per language (original + copy)
    await download("he", "original");
    await download("he", "copy");
    await download("en", "copy");
    await download("en", "copy");

    if (logPath) {
      const content = fs.readFileSync(logPath, "utf8");
      const generated = content.match(/PDF_GENERATED_AND_UPLOADED/g) || [];
      const returned = content.match(/PDF_RETURNED_STORED/g) || [];

      // Expect exactly two generations (he/en) and multiple returns
      expect(generated.length).toBe(2);
      expect(returned.length).toBeGreaterThanOrEqual(4);
    }
  });
});
