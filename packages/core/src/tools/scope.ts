import { createFileRepository, createSessionRepository } from "../db";
import type { DbContext, FileListing } from "../db";
import { AppError } from "../errors";
import type { ToolExecutionContext } from "./types";

/** Everything a read tool may touch for one chat. */
export interface ToolScope {
  readonly sessionId: string;
  readonly projectId: string | null;
  readonly files: readonly FileListing[];
}

export async function resolveToolScope(
  ctx: DbContext,
  context: ToolExecutionContext,
): Promise<ToolScope> {
  throwIfAborted(context.signal);
  const session = await createSessionRepository(ctx).get(context.sessionId);
  if (!session) {
    throw new AppError("db_not_found", `Session ${context.sessionId} not found`, {
      userMessage: "That chat no longer exists.",
    });
  }
  const files = await createFileRepository(ctx).listVisible(
    session.id,
    session.projectId,
  );
  throwIfAborted(context.signal);
  return { sessionId: session.id, projectId: session.projectId, files };
}

export function requireFile(scope: ToolScope, fileId: string): FileListing {
  const listing = scope.files.find((item) => item.file.id === fileId);
  if (!listing) {
    throw new AppError("file_not_found", `File ${fileId} is not in scope`, {
      userMessage: "That file is not in this chat or project.",
    });
  }
  return listing;
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new AppError("cancelled", "Tool call cancelled", {
      userMessage: "The tool call was cancelled.",
    });
  }
}
