import { AppError } from "../../errors";
import { assertSafeRelativePath } from "../../paths";
import type {
  DbContext,
  DocumentRecord,
  DocumentStatus,
  FileKind,
  FileRecord,
  SqlCommand,
  SqlValue,
} from "../types";
import { insertPendingDocumentCommand } from "./commands";
import { toDbError } from "./errors";

const FILE_COLUMNS = "id, session_id, project_id, name, mime, size, path, kind, created_at";

const LISTING_COLUMNS = `SELECT f.id, f.session_id, f.project_id, f.name, f.mime, f.size,
         f.path, f.kind, f.created_at,
         d.id AS document_id, d.page_count, d.slide_count, d.sheet_count,
         d.status, d.error, d.extracted_at
  FROM files f
  LEFT JOIN documents d ON d.file_id = f.id`;

interface FileRow {
  id: string;
  session_id: string | null;
  project_id: string | null;
  name: string;
  mime: string;
  size: number;
  path: string;
  kind: FileKind;
  created_at: number;
}

interface FileOwner {
  readonly sessionId: string | null;
  readonly projectId: string | null;
}

export interface AddFileInput {
  /**
   * Caller-supplied because the sandbox path is derived from the id before the row exists.
   */
  readonly id: string;
  /** Standalone chats own their imports; project chats write into the project library. */
  readonly sessionId?: string | null;
  readonly projectId?: string | null;
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

/** A visible file with its extraction row when one exists. */
export interface FileListing {
  readonly file: FileRecord;
  readonly document: DocumentRecord | null;
}

interface FileListingRow extends FileRow {
  document_id: string | null;
  page_count: number | null;
  slide_count: number | null;
  sheet_count: number | null;
  status: string | null;
  error: string | null;
  extracted_at: number | null;
}

export function createFileRepository({ db, ids, now }: DbContext) {
  return {
    async add(input: AddFileInput): Promise<FileRecord> {
      const file = normalizeFile(input, now());
      try {
        await db.execute(
          `INSERT INTO files (${FILE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          `INSERT INTO files (${FILE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

    /** Project library files only; legacy session files in a project chat are not included. */
    async listByProject(projectId: string): Promise<FileRecord[]> {
      const result = await db.execute(
        "SELECT * FROM files WHERE project_id = ? ORDER BY created_at DESC",
        [projectId],
      );
      return result.rows.map((row) => mapFile(row as unknown as FileRow));
    },

    /**
     * Everything a chat may read: its project library plus files owned by this session.
     * A standalone chat only sees its own files.
     */
    async listVisible(
      sessionId: string,
      projectId: string | null,
    ): Promise<FileListing[]> {
      const result = projectId === null
        ? await db.execute(
          `${LISTING_COLUMNS}
           WHERE f.session_id = ?
           ORDER BY f.created_at DESC`,
          [sessionId],
        )
        : await db.execute(
          `${LISTING_COLUMNS}
           WHERE f.project_id = ? OR f.session_id = ?
           ORDER BY f.created_at DESC`,
          [projectId, sessionId],
        );
      return result.rows.map((row) => mapListing(row as unknown as FileListingRow));
    },

    /**
     * Library rows for the project plus its saved links' summaries. A link snapshot is an
     * implementation detail of the link, so the library shows the link instead of the file.
     */
    async listLibrary(projectId: string): Promise<FileRecord[]> {
      const result = await db.execute(
        `SELECT files.* FROM files
         WHERE files.project_id = ?
           AND NOT EXISTS (
             SELECT 1 FROM project_links l WHERE l.snapshot_file_id = files.id
           )
         ORDER BY files.created_at DESC`,
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
  const owner = normalizeOwner(input);
  const name = normalizeName(input.name);
  const mime = requireValue(input.mime, "MIME type");
  const path = requireValue(input.path, "File path");
  assertSafeRelativePath(path);
  return {
    id,
    sessionId: owner.sessionId,
    projectId: owner.projectId,
    name,
    mime,
    size: normalizeSize(input.size),
    path,
    kind: input.kind,
    createdAt,
  };
}

/** A row has exactly one owner; the DB CHECK is the backstop, not the first line. */
function normalizeOwner(input: AddFileInput): FileOwner {
  const sessionId = optionalValue(input.sessionId);
  const projectId = optionalValue(input.projectId);
  if ((sessionId === null) === (projectId === null)) {
    throw new AppError("db_invalid", "File must belong to exactly one session or project", {
      userMessage: "The file is missing information.",
    });
  }
  return { sessionId, projectId };
}

function fileParams(file: FileRecord): SqlValue[] {
  return [
    file.id,
    file.sessionId,
    file.projectId,
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

function mapListing(row: FileListingRow): FileListing {
  return {
    file: mapFile(row),
    document: row.document_id === null ? null : mapListingDocument(row),
  };
}

function mapListingDocument(row: FileListingRow): DocumentRecord {
  return {
    id: String(row.document_id),
    fileId: row.id,
    pageCount: nullableNumber(row.page_count),
    slideCount: nullableNumber(row.slide_count),
    sheetCount: nullableNumber(row.sheet_count),
    status: toDocumentStatus(row.status),
    error: row.error,
    extractedAt: nullableNumber(row.extracted_at),
  };
}

function mapFile(row: FileRow): FileRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    projectId: row.project_id,
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

function optionalValue(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function nullableNumber(value: number | null): number | null {
  return value === null ? null : Number(value);
}

function toDocumentStatus(value: string | null): DocumentStatus {
  if (value === "pending" || value === "extracting" || value === "ready" || value === "error") {
    return value;
  }
  throw new AppError("db_invalid", `Unknown document status: ${String(value)}`, {
    userMessage: "A document could not be read.",
  });
}
