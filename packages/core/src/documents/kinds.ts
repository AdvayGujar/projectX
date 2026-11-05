import type { FileKind } from "../db";
import { extensionOf } from "./paths";

const EXTENSION_KINDS: Readonly<Record<string, FileKind>> = {
  pdf: "pdf",
  docx: "docx",
  xlsx: "xlsx",
  xls: "xlsx",
  csv: "xlsx",
  tsv: "xlsx",
  pptx: "pptx",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  heic: "image",
  heif: "image",
  bmp: "image",
  tiff: "image",
  txt: "text",
  md: "text",
  markdown: "text",
  json: "text",
  xml: "text",
  html: "text",
  yaml: "text",
  yml: "text",
  log: "text",
};

const MIME_KINDS: readonly [prefix: string, kind: FileKind][] = [
  ["application/pdf", "pdf"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml", "docx"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml", "xlsx"],
  ["application/vnd.openxmlformats-officedocument.presentationml", "pptx"],
  ["text/csv", "xlsx"],
  ["application/csv", "xlsx"],
  ["image/", "image"],
  ["text/", "text"],
];

/** Kind comes from the MIME type first, then the file name. Unknown files stay importable. */
export function detectFileKind(name: string, mime: string): FileKind {
  const normalizedMime = mime.trim().toLowerCase();
  for (const [prefix, kind] of MIME_KINDS) {
    if (normalizedMime.startsWith(prefix)) {
      return kind;
    }
  }
  return EXTENSION_KINDS[extensionOf(name)] ?? "other";
}
