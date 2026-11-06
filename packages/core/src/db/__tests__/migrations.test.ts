import { describe, expect, it } from "vitest";

import type { SqlDatabase } from "../types";
import {
  createProjectRepository,
  createSessionRepository,
  migrate,
  migrations,
} from "../index";
import { createNodeDatabase, withContext } from "./helpers";

describe("migrations", () => {
  it("applies once and is idempotent", async () => {
    const db = createNodeDatabase();
    try {
      expect(await migrate(db)).toBe(6);
      expect(await migrate(db)).toBe(0);
    } finally {
      await db.close();
    }
  });

  it("creates tables, indexes, and FTS triggers", async () => {
    await withContext(async ({ db }) => {
      const result = await db.execute(
        "SELECT name FROM sqlite_master WHERE type IN ('table', 'trigger') ORDER BY name",
      );
      const names = result.rows.map((row) => String(row.name));
      expect(names).toEqual(expect.arrayContaining([
        "projects",
        "sessions",
        "messages",
        "parts",
        "parts_fts",
        "parts_fts_insert",
        "parts_fts_delete",
        "parts_fts_update",
        "doc_chunks",
        "doc_chunks_fts",
        "project_links",
      ]));
    });
  });

  it("adds the effort and superseded columns to messages", async () => {
    await withContext(async ({ db }) => {
      const result = await db.execute("PRAGMA table_info(messages)");
      const columns = result.rows.map((row) => String(row.name));
      expect(columns).toContain("effort");
      expect(columns).toContain("superseded");
    });
  });

  it("gives files an owner union and artifacts a project home", async () => {
    await withContext(async ({ db }) => {
      const files = await db.execute("PRAGMA table_info(files)");
      const fileColumns = files.rows.map((row) => String(row.name));
      expect(fileColumns).toContain("session_id");
      expect(fileColumns).toContain("project_id");
      expect(fileColumns).not.toContain("origin");

      const links = await db.execute("PRAGMA table_info(project_links)");
      const linkColumns = links.rows.map((row) => String(row.name));
      expect(linkColumns).toEqual(expect.arrayContaining([
        "id",
        "project_id",
        "url",
        "title",
        "media_type",
        "snapshot_file_id",
        "status",
        "error",
        "fetched_at",
        "created_at",
      ]));

      const artifacts = await db.execute("PRAGMA table_info(artifacts)");
      const artifactColumns = artifacts.rows.map((row) => String(row.name));
      expect(artifactColumns).toContain("session_id");
      expect(artifactColumns).toContain("project_id");

      const indexes = await db.execute(
        "SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name",
      );
      const names = indexes.rows.map((row) => String(row.name));
      expect(names).toContain("idx_files_session");
      expect(names).toContain("idx_files_project");
      expect(names).toContain("idx_project_links_project");
      expect(names).toContain("idx_artifacts_session");
      expect(names).toContain("idx_documents_file");
      expect(names).toContain("idx_artifacts_project");
    });
  });

  it("indexes inserted parts through the trigger", async () => {
    await withContext(async ({ db }) => {
      await db.execute(
        "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p', 'P', 1, 1)",
      );
      await db.execute(
        "INSERT INTO sessions (id, project_id, title, created_at, updated_at) VALUES ('s', 'p', 'S', 1, 1)",
      );
      await db.execute(
        "INSERT INTO messages (id, session_id, seq, role, status, created_at) VALUES ('m', 's', 1, 'user', 'done', 1)",
      );
      await db.execute(
        "INSERT INTO parts (id, message_id, seq, type, data_json, search_text, created_at) VALUES ('pt', 'm', 1, 'text', '{}', 'hello world', 1)",
      );

      const hit = await db.execute(
        "SELECT rowid FROM parts_fts WHERE parts_fts MATCH ?",
        ["hello"],
      );
      expect(hit.rows).toHaveLength(1);
    });
  });

  it("upgrades a populated 001-003 database without leaving broken foreign keys", async () => {
    const db = createNodeDatabase();
    try {
      await applyThrough(db, 3);
      await db.execute(
        "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p', 'P', 1, 1)",
      );
      await db.execute(
        "INSERT INTO sessions (id, project_id, title, created_at, updated_at) VALUES ('s', 'p', 'S', 1, 1)",
      );
      await db.execute(
        `INSERT INTO files (id, project_id, name, mime, size, path, kind, origin, created_at)
         VALUES ('f', 'p', 'legacy.pdf', 'application/pdf', 1, 'legacy.pdf', 'pdf', 'import', 1)`,
      );
      await db.execute(
        `INSERT INTO documents (id, file_id, page_count, status, extracted_at)
         VALUES ('d', 'f', 2, 'ready', 1)`,
      );
      await db.execute(
        `INSERT INTO doc_chunks (id, document_id, ordinal, page, text, token_estimate)
         VALUES ('c', 'd', 1, 1, 'legacy text', 2)`,
      );
      await db.execute(
        `INSERT INTO artifacts (id, project_id, kind, title, current_version, created_at, updated_at)
         VALUES ('a', 'p', 'deck', 'Legacy', 1, 1, 1)`,
      );
      await db.execute(
        `INSERT INTO artifact_versions (artifact_id, version, spec_json, created_by, created_at)
         VALUES ('a', 1, '{}', 'model', 1)`,
      );

      expect(await migrate(db)).toBe(3);

      // 004 rebuilds these pre-release tables; no shipped code has ever written them.
      for (const table of ["files", "documents", "doc_chunks", "artifacts", "artifact_versions"]) {
        const result = await db.execute(`SELECT COUNT(*) AS count FROM ${table}`);
        expect(Number(result.rows[0]?.count)).toBe(0);
      }
      const foreignKeys = await db.execute("PRAGMA foreign_key_check");
      expect(foreignKeys.rows).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  it("keeps documents and chunks when files gain a project owner", async () => {
    const db = createNodeDatabase();
    try {
      await applyThrough(db, 5);
      await db.execute(
        "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p', 'P', 1, 1)",
      );
      await db.execute(
        "INSERT INTO sessions (id, project_id, title, created_at, updated_at) VALUES ('s', 'p', 'S', 1, 1)",
      );
      await db.execute(
        `INSERT INTO files (id, session_id, name, mime, size, path, kind, created_at)
         VALUES ('f', 's', 'report.pdf', 'application/pdf', 10, 'sessions/s/files/f.pdf', 'pdf', 1)`,
      );
      await db.execute(
        `INSERT INTO documents (id, file_id, page_count, status, extracted_at)
         VALUES ('d', 'f', 3, 'ready', 1)`,
      );
      await db.execute(
        `INSERT INTO doc_chunks (id, document_id, ordinal, page, text, token_estimate)
         VALUES ('c', 'd', 1, 1, 'surviving text', 2)`,
      );

      expect(await migrate(db)).toBe(1);

      const files = await db.execute("SELECT id, session_id, project_id FROM files");
      expect(files.rows).toEqual([{ id: "f", session_id: "s", project_id: null }]);

      const documents = await db.execute("SELECT id, file_id, status FROM documents");
      expect(documents.rows).toEqual([{ id: "d", file_id: "f", status: "ready" }]);

      const chunks = await db.execute("SELECT id, document_id, text FROM doc_chunks");
      expect(chunks.rows).toEqual([{ id: "c", document_id: "d", text: "surviving text" }]);

      expect((await db.execute("PRAGMA foreign_key_check")).rows).toHaveLength(0);
      expect(Number((await db.execute("PRAGMA foreign_keys")).rows[0]?.foreign_keys)).toBe(1);
    } finally {
      await db.close();
    }
  });

  it("enforces one owner per file", async () => {
    const db = createNodeDatabase();
    try {
      await migrate(db);
      await db.execute(
        "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p', 'P', 1, 1)",
      );
      await db.execute(
        "INSERT INTO sessions (id, project_id, title, created_at, updated_at) VALUES ('s', 'p', 'S', 1, 1)",
      );

      const insert = `INSERT INTO files (id, session_id, project_id, name, mime, size, path, kind, created_at)
                      VALUES (?, ?, ?, 'a.pdf', 'application/pdf', 1, 'a.pdf', 'pdf', 1)`;

      await expect(db.execute(insert, ["none", null, null])).rejects.toThrow();
      await expect(db.execute(insert, ["both", "s", "p"])).rejects.toThrow();

      await db.execute(insert, ["session-owned", "s", null]);
      await db.execute(insert, ["project-owned", null, "p"]);
      expect((await db.execute("SELECT id FROM files ORDER BY id")).rows).toEqual([
        { id: "project-owned" },
        { id: "session-owned" },
      ]);
    } finally {
      await db.close();
    }
  });

  it("keeps an artifact when its session and project are both removed", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const sessions = createSessionRepository(ctx);
    const project = await projects.create({ name: "Novel" });
    const session = await sessions.create({ projectId: project.id });

    await ctx.db.execute(
      `INSERT INTO artifacts (id, project_id, session_id, kind, title, current_version, created_at, updated_at)
       VALUES ('artifact', ?, ?, 'deck', 'Deck', 1, 1, 1)`,
      [project.id, session.id],
    );

    await sessions.remove(session.id);

    const afterSession = await ctx.db.execute(
      "SELECT session_id, project_id FROM artifacts WHERE id = 'artifact'",
    );
    expect(afterSession.rows[0]?.session_id).toBeNull();
    expect(afterSession.rows[0]?.project_id).toBe(project.id);

    await projects.remove(project.id);

    const afterProject = await ctx.db.execute(
      "SELECT session_id, project_id FROM artifacts WHERE id = 'artifact'",
    );
    expect(afterProject.rows).toHaveLength(1);
    expect(afterProject.rows[0]?.project_id).toBeNull();
  }));
});

async function applyThrough(db: SqlDatabase, version: number): Promise<void> {
  await db.execute(
    `CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    ) STRICT`,
  );
  for (const migration of migrations) {
    if (migration.version > version) {
      continue;
    }
    for (const statement of migration.statements) {
      await db.execute(statement);
    }
    await db.execute(
      "INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)",
      [migration.version, migration.name, 1],
    );
  }
}
