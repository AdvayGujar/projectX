export type AppErrorCode =
  | "db_constraint"
  | "db_not_found"
  | "db_invalid"
  | "provider_auth"
  | "provider_rate_limit"
  | "provider_unavailable"
  | "provider_invalid_response"
  | "invalid_request"
  | "tool_invalid_input"
  | "tool_failed"
  | "artifact_invalid_spec"
  | "file_not_found"
  | "file_too_large"
  | "cancelled"
  | "unknown";

export interface AppErrorOptions {
  cause?: unknown;
  userMessage?: string;
  retryable?: boolean;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly userMessage: string;
  readonly retryable: boolean;

  constructor(code: AppErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.userMessage = options.userMessage ?? message;
    this.retryable = options.retryable ?? false;
  }
}
