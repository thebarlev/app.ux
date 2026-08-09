import { expect, test } from "@playwright/test";
import JSZip from "jszip";

import { bkmvExportDirectory, buildIniTxt, bkmvSummaryRecords, type BkmvIniInput } from "@/lib/regulatory/bkmv/ini";
import {
  BKMV_DATA_ARCHIVE_FILENAME,
  BKMV_DATA_FILENAME,
  BKMV_INI_FILENAME,
  buildBkmvPackageZip,
} from "@/lib/regulatory/bkmv/zip";
import { encodeIso88598i } from "@/lib/regulatory/bkmv/encoding";

/**
 * Everything here is asserted **from inside the produced archive**, by unzipping
 * the bytes and reading them back. Nothing is checked against the objects that
 * went in: an auditor receives the ZIP, not our intermediate state.
 */

const AT = new Date(2026, 7, 9, 16, 42); // 9 Aug 2026, 16:42 local
const DIRECTORY = bkmvExportDirectory({ dealerNumber: "515960508", at: AT });

function iniInput(overrides: Partial<BkmvIniInput> = {}): BkmvIniInput {
  return {
    primaryIdentifier: "123456789012345",
    dealerNumber: "515960508",
    businessName: 'אוקסלנט בע"מ',
    address: { street: "הרצל", houseNumber: null, city: "תל אביב", postalCode: "6120101" },
    bkmvDataRecordCount: 5,
    summaries: bkmvSummaryRecords({ C100: 2, D110: 2, D120: 1 }),
    range: { from: "2026-01-01", to: "2026-12-31" },
    processStartedAt: AT,
    filePath: DIRECTORY,
    ...overrides,
  };
}

/**
 * A stand-in BKMVDATA.TXT. Its per-field mapping is workplan stage 5, so this
 * suite supplies fixed-length lines directly rather than waiting for it — the
 * packaging is what is under test.
 */
function bkmvDataTxt(): Buffer {
  const lines = ["A100" + "x".repeat(91), "C100" + "y".repeat(440), "Z900" + "z".repeat(106)];
  return encodeIso88598i(lines.join("\r\n") + "\r\n");
}

async function pack() {
  const ini = buildIniTxt(iniInput());
  const data = bkmvDataTxt();
  const pkg = await buildBkmvPackageZip({ directory: DIRECTORY, iniTxt: ini.txtBuffer, bkmvDataTxt: data });
  const zip = await JSZip.loadAsync(pkg.zipBuffer);
  return { pkg, zip, ini, data };
}

test("the archive reproduces OPENFRMT/<8 digits>.<YY>/<MMDDhhmm>/ with the three files", async () => {
  const { zip } = await pack();

  const files = Object.keys(zip.files)
    .filter((name) => !zip.files[name].dir)
    .sort();

  // Sorted, so BKMVDATA.TXT precedes BKMVDATA.zip on case.
  expect(files).toEqual([
    `OPENFRMT/51596050.26/08091642/${BKMV_DATA_FILENAME}`,
    `OPENFRMT/51596050.26/08091642/${BKMV_DATA_ARCHIVE_FILENAME}`,
    `OPENFRMT/51596050.26/08091642/${BKMV_INI_FILENAME}`,
  ]);
});

test("entry paths use forward slashes so they extract as real directories", async () => {
  const { zip } = await pack();
  for (const name of Object.keys(zip.files)) {
    expect(name).not.toContain("\\");
  }
});

test("BKMVDATA is delivered compressed in its own archive, and its bytes match the plain file", async () => {
  const { zip, data } = await pack();

  const inner = await zip
    .file(`${DIRECTORY.replace(/\\/g, "/")}/${BKMV_DATA_ARCHIVE_FILENAME}`)!
    .async("nodebuffer");

  const innerZip = await JSZip.loadAsync(inner);
  const names = Object.keys(innerZip.files).filter((n) => !innerZip.files[n].dir);
  expect(names).toEqual([BKMV_DATA_FILENAME]);

  const fromInner = await innerZip.file(BKMV_DATA_FILENAME)!.async("nodebuffer");
  const plain = await zip.file(`${DIRECTORY.replace(/\\/g, "/")}/${BKMV_DATA_FILENAME}`)!.async("nodebuffer");

  expect(fromInner.equals(data)).toBe(true);
  expect(plain.equals(data)).toBe(true);
});

/**
 * Reads the compression method straight out of each ZIP local file header rather
 * than asking the library what it thinks it did. Layout: the signature at +0, the
 * method at +8, the name length at +26 and the name at +30.
 */
