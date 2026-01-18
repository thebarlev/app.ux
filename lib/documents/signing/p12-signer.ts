import "server-only"

import crypto from "crypto"
import forge from "node-forge"
import SignPdf from "node-signpdf"
// @ts-ignore - node-signpdf helper has no stable types
import { plainAddPlaceholder } from "node-signpdf/dist/helpers"

export type P12SigningResult = {
  signedPdf: Buffer
  signedPdfSha256: string
  certFingerprintSha256: string
}

function getEnvOrThrow(key: string) {
  const v = process.env[key]
  if (!v || !v.trim()) throw new Error(`Missing env var: ${key}`)
  return v
}

function sha256Hex(buf: Buffer) {
  return crypto.createHash("sha256").update(buf).digest("hex")
}

function fingerprintCertSha256FromP12(p12Buffer: Buffer, password: string) {
  const p12Asn1 = forge.asn1.fromDer(p12Buffer.toString("binary"))
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password)
  // Try to take the first certificate bag
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]
  const cert = certBags?.[0]?.cert
  if (!cert) throw new Error("Signing cert not found in PKCS#12")

  // DER encode certificate and hash
  const derCert = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()
  return crypto.createHash("sha256").update(Buffer.from(derCert, "binary")).digest("hex")
}

/**
 * Sign a PDF buffer using PKCS#12 (.p12) from env.
 * This is intended for FINAL/RECOVERY output only (immutable originals).
 */
export function signPdfWithEnvP12(pdfBuffer: Buffer): P12SigningResult {
  const p12Base64 = getEnvOrThrow("SIGNING_P12_BASE64")
  const p12Password = getEnvOrThrow("SIGNING_P12_PASSWORD")
  const p12Buffer = Buffer.from(p12Base64, "base64")

  const pdfWithPlaceholder = plainAddPlaceholder({
    pdfBuffer,
    reason: "Computerized document signing",
    signatureLength: 8192,
  })

  const signer = new SignPdf()
  const signedPdf = signer.sign(pdfWithPlaceholder, p12Buffer, { passphrase: p12Password }) as Buffer

  return {
    signedPdf,
    signedPdfSha256: sha256Hex(signedPdf),
    certFingerprintSha256: fingerprintCertSha256FromP12(p12Buffer, p12Password),
  }
}

