import { z } from "zod";

import { createChunkRepository, createDocumentRepository } from "../db";
import type { ContextChunk, DbContext, DocChunk, FileListing } from "../db";
import { citationsFromChunks } from "./citations";
import { defineTool } from "./executor";
import { formatChunk, plural } from "./format";
import { requireFile, resolveToolScope, throwIfAborted } from "./scope";
import { parseChunkRange, parseRange, rangesOverlap } from "./sheetRange";
import type { SheetRange } from "./sheetRange";
import type { ToolDefinition } from "./types";

const input = z.object({
  fileId: z.string().min(1).describe("The spreadsheet's file id from list_files."),
  sheet: z.string().min(1).optional().describe("Sheet name, for example Budget."),
  range: z.string().min(1).optional().describe("A1 range, for example A1:F40."),
});

/** Reads the row bands an XLSX/CSV extraction stored, optionally narrowed by sheet/range. */
export function readSheetTool(ctx: DbContext): ToolDefinition {
  const documents = createDocumentRepository(ctx);
  const chunks = createChunkRepository(ctx);

  return defineTool({
    name: "read_sheet",
    description:
      "Read rows from an XLSX or CSV file. Pass the fileId from list_files. Use sheet and an A1 range such as A1:F40 to keep the result small. Formula cells include their formula text.",
    role: "read",
    input,

    async execute(value, context) {
      const scope = await resolveToolScope(ctx, context);
      const listing = requireFile(scope, value.fileId);
      if (listing.file.kind !== "xlsx") {
        return {
          content: `${listing.file.name} is not a spreadsheet. Use read_document instead.`,
          display: "not a spreadsheet",
          isError: true,
        };
      }
      const problem = readableProblem(listing);
      if (problem) {
        return { content: problem, display: "not readable", isError: true };
      }

      const wanted = value.range === undefined ? null : parseRange(value.range);
      if (value.range !== undefined && wanted === null) {
        return {
          content: `"${value.range}" is not a valid A1 range. Use a range such as A1:F40.`,
          display: "invalid range",
          isError: true,
        };
      }

      throwIfAborted(context.signal);
      const document = await documents.getByFile(listing.file.id);
      throwIfAborted(context.signal);
      if (!document) {
        return {
          content: `${listing.file.name} has no extracted rows yet.`,
          display: "not readable",
          isError: true,
        };
      }

      const all = await chunks.listByDocument(document.id);
      throwIfAborted(context.signal);
      const sheets = availableSheets(all);
      if (value.sheet !== undefined && !sheets.includes(value.sheet)) {
        return {
          content: sheets.length > 0
            ? `Sheet "${value.sheet}" was not found. Available sheets: ${sheets.join(", ")}.`
            : `Sheet "${value.sheet}" was not found in ${listing.file.name}.`,
          display: `${listing.file.name} · sheet not found`,
          isError: true,
        };
      }
      const selected = selectRows(all, listing, value.sheet, wanted);
      if (selected.length === 0) {
        return {
          content: `No rows are available for that sheet or range in ${listing.file.name}.`,
          display: `${listing.file.name} · no rows`,
        };
      }

      return {
        content: selected.map(formatChunk).join("\n\n"),
        display: displayOf(listing, value.sheet, value.range, selected, document.sheetCount),
        citations: citationsFromChunks(selected),
      };
    },
  });
}

function availableSheets(chunks: readonly DocChunk[]): string[] {
  const sheets = new Set<string>();
  for (const chunk of chunks) {
    const parsed = parseChunkRange(chunk.section);
    if (parsed) {
      sheets.add(parsed.sheet);
    }
  }
  return [...sheets];
}

function selectRows(
  chunks: readonly DocChunk[],
  listing: FileListing,
  sheet: string | undefined,
  range: SheetRange | null,
): ContextChunk[] {
  return chunks
    .filter((chunk) => {
      const parsed = parseChunkRange(chunk.section);
      if (parsed === null) {
        return sheet === undefined && range === null;
      }
      if (sheet !== undefined && parsed.sheet !== sheet) {
        return false;
      }
      return range === null || rangesOverlap(parsed.range, range);
    })
    .map((chunk) => toContextChunk(chunk, listing));
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
  if (!listing.document) {
    return `${listing.file.name} has no extracted rows yet.`;
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

function displayOf(
  listing: FileListing,
  sheet: string | undefined,
  range: string | undefined,
  chunks: readonly ContextChunk[],
  sheetCount: number | null,
): string {
  const name = listing.file.name;
  if (sheet !== undefined) {
    return `${name} · ${sheet}${range ? `!${range}` : ""}`;
  }
  if (range !== undefined) {
    return `${name} · ${range}`;
  }
  if (sheetCount !== null && sheetCount > 0) {
    return `${name} · ${plural(sheetCount, "sheet")}`;
  }
  return `${name} · ${plural(chunks.length, "row band")}`;
}
