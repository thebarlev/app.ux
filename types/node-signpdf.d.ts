declare module "node-signpdf" {
  type SignOptions = {
    passphrase?: string;
  };

  class SignPdf {
    sign(pdfBuffer: Buffer, p12Buffer: Buffer, options?: SignOptions): Buffer;
  }

  export default SignPdf;
}
