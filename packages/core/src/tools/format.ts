import { chunkLocation } from "../documents";
import type { ContextChunk, DocumentRecord, FileKind, FileListing } from "../db";

const KIND_LABELS: Readonly<Record<FileKind, string>> = {
  pdf: "PDF",
  docx: "Word",
  xlsx: "Spreadsheet",
  pptx: "Deck",
  image: "Image",
  text: "Text",
  other: "File",
};

export function kindLabel(kind: FileKind): string {
  return KIND_LABELS[kind];
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** One model-facing block for a stored chunk. */
export function formatChunk(chunk: ContextChunk): string {
  const location = chunkLocation(chunk);
  const header = location
    ? `[File: ${chunk.fileName}, ${location}]`
    : `[File: ${chunk.fileName}]`;
  return `${header}\n${chunk.text}`;
}

export function formatFile(listing: FileListing): string {
  const { file, document } = listing;
  const facts = [kindLabel(file.kind), `id ${file.id}`];
  if (document) {
    facts.push(documentStatus(document));
    const counts = documentCounts(document);
    if (counts) {
      facts.push(counts);
    }
  } else {
    facts.push("text unavailable");
  }
  return `- ${file.name} · ${facts.join(" · ")}`;
}

function documentStatus(document: DocumentRecord): string {
  if (document.status === "ready") {
    return "ready";
  }
  if (document.status === "error") {
    return `text unavailable${document.error ? `: ${document.error}` : ""}`;
  }
  return "text extraction pending";
}

function documentCounts(document: DocumentRecord): string | null {
  if (document.pageCount !== null && document.pageCount > 0) {
    return plural(document.pageCount, "page");
  }
  if (document.slideCount !== null && document.slideCount > 0) {
    return plural(document.slideCount, "slide");
  }
  if (document.sheetCount !== null && document.sheetCount > 0) {
    return plural(document.sheetCount, "sheet");
  }
  return null;
}
