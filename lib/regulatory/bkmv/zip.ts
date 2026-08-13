import "server-only";

import JSZip from "jszip";

import { BkmvError } from "./errors";

/**
 * Packs an export into the directory layout the instructions require.
 *
 * The published layout is
 *
 *   <drive>:\OPENFRMT\<8 digits>.<YY>\<MMDDhhmm>\
 *      INI.TXT
 *      BKMVDATA.zip
 *
 * There is no drive in a cloud application, so the tree is reproduced **inside**
 * the archive the user downloads: extracting it onto a drive puts every file where
 * the instructions expect it.
 *
 * **Two files, not three.** Section 2.2 says "הקובץ INI.TXT והקובץ BKMVDATA.TXT
 * המכווץ יישמרו בכונן", and 2.5.ד says to compress BKMVDATA.TXT into an archive
 * named BKMVDATA. So the uncompressed BKMVDATA.TXT is an intermediate and does not
 * ship; a previous revision of this function put all three in the directory.
 *
 * The compression layer used to be inverted as well: the old `buildIncomeZip`
 * produced a single `Income.zip` holding a bare `BKMVDATA.TXT` at the root — a
 * name with no basis in 1.31, no INI.TXT, no directory tree, and BKMVDATA
 * compressed by the outer archive instead of being an archive in its own right.
 */

/** Entry names, fixed by the instructions. */
export const BKMV_INI_FILENAME = "INI.TXT";
export const BKMV_DATA_FILENAME = "BKMVDATA.TXT";
export const BKMV_DATA_ARCHIVE_FILENAME = "BKMVDATA.zip";

export type BkmvPackage = {
  zipBuffer: Buffer;
  /** Entry paths inside the archive, in order. */
  entries: string[];
  /** The directory every entry sits under, with forward slashes. */
  directory: string;
};

/**
 * ZIP entry paths use forward slashes — that is the archive format, not a
 * platform choice, and extractors turn them into real directories on Windows.
 * Field 1012 keeps the backslashes the instructions print, so the two spellings
 * are deliberately different and this is the only place that converts.
 */
function toZipPath(directory: string): string {
  const normalised = directory.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!normalised) {
    throw new BkmvError("BKMV_INTERNAL", "The export directory cannot be empty", { directory });
  }
  return normalised;
}

export async function buildBkmvPackageZip(params: {
  /** As produced by `bkmvExportDirectory`, e.g. `OPENFRMT\\51596050.26\\08091642`. */
  directory: string;
  iniTxt: Buffer;
  bkmvDataTxt: Buffer;
}): Promise<BkmvPackage> {
  const directory = toZipPath(params.directory);

  // BKMVDATA compressed in its own right, as its own archive, holding the one
  // file at its root. This is the layer that was inverted.
  const inner = new JSZip();
  inner.file(BKMV_DATA_FILENAME, new Uint8Array(params.bkmvDataTxt), {
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
  const innerBuffer: Buffer = await inner.generateAsync({ type: "nodebuffer" });

  const outer = new JSZip();
  const folder = outer.folder(directory);
  if (!folder) {
    throw new BkmvError("BKMV_INTERNAL", "Could not create the export directory in the archive", { directory });
  }

  // Stored, not deflated. The outer archive is transport: INI.TXT is required to
  // be an uncompressed file, and BKMVDATA.zip is already compressed, so deflating
  // either would only obscure the bytes an auditor is meant to read.
  const stored = { compression: "STORE" } as const;
  folder.file(BKMV_INI_FILENAME, new Uint8Array(params.iniTxt), stored);
  folder.file(BKMV_DATA_ARCHIVE_FILENAME, new Uint8Array(innerBuffer), stored);

  const zipBuffer: Buffer = await outer.generateAsync({ type: "nodebuffer" });

  return {
    zipBuffer,
    directory,
    entries: [`${directory}/${BKMV_INI_FILENAME}`, `${directory}/${BKMV_DATA_ARCHIVE_FILENAME}`],
  };
}
