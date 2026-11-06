import type { DbContext, SqlValue } from "../types";

export interface SearchOptions {
  limit?: number;
  projectId?: string | null;
}

export interface MessageSearchHit {
  readonly partId: string;
  readonly messageId: string;
  readonly sessionId: string;
  readonly sessionTitle: string;
  readonly projectId: string | null;
  readonly projectName: string | null;
  readonly snippet: string;
  readonly rank: number;
}

export interface ChunkSearchHit {
  readonly chunkId: string;
  readonly documentId: string;
  readonly fileId: string;
  readonly fileName: string;
  readonly projectId: string | null;
  readonly projectName: string | null;
  readonly sourceUrl: string | null;
  readonly sourceTitle: string | null;
  readonly page: number | null;
  readonly section: string | null;
  readonly snippet: string;
  readonly rank: number;
}

/** A chunk ready to become model context: text plus the citation its header needs. */
export interface ContextChunk {
  readonly chunkId: string;
  readonly documentId: string;
  readonly fileId: string;
  readonly fileName: string;
  readonly ordinal: number;
  readonly page: number | null;
  readonly section: string | null;
  readonly text: string;
  readonly tokenEstimate: number;
}

export interface ContextChunkHit extends ContextChunk {
  readonly rank: number;
}

/** Retrieval covers the project library plus the current chat's own files. */
export interface ContextScope {
  readonly projectId: string;
  readonly sessionId: string;
}

export interface ContextSearchOptions extends ContextScope {
  readonly limit?: number;
}

