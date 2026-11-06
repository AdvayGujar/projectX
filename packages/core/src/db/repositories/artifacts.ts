import { AppError } from "../../errors";
import type {
  ArtifactKind,
  ArtifactRecord,
  ArtifactSummary,
  ArtifactVersionRecord,
  DbContext,
  SqlValue,
} from "../types";

const ARTIFACT_COLUMNS =
  "id, session_id, project_id, kind, title, current_version, created_at, updated_at";
const DEFAULT_LIMIT = 20;

interface ArtifactRow {
  id: string;
  session_id: string | null;
  project_id: string | null;
  kind: string;
  title: string;
  current_version: number;
  created_at: number;
  updated_at: number;
}

interface VersionRow {
  artifact_id: string;
  version: number;
  spec_json: string;
  created_by: string;
  created_at: number;
}

/** The chat and its project, resolved once by the caller. */
export interface ArtifactScope {
  readonly sessionId: string;
  readonly projectId: string | null;
}

export function createArtifactRepository({ db }: DbContext) {
  return {
    /** Newest first. A project chat sees its project's artifacts and its own history. */
    async listSummaries(
      scope: ArtifactScope,
      limit = DEFAULT_LIMIT,
    ): Promise<ArtifactSummary[]> {
      const { where, params } = scopeFilter(scope);
      const result = await db.execute(
        `SELECT ${ARTIFACT_COLUMNS} FROM artifacts
         WHERE ${where}
         ORDER BY updated_at DESC
         LIMIT ?`,
        [...params, clampLimit(limit)],
      );
      return result.rows.map((row) => toSummary(mapArtifact(row as unknown as ArtifactRow)));
    },

    async get(id: string): Promise<ArtifactRecord | null> {
      const result = await db.execute("SELECT * FROM artifacts WHERE id = ?", [id]);
      const row = result.rows[0];
      return row ? mapArtifact(row as unknown as ArtifactRow) : null;
    },

    /** Reads the requested version, or the artifact's current version when omitted. */
    async getVersion(
      artifactId: string,
      version?: number,
    ): Promise<ArtifactVersionRecord | null> {
      const result = version === undefined
        ? await db.execute(
          `SELECT v.* FROM artifact_versions v
           JOIN artifacts a ON a.id = v.artifact_id AND a.current_version = v.version
           WHERE v.artifact_id = ?`,
          [artifactId],
        )
        : await db.execute(
          "SELECT * FROM artifact_versions WHERE artifact_id = ? AND version = ?",
          [artifactId, version],
        );
      const row = result.rows[0];
      return row ? mapVersion(row as unknown as VersionRow) : null;
    },
  };
}

export type ArtifactRepository = ReturnType<typeof createArtifactRepository>;

/** The scope check lives here so a tool cannot widen it by accident. */
export function isArtifactInScope(
  artifact: ArtifactRecord,
  scope: ArtifactScope,
): boolean {
  if (scope.projectId !== null) {
    return artifact.projectId === scope.projectId || artifact.sessionId === scope.sessionId;
  }
  return artifact.projectId === null && artifact.sessionId === scope.sessionId;
}

function scopeFilter(scope: ArtifactScope): { where: string; params: SqlValue[] } {
  if (scope.projectId !== null) {
    return {
      where: "(project_id = ? OR session_id = ?)",
      params: [scope.projectId, scope.sessionId],
    };
  }
  return {
    where: "(project_id IS NULL AND session_id = ?)",
    params: [scope.sessionId],
  };
}

function mapArtifact(row: ArtifactRow): ArtifactRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    projectId: row.project_id,
    kind: toArtifactKind(row.kind),
    title: row.title,
    currentVersion: Number(row.current_version),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function mapVersion(row: VersionRow): ArtifactVersionRecord {
  return {
    artifactId: row.artifact_id,
    version: Number(row.version),
    specJson: row.spec_json,
    createdBy: row.created_by === "user" ? "user" : "model",
    createdAt: Number(row.created_at),
  };
}

function toSummary(artifact: ArtifactRecord): ArtifactSummary {
  return {
    id: artifact.id,
    kind: artifact.kind,
    title: artifact.title,
    currentVersion: artifact.currentVersion,
  };
}

function toArtifactKind(value: string): ArtifactKind {
  if (value === "deck" || value === "sheet" || value === "doc") {
    return value;
  }
  throw new AppError("db_invalid", `Unknown artifact kind: ${value}`, {
    userMessage: "An artifact could not be read.",
  });
}

function clampLimit(limit: number): number {
  return Math.max(1, Math.min(Math.trunc(limit), 50));
}
