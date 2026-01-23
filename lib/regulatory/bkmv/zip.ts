import "server-only";

import JSZip from "jszip";

export async function buildIncomeZip(params: { bkmvDataTxt: Buffer }): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("BKMVDATA.TXT", new Uint8Array(params.bkmvDataTxt));
  const out = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
  return out;
}

