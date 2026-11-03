import type { Migration } from "../types";

const tables = [
  `CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT,
    instructions TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  ) STRICT`,
  `CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    title TEXT NOT NULL DEFAULT 'New chat',
    provider_id TEXT,
    model_id TEXT,
    summary TEXT,
    summary_upto_seq INTEGER,
    pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    last_message_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  ) STRICT`,
  `CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    provider_id TEXT,
    model_id TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    cached_tokens INTEGER,
    cost_usd REAL,
    status TEXT NOT NULL CHECK (status IN ('streaming', 'done', 'aborted', 'error')),
    created_at INTEGER NOT NULL,
    UNIQUE (session_id, seq)
  ) STRICT`,
  `CREATE TABLE parts (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (
      type IN ('text', 'reasoning', 'tool_call', 'tool_result', 'attachment', 'artifact', 'error')
    ),
    data_json TEXT NOT NULL,
    search_text TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE (message_id, seq)
  ) STRICT`,
  `CREATE TABLE files (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    path TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('pdf', 'docx', 'xlsx', 'pptx', 'image', 'text', 'other')),
    origin TEXT NOT NULL CHECK (origin IN ('import', 'generated')),
    created_at INTEGER NOT NULL
  ) STRICT`,
  `CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    page_count INTEGER,
    slide_count INTEGER,
    sheet_count INTEGER,
    status TEXT NOT NULL CHECK (status IN ('pending', 'extracting', 'ready', 'error')),
    error TEXT,
    extracted_at INTEGER
  ) STRICT`,
  `CREATE TABLE doc_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL,
    page INTEGER,
    section TEXT,
    text TEXT NOT NULL,
    token_estimate INTEGER NOT NULL,
    UNIQUE (document_id, ordinal)
  ) STRICT`,
  `CREATE TABLE artifacts (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
    kind TEXT NOT NULL CHECK (kind IN ('deck', 'sheet', 'doc')),
    title TEXT NOT NULL,
    current_version INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  ) STRICT`,
  `CREATE TABLE artifact_versions (
    artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    spec_json TEXT NOT NULL,
    created_by TEXT NOT NULL CHECK (created_by IN ('model', 'user')),
    created_at INTEGER NOT NULL,
    PRIMARY KEY (artifact_id, version)
  ) STRICT`,
  `CREATE TABLE memories (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL CHECK (scope IN ('global', 'project')),
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    section TEXT NOT NULL,
    content TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    CHECK (
      (scope = 'global' AND project_id IS NULL) OR
      (scope = 'project' AND project_id IS NOT NULL)
    )
  ) STRICT`,
  `CREATE TABLE providers (
    id TEXT PRIMARY KEY,
    preset_id TEXT NOT NULL,
    label TEXT NOT NULL,
    protocol TEXT NOT NULL CHECK (
      protocol IN ('openai-chat', 'openai-responses', 'anthropic', 'google')
    ),
    base_url TEXT NOT NULL,
    key_ref TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    created_at INTEGER NOT NULL
  ) STRICT`,
  `CREATE TABLE models_cache (
    provider_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    json TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    PRIMARY KEY (provider_id, model_id)
  ) STRICT`,
  `CREATE TABLE usage_ledger (
    id TEXT PRIMARY KEY,
    message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
    session_id TEXT,
    provider_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cached_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  ) STRICT`,
];

const indexes = [
  "CREATE INDEX idx_sessions_project ON sessions(project_id, last_message_at DESC)",
  "CREATE INDEX idx_sessions_updated ON sessions(updated_at DESC)",
  "CREATE INDEX idx_messages_session ON messages(session_id, seq)",
  "CREATE INDEX idx_parts_message ON parts(message_id, seq)",
  "CREATE INDEX idx_files_project ON files(project_id, created_at DESC)",
  "CREATE INDEX idx_doc_chunks_document ON doc_chunks(document_id, ordinal)",
  "CREATE INDEX idx_artifacts_project ON artifacts(project_id, updated_at DESC)",
  "CREATE INDEX idx_usage_session ON usage_ledger(session_id, created_at)",
  "CREATE INDEX idx_usage_created ON usage_ledger(created_at)",
];

const search = [
  `CREATE VIRTUAL TABLE parts_fts USING fts5(
    search_text,
    content='parts',
    content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2'
  )`,
  `CREATE TRIGGER parts_fts_insert AFTER INSERT ON parts BEGIN
    INSERT INTO parts_fts(rowid, search_text) VALUES (new.rowid, new.search_text);
  END`,
  `CREATE TRIGGER parts_fts_delete AFTER DELETE ON parts BEGIN
    INSERT INTO parts_fts(parts_fts, rowid, search_text)
    VALUES ('delete', old.rowid, old.search_text);
  END`,
  `CREATE TRIGGER parts_fts_update AFTER UPDATE ON parts BEGIN
    INSERT INTO parts_fts(parts_fts, rowid, search_text)
    VALUES ('delete', old.rowid, old.search_text);
    INSERT INTO parts_fts(rowid, search_text) VALUES (new.rowid, new.search_text);
  END`,
  `CREATE VIRTUAL TABLE doc_chunks_fts USING fts5(
    text,
    content='doc_chunks',
    content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2'
  )`,
  `CREATE TRIGGER doc_chunks_fts_insert AFTER INSERT ON doc_chunks BEGIN
    INSERT INTO doc_chunks_fts(rowid, text) VALUES (new.rowid, new.text);
  END`,
  `CREATE TRIGGER doc_chunks_fts_delete AFTER DELETE ON doc_chunks BEGIN
    INSERT INTO doc_chunks_fts(doc_chunks_fts, rowid, text)
    VALUES ('delete', old.rowid, old.text);
  END`,
  `CREATE TRIGGER doc_chunks_fts_update AFTER UPDATE ON doc_chunks BEGIN
    INSERT INTO doc_chunks_fts(doc_chunks_fts, rowid, text)
    VALUES ('delete', old.rowid, old.text);
    INSERT INTO doc_chunks_fts(rowid, text) VALUES (new.rowid, new.text);
  END`,
];

export const initialMigration: Migration = {
  version: 1,
  name: "initial schema",
  statements: [...tables, ...indexes, ...search],
};
