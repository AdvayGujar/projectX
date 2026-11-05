import { AppError } from "../errors";
import { createFileRepository, createSessionRepository } from "../db";
import type { DbContext, DocumentRecord, FileRecord, Session } from "../db";
import type { CopiedFile, FileStoragePort } from "../ports";
import { detectFileKind } from "./kinds";
import { fileRelativePath, safeDisplayName } from "./paths";

const MIME_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;

export interface ImportFileInput {
  readonly sessionId: string;
  /** Picker URI. Never stored; the bytes are copied into the sandbox. */
  readonly sourceUri: string;
  readonly name: string;
  readonly mime: string;
  /** Picker-reported size, used only when the filesystem cannot report the copy. */
  readonly size?: number | null;
  readonly signal?: AbortSignal;
}

export interface ImportedFile {
  readonly file: FileRecord;
  readonly document: DocumentRecord;
}

export interface FileImporter {
  import(input: ImportFileInput): Promise<ImportedFile>;
}

/**
 * Copies a picked file into the session's sandbox folder, then records the file and its
 * pending extraction row in one transaction. Bytes are removed on every failure path.
 */
export function createFileImporter(ctx: DbContext, storage: FileStoragePort): FileImporter {
  const files = createFileRepository(ctx);
  const sessions = createSessionRepository(ctx);

  return {
    async import(input: ImportFileInput): Promise<ImportedFile> {
      throwIfAborted(input.signal);
      const session = await requireSession(sessions, input.sessionId);
      throwIfAborted(input.signal);

      const id = ctx.ids();
      const name = safeDisplayName(input.name);
      const mime = normalizeMime(input.mime);
      const kind = detectFileKind(name, mime);
      const relativePath = fileRelativePath(session.id, id, name, mime);

      const copied = await copyIntoSession(storage, input.sourceUri, relativePath, input.signal);
      if (input.signal?.aborted) {
        await discard(storage, relativePath, cancelled());
        throw cancelled();
      }

      try {
        return await files.addWithDocument({
          id,
          sessionId: session.id,
          name,
          mime,
          size: copied.size ?? fallbackSize(input.size),
          path: relativePath,
          kind,
        });
      } catch (error) {
        await discard(storage, relativePath, error);
        throw error;
      }
    },
  };
}

async function requireSession(
  sessions: ReturnType<typeof createSessionRepository>,
  sessionId: string,
): Promise<Session> {
  const session = await sessions.get(sessionId);
  if (!session) {
    throw new AppError("db_not_found", `Session ${sessionId} not found`, {
      userMessage: "That chat no longer exists.",
    });
  }
  return session;
}

async function copyIntoSession(
  storage: FileStoragePort,
  sourceUri: string,
  relativePath: string,
  signal: AbortSignal | undefined,
): Promise<CopiedFile> {
  if (!sourceUri.trim()) {
    throw new AppError("db_invalid", "Source URI is required", {
      userMessage: "The file could not be read.",
    });
  }
  try {
    return await storage.copyFromUri(sourceUri, relativePath, { signal });
  } catch (error) {
    await discard(storage, relativePath, error);
    throw toImportError(error);
  }
}

async function discard(
  storage: FileStoragePort,
  relativePath: string,
  primary: unknown,
): Promise<void> {
  try {
    await storage.remove(relativePath);
  } catch (error) {
    throw new AppError("unknown", "Import cleanup failed", {
      cause: { primary, cleanup: error },
      userMessage: "Could not import the file.",
    });
  }
}

function toImportError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  return new AppError("unknown", "Could not copy the file into the app", {
    cause: error,
    userMessage: "Could not import the file.",
  });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw cancelled();
  }
}

function cancelled(): AppError {
  return new AppError("cancelled", "Import cancelled", {
    userMessage: "Import cancelled.",
  });
}

function normalizeMime(mime: string): string {
  const base = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  return MIME_PATTERN.test(base) ? base : "application/octet-stream";
}

function fallbackSize(size: number | null | undefined): number {
  if (size === null || size === undefined || !Number.isFinite(size)) {
    return 0;
  }
  return Math.max(0, Math.trunc(size));
}
