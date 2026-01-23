declare module "node-signpdf/dist/helpers" {
  type PlaceholderOptions = {
    pdfBuffer: Buffer;
    reason?: string;
    signatureLength?: number;
  };

  export function plainAddPlaceholder(options: PlaceholderOptions): Buffer;
}
