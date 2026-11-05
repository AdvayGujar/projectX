import { describe, expect, it } from "vitest";

import {
  createMessageRepository,
  createProjectRepository,
  createSearchRepository,
  createSessionRepository,
  toFtsQuery,
} from "../index";
import { withContext } from "./helpers";

describe("toFtsQuery", () => {
  it("quotes terms and joins with AND", () => {
    expect(toFtsQuery("brown fox")).toBe('"brown" AND "fox"');
  });

  it("returns null for punctuation-only input", () => {
    expect(toFtsQuery(' " ')).toBeNull();
    expect(toFtsQuery("   ")).toBeNull();
  });

  it("drops characters that FTS treats as syntax", () => {
    expect(toFtsQuery("C++")).toBe('"C"');
  });
});

describe("search repository", () => {
  it("finds messages and returns a snippet", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const messages = createMessageRepository(ctx);
    const search = createSearchRepository(ctx);
    const session = await sessions.create({});

    await messages.append({
      sessionId: session.id,
      role: "user",
      parts: [{
        type: "text",
        data: { text: "The quick brown fox jumps" },
        searchText: "The quick brown fox jumps",
      }],
    });
    await messages.append({
      sessionId: session.id,
      role: "assistant",
      parts: [{
        type: "text",
        data: { text: "A lazy dog sleeps" },
        searchText: "A lazy dog sleeps",
      }],
    });

    const hits = await search.messages("brown fox");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.snippet).toContain("[brown]");
    expect(await search.messages("missing")).toEqual([]);
    expect(await search.messages('"')).toEqual([]);
  }));

  it("filters by project", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const sessions = createSessionRepository(ctx);
    const messages = createMessageRepository(ctx);
    const search = createSearchRepository(ctx);
    const first = await projects.create({ name: "First" });
    const second = await projects.create({ name: "Second" });

    for (const project of [first, second]) {
      const session = await sessions.create({ projectId: project.id });
      await messages.append({
        sessionId: session.id,
        role: "user",
        parts: [{
          type: "text",
          data: { text: "shared keyword" },
          searchText: "shared keyword",
        }],
      });
    }

    const hits = await search.messages("keyword", { projectId: first.id });
    expect(hits).toHaveLength(1);
    expect((await search.messages("keyword"))).toHaveLength(2);
  }));

  it("removes hits when the session is deleted", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const messages = createMessageRepository(ctx);
    const search = createSearchRepository(ctx);
    const session = await sessions.create({});

    await messages.append({
      sessionId: session.id,
      role: "user",
      parts: [{ type: "text", data: { text: "ephemeral" }, searchText: "ephemeral" }],
    });
    expect(await search.messages("ephemeral")).toHaveLength(1);

    await sessions.remove(session.id);
    expect(await search.messages("ephemeral")).toEqual([]);
  }));

  it("finds document chunks with page references", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const sessions = createSessionRepository(ctx);
    const search = createSearchRepository(ctx);
    const project = await projects.create({ name: "Reports" });
    const session = await sessions.create({ projectId: project.id });

    await ctx.db.execute(
      `INSERT INTO files (id, session_id, name, mime, size, path, kind, created_at)
       VALUES ('f', ?, 'report.pdf', 'application/pdf', 100, 'reports/report.pdf', 'pdf', 1)`,
      [session.id],
    );
    await ctx.db.execute(
      `INSERT INTO documents (id, file_id, page_count, status, extracted_at)
       VALUES ('d', 'f', 40, 'ready', 1)`,
    );
    await ctx.db.execute(
      `INSERT INTO doc_chunks (id, document_id, ordinal, page, section, text, token_estimate)
       VALUES ('c', 'd', 1, 12, 'Results', 'The quarterly report shows growth', 8)`,
    );

    const hits = await search.chunks("quarterly report", { projectId: project.id });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.page).toBe(12);
    expect(hits[0]?.fileId).toBe("f");
  }));

  it("keeps standalone chunks out of project searches", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const sessions = createSessionRepository(ctx);
    const search = createSearchRepository(ctx);
    const project = await projects.create({ name: "Reports" });
    const session = await sessions.create({});
    const grouped = await sessions.create({ projectId: project.id });

    for (const [fileId, sessionId] of [["loose", session.id], ["grouped", grouped.id]] as const) {
      await ctx.db.execute(
        `INSERT INTO files (id, session_id, name, mime, size, path, kind, created_at)
         VALUES (?, ?, 'report.pdf', 'application/pdf', 100, 'reports/report.pdf', 'pdf', 1)`,
        [fileId, sessionId],
      );
      await ctx.db.execute(
        `INSERT INTO documents (id, file_id, status) VALUES (?, ?, 'ready')`,
        [`doc-${fileId}`, fileId],
      );
      await ctx.db.execute(
        `INSERT INTO doc_chunks (id, document_id, ordinal, text, token_estimate)
         VALUES (?, ?, 1, 'shared keyword', 2)`,
        [`chunk-${fileId}`, `doc-${fileId}`],
      );
    }

    expect(await search.chunks("keyword")).toHaveLength(2);
    const hits = await search.chunks("keyword", { projectId: project.id });
    expect(hits.map((hit) => hit.fileId)).toEqual(["grouped"]);
  }));
});
