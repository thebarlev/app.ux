import "server-only";

import { encodeWindows1255 } from "./encoding";
import { buildFixedLengthRecord } from "./format";
import { BkmvError } from "./errors";
import { assertBkmvSpecComplete, BKMV_SPEC } from "./spec";
import type { BkmvContext, BkmvDocument, BkmvLineItem, BkmvRecordCode } from "./types";

type RecordInput = {
  code: BkmvRecordCode;
  values: Record<string, any>;
};

function buildRecordLine(input: RecordInput): string {
  const spec = BKMV_SPEC.records[input.code];
  if (!spec) {
    throw new BkmvError("BKMV_INTERNAL", "Unknown record code", { code: input.code });
  }

  const pairs = spec.fields.map((field) => ({
    spec: field,
    value: field.name === "record_code" ? input.code : input.values[field.name],
  }));

  return buildFixedLengthRecord(pairs);
}

export function buildBkmvTxt(params: {
  ctx: BkmvContext;
  documents: BkmvDocument[];
  lineItems: BkmvLineItem[];
}): { txtBuffer: Buffer; stats: { totalDocs: number } } {
  // Refuse to generate until the fixed-length spec is fully populated.
  assertBkmvSpecComplete();

  const { ctx, documents } = params;

  // Sort chronologically (issue_date, then created_at)
  const docsSorted = [...documents].sort((a, b) => {
    const aKey = `${a.issueDate || "9999-12-31"}|${a.createdAt}`;
    const bKey = `${b.issueDate || "9999-12-31"}|${b.createdAt}`;
    return aKey.localeCompare(bKey);
  });

  const records: RecordInput[] = [];

  // A100 – opening
  records.push({
    code: "A100",
    values: {
      company_id: ctx.companyId,
      company_tax_id: ctx.companyTaxId,
      company_name: ctx.companyName,
      period_from: ctx.from,
      period_to: ctx.to,
      generated_at: ctx.generatedAtIso,
    },
  });

  // B100/B110 – ledgers (exact fields are defined by spec; values must be mapped accordingly)
  records.push({ code: "B100", values: {} });
  records.push({ code: "B110", values: {} });

  for (const doc of docsSorted) {
    records.push({
      code: "C100",
      values: {
        doc_id: doc.id,
        doc_type: doc.documentType,
        doc_number: doc.documentNumber,
        doc_date: doc.issueDate,
        currency: doc.currency,
      },
    });
    records.push({
      code: "D110",
      values: {
        doc_id: doc.id,
        amount: doc.totalAmount,
        currency: doc.currency,
      },
    });

    if (doc.documentType === "receipt") {
      records.push({
        code: "D120",
        values: {
          doc_id: doc.id,
          amount: doc.totalAmount,
          currency: doc.currency,
        },
      });
    }

    records.push({
      code: "M100",
      values: {
        doc_id: doc.id,
      },
    });
  }

  // Z900 – closing/summary
  records.push({
    code: "Z900",
    values: {
      total_docs: docsSorted.length,
    },
  });

  // Fixed-length lines + CRLF
  const txt = records.map(buildRecordLine).join("\r\n") + "\r\n";
  const txtBuffer = encodeWindows1255(txt);

  return { txtBuffer, stats: { totalDocs: docsSorted.length } };
}

