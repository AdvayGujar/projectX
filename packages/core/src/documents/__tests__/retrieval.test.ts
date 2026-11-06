import { describe, expect, it } from "vitest";

import {
  createProjectRepository,
  createSessionRepository,
} from "../../db";
import type { DbContext } from "../../db";
import { withContext } from "../../db/__tests__/helpers";
import { createProjectContextRetriever } from "../index";

interface SeedFileOptions {
  readonly id: string;
  readonly sessionId?: string;
  readonly projectId?: string;
  readonly name?: string;
  readonly createdAt?: number;
}

interface SeedChunk {
  readonly ordinal: number;
  readonly page?: number;
  readonly text: string;
  readonly tokens?: number;
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
      options.createdAt ?? 1,
    ],
  );
  await ctx.db.execute(
    "INSERT INTO documents (id, file_id, status) VALUES (?, ?, 'ready')",
    [`doc-${options.id}`, options.id],
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

async function seedArtifact(
  ctx: DbContext,
  artifact: {
    readonly id: string;
    readonly projectId: string | null;
    readonly kind: "deck" | "sheet" | "doc";
    readonly title: string;
    readonly version: number;
    readonly updatedAt: number;
  },
): Promise<void> {
  await ctx.db.execute(
    `INSERT INTO artifacts
       (id, session_id, project_id, kind, title, current_version, created_at, updated_at)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`,
    [
      artifact.id,
      artifact.projectId,
      artifact.kind,
      artifact.title,
      artifact.version,
      artifact.updatedAt,
      artifact.updatedAt,
    ],
  );
}

describe("project context retrieval", () => {
  it("includes the whole scoped library when it fits the budget", () => withContext(async (ctx) => {
    const project = await createProjectRepository(ctx).create({ name: "Reports" });
    const session = await createSessionRepository(ctx).create({ projectId: project.id });
    await seedFile(ctx, {
      id: "library",
      projectId: project.id,
      name: "Library.pdf",
      createdAt: 1,
    });
    await seedChunk(ctx, "library", { ordinal: 1, page: 2, text: "alpha library text", tokens: 5 });
    await seedChunk(ctx, "library", { ordinal: 2, page: 3, text: "beta library text", tokens: 5 });
    await seedFile(ctx, { id: "current", sessionId: session.id, name: "Notes.txt", createdAt: 2 });
    await seedChunk(ctx, "current", { ordinal: 1, text: "current notes text", tokens: 5 });

    const context = await createProjectContextRetriever(ctx).retrieve({
      projectId: project.id,
      sessionId: session.id,
      query: "anything",
      maxTokens: 1_000,
    });

    expect(context.text).toContain("[File: Library.pdf, p.2]\n\nalpha library text");
    expect(context.text).toContain("[File: Library.pdf, p.3]\n\nbeta library text");
    expect(context.text).toContain("[File: Notes.txt]\n\ncurrent notes text");
    expect(context.text.indexOf("alpha")).toBeLessThan(context.text.indexOf("beta"));
    expect(context.artifacts).toEqual([]);
  }));

  it("uses FTS hits with their neighbours when the library is too large", () => withContext(async (ctx) => {
    const project = await createProjectRepository(ctx).create({ name: "Reports" });
    const session = await createSessionRepository(ctx).create({ projectId: project.id });
    await seedFile(ctx, { id: "library", projectId: project.id, name: "Library.pdf" });
    const texts = [
      "alpha text about nothing in particular",
      "bravo text about nothing in particular",
      "distinctive text about the target",
      "delta text about nothing in particular",
      "echo text about nothing in particular",
    ];
    for (const [index, text] of texts.entries()) {
      await seedChunk(ctx, "library", { ordinal: index + 1, page: index + 1, text, tokens: 30 });
    }

    const context = await createProjectContextRetriever(ctx).retrieve({
      projectId: project.id,
      sessionId: session.id,
      query: "distinctive",
      maxTokens: 60,
    });

    expect(context.text).toContain("bravo text");
    expect(context.text).toContain("distinctive text");
    expect(context.text).toContain("delta text");
    expect(context.text).not.toContain("alpha text");
    expect(context.text).not.toContain("echo text");
    expect(Math.ceil(context.text.length / 4)).toBeLessThanOrEqual(60);
  }));

  it("truncates the final chunk to stay inside the token budget", () => withContext(async (ctx) => {
    const project = await createProjectRepository(ctx).create({ name: "Reports" });
    const session = await createSessionRepository(ctx).create({ projectId: project.id });
    await seedFile(ctx, { id: "big", projectId: project.id, name: "Big.pdf" });
    await seedChunk(ctx, "big", {
      ordinal: 1,
      page: 1,
      text: `budget ${"word ".repeat(2_000)}`,
      tokens: 3_000,
    });

    const context = await createProjectContextRetriever(ctx).retrieve({
      projectId: project.id,
      sessionId: session.id,
      query: "budget",
      maxTokens: 50,
    });

    expect(context.text.startsWith("[File: Big.pdf, p.1]\n\nbudget")).toBe(true);
    expect(context.text.length).toBeLessThanOrEqual(200);
    expect(Math.ceil(context.text.length / 4)).toBeLessThanOrEqual(50);
  }));

  it("never includes another project or another chat's files", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const sessions = createSessionRepository(ctx);
    const project = await projects.create({ name: "Mine" });
    const otherProject = await projects.create({ name: "Other" });
    const session = await sessions.create({ projectId: project.id });
    const sibling = await sessions.create({ projectId: project.id });

    await seedFile(ctx, { id: "library", projectId: project.id, name: "Library.pdf" });
    await seedChunk(ctx, "library", { ordinal: 1, page: 1, text: "library keyword text", tokens: 30 });
    await seedFile(ctx, { id: "current", sessionId: session.id, name: "Current.pdf" });
    await seedChunk(ctx, "current", { ordinal: 1, page: 1, text: "current keyword text", tokens: 30 });
    await seedFile(ctx, { id: "sibling", sessionId: sibling.id, name: "Sibling.pdf" });
    await seedChunk(ctx, "sibling", { ordinal: 1, page: 1, text: "sibling keyword text", tokens: 30 });
    await seedFile(ctx, { id: "foreign", projectId: otherProject.id, name: "Foreign.pdf" });
    await seedChunk(ctx, "foreign", { ordinal: 1, page: 1, text: "foreign keyword text", tokens: 30 });

    const context = await createProjectContextRetriever(ctx).retrieve({
      projectId: project.id,
      sessionId: session.id,
      query: "keyword",
      maxTokens: 60,
    });

    expect(context.text).toContain("library keyword text");
    expect(context.text).toContain("current keyword text");
    expect(context.text).not.toContain("sibling keyword text");
    expect(context.text).not.toContain("foreign keyword text");
  }));

  it("lists the project's artifacts newest first and ignores other projects", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const project = await projects.create({ name: "Mine" });
    const otherProject = await projects.create({ name: "Other" });

    await seedArtifact(ctx, {
      id: "old",
      projectId: project.id,
      kind: "deck",
      title: "Old deck",
      version: 1,
      updatedAt: 100,
    });
    await seedArtifact(ctx, {
      id: "new",
      projectId: project.id,
      kind: "sheet",
      title: "New sheet",
      version: 3,
      updatedAt: 200,
    });
    await seedArtifact(ctx, {
      id: "foreign",
      projectId: otherProject.id,
      kind: "doc",
      title: "Foreign doc",
      version: 1,
      updatedAt: 300,
    });
    await seedArtifact(ctx, {
      id: "global",
      projectId: null,
      kind: "doc",
      title: "Global doc",
      version: 1,
      updatedAt: 400,
    });

    const context = await createProjectContextRetriever(ctx).retrieve({
      projectId: project.id,
      sessionId: "session-not-needed",
      query: "",
      maxTokens: 100,
    });

    expect(context.artifacts).toEqual([
      { id: "new", kind: "sheet", title: "New sheet", currentVersion: 3 },
      { id: "old", kind: "deck", title: "Old deck", currentVersion: 1 },
    ]);
  }));

  it("returns empty context for an empty library", () => withContext(async (ctx) => {
    const project = await createProjectRepository(ctx).create({ name: "Empty" });

    const context = await createProjectContextRetriever(ctx).retrieve({
      projectId: project.id,
      sessionId: "session-with-no-files",
      query: "anything",
      maxTokens: 100,
    });

    expect(context).toEqual({ text: "", artifacts: [] });
  }));
});
