import { AppError } from "@projectx/core";

/** Only `AppError` carries a message written for the user; anything else gets the fallback. */
export function describeError(failure: unknown, fallback: string): string {
  if (failure instanceof AppError) {
    return failure.userMessage;
  }
  return fallback;
}
