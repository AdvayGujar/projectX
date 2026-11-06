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

  it("includes the session title and project with message hits", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const sessions = createSessionRepository(ctx);
    const messages = createMessageRepository(ctx);
    const search = createSearchRepository(ctx);
    const project = await projects.create({ name: "Research" });
    const session = await sessions.create({ projectId: project.id, title: "Quarterly review" });

    await messages.append({
      sessionId: session.id,
      role: "user",
      parts: [{
        type: "text",
        data: { text: "budget planning notes" },
        searchText: "budget planning notes",
      }],
    });

    const hits = await search.messages("budget");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      sessionTitle: "Quarterly review",
      projectId: project.id,
      projectName: "Research",
    });
  }));

  it("returns null project fields for standalone message hits", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const messages = createMessageRepository(ctx);
    const search = createSearchRepository(ctx);
    const session = await sessions.create({ title: "Loose chat" });

    await messages.append({
      sessionId: session.id,
      role: "user",
      parts: [{
        type: "text",
        data: { text: "standalone thought" },
        searchText: "standalone thought",
      }],
    });

    const hits = await search.messages("standalone");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.sessionTitle).toBe("Loose chat");
    expect(hits[0]?.projectId).toBeNull();
    expect(hits[0]?.projectName).toBeNull();
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

  it("returns library metadata for project file chunks", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const search = createSearchRepository(ctx);
    const project = await projects.create({ name: "Reports" });

    await ctx.db.execute(
      `INSERT INTO files (id, project_id, name, mime, size, path, kind, created_at)
       VALUES ('library', ?, 'report.pdf', 'application/pdf', 100,
               'projects/library/report.pdf', 'pdf', 1)`,
      [project.id],
    );
    await ctx.db.execute(
      "INSERT INTO documents (id, file_id, status) VALUES ('doc-library', 'library', 'ready')",
    );
    await ctx.db.execute(
      `INSERT INTO doc_chunks (id, document_id, ordinal, text, token_estimate)
       VALUES ('chunk-library', 'doc-library', 1, 'quarterly report', 2)`,
    );

    const hits = await search.chunks("quarterly");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      fileId: "library",
      fileName: "report.pdf",
      projectId: project.id,
      projectName: "Reports",
      sourceUrl: null,
    });
  }));

  it("points link-summary chunks at their source URL", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const search = createSearchRepository(ctx);
    const project = await projects.create({ name: "Reading" });

    await ctx.db.execute(
      `INSERT INTO files (id, project_id, name, mime, size, path, kind, created_at)
       VALUES ('snapshot', ?, 'summary.txt', 'text/plain', 10,
               'projects/reading/summary.txt', 'text', 1)`,
      [project.id],
    );
    await ctx.db.execute(
      `INSERT INTO project_links
         (id, project_id, url, title, snapshot_file_id, status, created_at)
       VALUES ('link', ?, 'https://example.com/article', 'Example', 'snapshot', 'ready', 1)`,
      [project.id],
    );
    await ctx.db.execute(
      "INSERT INTO documents (id, file_id, status) VALUES ('doc-snapshot', 'snapshot', 'ready')",
    );
    await ctx.db.execute(
      `INSERT INTO doc_chunks (id, document_id, ordinal, text, token_estimate)
       VALUES ('chunk-snapshot', 'doc-snapshot', 1, 'linked article summary', 2)`,
    );

    const hits = await search.chunks("linked");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.sourceUrl).toBe("https://example.com/article");
    expect(hits[0]?.sourceTitle).toBe("Example");
    expect(hits[0]?.projectName).toBe("Reading");
    expect(hits[0]?.fileName).toBe("summary.txt");
  }));

  it("derives project metadata for session-owned file chunks", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const sessions = createSessionRepository(ctx);
    const search = createSearchRepository(ctx);
    const project = await projects.create({ name: "Reports" });
    const session = await sessions.create({ projectId: project.id });

    await ctx.db.execute(
      `INSERT INTO files (id, session_id, name, mime, size, path, kind, created_at)
       VALUES ('session-file', ?, 'notes.txt', 'text/plain', 10,
               'sessions/s/files/notes.txt', 'text', 1)`,
      [session.id],
    );
    await ctx.db.execute(
      "INSERT INTO documents (id, file_id, status) VALUES ('doc-session', 'session-file', 'ready')",
    );
    await ctx.db.execute(
      `INSERT INTO doc_chunks (id, document_id, ordinal, text, token_estimate)
       VALUES ('chunk-session', 'doc-session', 1, 'session owned content', 2)`,
    );

    const hits = await search.chunks("owned");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      fileId: "session-file",
      fileName: "notes.txt",
      projectId: project.id,
      projectName: "Reports",
      sourceUrl: null,
    });
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
    const standalone = await search.chunks("keyword", { projectId: null });
    expect(standalone.map((hit) => hit.fileId)).toEqual(["loose"]);
  }));

  it("finds project-owned chunks only for their project", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const sessions = createSessionRepository(ctx);
    const search = createSearchRepository(ctx);
    const project = await projects.create({ name: "Reports" });
    const other = await projects.create({ name: "Other" });
    const standalone = await sessions.create({});

    for (const [fileId, projectId] of [
      ["library", project.id],
      ["other-library", other.id],
    ] as const) {
      await ctx.db.execute(
        `INSERT INTO files (id, project_id, name, mime, size, path, kind, created_at)
         VALUES (?, ?, 'report.pdf', 'application/pdf', 100, 'reports/report.pdf', 'pdf', 1)`,
        [fileId, projectId],
      );
      await ctx.db.execute(
        "INSERT INTO documents (id, file_id, status) VALUES (?, ?, 'ready')",
        [`doc-${fileId}`, fileId],
      );
      await ctx.db.execute(
        `INSERT INTO doc_chunks (id, document_id, ordinal, text, token_estimate)
         VALUES (?, ?, 1, 'library keyword', 2)`,
        [`chunk-${fileId}`, `doc-${fileId}`],
      );
    }

    await ctx.db.execute(
      `INSERT INTO files (id, session_id, name, mime, size, path, kind, created_at)
       VALUES ('loose', ?, 'note.txt', 'text/plain', 1, 'sessions/s/files/loose.txt', 'text', 1)`,
      [standalone.id],
    );
    await ctx.db.execute(
      "INSERT INTO documents (id, file_id, status) VALUES ('doc-loose', 'loose', 'ready')",
    );
    await ctx.db.execute(
      `INSERT INTO doc_chunks (id, document_id, ordinal, text, token_estimate)
       VALUES ('chunk-loose', 'doc-loose', 1, 'library keyword', 2)`,
    );

    expect((await search.chunks("keyword", { projectId: project.id })).map((hit) => hit.fileId)).toEqual([
      "library",
    ]);
    expect(await search.chunks("keyword", { projectId: other.id })).toHaveLength(1);
    expect((await search.chunks("keyword", { projectId: null })).map((hit) => hit.fileId)).toEqual([
      "loose",
    ]);
  }));
});
