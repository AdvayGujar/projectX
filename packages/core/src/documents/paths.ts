import { assertSafeSegment } from "../paths";

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

/** Root of a project's sandbox folder; deleting a project removes it whole. */
export function projectDirectory(projectId: string): string {
  assertSafeSegment(projectId, "project id");
  return `projects/${projectId}`;
}

/** Directory that owns the files a project keeps after its chats are gone. */
export function projectLibraryDirectory(projectId: string): string {
  return `${projectDirectory(projectId)}/library`;
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
  return filePathIn(sessionFilesDirectory(sessionId), fileId, name, mime);
}

/** `<project>/library/<fileId>.<ext>`, mirroring the session layout. */
export function projectFileRelativePath(
  projectId: string,
  fileId: string,
  name: string,
  mime: string,
): string {
  return filePathIn(projectLibraryDirectory(projectId), fileId, name, mime);
}

function filePathIn(directory: string, fileId: string, name: string, mime: string): string {
  const extension = extensionForFile(name, mime);
  assertSafeSegment(fileId, "file id");
  return `${directory}/${fileId}${extension ? `.${extension}` : ""}`;
}

export function safeDisplayName(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "")
    .trim();
  return Array.from(cleaned).slice(0, MAX_NAME_LENGTH).join("") || "Untitled file";
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
