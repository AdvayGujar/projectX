import { createChunkRepository, createDocumentRepository } from "../db";
import type { ChunkDraft, DbContext, DocumentRepository } from "../db";
import { AppError } from "../errors";
import type { PdfPort } from "../ports";
import { chunkPages } from "./chunking";

export type PdfExtractionResult =
  | { readonly status: "ready"; readonly pageCount: number; readonly chunkCount: number }
  | { readonly status: "cancelled" }
  | { readonly status: "error"; readonly error: AppError };

export interface PdfExtractionInput {
  readonly documentId: string;
  readonly fileUri: string;
  readonly signal?: AbortSignal;
}

export interface PdfExtractionService {
  extract(input: PdfExtractionInput): Promise<PdfExtractionResult>;
}

export function createPdfExtractionService(
  ctx: DbContext,
  pdf: PdfPort,
): PdfExtractionService {
  const documents = createDocumentRepository(ctx);
  const chunks = createChunkRepository(ctx);

  return {
    async extract(input: PdfExtractionInput): Promise<PdfExtractionResult> {
      const document = await documents.get(input.documentId);
      if (!document) {
        return { status: "error", error: notFound(input.documentId) };
      }

      await documents.update(document.id, { status: "extracting", error: null });
      try {
        throwIfAborted(input.signal);
        const pageCount = await pdf.getPageCount(input.fileUri, { signal: input.signal });
        if (!Number.isInteger(pageCount) || pageCount < 0) {
          throw new AppError("unknown", `Invalid PDF page count: ${pageCount}`, {
            userMessage: "Could not read this PDF.",
          });
        }
        const drafts = await extractPages(pdf, input, pageCount);
        throwIfAborted(input.signal);
        await chunks.replaceForDocument(document.id, drafts);
        await markReady(documents, document.id, pageCount, ctx.now());
        return { status: "ready", pageCount, chunkCount: drafts.length };
      } catch (error) {
        return handleFailure(documents, document.id, error, input.signal);
      }
    },
  };
}

async function extractPages(
  pdf: PdfPort,
  input: PdfExtractionInput,
  pageCount: number,
): Promise<ChunkDraft[]> {
  const drafts: ChunkDraft[] = [];

  for (let page = 1; page <= pageCount; page += 1) {
    throwIfAborted(input.signal);
    const text = await pdf.extractPage(input.fileUri, page, { signal: input.signal });
    throwIfAborted(input.signal);
    appendPageDrafts(drafts, page, text);
  }

  return drafts;
}

function appendPageDrafts(drafts: ChunkDraft[], page: number, text: string): void {
  for (const chunk of chunkPages([{ page, text }])) {
    drafts.push({ ...chunk, ordinal: drafts.length + 1 });
  }
}

async function handleFailure(
  documents: DocumentRepository,
  documentId: string,
  error: unknown,
  signal: AbortSignal | undefined,
): Promise<PdfExtractionResult> {
  if (signal?.aborted || isCancelled(error)) {
    await documents.update(documentId, { status: "pending", error: null });
    return { status: "cancelled" };
  }

  const mapped = toExtractionError(error);
  await documents.update(documentId, { status: "error", error: mapped.userMessage });
  return { status: "error", error: mapped };
}

async function markReady(
  documents: DocumentRepository,
  documentId: string,
  pageCount: number,
  extractedAt: number,
): Promise<void> {
  await documents.update(documentId, {
    status: "ready",
    pageCount,
    error: null,
    extractedAt,
  });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw cancelled();
  }
}

function isCancelled(error: unknown): boolean {
  return error instanceof AppError && error.code === "cancelled";
}

function cancelled(): AppError {
  return new AppError("cancelled", "PDF extraction cancelled", {
    userMessage: "PDF extraction cancelled.",
  });
}

function toExtractionError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new AppError("unknown", `PDF extraction failed: ${message}`, {
    cause: error,
    userMessage: "Could not read this PDF.",
  });
}

function notFound(documentId: string): AppError {
  return new AppError("db_not_found", `Document ${documentId} not found`, {
    userMessage: "Document not found.",
  });
}
