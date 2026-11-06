import { z } from "zod";

import type { DbContext } from "../db";
import { defineTool } from "./executor";
import { formatFile, plural } from "./format";
import { resolveToolScope } from "./scope";
import type { ToolDefinition } from "./types";

const MAX_FILES = 50;

/** Lists the chat's own files and, in a project chat, the project library. */
export function listFilesTool(ctx: DbContext): ToolDefinition {
  return defineTool({
    name: "list_files",
    description:
      "List the files attached to this chat and its project. Returns the file id, name, kind, and whether its text is ready. Call this before reading a file whose id you do not know.",
    role: "read",
    input: z.object({}),

    async execute(_input, context) {
      const scope = await resolveToolScope(ctx, context);
      if (scope.files.length === 0) {
        return {
          content: "No files are attached to this chat or project.",
          display: "0 files",
        };
      }

      const visible = scope.files.slice(0, MAX_FILES);
      const lines = visible.map(formatFile);
      if (scope.files.length > visible.length) {
        lines.push(`… and ${scope.files.length - visible.length} more files.`);
      }

      return {
        content: `Available files (${plural(scope.files.length, "file")}):\n${lines.join("\n")}`,
        display: plural(scope.files.length, "file"),
      };
    },
  });
}
