export type BkmvErrorCode =
  | "BKMV_SPEC_INCOMPLETE"
  | "BKMV_ENCODING_UNSUPPORTED_CHAR"
  | "BKMV_FORMAT_VALIDATION"
  | "BKMV_INTERNAL";

export class BkmvError extends Error {
  public readonly code: BkmvErrorCode;
  public readonly details?: Record<string, any>;

  constructor(code: BkmvErrorCode, message: string, details?: Record<string, any>) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

