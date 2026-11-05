import { AppError } from "../../errors";
import type { DbContext, Project, SqlDatabase, SqlValue } from "../types";
import { toDbError } from "./errors";

interface ProjectRow {
  id: string;
  name: string;
  icon: string | null;
  instructions: string;
  created_at: number;
  updated_at: number;
}

interface ProjectCountRow extends ProjectRow {
  session_count: number;
}

export interface ProjectWithCount extends Project {
  sessionCount: number;
}

export interface CreateProjectInput {
  name: string;
  icon?: string | null;
  instructions?: string;
}

export interface UpdateProjectInput {
  name?: string;
  icon?: string | null;
  instructions?: string;
}

export function createProjectRepository({ db, ids, now }: DbContext) {
  return {
    async create(input: CreateProjectInput): Promise<Project> {
      const id = ids();
      const timestamp = now();
      const name = normalizeName(input.name);
      try {
        await db.execute(
          "INSERT INTO projects (id, name, icon, instructions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
          [id, name, input.icon ?? null, input.instructions ?? "", timestamp, timestamp],
        );
      } catch (error) {
        throw toDbError(error, "Could not create project.");
      }
      return { id, name, icon: input.icon ?? null, instructions: input.instructions ?? "", createdAt: timestamp, updatedAt: timestamp };
    },

    async get(id: string): Promise<Project | null> {
      return getProject(db, id);
    },

    async list(): Promise<Project[]> {
      const result = await db.execute("SELECT * FROM projects ORDER BY updated_at DESC");
      return result.rows.map((row) => mapProject(row as unknown as ProjectRow));
    },

    async listWithCounts(): Promise<ProjectWithCount[]> {
      const result = await db.execute(
        `SELECT p.*, COUNT(CASE WHEN s.archived = 0 THEN 1 END) AS session_count
         FROM projects p
         LEFT JOIN sessions s ON s.project_id = p.id
         GROUP BY p.id
         ORDER BY p.updated_at DESC`,
      );
      return result.rows.map((row) => mapProjectWithCount(row as unknown as ProjectCountRow));
    },

    async update(id: string, patch: UpdateProjectInput): Promise<Project> {
      const update = buildUpdate(patch, now());
      if (!update) {
        const existing = await getProject(db, id);
        if (!existing) {
          throw notFound(id);
        }
        return existing;
      }
      try {
        await db.execute(`UPDATE projects SET ${update.fields.join(", ")} WHERE id = ?`, [...update.params, id]);
      } catch (error) {
        throw toDbError(error, "Could not update project.");
      }
      const updated = await getProject(db, id);
      if (!updated) {
        throw notFound(id);
      }
      return updated;
    },

    async remove(id: string): Promise<void> {
      await db.execute("DELETE FROM projects WHERE id = ?", [id]);
    },
  };
}

export type ProjectRepository = ReturnType<typeof createProjectRepository>;

async function getProject(db: SqlDatabase, id: string): Promise<Project | null> {
  const result = await db.execute("SELECT * FROM projects WHERE id = ?", [id]);
  const row = result.rows[0];
  return row ? mapProject(row as unknown as ProjectRow) : null;
}

function buildUpdate(patch: UpdateProjectInput, timestamp: number): { fields: string[]; params: SqlValue[] } | null {
  const fields: string[] = [];
  const params: SqlValue[] = [];
  if (patch.name !== undefined) {
    fields.push("name = ?");
    params.push(normalizeName(patch.name));
  }
  if (patch.icon !== undefined) {
    fields.push("icon = ?");
    params.push(patch.icon);
  }
  if (patch.instructions !== undefined) {
    fields.push("instructions = ?");
    params.push(patch.instructions);
  }
  if (fields.length === 0) {
    return null;
  }
  fields.push("updated_at = ?");
  params.push(timestamp);
  return { fields, params };
}

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    instructions: row.instructions,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function mapProjectWithCount(row: ProjectCountRow): ProjectWithCount {
  return { ...mapProject(row), sessionCount: Number(row.session_count) };
}

function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new AppError("db_invalid", "Project name is required", {
      userMessage: "Project name is required.",
    });
  }
  return trimmed;
}

function notFound(id: string): AppError {
  return new AppError("db_not_found", `Project ${id} not found`, {
    userMessage: "Project not found.",
  });
}
