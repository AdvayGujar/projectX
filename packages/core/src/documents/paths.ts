import { AppError } from "../errors";

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SAFE_EXTENSION = /^[a-z0-9]{1,10}$/;
const MAX_NAME_LENGTH = 160;

const MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.ms-excel": "xls",
  "text/csv": "csv",
  "application/csv": "csv",
  "text/plain": "txt",
  "text/markdown": "md",
  "application/json": "json",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/bmp": "bmp",
  "image/tiff": "tiff",
};

/** Directory under the app's Documents folder that owns every imported file for a chat. */
export function sessionFilesDirectory(sessionId: string): string {
  assertSafeSegment(sessionId, "session id");
  return `sessions/${sessionId}/files`;
}

/**
 * `<session>/files/<fileId>.<ext>`. The id is the stable part; the extension is only there
 * so native viewers and share sheets can pick the right handler.
 */
export function fileRelativePath(
  sessionId: string,
  fileId: string,
  name: string,
  mime: string,
): string {
  const extension = extensionForFile(name, mime);
  assertSafeSegment(fileId, "file id");
  return `${sessionFilesDirectory(sessionId)}/${fileId}${extension ? `.${extension}` : ""}`;
}

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

export function safeDisplayName(name: string): string {
  const cleaned = name.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return cleaned.slice(0, MAX_NAME_LENGTH) || "Untitled file";
}

export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) {
    return "";
  }
  const extension = base.slice(dot + 1).toLowerCase();
  return SAFE_EXTENSION.test(extension) ? extension : "";
}

export function extensionForMime(mime: string): string {
  const base = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  return MIME_EXTENSIONS[base] ?? "";
}

function extensionForFile(name: string, mime: string): string {
  const normalizedMime = mime.trim().toLowerCase();
  const fromName = extensionOf(name);
  const fromMime = extensionForMime(normalizedMime);
  if (normalizedMime.startsWith("text/") || normalizedMime === "application/json") {
    return fromName || fromMime;
  }
  return fromMime || fromName;
}

function assertSafeSegment(value: string, label: string): void {
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
