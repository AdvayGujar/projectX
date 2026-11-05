import type { Migration } from "../types";

/**
 * Files and artifacts are owned by a session, never a project. Projects aggregate them
 * through their sessions. Both tables shipped in migration 001 but no code writes them yet,
 * so rebuilding is safe.
 */
const statements = [
  "DROP TABLE files",
  `CREATE TABLE files (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    path TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('pdf', 'docx', 'xlsx', 'pptx', 'image', 'text', 'other')),
    created_at INTEGER NOT NULL
  ) STRICT`,
  "CREATE INDEX idx_files_session ON files(session_id, created_at DESC)",
  "CREATE UNIQUE INDEX idx_documents_file ON documents(file_id)",
  "DROP TABLE artifacts",
  `CREATE TABLE artifacts (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
    kind TEXT NOT NULL CHECK (kind IN ('deck', 'sheet', 'doc')),
    title TEXT NOT NULL,
    current_version INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  ) STRICT`,
  "CREATE INDEX idx_artifacts_session ON artifacts(session_id, updated_at DESC)",
];

export const sessionScopedFilesMigration: Migration = {
  version: 4,
  name: "session-scoped files and artifacts",
  statements,
};
