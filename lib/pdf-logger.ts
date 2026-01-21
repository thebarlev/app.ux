type PdfLogLevel = "none" | "core" | "debug";

export const resolvePdfLogLevel = (): PdfLogLevel => {
  const envLevel = (process.env.PDF_LOG_LEVEL || "").toLowerCase();
  if (envLevel === "none" || envLevel === "core" || envLevel === "debug") {
    return envLevel;
  }
  return process.env.NODE_ENV === "production" ? "none" : "core";
};

const levelRank: Record<PdfLogLevel, number> = {
  none: 0,
  core: 1,
  debug: 2,
};

export type PdfLogContext = "preview" | "finalize" | "issue" | "recovery" | "download" | "view";

export type PdfLogData = {
  docId: string;
  requestId: string;
  context: PdfLogContext;
  lang: "he" | "en";
  result: "GENERATED_NEW" | "RETURNED_STORED" | "MISSING";
  bucket?: string;
  fullPath?: string;
  sizeBytes?: number;
  sha256?: string;
  timingMs?: number;
  source?: string;
  userId?: string;
  businessId?: string;
};

export const logPdfEvent = (
  level: PdfLogLevel,
  message: string,
  data: PdfLogData
) => {
  const currentLevel = resolvePdfLogLevel();
  if (levelRank[currentLevel] < levelRank[level]) return;
  const {
    docId,
    requestId,
    context,
    lang,
    result,
    bucket,
    fullPath,
    timingMs,
  } = data;
  const prefix = `[PDF][requestId=${requestId}][docId=${docId}][lang=${lang}][context=${context}]`;
  const storage = bucket && fullPath ? ` bucket=${bucket} path=${fullPath}` : "";
  const timing = typeof timingMs === "number" ? ` timingMs=${timingMs}` : "";
  console.log(`${prefix} ${message} result=${result}${storage}${timing}`);
};

export const isPdfDebugEnabled = () => resolvePdfLogLevel() === "debug";
