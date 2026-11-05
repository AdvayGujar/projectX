import { AppError } from "../../errors";
import type { DbContext, DocumentRecord, DocumentStatus, SqlValue } from "../types";
import { toDbError } from "./errors";

interface DocumentRow {
  id: string;
  file_id: string;
  page_count: number | null;
  slide_count: number | null;
  sheet_count: number | null;
  status: DocumentStatus;
  error: string | null;
  extracted_at: number | null;
}

export interface CreateDocumentInput {
  readonly fileId: string;
}

export interface UpdateDocumentInput {
  readonly status?: DocumentStatus;
  readonly pageCount?: number | null;
  readonly slideCount?: number | null;
  readonly sheetCount?: number | null;
  readonly error?: string | null;
  readonly extractedAt?: number | null;
}

export function createDocumentRepository({ db, ids, now }: DbContext) {
  return {
    async create(input: CreateDocumentInput): Promise<DocumentRecord> {
      const id = ids();
      try {
        await db.execute(
          `INSERT INTO documents (id, file_id, status)
           VALUES (?, ?, 'pending')`,
          [id, input.fileId],
        );
      } catch (error) {
        throw toDbError(error, "Could not queue the document.");
      }
      const created = await getDocument(db, id);
      if (!created) {
        throw new AppError("db_not_found", `Document ${id} not found after insert`);
      }
      return created;
    },

    async get(id: string): Promise<DocumentRecord | null> {
      return getDocument(db, id);
    },

    async getByFile(fileId: string): Promise<DocumentRecord | null> {
      const result = await db.execute("SELECT * FROM documents WHERE file_id = ?", [fileId]);
      const row = result.rows[0];
      return row ? mapDocument(row as unknown as DocumentRow) : null;
    },

    async update(id: string, patch: UpdateDocumentInput): Promise<DocumentRecord> {
      const update = buildUpdate(patch, now());
      if (!update) {
        const existing = await getDocument(db, id);
        if (!existing) {
          throw notFound(id);
        }
        return existing;
      }
      try {
        await db.execute(`UPDATE documents SET ${update.fields.join(", ")} WHERE id = ?`, [
          ...update.params,
          id,
        ]);
      } catch (error) {
        throw toDbError(error, "Could not update the document.");
      }
      const updated = await getDocument(db, id);
      if (!updated) {
        throw notFound(id);
      }
      return updated;
    },
  };
}

export type DocumentRepository = ReturnType<typeof createDocumentRepository>;

async function getDocument(
  db: DbContext["db"],
  id: string,
): Promise<DocumentRecord | null> {
  const result = await db.execute("SELECT * FROM documents WHERE id = ?", [id]);
  const row = result.rows[0];
  return row ? mapDocument(row as unknown as DocumentRow) : null;
}

function buildUpdate(
  patch: UpdateDocumentInput,
  timestamp: number,
): { fields: string[]; params: SqlValue[] } | null {
  const fields: string[] = [];
  const params: SqlValue[] = [];
  if (patch.status !== undefined) {
    fields.push("status = ?");
    params.push(patch.status);
    if (patch.status === "ready" && patch.extractedAt === undefined) {
      fields.push("extracted_at = ?");
      params.push(timestamp);
    }
  }
  if (patch.pageCount !== undefined) {
    fields.push("page_count = ?");
    params.push(patch.pageCount);
  }
  if (patch.slideCount !== undefined) {
    fields.push("slide_count = ?");
    params.push(patch.slideCount);
  }
  if (patch.sheetCount !== undefined) {
    fields.push("sheet_count = ?");
    params.push(patch.sheetCount);
  }
  if (patch.error !== undefined) {
    fields.push("error = ?");
    params.push(patch.error);
  }
  if (patch.extractedAt !== undefined) {
    fields.push("extracted_at = ?");
    params.push(patch.extractedAt);
  }
  if (fields.length === 0) {
    return null;
  }
  return { fields, params };
}

function mapDocument(row: DocumentRow): DocumentRecord {
  return {
    id: row.id,
    fileId: row.file_id,
    pageCount: row.page_count === null ? null : Number(row.page_count),
    slideCount: row.slide_count === null ? null : Number(row.slide_count),
    sheetCount: row.sheet_count === null ? null : Number(row.sheet_count),
    status: row.status,
    error: row.error,
    extractedAt: row.extracted_at === null ? null : Number(row.extracted_at),
  };
}

function notFound(id: string): AppError {
  return new AppError("db_not_found", `Document ${id} not found`, {
    userMessage: "Document not found.",
  });
}
