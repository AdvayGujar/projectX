import { AppError } from "../../errors";

export function toDbError(error: unknown, context: string): AppError {
  if (error instanceof AppError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  const code = /constraint|unique|foreign key/i.test(message) ? "db_constraint" : "unknown";
  return new AppError(code, `${context}: ${message}`, {
    cause: error,
    userMessage: context,
  });
}
