import { z } from "zod";

import { createChunkRepository, createDocumentRepository } from "../db";
import type { ContextChunk, DbContext, DocChunk, FileListing } from "../db";
import { defineTool } from "./executor";
import { formatChunk, plural } from "./format";
import { requireFile, resolveToolScope, throwIfAborted } from "./scope";
import type { ToolDefinition } from "./types";

const PAGED_KINDS = new Set(["pdf", "pptx"]);

const input = z.object({
  fileId: z.string().min(1).describe("The file id from list_files or an attachment."),
  pageStart: z.number().int().min(1).optional().describe(
    "First page (PDF) or slide (deck) to read, 1-based.",
  ),
  pageEnd: z.number().int().min(1).optional().describe(
    "Last page (PDF) or slide (deck) to read, inclusive.",
  ),
  section: z.string().min(1).optional().describe(
    "Section heading to read from a Word or text document.",
  ),
}).refine(
  (value) =>
    value.pageStart === undefined ||
    value.pageEnd === undefined ||
    value.pageEnd >= value.pageStart,
  { message: "pageEnd must be at least pageStart", path: ["pageEnd"] },
);

/** Reads already-extracted text; bytes never enter the model context. */
export function readDocumentTool(ctx: DbContext): ToolDefinition {
  const documents = createDocumentRepository(ctx);
  const chunks = createChunkRepository(ctx);

  return defineTool({
    name: "read_document",
    description:
      "Read extracted text from a PDF, Word document, deck, or text file. Pass a fileId from list_files. Use pageStart/pageEnd for PDFs and decks, or section for Word/text. Spreadsheets use read_sheet.",
    role: "read",
    input,

    async execute(value, context) {
      const scope = await resolveToolScope(ctx, context);
      const listing = requireFile(scope, value.fileId);
      const problem = readableProblem(listing);
      if (problem) {
        return { content: problem, display: "not readable", isError: true };
      }
      if (listing.file.kind === "xlsx") {
        return {
          content: `${listing.file.name} is a spreadsheet. Use read_sheet instead.`,
          display: "spreadsheet",
          isError: true,
        };
      }

      throwIfAborted(context.signal);
      const document = await documents.getByFile(listing.file.id);
      throwIfAborted(context.signal);
      if (!document) {
        return {
          content: `${listing.file.name} has no extracted text yet.`,
          display: "not readable",
          isError: true,
        };
      }

      const all = await chunks.listByDocument(document.id);
      throwIfAborted(context.signal);
      const selected = selectChunks(all, listing, value);
      if (selected instanceof Error) {
        return { content: selected.message, display: "invalid range", isError: true };
      }
      if (selected.length === 0) {
        return {
          content: `No text is available for that range in ${listing.file.name}.`,
          display: `${listing.file.name} · no text`,
        };
      }

      return {
        content: selected.map(formatChunk).join("\n\n"),
        display: displayOf(listing, selected),
      };
    },
  });
}

interface Selection {
  readonly pageStart?: number;
  readonly pageEnd?: number;
  readonly section?: string;
}

function selectChunks(
  chunks: readonly DocChunk[],
  listing: FileListing,
  selection: Selection,
): ContextChunk[] | Error {
  const wantsPages = selection.pageStart !== undefined || selection.pageEnd !== undefined;
  if (wantsPages && !PAGED_KINDS.has(listing.file.kind)) {
    return new Error(
      `${listing.file.name} has no page numbers. Read it without a page range or use its section headings.`,
    );
  }

  const keep = wantsPages
    ? (chunk: DocChunk) =>
      chunk.page !== null &&
      (selection.pageStart === undefined || chunk.page >= selection.pageStart) &&
      (selection.pageEnd === undefined || chunk.page <= selection.pageEnd)
    : selection.section !== undefined
      ? (chunk: DocChunk) =>
        chunk.section !== null &&
        chunk.section.toLowerCase().includes(selection.section?.toLowerCase() ?? "")
      : () => true;

  return chunks.filter(keep).map((chunk) => toContextChunk(chunk, listing));
}

function toContextChunk(chunk: DocChunk, listing: FileListing): ContextChunk {
  return {
    chunkId: chunk.id,
    documentId: chunk.documentId,
    fileId: listing.file.id,
    fileName: listing.file.name,
    fileKind: listing.file.kind,
    ordinal: chunk.ordinal,
    page: chunk.page,
    section: chunk.section,
    text: chunk.text,
    tokenEstimate: chunk.tokenEstimate,
  };
}

function readableProblem(listing: FileListing): string | null {
  if (listing.file.kind === "image") {
    return `${listing.file.name} is an image, so it has no extracted text.`;
  }
  if (listing.file.kind === "other") {
    return `${listing.file.name} is not a readable document type.`;
  }
  if (!listing.document) {
    return `${listing.file.name} has no extracted text yet.`;
  }
  if (listing.document.status === "ready") {
    return null;
  }
  if (listing.document.status === "error") {
    return listing.document.error
      ? `${listing.file.name} could not be read: ${listing.document.error}`
      : `${listing.file.name} could not be read.`;
  }
  return `${listing.file.name} is still being read. Try again in a moment.`;
}

function displayOf(listing: FileListing, chunks: readonly ContextChunk[]): string {
  const name = listing.file.name;
  const pages = chunks
    .map((chunk) => chunk.page)
    .filter((page): page is number => page !== null);

  if (pages.length > 0) {
    const first = Math.min(...pages);
    const last = Math.max(...pages);
    const unit = listing.file.kind === "pptx" ? "slide" : "page";
    return `${name} · ${locationLabel(unit, first, last)}`;
  }

  const sections = new Set(chunks.map((chunk) => chunk.section ?? ""));
  return sections.size > 1
    ? `${name} · ${plural(sections.size, "section")}`
    : name;
}

function locationLabel(unit: string, first: number, last: number): string {
  return first === last ? `${unit} ${first}` : `${unit}s ${first}–${last}`;
}
