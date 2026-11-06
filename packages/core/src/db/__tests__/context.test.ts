import { describe, expect, it } from "vitest";

import {
  createProjectRepository,
  createSearchRepository,
  createSessionRepository,
} from "../index";
import type { DbContext } from "../index";
import { withContext } from "./helpers";

interface SeedFileOptions {
  readonly id: string;
  readonly sessionId?: string;
  readonly projectId?: string;
  readonly name?: string;
  readonly createdAt: number;
  readonly status?: "pending" | "ready";
}

interface SeedChunk {
  readonly ordinal: number;
  readonly page?: number;
  readonly text: string;
  readonly tokens?: number;
}

interface ContextFixture {
  readonly projectId: string;
  readonly otherProjectId: string;
  readonly sessionId: string;
  readonly otherSessionId: string;
}

async function seedFile(ctx: DbContext, options: SeedFileOptions): Promise<void> {
  await ctx.db.execute(
    `INSERT INTO files (id, session_id, project_id, name, mime, size, path, kind, created_at)
     VALUES (?, ?, ?, ?, 'application/pdf', 100, ?, 'pdf', ?)`,
    [
      options.id,
      options.sessionId ?? null,
      options.projectId ?? null,
      options.name ?? `${options.id}.pdf`,
      `files/${options.id}.pdf`,
      options.createdAt,
    ],
  );
  await ctx.db.execute(
    "INSERT INTO documents (id, file_id, status) VALUES (?, ?, ?)",
    [`doc-${options.id}`, options.id, options.status ?? "ready"],
  );
}

async function seedChunk(ctx: DbContext, fileId: string, chunk: SeedChunk): Promise<void> {
  await ctx.db.execute(
    `INSERT INTO doc_chunks (id, document_id, ordinal, page, section, text, token_estimate)
     VALUES (?, ?, ?, ?, NULL, ?, ?)`,
    [
      `chunk-${fileId}-${chunk.ordinal}`,
      `doc-${fileId}`,
      chunk.ordinal,
      chunk.page ?? null,
      chunk.text,
      chunk.tokens ?? Math.ceil(chunk.text.length / 4),
    ],
  );
}

async function seedFixture(ctx: DbContext): Promise<ContextFixture> {
  const projects = createProjectRepository(ctx);
  const sessions = createSessionRepository(ctx);
  const project = await projects.create({ name: "Library" });
  const otherProject = await projects.create({ name: "Other" });
  const session = await sessions.create({ projectId: project.id });
  const otherSession = await sessions.create({ projectId: project.id });

  await seedFile(ctx, { id: "library", projectId: project.id, name: "Library.pdf", createdAt: 10 });
  await seedChunk(ctx, "library", { ordinal: 2, page: 3, text: "library second keyword", tokens: 5 });
  await seedChunk(ctx, "library", { ordinal: 1, page: 2, text: "library first keyword", tokens: 5 });

  await seedFile(ctx, { id: "current", sessionId: session.id, name: "Current.pdf", createdAt: 20 });
  await seedChunk(ctx, "current", { ordinal: 1, page: 1, text: "current chat keyword", tokens: 5 });

  await seedFile(ctx, { id: "sibling", sessionId: otherSession.id, name: "Sibling.pdf", createdAt: 30 });
  await seedChunk(ctx, "sibling", { ordinal: 1, page: 1, text: "sibling keyword", tokens: 5 });

  await seedFile(ctx, {
    id: "foreign",
    projectId: otherProject.id,
    name: "Foreign.pdf",
    createdAt: 40,
  });
  await seedChunk(ctx, "foreign", { ordinal: 1, page: 1, text: "foreign keyword", tokens: 5 });

  await seedFile(ctx, {
    id: "pending",
    projectId: project.id,
    name: "Pending.pdf",
    createdAt: 50,
    status: "pending",
  });
  await seedChunk(ctx, "pending", { ordinal: 1, page: 1, text: "pending keyword", tokens: 5 });

  return {
    projectId: project.id,
    otherProjectId: otherProject.id,
    sessionId: session.id,
    otherSessionId: otherSession.id,
  };
}

describe("search repository context", () => {
  it("covers the project library and the current chat only", () => withContext(async (ctx) => {
    const fixture = await seedFixture(ctx);
    const search = createSearchRepository(ctx);

    const hits = await search.contextChunks("keyword", fixture);

    expect(hits.map((hit) => hit.fileId).sort()).toEqual(["current", "library", "library"]);
    expect(hits.map((hit) => hit.fileName)).toContain("Library.pdf");
    expect(hits.map((hit) => hit.ordinal).sort()).toEqual([1, 1, 2]);
  }));

  it("returns totals and whole lists for the same scope", () => withContext(async (ctx) => {
    const fixture = await seedFixture(ctx);
    const search = createSearchRepository(ctx);

    expect(await search.contextTotals(fixture)).toEqual({ chunkCount: 3, tokenTotal: 15 });

    const listed = await search.listContextChunks(fixture);
    expect(listed.map((chunk) => chunk.fileId)).toEqual(["library", "library", "current"]);
    expect(listed.filter((chunk) => chunk.fileId === "library").map((chunk) => chunk.ordinal)).toEqual([
      1, 2,
    ]);
    expect(listed.every((chunk) => chunk.text.includes("keyword"))).toBe(true);
  }));

  it("gates totals, lists, and neighbours on ready documents", () => withContext(async (ctx) => {
    const fixture = await seedFixture(ctx);
    const search = createSearchRepository(ctx);

    const listed = await search.listContextChunks(fixture);
    expect(listed.some((chunk) => chunk.fileId === "pending")).toBe(false);
    expect(await search.contextNeighbors("doc-pending", 1)).toEqual([]);
  }));

  it("returns the chunk before and after within one document", () => withContext(async (ctx) => {
    const fixture = await seedFixture(ctx);
    const search = createSearchRepository(ctx);
    await seedFile(ctx, { id: "book", projectId: fixture.projectId, createdAt: 5 });
    for (let ordinal = 1; ordinal <= 4; ordinal += 1) {
      await seedChunk(ctx, "book", { ordinal, page: ordinal, text: `book page ${ordinal}` });
    }

    const neighbours = await search.contextNeighbors("doc-book", 2);

    expect(neighbours.map((chunk) => chunk.ordinal)).toEqual([1, 2, 3]);
    expect(neighbours.every((chunk) => chunk.documentId === "doc-book")).toBe(true);
    expect(neighbours[0]?.fileName).toBe("book.pdf");
    expect(neighbours[0]?.page).toBe(1);
  }));

  it("returns no hits for punctuation-only queries", () => withContext(async (ctx) => {
    const fixture = await seedFixture(ctx);
    const search = createSearchRepository(ctx);

    expect(await search.contextChunks(' " ', fixture)).toEqual([]);
  }));
});
