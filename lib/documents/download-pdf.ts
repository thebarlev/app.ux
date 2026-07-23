/**
 * Download a document's PDF, with the Hebrew error messages the UI expects.
 *
 * Extracted from DocumentsListClient so the document page can reuse it instead of
 * carrying a second copy of the same error handling.
 */
export async function downloadDocumentPdf(documentId: string, fileName: string): Promise<void> {
  const response = await fetch(`/api/documents/${documentId}/pdf`, {
    headers: { Accept: "application/pdf" },
  });

  if (!response.ok) {
    const status = response.status;
    const contentType = response.headers.get("content-type") || "";
    let details: string | null = null;

    try {
      if (contentType.includes("application/json")) {
        const data = (await response.json()) as any;
        details =
          (typeof data?.message === "string" && data.message) ||
          (typeof data?.details === "string" && data.details) ||
          (typeof data?.error === "string" && data.error) ||
          null;
      } else {
        const text = await response.text();
        details = text?.trim() ? text.trim().slice(0, 200) : null;
      }
    } catch {
      // ignore parsing errors
    }

    const hint =
      status === 401
        ? " (אין הרשאה / ייתכן שפג תוקף ההתחברות)"
        : status === 404
          ? " (מסמך לא נמצא / PDF חסר)"
          : status === 400
            ? " (בקשה לא תקינה)"
            : "";

    throw new Error(details || `שגיאה בהורדת המסמך (${status})${hint}`);
  }

  // Prefer server-provided filename (already <documentNumber>-<lang>.pdf).
  // Same two-pattern precedence as the documents list, so both behave identically.
  const contentDisposition = response.headers.get("content-disposition") || "";
  const mQuoted = contentDisposition.match(/filename="([^"]+)"/i);
  const mStar = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  const serverName = mQuoted?.[1] || (mStar?.[1] ? decodeURIComponent(mStar[1]) : null);

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = serverName || fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
