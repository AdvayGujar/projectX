import { z } from "zod";

import { createSearchRepository } from "../db";
import type { DbContext } from "../db";
import { citationsFromChunks } from "./citations";
import { defineTool } from "./executor";
import { formatChunk, plural } from "./format";
import { resolveToolScope, throwIfAborted } from "./scope";
import type { ToolDefinition } from "./types";

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

const input = z.object({
  query: z.string().min(1).describe("Words to find in the extracted document text."),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe(
    `Maximum matches to return. Defaults to ${DEFAULT_LIMIT}.`,
  ),
});

/** FTS over the same scope the chat can read; never another chat or project. */
export function searchDocumentsTool(ctx: DbContext): ToolDefinition {
  const search = createSearchRepository(ctx);

  return defineTool({
    name: "search_documents",
    description:
      "Search the extracted text of this chat's and project's documents. Returns matching chunks with page, slide, or sheet references. Use it when the exact file is unknown or the document is too large to read whole.",
    role: "read",
    input,

    async execute(value, context) {
      const scope = await resolveToolScope(ctx, context);
      throwIfAborted(context.signal);
      const hits = await search.contextChunks(value.query, {
        projectId: scope.projectId,
        sessionId: scope.sessionId,
        limit: value.limit ?? DEFAULT_LIMIT,
      });
      throwIfAborted(context.signal);

      if (hits.length === 0) {
        return {
          content: `No document text matched "${value.query}".`,
          display: `"${value.query}" · 0 matches`,
        };
      }

      return {
        content: hits.map(formatChunk).join("\n\n"),
        display: `"${value.query}" · ${plural(hits.length, "match", "matches")}`,
        citations: citationsFromChunks(hits),
      };
    },
  });
}
