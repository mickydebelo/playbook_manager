export type ErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "validation_failed"
  | "conflict"
  | "rate_limited"
  | "internal";

const STATUS: Record<ErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  validation_failed: 422,
  conflict: 409,
  rate_limited: 429,
  internal: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export const unauthenticated = (msg = "Sign in to continue") => new AppError("unauthenticated", msg);
export const forbidden = (msg = "You do not have access to this resource") => new AppError("forbidden", msg);
export const notFound = (what = "Resource") => new AppError("not_found", `${what} not found`);
export const conflict = (msg: string) => new AppError("conflict", msg);
export const validationFailed = (details: unknown, msg = "Check the highlighted fields") =>
  new AppError("validation_failed", msg, details);
