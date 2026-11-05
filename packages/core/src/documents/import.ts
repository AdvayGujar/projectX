import { AppError } from "../errors";
import { createDocumentRepository, createFileRepository, createSessionRepository } from "../db";
import type { DbContext, DocumentRecord, FileRecord } from "../db";
import type { FileStoragePort } from "../ports";
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
 * Copies a picked file into the session's sandbox folder, then records it. The file row is
 * only written after the copy succeeds, and both row and bytes are discarded if recording
 * the document fails.
 */
export function createFileImporter(ctx: DbContext, storage: FileStoragePort): FileImporter {
  const files = createFileRepository(ctx);
  const documents = createDocumentRepository(ctx);
  const sessions = createSessionRepository(ctx);

  return {
    async import(input: ImportFileInput): Promise<ImportedFile> {
      throwIfAborted(input.signal);
      const session = await sessions.get(input.sessionId);
      if (!session) {
        throw new AppError("db_not_found", `Session ${input.sessionId} not found`, {
          userMessage: "That chat no longer exists.",
        });
      }
      if (!input.sourceUri.trim()) {
        throw new AppError("db_invalid", "Source URI is required", {
          userMessage: "The file could not be read.",
        });
      }
      throwIfAborted(input.signal);

      const id = ctx.ids();
      const name = safeDisplayName(input.name);
      const mime = normalizeMime(input.mime);
      const kind = detectFileKind(name, mime);
      const relativePath = fileRelativePath(session.id, id, name, mime);

      const copied = await storage.copyFromUri(input.sourceUri, relativePath);
      if (input.signal?.aborted) {
        await discard(storage, relativePath);
        throw cancelled();
      }

      const size = copied.size > 0 ? copied.size : fallbackSize(input.size);
      let file: FileRecord;
      try {
        file = await files.add({
          id,
          sessionId: session.id,
          name,
          mime,
          size,
          path: relativePath,
          kind,
        });
      } catch (error) {
        await discard(storage, relativePath, error);
        throw error;
      }

      try {
        throwIfAborted(input.signal);
        const document = await documents.create({ fileId: file.id });
        return { file, document };
      } catch (error) {
        await discard(storage, relativePath, error, file.id, files.remove);
        throw error;
      }
    },
  };
}

async function discard(
  storage: FileStoragePort,
  relativePath: string,
  primary?: unknown,
  fileId?: string,
  removeRow?: (id: string) => Promise<void>,
): Promise<void> {
  const failures: unknown[] = [];
  if (fileId && removeRow) {
    try {
      await removeRow(fileId);
    } catch (error) {
      failures.push(error);
    }
  }
  try {
    await storage.remove(relativePath);
  } catch (error) {
    failures.push(error);
  }
  if (failures.length > 0) {
    throw new AppError("unknown", "Import cleanup failed", {
      cause: { primary, failures },
      userMessage: "Could not import the file.",
    });
  }
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
