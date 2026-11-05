import { AppError } from "../../errors";
import type { DbContext, DocChunk, SqlCommand } from "../types";
import { toDbError } from "./errors";

const CHUNK_COLUMNS =
  "id, document_id, ordinal, page, section, text, token_estimate";

interface ChunkRow {
  id: string;
  document_id: string;
  ordinal: number;
  page: number | null;
  section: string | null;
  text: string;
  token_estimate: number;
}

/** A new chunk before the repository assigns its id and document. */
export interface ChunkDraft {
  readonly ordinal: number;
  readonly page: number | null;
  readonly section: string | null;
  readonly text: string;
  readonly tokenEstimate: number;
}

export interface ChunkRepository {
  replaceForDocument(documentId: string, chunks: readonly ChunkDraft[]): Promise<DocChunk[]>;
  listByDocument(documentId: string): Promise<DocChunk[]>;
  count(documentId: string): Promise<number>;
}

export function createChunkRepository({ db, ids }: DbContext): ChunkRepository {
  return {
    /**
     * Re-extraction replaces the whole document in one transaction so an interrupted
     * run can never leave a mix of old and new chunks.
     */
    async replaceForDocument(
      documentId: string,
      chunks: readonly ChunkDraft[],
    ): Promise<DocChunk[]> {
      const records = chunks.map((draft) => toRecord(draft, documentId, ids()));
      const commands: SqlCommand[] = [
        ["DELETE FROM doc_chunks WHERE document_id = ?", [documentId]],
        ...records.map(insertCommand),
      ];
      try {
        await db.executeBatch(commands);
      } catch (error) {
        throw toDbError(error, "Could not save the document text.");
      }
      return records;
    },

    async listByDocument(documentId: string): Promise<DocChunk[]> {
      const result = await db.execute(
        `SELECT ${CHUNK_COLUMNS} FROM doc_chunks WHERE document_id = ? ORDER BY ordinal`,
        [documentId],
      );
      return result.rows.map((row) => mapChunk(row as unknown as ChunkRow));
    },

    async count(documentId: string): Promise<number> {
      const result = await db.execute(
        "SELECT COUNT(*) AS total FROM doc_chunks WHERE document_id = ?",
        [documentId],
      );
      return Number(result.rows[0]?.total ?? 0);
    },
  };
}

function toRecord(draft: ChunkDraft, documentId: string, id: string): DocChunk {
  return {
    id,
    documentId,
    ordinal: requireOrdinal(draft.ordinal),
    page: draft.page,
    section: draft.section,
    text: requireText(draft.text),
    tokenEstimate: draft.tokenEstimate,
  };
}

function insertCommand(chunk: DocChunk): SqlCommand {
  return [
    `INSERT INTO doc_chunks (${CHUNK_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      chunk.id,
      chunk.documentId,
      chunk.ordinal,
      chunk.page,
      chunk.section,
      chunk.text,
      chunk.tokenEstimate,
    ],
  ];
}

function mapChunk(row: ChunkRow): DocChunk {
  return {
    id: row.id,
    documentId: row.document_id,
    ordinal: Number(row.ordinal),
    page: row.page === null ? null : Number(row.page),
    section: row.section,
    text: row.text,
    tokenEstimate: Number(row.token_estimate),
  };
}

function requireOrdinal(ordinal: number): number {
  if (!Number.isInteger(ordinal) || ordinal < 1) {
    throw new AppError("db_invalid", `Invalid chunk ordinal: ${ordinal}`, {
      userMessage: "The document text could not be saved.",
    });
  }
  return ordinal;
}

function requireText(text: string): string {
  if (!text.trim()) {
    throw new AppError("db_invalid", "Chunk text is required", {
      userMessage: "The document text could not be saved.",
    });
  }
  return text;
}
