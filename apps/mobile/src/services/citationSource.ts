import { createChunkRepository, createDocumentRepository, createFileRepository } from "@projectx/core";
import type { CitationRef } from "@projectx/ui";

import { getDbContext } from "../db/client";

export interface CitationSource {
  readonly citation: CitationRef;
  readonly text: string;
}

/** Keeps only the chunks that belong to the cited page, slide, or section. */
export function filterCitationChunks(
  chunks: readonly { page: number | null; section: string | null; text: string }[],
  citation: Pick<CitationRef, "page" | "section">,
): string {
  const selected = chunks.filter((chunk) => {
    if (citation.page !== null) {
      return chunk.page === citation.page;
    }
    if (citation.section !== null) {
      return chunk.section === citation.section;
    }
    return true;
  });
  return selected.map((chunk) => chunk.text).join("\n\n");
}

/**
 * Loads the extracted text behind a citation. The file is never read from bytes here; the
 * citation points at chunks that were already indexed at import time.
 */
export async function loadCitationSource(
  citation: CitationRef,
): Promise<CitationSource> {
  const context = await getDbContext();
  const file = await createFileRepository(context).get(citation.fileId);
  if (!file) {
    return { citation, text: "" };
  }
  const resolved: CitationRef = {
    ...citation,
    fileName: file.name,
    fileKind: file.kind,
  };
  const document = await createDocumentRepository(context).getByFile(file.id);
  if (!document) {
    return { citation: resolved, text: "" };
  }
  const chunks = await createChunkRepository(context).listByDocument(document.id);
  return { citation: resolved, text: filterCitationChunks(chunks, citation) };
}
