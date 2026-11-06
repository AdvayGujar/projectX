import type { DbContext, SqlValue } from "../types";

export interface SearchOptions {
  limit?: number;
  projectId?: string | null;
}

export interface MessageSearchHit {
  partId: string;
  messageId: string;
  sessionId: string;
  snippet: string;
  rank: number;
}

export interface ChunkSearchHit {
  chunkId: string;
  documentId: string;
  fileId: string;
  page: number | null;
  section: string | null;
  snippet: string;
  rank: number;
}

export function createSearchRepository({ db }: DbContext) {
  return {
    async messages(query: string, options: SearchOptions = {}): Promise<MessageSearchHit[]> {
      const match = toFtsQuery(query);
      if (!match) {
        return [];
      }
      const { filter, params } = buildFilter(options.projectId, "s.project_id");
      const result = await db.execute(
        `SELECT p.id AS part_id, p.message_id, m.session_id,
                snippet(parts_fts, 0, '[', ']', '…', 12) AS snippet,
                bm25(parts_fts) AS rank
         FROM parts_fts
         JOIN parts p ON p.rowid = parts_fts.rowid
         JOIN messages m ON m.id = p.message_id
         JOIN sessions s ON s.id = m.session_id
         WHERE parts_fts MATCH ?${filter}
         ORDER BY rank
         LIMIT ?`,
        [match, ...params, limitOf(options)],
      );
      return result.rows.map((row) => ({
        partId: String(row.part_id),
        messageId: String(row.message_id),
        sessionId: String(row.session_id),
        snippet: String(row.snippet ?? ""),
        rank: Number(row.rank ?? 0),
      }));
    },

    async chunks(query: string, options: SearchOptions = {}): Promise<ChunkSearchHit[]> {
      const match = toFtsQuery(query);
      if (!match) {
        return [];
      }
      const { filter, params } = buildChunkFilter(options.projectId);
      const result = await db.execute(
        `SELECT c.id AS chunk_id, c.document_id, d.file_id, c.page, c.section,
                snippet(doc_chunks_fts, 0, '[', ']', '…', 12) AS snippet,
                bm25(doc_chunks_fts) AS rank
         FROM doc_chunks_fts
         JOIN doc_chunks c ON c.rowid = doc_chunks_fts.rowid
         JOIN documents d ON d.id = c.document_id
         JOIN files f ON f.id = d.file_id
         LEFT JOIN sessions s ON s.id = f.session_id
         WHERE doc_chunks_fts MATCH ? AND d.status = 'ready'${filter}
         ORDER BY rank
         LIMIT ?`,
        [match, ...params, limitOf(options)],
      );
      return result.rows.map((row) => ({
        chunkId: String(row.chunk_id),
        documentId: String(row.document_id),
        fileId: String(row.file_id),
        page: row.page === null ? null : Number(row.page),
        section: row.section === null ? null : String(row.section),
        snippet: String(row.snippet ?? ""),
        rank: Number(row.rank ?? 0),
      }));
    },
  };
}

export type SearchRepository = ReturnType<typeof createSearchRepository>;

export function toFtsQuery(input: string): string | null {
  const terms = input
    .split(/\s+/)
    .map((term) => term.replace(/[^\p{L}\p{N}_-]+/gu, ""))
    .filter(Boolean);
  if (terms.length === 0) {
    return null;
  }
  return terms.map((term) => `"${term}"`).join(" AND ");
}

function buildFilter(projectId: string | null | undefined, column: string): { filter: string; params: SqlValue[] } {
  if (projectId === undefined) {
    return { filter: "", params: [] };
  }
  if (projectId === null) {
    return { filter: ` AND ${column} IS NULL`, params: [] };
  }
  return { filter: ` AND ${column} = ?`, params: [projectId] };
}

/**
 * Chunks have two possible owners: a project library file, or a session file. A project
 * search covers both the project's own library and legacy files still owned by its chats.
 * A standalone search only covers chats that were never in a project.
 */
function buildChunkFilter(projectId: string | null | undefined): { filter: string; params: SqlValue[] } {
  if (projectId === undefined) {
    return { filter: "", params: [] };
  }
  if (projectId === null) {
    return { filter: " AND f.session_id IS NOT NULL AND s.project_id IS NULL", params: [] };
  }
  return { filter: " AND (s.project_id = ? OR f.project_id = ?)", params: [projectId, projectId] };
}

function limitOf(options: SearchOptions): number {
  return Math.max(1, Math.min(options.limit ?? 20, 50));
}
