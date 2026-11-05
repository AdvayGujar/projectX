import { AppError } from "../../errors";
import type { DbContext, FileKind, FileRecord } from "../types";
import { toDbError } from "./errors";

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

export function createFileRepository({ db, now }: DbContext) {
  return {
    async add(input: AddFileInput): Promise<FileRecord> {
      const id = requireValue(input.id, "File id");
      const sessionId = requireValue(input.sessionId, "Session id");
      const name = normalizeName(input.name);
      const mime = requireValue(input.mime, "MIME type");
      const path = requireValue(input.path, "File path");
      const size = normalizeSize(input.size);
      const createdAt = now();
      try {
        await db.execute(
          `INSERT INTO files (id, session_id, name, mime, size, path, kind, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, sessionId, name, mime, size, path, input.kind, createdAt],
        );
      } catch (error) {
        throw toDbError(error, "Could not save the file.");
      }
      return {
        id,
        sessionId,
        name,
        mime,
        size,
        path,
        kind: input.kind,
        createdAt,
      };
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
      await db.execute("DELETE FROM files WHERE id = ?", [id]);
    },
  };
}

export type FileRepository = ReturnType<typeof createFileRepository>;

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