function compressionMethods(zipBuffer: Buffer): Record<string, number> {
  const methods: Record<string, number> = {};
  for (let i = 0; i + 30 <= zipBuffer.length; i++) {
    if (zipBuffer.readUInt32LE(i) !== 0x04034b50) continue;
    const method = zipBuffer.readUInt16LE(i + 8);
    const nameLength = zipBuffer.readUInt16LE(i + 26);
    const name = zipBuffer.subarray(i + 30, i + 30 + nameLength).toString("latin1");
    methods[name] = method;
  }
  return methods;
}

test("INI.TXT is stored uncompressed, read from the ZIP header itself", async () => {
  const { pkg } = await pack();
  const methods = compressionMethods(pkg.zipBuffer);
  const dir = DIRECTORY.replace(/\\/g, "/");

  // 0 = STORE, 8 = DEFLATE.
  expect(methods[`${dir}/${BKMV_INI_FILENAME}`]).toBe(0);
  expect(methods[`${dir}/${BKMV_DATA_FILENAME}`]).toBe(0);
  expect(methods[`${dir}/${BKMV_DATA_ARCHIVE_FILENAME}`]).toBe(0);
});

test("inside BKMVDATA.zip the payload really is deflated", async () => {
  const { zip } = await pack();
  const inner = await zip
    .file(`${DIRECTORY.replace(/\\/g, "/")}/${BKMV_DATA_ARCHIVE_FILENAME}`)!
    .async("nodebuffer");

  expect(compressionMethods(inner)[BKMV_DATA_FILENAME]).toBe(8);
});

test("INI.TXT read back out of the ZIP: every line its fixed length, CRLF, no BOM, no separator", async () => {
  const { zip } = await pack();
  const bytes = await zip
    .file(`${DIRECTORY.replace(/\\/g, "/")}/${BKMV_INI_FILENAME}`)!
    .async("nodebuffer");

  // No BOM of any flavour.
  expect(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
  expect(bytes.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))).toBe(false);
  expect(bytes.subarray(0, 2).equals(Buffer.from([0xfe, 0xff]))).toBe(false);

  // Exactly one CRLF per line and nothing else structural: no bare CR, no bare LF,
  // no tab, no comma-or-pipe style separator anywhere in the payload.
  const text = bytes.toString("latin1");
  expect(text.endsWith("\r\n")).toBe(true);

  const lines = text.slice(0, -2).split("\r\n");
  expect(lines).toHaveLength(4);
  expect(lines[0]).toHaveLength(466);
  for (const line of lines.slice(1)) {
    expect(line).toHaveLength(19);
  }
  for (const line of lines) {
    expect(line).not.toMatch(/[\r\n\t|;]/);
  }

  // Total size is the sum of the fixed widths plus two bytes of CRLF per line —
  // which is only true if no byte was added anywhere.
  expect(bytes.length).toBe(466 + 3 * 19 + 4 * 2);
});

test("INI.TXT bytes are ISO-8859-8-i: ASCII or Hebrew 0xE0-0xFA, nothing else", async () => {
  const { zip } = await pack();
  const bytes = await zip
    .file(`${DIRECTORY.replace(/\\/g, "/")}/${BKMV_INI_FILENAME}`)!
    .async("nodebuffer");

  const offending: Array<{ offset: number; byte: string }> = [];
  for (const [offset, b] of bytes.entries()) {
    const ok = b === 0x0d || b === 0x0a || (b >= 0x20 && b <= 0x7e) || (b >= 0xe0 && b <= 0xfa);
    if (!ok) offending.push({ offset, byte: `0x${b.toString(16)}` });
  }
  expect(offending).toEqual([]);

  // The Hebrew business name really is there, in the ISO-8859-8 range.
  expect(bytes.includes(0xe0)).toBe(true); // א
});

test("the Hebrew business name round-trips through the ZIP byte for byte", async () => {
  const { zip } = await pack();
  const bytes = await zip
    .file(`${DIRECTORY.replace(/\\/g, "/")}/${BKMV_INI_FILENAME}`)!
    .async("nodebuffer");

  // 1018, cols 215-264, left aligned and space padded.
  const field1018 = bytes.subarray(214, 264);
  const expected = Buffer.concat([
    encodeIso88598i('אוקסלנט בע"מ'),
    Buffer.from(" ".repeat(50 - 'אוקסלנט בע"מ'.length)),
  ]);
  expect(field1018.equals(expected)).toBe(true);
});

test("a character that is legal in Windows-1255 but not in ISO-8859-8 is refused, not approximated", async () => {
  // ₪ is 0xA4 in Windows-1255 and does not exist in ISO-8859-8. The strictness is
  // the compliance: it must throw rather than emit a byte that means nothing.
  expect(() => buildIniTxt(iniInput({ businessName: "חנות ₪" }))).toThrow(/Unsupported character/);
});