export interface ContextTotals {
  readonly chunkCount: number;
  readonly tokenTotal: number;
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
        `SELECT p.id AS part_id, p.message_id, m.session_id, s.title AS session_title,
                s.project_id, pr.name AS project_name,
                snippet(parts_fts, 0, '[', ']', '…', 12) AS snippet,
                bm25(parts_fts) AS rank
         FROM parts_fts
         JOIN parts p ON p.rowid = parts_fts.rowid
         JOIN messages m ON m.id = p.message_id
         JOIN sessions s ON s.id = m.session_id
         LEFT JOIN projects pr ON pr.id = s.project_id
         WHERE parts_fts MATCH ?${filter}
         ORDER BY rank
         LIMIT ?`,
        [match, ...params, limitOf(options)],
      );
      return result.rows.map((row) => ({
        partId: String(row.part_id),
        messageId: String(row.message_id),
        sessionId: String(row.session_id),
        sessionTitle: String(row.session_title ?? ""),
        projectId: nullableString(row.project_id),
        projectName: nullableString(row.project_name),
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
                f.name AS file_name,
                COALESCE(f.project_id, s.project_id) AS project_id,
                pr.name AS project_name,
                (SELECT l.url FROM project_links l
                 WHERE l.snapshot_file_id = f.id
                 ORDER BY l.created_at DESC LIMIT 1) AS source_url,
                (SELECT l.title FROM project_links l
                 WHERE l.snapshot_file_id = f.id
                 ORDER BY l.created_at DESC LIMIT 1) AS source_title,
                snippet(doc_chunks_fts, 0, '[', ']', '…', 12) AS snippet,
                bm25(doc_chunks_fts) AS rank
         FROM doc_chunks_fts
         JOIN doc_chunks c ON c.rowid = doc_chunks_fts.rowid
         JOIN documents d ON d.id = c.document_id
         JOIN files f ON f.id = d.file_id
         LEFT JOIN sessions s ON s.id = f.session_id
         LEFT JOIN projects pr ON pr.id = COALESCE(f.project_id, s.project_id)
         WHERE doc_chunks_fts MATCH ? AND d.status = 'ready'${filter}
         ORDER BY rank
         LIMIT ?`,
        [match, ...params, limitOf(options)],
      );
      return result.rows.map((row) => ({
        chunkId: String(row.chunk_id),
        documentId: String(row.document_id),
        fileId: String(row.file_id),
        fileName: String(row.file_name ?? ""),
        projectId: nullableString(row.project_id),
        projectName: nullableString(row.project_name),
        sourceUrl: nullableString(row.source_url),
        sourceTitle: nullableString(row.source_title),
        page: row.page === null ? null : Number(row.page),
        section: row.section === null ? null : String(row.section),
        snippet: String(row.snippet ?? ""),
        rank: Number(row.rank ?? 0),
      }));
    },

    async contextChunks(
      query: string,
      options: ContextSearchOptions,
    ): Promise<ContextChunkHit[]> {
      const match = toFtsQuery(query);
      if (!match) {
        return [];
      }
      const result = await db.execute(
        `${CONTEXT_COLUMNS}${CONTEXT_RANK_COLUMN}
         FROM doc_chunks_fts
         JOIN doc_chunks c ON c.rowid = doc_chunks_fts.rowid
         JOIN documents d ON d.id = c.document_id
         JOIN files f ON f.id = d.file_id
         WHERE doc_chunks_fts MATCH ? AND d.status = 'ready'
           AND (f.project_id = ? OR f.session_id = ?)
         ORDER BY rank
         LIMIT ?`,
        [match, options.projectId, options.sessionId, contextLimit(options.limit)],
      );
      return result.rows.map((row) => ({
        ...mapContextChunk(row),
        rank: Number(row.rank ?? 0),
      }));
    },

    async contextNeighbors(documentId: string, ordinal: number): Promise<ContextChunk[]> {
      const result = await db.execute(
        `${CONTEXT_COLUMNS}
         FROM doc_chunks c
         JOIN documents d ON d.id = c.document_id
         JOIN files f ON f.id = d.file_id
         WHERE c.document_id = ? AND d.status = 'ready'
           AND c.ordinal BETWEEN ? AND ?
         ORDER BY c.ordinal`,
        [documentId, ordinal - 1, ordinal + 1],
      );
      return result.rows.map(mapContextChunk);
    },

    async contextTotals(scope: ContextScope): Promise<ContextTotals> {
      const result = await db.execute(
        `SELECT COUNT(*) AS chunk_count, COALESCE(SUM(c.token_estimate), 0) AS token_total
         FROM doc_chunks c
         JOIN documents d ON d.id = c.document_id
         JOIN files f ON f.id = d.file_id
         WHERE d.status = 'ready' AND (f.project_id = ? OR f.session_id = ?)`,
        [scope.projectId, scope.sessionId],
      );
      return {
        chunkCount: Number(result.rows[0]?.chunk_count ?? 0),
        tokenTotal: Number(result.rows[0]?.token_total ?? 0),
      };
    },

    async listContextChunks(scope: ContextScope): Promise<ContextChunk[]> {
      const result = await db.execute(
        `${CONTEXT_COLUMNS}
         FROM doc_chunks c
         JOIN documents d ON d.id = c.document_id
         JOIN files f ON f.id = d.file_id
         WHERE d.status = 'ready' AND (f.project_id = ? OR f.session_id = ?)
         ORDER BY f.created_at, c.page, c.ordinal, c.id`,
        [scope.projectId, scope.sessionId],
      );
      return result.rows.map(mapContextChunk);
    },
  };
}

export type SearchRepository = ReturnType<typeof createSearchRepository>;

const CONTEXT_COLUMNS = `SELECT c.id AS chunk_id, c.document_id, d.file_id, f.name AS file_name,
         c.ordinal, c.page, c.section, c.text, c.token_estimate`;
const CONTEXT_RANK_COLUMN = `, bm25(doc_chunks_fts) AS rank`;

function mapContextChunk(row: Record<string, SqlValue>): ContextChunk {
  return {
    chunkId: String(row.chunk_id),
    documentId: String(row.document_id),
    fileId: String(row.file_id),
    fileName: String(row.file_name ?? ""),
    ordinal: Number(row.ordinal),
    page: row.page === null ? null : Number(row.page),
    section: row.section === null ? null : String(row.section),
    text: String(row.text ?? ""),
    tokenEstimate: Number(row.token_estimate ?? 0),
  };
}

function contextLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(limit ?? 10, 50));
}

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

function nullableString(value: SqlValue | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}
