import { describe, expect, it } from "vitest";

import { migrate } from "../migrations";
import { createNodeDatabase, withContext } from "./helpers";

describe("migrations", () => {
  it("applies once and is idempotent", async () => {
    const db = createNodeDatabase();
    try {
      expect(await migrate(db)).toBe(3);
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
});
