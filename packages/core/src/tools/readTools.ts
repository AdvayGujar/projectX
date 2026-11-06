import type { DbContext } from "../db";
import { createToolExecutor } from "./executor";
import { getArtifactTool } from "./getArtifact";
import { listFilesTool } from "./listFiles";
import { readDocumentTool } from "./readDocument";
import { readSheetTool } from "./readSheet";
import { searchDocumentsTool } from "./searchDocuments";
import type { ToolExecutor } from "./types";

/**
 * The read-only tool set. Every tool is scoped to the chat at execution time, so a model
 * cannot read another chat's or another project's files by guessing an id.
 */
export function createReadTools(ctx: DbContext): ToolExecutor {
  return createToolExecutor([
    listFilesTool(ctx),
    readDocumentTool(ctx),
    readSheetTool(ctx),
    searchDocumentsTool(ctx),
    getArtifactTool(ctx),
  ]);
}

/** Sent with the system prompt when the selected model supports tools. */
export const READ_TOOL_GUIDANCE =
  "Use the file tools when an answer depends on the user's documents. Call list_files to discover file ids, read only the pages or sections you need, and keep page, slide, and sheet references in the answer.";
