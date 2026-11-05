import { AppError } from "../../errors";
import type { DbContext, Session, SqlDatabase, SqlValue } from "../types";
import { toDbError } from "./errors";

interface SessionRow {
  id: string;
  project_id: string | null;
  title: string;
  provider_id: string | null;
  model_id: string | null;
  summary: string | null;
  summary_upto_seq: number | null;
  pinned: number;
  archived: number;
  last_message_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface CreateSessionInput {
  projectId?: string | null;
  title?: string;
  providerId?: string | null;
  modelId?: string | null;
}

export interface UpdateSessionInput {
  projectId?: string | null;
  title?: string;
  providerId?: string | null;
  modelId?: string | null;
  pinned?: boolean;
  archived?: boolean;
}

export interface ListSessionsOptions {
  includeArchived?: boolean;
}

export function createSessionRepository({ db, ids, now }: DbContext) {
  return {
    async create(input: CreateSessionInput = {}): Promise<Session> {
      const id = ids();
      const timestamp = now();
      const title = input.title?.trim() || "New chat";
      try {
        await db.execute(
          `INSERT INTO sessions
            (id, project_id, title, provider_id, model_id, pinned, archived, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`,
          [id, input.projectId ?? null, title, input.providerId ?? null, input.modelId ?? null, timestamp, timestamp],
        );
      } catch (error) {
        throw toDbError(error, "Could not create chat.");
      }
      const created = await getSession(db, id);
      if (!created) {
        throw new AppError("db_not_found", `Session ${id} not found after insert`);
      }
      return created;
    },

    async get(id: string): Promise<Session | null> {
      return getSession(db, id);
    },

    async listByProject(projectId: string | null, options: ListSessionsOptions = {}): Promise<Session[]> {
      const archived = options.includeArchived ? 1 : 0;
      const result = await db.execute(
        `SELECT * FROM sessions
         WHERE project_id IS ? AND archived IN (0, ?)
         ORDER BY pinned DESC, COALESCE(last_message_at, created_at) DESC`,
        [projectId, archived],
      );
      return result.rows.map((row) => mapSession(row as unknown as SessionRow));
    },

    async listRecent(limit = 50, options: ListSessionsOptions = {}): Promise<Session[]> {
      const archived = options.includeArchived ? 1 : 0;
      const result = await db.execute(
        `SELECT * FROM sessions
         WHERE archived IN (0, ?)
         ORDER BY pinned DESC, COALESCE(last_message_at, created_at) DESC
         LIMIT ?`,
        [archived, Math.max(1, Math.min(limit, 200))],
      );
      return result.rows.map((row) => mapSession(row as unknown as SessionRow));
    },

    async update(id: string, patch: UpdateSessionInput): Promise<Session> {
      const update = buildUpdate(patch, now());
      if (!update) {
        const existing = await getSession(db, id);
        if (!existing) {
          throw notFound(id);
        }
        return existing;
      }
      try {
        await db.execute(`UPDATE sessions SET ${update.fields.join(", ")} WHERE id = ?`, [...update.params, id]);
      } catch (error) {
        throw toDbError(error, "Could not update chat.");
      }
      const updated = await getSession(db, id);
      if (!updated) {
        throw notFound(id);
      }
      return updated;
    },

    async setSummary(id: string, summary: string | null, uptoSeq: number | null): Promise<void> {
      await db.execute(
        "UPDATE sessions SET summary = ?, summary_upto_seq = ?, updated_at = ? WHERE id = ?",
        [summary, uptoSeq, now(), id],
      );
    },

    async touch(id: string, at: number): Promise<void> {
      await db.execute(
        "UPDATE sessions SET last_message_at = ?, updated_at = ? WHERE id = ?",
        [at, at, id],
      );
    },

    async remove(id: string): Promise<void> {
      await db.execute("DELETE FROM sessions WHERE id = ?", [id]);
    },
  };
}

export type SessionRepository = ReturnType<typeof createSessionRepository>;

async function getSession(db: SqlDatabase, id: string): Promise<Session | null> {
  const result = await db.execute("SELECT * FROM sessions WHERE id = ?", [id]);
  const row = result.rows[0];
  return row ? mapSession(row as unknown as SessionRow) : null;
}

function buildUpdate(patch: UpdateSessionInput, timestamp: number): { fields: string[]; params: SqlValue[] } | null {
  const fields: string[] = [];
  const params: SqlValue[] = [];
  if (patch.projectId !== undefined) {
    fields.push("project_id = ?");
    params.push(patch.projectId);
  }
  if (patch.title !== undefined) {
    fields.push("title = ?");
    params.push(patch.title.trim() || "New chat");
  }
  if (patch.providerId !== undefined) {
    fields.push("provider_id = ?");
    params.push(patch.providerId);
  }
  if (patch.modelId !== undefined) {
    fields.push("model_id = ?");
    params.push(patch.modelId);
  }
  if (patch.pinned !== undefined) {
    fields.push("pinned = ?");
    params.push(patch.pinned ? 1 : 0);
  }
  if (patch.archived !== undefined) {
    fields.push("archived = ?");
    params.push(patch.archived ? 1 : 0);
  }
  if (fields.length === 0) {
    return null;
  }
  fields.push("updated_at = ?");
  params.push(timestamp);
  return { fields, params };
}

function mapSession(row: SessionRow): Session {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    providerId: row.provider_id,
    modelId: row.model_id,
    summary: row.summary,
    summaryUptoSeq: row.summary_upto_seq === null ? null : Number(row.summary_upto_seq),
    pinned: Number(row.pinned) === 1,
    archived: Number(row.archived) === 1,
    lastMessageAt: row.last_message_at === null ? null : Number(row.last_message_at),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function notFound(id: string): AppError {
  return new AppError("db_not_found", `Session ${id} not found`, {
    userMessage: "Chat not found.",
  });
}
