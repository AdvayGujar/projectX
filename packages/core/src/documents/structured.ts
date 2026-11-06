import {
  createChunkRepository,
  createDocumentRepository,
  createFileRepository,
} from "../db";
import type { ChunkDraft, DbContext, FileKind, FileRecord } from "../db";
import { AppError } from "../errors";
import type { FileStoragePort } from "../ports";
import { chunkSources } from "./chunking";
import { parseDocx } from "./office/docx";
import { parsePptx } from "./office/pptx";
import { parseText } from "./office/text";
import { parseCsv, parseXlsxBytes } from "./office/xlsx";
import { extensionOf } from "./paths";

export type StructuredExtractionResult =
  | {
    readonly status: "ready";
    readonly chunkCount: number;
    readonly pageCount: number | null;
    readonly slideCount: number | null;
    readonly sheetCount: number | null;
  }
  | { readonly status: "cancelled" }
  | { readonly status: "error"; readonly error: AppError };

export interface StructuredExtractionInput {
  readonly documentId: string;
  readonly signal?: AbortSignal;
}

export interface StructuredExtractionService {
  extract(input: StructuredExtractionInput): Promise<StructuredExtractionResult>;
}

const SUPPORTED: readonly FileKind[] = ["docx", "xlsx", "pptx", "text"];

/**
 * Extracts non-PDF formats from stored bytes and replaces the document's chunks in one
 * transaction. Parsing stays in core; the app only supplies the sandbox bytes.
 */
export function createStructuredExtractionService(
  ctx: DbContext,
  storage: FileStoragePort,
): StructuredExtractionService {
  const documents = createDocumentRepository(ctx);
  const files = createFileRepository(ctx);
  const chunks = createChunkRepository(ctx);

  return {
    async extract(input: StructuredExtractionInput): Promise<StructuredExtractionResult> {
      const document = await documents.get(input.documentId);
      if (!document) {
        return { status: "error", error: notFound(input.documentId) };
      }
      const file = await files.get(document.fileId);
      if (!file) {
        return { status: "error", error: notFound(input.documentId) };
      }
      if (!SUPPORTED.includes(file.kind)) {
        return { status: "error", error: unreadable(file.kind) };
      }

      await documents.update(document.id, { status: "extracting", error: null });
      try {
        throwIfAborted(input.signal);
        const parsed = await parse(file, storage, input.signal);
        throwIfAborted(input.signal);
        await chunks.replaceForDocument(document.id, parsed.chunks);
        await documents.update(document.id, {
          status: "ready",
          pageCount: parsed.pageCount,
          slideCount: parsed.slideCount,
          sheetCount: parsed.sheetCount,
          error: null,
          extractedAt: ctx.now(),
        });
        return {
          status: "ready",
          chunkCount: parsed.chunks.length,
          pageCount: parsed.pageCount,
          slideCount: parsed.slideCount,
          sheetCount: parsed.sheetCount,
        };
      } catch (error) {
        return handleFailure(documents, document.id, file.kind, error, input.signal);
      }
    },
  };
}

interface Parsed {
  readonly chunks: readonly ChunkDraft[];
  readonly pageCount: number | null;
  readonly slideCount: number | null;
  readonly sheetCount: number | null;
}

async function parse(
  file: FileRecord,
  storage: FileStoragePort,
  signal: AbortSignal | undefined,
): Promise<Parsed> {
  switch (file.kind) {
    case "docx": {
      const parsed = await parseDocx(await storage.readBytes(file.path, { signal }));
      return {
        chunks: chunkSources(parsed.sections),
        pageCount: parsed.pageCount,
        slideCount: parsed.slideCount,
        sheetCount: parsed.sheetCount,
      };
    }
    case "pptx": {
      const parsed = await parsePptx(await storage.readBytes(file.path, { signal }));
      return {
        chunks: chunkSources(parsed.sections),
        pageCount: parsed.pageCount,
        slideCount: parsed.slideCount,
        sheetCount: parsed.sheetCount,
      };
    }
    case "text": {
      const parsed = parseText(await storage.readText(file.path, { signal }));
      return {
        chunks: chunkSources(parsed.sections),
        pageCount: parsed.pageCount,
        slideCount: parsed.slideCount,
        sheetCount: parsed.sheetCount,
      };
    }
    case "xlsx": {
      const parsed = isDelimited(file)
        ? parseCsv(await storage.readText(file.path, { signal }))
        : parseXlsxBytes(await storage.readBytes(file.path, { signal }));
      return {
        chunks: parsed.chunks.map((chunk, index) => ({
          ordinal: index + 1,
          page: chunk.page,
          section: chunk.section,
          text: chunk.text,
          tokenEstimate: chunk.tokenEstimate,
        })),
        pageCount: null,
        slideCount: null,
        sheetCount: parsed.sheetCount,
      };
    }
    default:
      throw unreadable(file.kind);
  }
}

function isDelimited(file: FileRecord): boolean {
  if (file.mime.startsWith("text/")) {
    return true;
  }
  const extension = extensionOf(file.name);
  return extension === "csv" || extension === "tsv";
}

async function handleFailure(
  documents: ReturnType<typeof createDocumentRepository>,
  documentId: string,
  kind: FileKind,
  error: unknown,
  signal: AbortSignal | undefined,
): Promise<StructuredExtractionResult> {
  if (signal?.aborted || isCancelled(error)) {
    await documents.update(documentId, { status: "pending", error: null });
    return { status: "cancelled" };
  }

  const mapped = toExtractionError(error, kind);
  await documents.update(documentId, { status: "error", error: mapped.userMessage });
  return { status: "error", error: mapped };
}

function toExtractionError(error: unknown, kind: FileKind): AppError {
  if (error instanceof AppError && error.code === "file_too_large") {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new AppError("tool_failed", `Structured extraction failed: ${message}`, {
    cause: error,
    userMessage: failureMessage(kind),
  });
}

function failureMessage(kind: FileKind): string {
  switch (kind) {
    case "docx":
      return "Could not read this Word document.";
    case "xlsx":
      return "Could not read this spreadsheet.";
    case "pptx":
      return "Could not read this deck.";
    case "text":
      return "Could not read this text file.";
    default:
      return "Could not read this file.";
  }
}

function unreadable(kind: FileKind): AppError {
  return new AppError("tool_failed", `Unsupported structured kind: ${kind}`, {
    userMessage: "This file type cannot be read.",
  });
}

function notFound(documentId: string): AppError {
  return new AppError("db_not_found", `Document ${documentId} not found`, {
    userMessage: "Document not found.",
  });
}

function isCancelled(error: unknown): boolean {
  return error instanceof AppError && error.code === "cancelled";
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new AppError("cancelled", "Structured extraction cancelled", {
      userMessage: "Document extraction cancelled.",
    });
  }
}
