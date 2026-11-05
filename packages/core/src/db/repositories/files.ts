import { AppError } from "../../errors";
import { assertSafeRelativePath } from "../../paths";
import type { DbContext, DocumentRecord, FileKind, FileRecord, SqlCommand, SqlValue } from "../types";
import { insertPendingDocumentCommand } from "./commands";
import { toDbError } from "./errors";

const FILE_COLUMNS = "id, session_id, name, mime, size, path, kind, created_at";

interface FileRow {
  id: string;
  session_id: string;
  name: string;
  mime: string;
  size: number;
  path: string;
  kind: FileKind;
  created_at: number;
}

export interface AddFileInput {
  /**
   * Caller-supplied because the sandbox path is derived from the id before the row exists.
   */
  readonly id: string;
  readonly sessionId: string;
  readonly name: string;
  readonly mime: string;
  readonly size: number;
  readonly path: string;
  readonly kind: FileKind;
}

export interface FileWithDocument {
  readonly file: FileRecord;
  readonly document: DocumentRecord;
}

export function createFileRepository({ db, ids, now }: DbContext) {
  return {
    async add(input: AddFileInput): Promise<FileRecord> {
      const file = normalizeFile(input, now());
      try {
        await db.execute(
          `INSERT INTO files (${FILE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          fileParams(file),
        );
      } catch (error) {
        throw toDbError(error, "Could not save the file.");
      }
      return file;
    },

    /**
     * Import is the only caller. One transaction keeps a file from existing without the
     * pending document row that extraction depends on.
     */
    async addWithDocument(input: AddFileInput): Promise<FileWithDocument> {
      const file = normalizeFile(input, now());
      const document = pendingDocument(ids(), file.id);
      const commands: SqlCommand[] = [
        [
          `INSERT INTO files (${FILE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          fileParams(file),
        ],
        insertPendingDocumentCommand(document.id, file.id),
      ];
      try {
        await db.executeBatch(commands);
      } catch (error) {
        throw toDbError(error, "Could not save the file.");
      }
      return { file, document };
    },

    async get(id: string): Promise<FileRecord | null> {
      const result = await db.execute("SELECT * FROM files WHERE id = ?", [id]);
      const row = result.rows[0];
      return row ? mapFile(row as unknown as FileRow) : null;
    },

    async listBySession(sessionId: string): Promise<FileRecord[]> {
      const result = await db.execute(
        "SELECT * FROM files WHERE session_id = ? ORDER BY created_at DESC",
        [sessionId],
      );
      return result.rows.map((row) => mapFile(row as unknown as FileRow));
    },

    async listByProject(projectId: string): Promise<FileRecord[]> {
      const result = await db.execute(
        `SELECT f.* FROM files f
         JOIN sessions s ON s.id = f.session_id
         WHERE s.project_id = ?
         ORDER BY f.created_at DESC`,
        [projectId],
      );
      return result.rows.map((row) => mapFile(row as unknown as FileRow));
    },

    async remove(id: string): Promise<void> {
      try {
        await db.execute("DELETE FROM files WHERE id = ?", [id]);
      } catch (error) {
        throw toDbError(error, "Could not remove the file.");
      }
    },
  };
}

export type FileRepository = ReturnType<typeof createFileRepository>;

function normalizeFile(input: AddFileInput, createdAt: number): FileRecord {
  const id = requireValue(input.id, "File id");
  const sessionId = requireValue(input.sessionId, "Session id");
  const name = normalizeName(input.name);
  const mime = requireValue(input.mime, "MIME type");
  const path = requireValue(input.path, "File path");
  assertSafeRelativePath(path);
  return {
    id,
    sessionId,
    name,
    mime,
    size: normalizeSize(input.size),
    path,
    kind: input.kind,
    createdAt,
  };
}

function fileParams(file: FileRecord): SqlValue[] {
  return [
    file.id,
    file.sessionId,
    file.name,
    file.mime,
    file.size,
    file.path,
    file.kind,
    file.createdAt,
  ];
}

function pendingDocument(id: string, fileId: string): DocumentRecord {
  return {
    id,
    fileId,
    pageCount: null,
    slideCount: null,
    sheetCount: null,
    status: "pending",
    error: null,
    extractedAt: null,
  };
}

function mapFile(row: FileRow): FileRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    name: row.name,
    mime: row.mime,
    size: Number(row.size),
    path: row.path,
    kind: row.kind,
    createdAt: Number(row.created_at),
  };
}

function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new AppError("db_invalid", "File name is required", {
      userMessage: "The file has no name.",
    });
  }
  return trimmed;
}

function normalizeSize(size: number): number {
  if (!Number.isInteger(size) || size < 0) {
    throw new AppError("db_invalid", `Invalid file size: ${size}`, {
      userMessage: "The file size is invalid.",
    });
  }
  return size;
}

function requireValue(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AppError("db_invalid", `${label} is required`, {
      userMessage: "The file is missing information.",
    });
  }
  return trimmed;
}
