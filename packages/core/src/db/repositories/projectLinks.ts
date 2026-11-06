import { AppError } from "../../errors";
import type { DbContext, ProjectLink, ProjectLinkStatus, SqlValue } from "../types";
import { toDbError } from "./errors";

const LINK_COLUMNS =
  "id, project_id, url, title, media_type, snapshot_file_id, status, error, fetched_at, created_at";

interface ProjectLinkRow {
  id: string;
  project_id: string;
  url: string;
  title: string;
  media_type: string | null;
  snapshot_file_id: string | null;
  status: ProjectLinkStatus;
  error: string | null;
  fetched_at: number | null;
  created_at: number;
}

export interface AddProjectLinkInput {
  readonly projectId: string;
  readonly url: string;
  readonly title: string;
  readonly mediaType?: string | null;
}

export interface UpdateProjectLinkInput {
  readonly title?: string;
  readonly mediaType?: string | null;
  readonly snapshotFileId?: string | null;
  readonly status?: ProjectLinkStatus;
  readonly error?: string | null;
  readonly fetchedAt?: number | null;
}

/**
 * Links are stored first and fetched later, so a link is visible with status "pending" even
 * when the device is offline. The status union is enforced by the table CHECK.
 */
export function createProjectLinkRepository({ db, ids, now }: DbContext) {
  return {
    async add(input: AddProjectLinkInput): Promise<ProjectLink> {
      const link: ProjectLink = {
        id: ids(),
        projectId: requireValue(input.projectId, "Project id"),
        url: requireValue(input.url, "Link URL"),
        title: requireValue(input.title, "Link title"),
        mediaType: normalizeOptional(input.mediaType),
        snapshotFileId: null,
        status: "pending",
        error: null,
        fetchedAt: null,
        createdAt: now(),
      };
      try {
        await db.execute(
          `INSERT INTO project_links (${LINK_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          linkParams(link),
        );
      } catch (error) {
        throw toDbError(error, "Could not save the link.");
      }
      return link;
    },

    async get(id: string): Promise<ProjectLink | null> {
      const result = await db.execute("SELECT * FROM project_links WHERE id = ?", [id]);
      const row = result.rows[0];
      return row ? mapLink(row as unknown as ProjectLinkRow) : null;
    },

    async listByProject(projectId: string): Promise<ProjectLink[]> {
      const result = await db.execute(
        "SELECT * FROM project_links WHERE project_id = ? ORDER BY created_at DESC",
        [projectId],
      );
      return result.rows.map((row) => mapLink(row as unknown as ProjectLinkRow));
    },

    async update(id: string, patch: UpdateProjectLinkInput): Promise<ProjectLink> {
      const update = buildUpdate(patch);
      if (!update) {
        const existing = await getLink(db, id);
        if (!existing) {
          throw notFound(id);
        }
        return existing;
      }
      try {
        await db.execute(
          `UPDATE project_links SET ${update.fields.join(", ")} WHERE id = ?`,
          [...update.params, id],
        );
      } catch (error) {
        throw toDbError(error, "Could not update the link.");
      }
      const updated = await getLink(db, id);
      if (!updated) {
        throw notFound(id);
      }
      return updated;
    },

    async remove(id: string): Promise<void> {
      await db.execute("DELETE FROM project_links WHERE id = ?", [id]);
    },
  };
}

export type ProjectLinkRepository = ReturnType<typeof createProjectLinkRepository>;

async function getLink(
  db: DbContext["db"],
  id: string,
): Promise<ProjectLink | null> {
  const result = await db.execute("SELECT * FROM project_links WHERE id = ?", [id]);
  const row = result.rows[0];
  return row ? mapLink(row as unknown as ProjectLinkRow) : null;
}

function buildUpdate(
  patch: UpdateProjectLinkInput,
): { fields: string[]; params: SqlValue[] } | null {
  const fields: string[] = [];
  const params: SqlValue[] = [];
  if (patch.title !== undefined) {
    fields.push("title = ?");
    params.push(requireValue(patch.title, "Link title"));
  }
  if (patch.mediaType !== undefined) {
    fields.push("media_type = ?");
    params.push(normalizeOptional(patch.mediaType));
  }
  if (patch.snapshotFileId !== undefined) {
    fields.push("snapshot_file_id = ?");
    params.push(normalizeOptional(patch.snapshotFileId));
  }
  if (patch.status !== undefined) {
    fields.push("status = ?");
    params.push(patch.status);
  }
  if (patch.error !== undefined) {
    fields.push("error = ?");
    params.push(patch.error);
  }
  if (patch.fetchedAt !== undefined) {
    fields.push("fetched_at = ?");
    params.push(patch.fetchedAt);
  }
  if (fields.length === 0) {
    return null;
  }
  return { fields, params };
}

function linkParams(link: ProjectLink): SqlValue[] {
  return [
    link.id,
    link.projectId,
    link.url,
    link.title,
    link.mediaType,
    link.snapshotFileId,
    link.status,
    link.error,
    link.fetchedAt,
    link.createdAt,
  ];
}

function mapLink(row: ProjectLinkRow): ProjectLink {
  return {
    id: row.id,
    projectId: row.project_id,
    url: row.url,
    title: row.title,
    mediaType: row.media_type,
    snapshotFileId: row.snapshot_file_id,
    status: row.status,
    error: row.error,
    fetchedAt: row.fetched_at === null ? null : Number(row.fetched_at),
    createdAt: Number(row.created_at),
  };
}

function requireValue(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AppError("db_invalid", `${label} is required`, {
      userMessage: "The link is missing information.",
    });
  }
  return trimmed;
}

function normalizeOptional(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function notFound(id: string): AppError {
  return new AppError("db_not_found", `Project link ${id} not found`, {
    userMessage: "Link not found.",
  });
}
