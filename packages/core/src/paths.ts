import { AppError } from "./errors";

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Validates a relative sandbox path before it is joined to a storage root. */
export function assertSafeRelativePath(relativePath: string): void {
  if (!relativePath || relativePath.startsWith("/") || relativePath.includes("\\")) {
    throw unsafePath(relativePath);
  }
  if (relativePath.includes("\0")) {
    throw unsafePath(relativePath);
  }
  const segments = relativePath.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw unsafePath(relativePath);
  }
  for (const segment of segments) {
    if (!SAFE_SEGMENT.test(segment)) {
      throw unsafePath(relativePath);
    }
  }
}

/** Joins a root URI to a validated relative path, so nothing can escape the sandbox. */
export function joinUnderRoot(rootUri: string, relativePath: string): string {
  assertSafeRelativePath(relativePath);
  const root = rootUri.endsWith("/") ? rootUri : `${rootUri}/`;
  return `${root}${relativePath}`;
}

/** Validates one path segment such as a session or file id. */
export function assertSafeSegment(value: string, label: string): void {
  if (!SAFE_SEGMENT.test(value)) {
    throw new AppError("db_invalid", `Unsafe ${label}: ${value}`, {
      userMessage: "The file location is invalid.",
    });
  }
}

function unsafePath(path: string): AppError {
  return new AppError("db_invalid", `Unsafe file path: ${path}`, {
    userMessage: "The file location is invalid.",
  });
}
