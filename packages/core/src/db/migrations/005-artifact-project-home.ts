import type { Migration } from "../types";

/**
 * Artifacts outlive the session that created them, so they can lose their session and still
 * appear in the global Artifacts list. The project home lets a project's Artifacts tab keep
 * showing them after the originating chat is deleted. The column is nullable because an
 * artifact created in a standalone chat has no project.
 */
const statements = [
  "ALTER TABLE artifacts ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL",
  "CREATE INDEX idx_artifacts_project ON artifacts(project_id, updated_at DESC)",
];

export const artifactProjectHomeMigration: Migration = {
  version: 5,
  name: "artifact project home",
  statements,
};
