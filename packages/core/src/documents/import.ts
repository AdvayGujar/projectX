import { AppError } from "../errors";
import {
  createDocumentRepository,
  createFileRepository,
  createProjectRepository,
  createSessionRepository,
} from "../db";
import type { DbContext, DocumentRecord, FileRecord, Session } from "../db";
import type { CopiedFile, FileStoragePort } from "../ports";
import { detectFileKind } from "./kinds";
import { fileRelativePath, projectFileRelativePath, safeDisplayName } from "./paths";

const MIME_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;

export interface ImportFileInput {
  /** A standalone chat's imports belong to the chat; project chats use the project library. */
  readonly sessionId?: string;
  /** Direct library import. Exactly one of `sessionId` and `projectId` is required. */
  readonly projectId?: string;
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

interface ImportTarget {
  readonly sessionId: string | null;
  readonly projectId: string | null;
  readonly relativePath: string;
}

/**
 * Copies a picked file into the sandbox, then records the file and its pending extraction
 * row in one transaction. A project chat writes into the project library, which outlives the
 * chat; every other chat owns its files. Images have nothing to extract, so they are marked
 * ready immediately. Bytes and rows are removed on every failure path.
 */
export function createFileImporter(ctx: DbContext, storage: FileStoragePort): FileImporter {
  const files = createFileRepository(ctx);
  const sessions = createSessionRepository(ctx);
  const projects = createProjectRepository(ctx);
  const documents = createDocumentRepository(ctx);

  return {
    async import(input: ImportFileInput): Promise<ImportedFile> {
      throwIfAborted(input.signal);
      const owner = await resolveOwner(sessions, projects, input);
      throwIfAborted(input.signal);

      const id = ctx.ids();
      const name = safeDisplayName(input.name);
      const mime = normalizeMime(input.mime);
      const kind = detectFileKind(name, mime);
      const target = importTarget(owner, id, name, mime);

      const copied = await copyIntoStore(storage, input.sourceUri, target.relativePath, input.signal);
      if (input.signal?.aborted) {
        await discard(storage, target.relativePath, cancelled());
        throw cancelled();
      }

      let imported: ImportedFile | null = null;
      try {
        imported = await files.addWithDocument({
          id,
          sessionId: target.sessionId,
          projectId: target.projectId,
          name,
          mime,
          size: copied.size ?? fallbackSize(input.size),
          path: target.relativePath,
          kind,
        });
        return kind === "image"
          ? await markImageReady(documents, ctx, imported)
          : imported;
      } catch (error) {
        await discardImport(files, storage, target.relativePath, imported, error);
        throw error;
      }
    },
  };
}

interface ImportOwner {
  readonly sessionId: string | null;
  readonly projectId: string | null;
}

/** Exactly one owner. A project id imports straight into the library; a session may map to one. */
async function resolveOwner(
  sessions: ReturnType<typeof createSessionRepository>,
  projects: ReturnType<typeof createProjectRepository>,
  input: ImportFileInput,
): Promise<ImportOwner> {
  const sessionId = optionalOwner(input.sessionId);
  const projectId = optionalOwner(input.projectId);
  if (sessionId === null && projectId === null) {
    throw ownerError("Import needs a session or a project");
  }
  if (sessionId !== null && projectId !== null) {
    throw ownerError("Import cannot belong to both a session and a project");
  }
  if (projectId !== null) {
    await requireProject(projects, projectId);
    return { sessionId: null, projectId };
  }
  if (sessionId === null) {
    throw ownerError("Import needs a session or a project");
  }
  return ownerFromSession(await requireSession(sessions, sessionId));
}

function ownerFromSession(session: Session): ImportOwner {
  if (session.projectId !== null) {
    return { sessionId: null, projectId: session.projectId };
  }
  return { sessionId: session.id, projectId: null };
}

function importTarget(owner: ImportOwner, fileId: string, name: string, mime: string): ImportTarget {
  if (owner.projectId !== null) {
    return {
      ...owner,
      relativePath: projectFileRelativePath(owner.projectId, fileId, name, mime),
    };
  }
  if (owner.sessionId === null) {
    throw ownerError("Import target has no owner");
  }
  return {
    ...owner,
    relativePath: fileRelativePath(owner.sessionId, fileId, name, mime),
  };
}

async function markImageReady(
  documents: ReturnType<typeof createDocumentRepository>,
  ctx: DbContext,
  imported: ImportedFile,
): Promise<ImportedFile> {
  const document = await documents.update(imported.document.id, {
    status: "ready",
    pageCount: 0,
    error: null,
    extractedAt: ctx.now(),
  });
  return { file: imported.file, document };
}

async function requireProject(
  projects: ReturnType<typeof createProjectRepository>,
  projectId: string,
): Promise<void> {
  if (!(await projects.get(projectId))) {
    throw new AppError("db_not_found", `Project ${projectId} not found`, {
      userMessage: "That project no longer exists.",
    });
  }
}

function ownerError(message: string): AppError {
  return new AppError("db_invalid", message, {
    userMessage: "The file is missing information.",
  });
}

function optionalOwner(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
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

async function copyIntoStore(
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

/** A row that was already committed cannot be rolled back with the batch, so remove it here. */
async function discardImport(
  files: ReturnType<typeof createFileRepository>,
  storage: FileStoragePort,
  relativePath: string,
  imported: ImportedFile | null,
  primary: unknown,
): Promise<void> {
  if (imported === null) {
    await discard(storage, relativePath, primary);
    return;
  }
  const failures: unknown[] = [];
  try {
    await files.remove(imported.file.id);
  } catch (error) {
    failures.push(error);
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
