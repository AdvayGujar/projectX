import type { Migration } from "../types";

/**
 * Files gain an owner union: a standalone chat's session or a project's library, never both.
 * The table is rebuilt rather than altered because SQLite cannot add a CHECK constraint in
 * place. Rebuilding means dropping the parent of `documents`, so foreign keys are disabled
 * for the batch; otherwise the drop would cascade every document and chunk away.
 */
const statements = [
  `CREATE TABLE files_new (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    path TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('pdf', 'docx', 'xlsx', 'pptx', 'image', 'text', 'other')),
    created_at INTEGER NOT NULL,
    CHECK ((session_id IS NULL) <> (project_id IS NULL))
  ) STRICT`,
  `INSERT INTO files_new (id, session_id, project_id, name, mime, size, path, kind, created_at)
   SELECT id, session_id, NULL, name, mime, size, path, kind, created_at FROM files`,
  "DROP TABLE files",
  "ALTER TABLE files_new RENAME TO files",
  "CREATE INDEX idx_files_session ON files(session_id, created_at DESC)",
  "CREATE INDEX idx_files_project ON files(project_id, created_at DESC)",
  `CREATE TABLE project_links (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    media_type TEXT,
    snapshot_file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fetching', 'ready', 'error')),
    error TEXT,
    fetched_at INTEGER,
    created_at INTEGER NOT NULL
  ) STRICT`,
  "CREATE INDEX idx_project_links_project ON project_links(project_id, created_at DESC)",
];

export const projectLibraryMigration: Migration = {
  version: 6,
  name: "project library files and links",
  statements,
  foreignKeys: "off",
};
