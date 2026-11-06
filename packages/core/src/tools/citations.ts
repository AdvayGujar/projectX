import type { ContextChunk } from "../db";
import type { CitationRef } from "./types";

/** One citation per distinct page/section in the chunks a tool returned. */
export function citationsFromChunks(chunks: readonly ContextChunk[]): CitationRef[] {
  return mergeCitations([], chunks.map((chunk) => ({
    fileId: chunk.fileId,
    fileName: chunk.fileName,
    fileKind: chunk.fileKind,
    page: chunk.page,
    section: chunk.section,
  })));
}

/** Stable identity for a citation: the same page/section read twice is one source. */
export function citationKey(citation: CitationRef): string {
  return [
    citation.fileId,
    citation.page === null ? "-" : String(citation.page),
    citation.section ?? "-",
  ].join(":");
}

/** Keeps insertion order while dropping duplicates from overlapping tool reads. */
export function mergeCitations(
  current: readonly CitationRef[],
  incoming: readonly CitationRef[] | undefined,
): CitationRef[] {
  if (!incoming || incoming.length === 0) {
    return [...current];
  }
  const seen = new Set(current.map(citationKey));
  const merged = [...current];
  for (const citation of incoming) {
    const key = citationKey(citation);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(citation);
  }
  return merged;
}
