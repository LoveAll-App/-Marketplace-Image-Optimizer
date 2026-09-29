export type ErrorCode =
  | "UNSUPPORTED_FORMAT"
  | "CORRUPT_IMAGE"
  | "PRODUCT_NOT_DETECTED"
  | "PROVIDER_ERROR"
  | "EXTERNAL_NOT_ALLOWED"
  | "INVALID_OPTIONS"
  | "CANCELLED"
  | "INTERNAL";

export class OptimizerError extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message);
    this.name = "OptimizerError";
  }
}

export function toErrorInfo(err: unknown): { code: string; message: string } {
  if (err instanceof OptimizerError) return { code: err.code, message: err.message };
  const message = err instanceof Error ? err.message : String(err);
  if (/unsupported image format|Input buffer contains unsupported|bad seek|Input file is missing|corrupt|VipsJpeg|premature end|not a valid|Invalid/i.test(message)) {
    return { code: "CORRUPT_IMAGE", message: `Image could not be read: ${message.split("\n")[0]}` };
  }
  return { code: "INTERNAL", message };
}
