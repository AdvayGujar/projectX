import { describe, expect, it } from "vitest";

import {
  createChunkRepository,
  createDocumentRepository,
  createFileRepository,
  createProjectRepository,
  createSessionRepository,
} from "../../db";
import type { ChunkDraft, DbContext, DocumentRecord, FileKind, FileRecord } from "../../db";
import { withContext } from "../../db/__tests__/helpers";
import { createReadTools } from "../index";
import type { ToolResult } from "../types";

interface SeedFileOptions {
  readonly id: string;
  readonly sessionId?: string;
  readonly projectId?: string;
  readonly name: string;
  readonly kind: FileKind;
  readonly mime?: string;
  readonly pageCount?: number;
  readonly slideCount?: number;
  readonly sheetCount?: number;
  readonly chunks?: readonly ChunkDraft[];
}

async function seedFile(
  ctx: DbContext,
  options: SeedFileOptions,
): Promise<{ file: FileRecord; document: DocumentRecord }> {
  const files = createFileRepository(ctx);
  const documents = createDocumentRepository(ctx);
  const chunks = createChunkRepository(ctx);
  const stored = await files.addWithDocument({
    id: options.id,
    sessionId: options.sessionId ?? null,
    projectId: options.projectId ?? null,
    name: options.name,
    mime: options.mime ?? mimeFor(options.kind),
    size: 100,
    path: `files/${options.id}`,
    kind: options.kind,
  });
  const document = await documents.update(stored.document.id, {
    status: "ready",
    pageCount: options.pageCount ?? null,
    slideCount: options.slideCount ?? null,
    sheetCount: options.sheetCount ?? null,
    error: null,
    extractedAt: ctx.now(),
  });
  await chunks.replaceForDocument(document.id, options.chunks ?? []);
  return { file: stored.file, document };
}

function mimeFor(kind: FileKind): string {
  switch (kind) {
    case "pdf":
      return "application/pdf";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "text":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

async function run(
  ctx: DbContext,
  sessionId: string,
  name: string,
  args: unknown,
): Promise<ToolResult> {
  return createReadTools(ctx).execute(
    { id: "call-1", name, arguments: args },
    { sessionId },
  );
}

function chunk(
  ordinal: number,
  page: number | null,
  section: string | null,
  text: string,
): ChunkDraft {
  return { ordinal, page, section, text, tokenEstimate: Math.ceil(text.length / 4) };
}

describe("read tools", () => {
  it("lists only the current chat's files and its project library", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const sessions = createSessionRepository(ctx);
    const mine = await projects.create({ name: "Mine" });
    const other = await projects.create({ name: "Other" });
    const session = await sessions.create({ projectId: mine.id });
    const otherSession = await sessions.create({ projectId: other.id });

    await seedFile(ctx, { id: "mine-pdf", projectId: mine.id, name: "mine.pdf", kind: "pdf" });
    await seedFile(ctx, { id: "mine-note", sessionId: session.id, name: "mine.txt", kind: "text" });
    await seedFile(ctx, { id: "other-pdf", projectId: other.id, name: "other.pdf", kind: "pdf" });
    await seedFile(ctx, {
      id: "other-note",
      sessionId: otherSession.id,
      name: "other.txt",
      kind: "text",
    });

    const result = await run(ctx, session.id, "list_files", {});

    expect(result.isError).not.toBe(true);
    expect(result.content).toContain("mine.pdf");
    expect(result.content).toContain("mine.txt");
    expect(result.content).not.toContain("other.pdf");
    expect(result.content).not.toContain("other.txt");
    expect(result.display).toBe("2 files");
  }));

  it("reads only the requested PDF pages", () => withContext(async (ctx) => {
    const session = await createSessionRepository(ctx).create({});
    await seedFile(ctx, {
      id: "report",
      sessionId: session.id,
      name: "report.pdf",
      kind: "pdf",
      pageCount: 3,
      chunks: [
        chunk(1, 1, null, "page one"),
        chunk(2, 2, null, "page two"),
        chunk(3, 3, null, "page three"),
      ],
    });

    const result = await run(ctx, session.id, "read_document", {
      fileId: "report",
      pageStart: 2,
      pageEnd: 3,
    });

    expect(result.isError).not.toBe(true);
    expect(result.content).toContain("[File: report.pdf, p.2]");
    expect(result.content).toContain("page three");
    expect(result.content).not.toContain("page one");
    expect(result.display).toBe("report.pdf · pages 2–3");
    expect(result.citations?.map((citation) => citation.page)).toEqual([2, 3]);
    expect(result.citations?.[0]).toMatchObject({
      fileId: "report",
      fileName: "report.pdf",
      fileKind: "pdf",
    });
  }));

  it("rejects a page range that is backwards", () => withContext(async (ctx) => {
    const session = await createSessionRepository(ctx).create({});
    await seedFile(ctx, {
      id: "report",
      sessionId: session.id,
      name: "report.pdf",
      kind: "pdf",
      chunks: [chunk(1, 1, null, "page one")],
    });

    const result = await run(ctx, session.id, "read_document", {
      fileId: "report",
      pageStart: 3,
      pageEnd: 1,
    });

    expect(result.isError).toBe(true);
    expect(result.content).toContain("pageEnd");
  }));

  it("refuses files outside the chat's scope", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const sessions = createSessionRepository(ctx);
    const other = await projects.create({ name: "Other" });
    const session = await sessions.create({});
    await seedFile(ctx, {
      id: "foreign",
      projectId: other.id,
      name: "foreign.pdf",
      kind: "pdf",
      chunks: [chunk(1, 1, null, "secret")],
    });

    const result = await run(ctx, session.id, "read_document", { fileId: "foreign" });

    expect(result.isError).toBe(true);
    expect(result.content).toContain("not in this chat or project");
  }));

  it("points spreadsheets at read_sheet", () => withContext(async (ctx) => {
    const session = await createSessionRepository(ctx).create({});
    await seedFile(ctx, {
      id: "budget",
      sessionId: session.id,
      name: "budget.xlsx",
      kind: "xlsx",
      sheetCount: 1,
    });

    const result = await run(ctx, session.id, "read_document", { fileId: "budget" });

    expect(result.isError).toBe(true);
    expect(result.content).toContain("read_sheet");
  }));

  it("reads only the requested sheet range", () => withContext(async (ctx) => {
    const session = await createSessionRepository(ctx).create({});
    await seedFile(ctx, {
      id: "budget",
      sessionId: session.id,
      name: "budget.xlsx",
      kind: "xlsx",
      sheetCount: 2,
      chunks: [
        chunk(1, 1, "Budget!A1:C3", "Item\tAmount\nA\t10"),
        chunk(2, 1, "Budget!A4:C6", "B\t20"),
        chunk(3, 2, "Other!A1:B2", "x\ty"),
      ],
    });

    const result = await run(ctx, session.id, "read_sheet", {
      fileId: "budget",
      sheet: "Budget",
      range: "A2:B5",
    });

    expect(result.isError).not.toBe(true);
    expect(result.content).toContain("Budget!A1:C3");
    expect(result.content).toContain("Budget!A4:C6");
    expect(result.content).not.toContain("Other!A1:B2");
    expect(result.display).toBe("budget.xlsx · Budget!A2:B5");
    expect(result.citations?.map((citation) => citation.section)).toEqual([
      "Budget!A1:C3",
      "Budget!A4:C6",
    ]);
  }));

  it("names the available sheets when the model guesses wrong", () => withContext(async (ctx) => {
    const session = await createSessionRepository(ctx).create({});
    await seedFile(ctx, {
      id: "budget",
      sessionId: session.id,
      name: "budget.xlsx",
      kind: "xlsx",
      sheetCount: 1,
      chunks: [chunk(1, 1, "Budget!A1:C3", "Item\tAmount")],
    });

    const result = await run(ctx, session.id, "read_sheet", {
      fileId: "budget",
      sheet: "Sheet1",
    });

    expect(result.isError).toBe(true);
    expect(result.content).toContain('Available sheets: Budget');
  }));

  it("searches only the chat and project scope", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const sessions = createSessionRepository(ctx);
    const mine = await projects.create({ name: "Mine" });
    const other = await projects.create({ name: "Other" });
    const session = await sessions.create({ projectId: mine.id });

    await seedFile(ctx, {
      id: "mine-report",
      projectId: mine.id,
      name: "mine.pdf",
      kind: "pdf",
      chunks: [chunk(1, 1, null, "quarterly revenue grew")],
    });
    await seedFile(ctx, {
      id: "other-report",
      projectId: other.id,
      name: "other.pdf",
      kind: "pdf",
      chunks: [chunk(1, 1, null, "quarterly revenue fell")],
    });

    const result = await run(ctx, session.id, "search_documents", { query: "revenue" });

    expect(result.isError).not.toBe(true);
    expect(result.content).toContain("mine.pdf");
    expect(result.content).not.toContain("other.pdf");
    expect(result.display).toBe('"revenue" · 1 match');
    expect(result.citations?.[0]?.fileId).toBe("mine-report");
  }));

  it("searches only a standalone chat's own files", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const mine = await sessions.create({});
    const other = await sessions.create({});
    await seedFile(ctx, {
      id: "mine-note",
      sessionId: mine.id,
      name: "mine.txt",
      kind: "text",
      chunks: [chunk(1, null, null, "revenue grew")],
    });
    await seedFile(ctx, {
      id: "other-note",
      sessionId: other.id,
      name: "other.txt",
      kind: "text",
      chunks: [chunk(1, null, null, "revenue fell")],
    });

    const result = await run(ctx, mine.id, "search_documents", { query: "revenue" });

    expect(result.content).toContain("mine.txt");
    expect(result.content).not.toContain("other.txt");
  }));

  it("reads a deck slide by number", () => withContext(async (ctx) => {
    const session = await createSessionRepository(ctx).create({});
    await seedFile(ctx, {
      id: "deck",
      sessionId: session.id,
      name: "deck.pptx",
      kind: "pptx",
      slideCount: 2,
      chunks: [
        chunk(1, 1, "Title One", "First slide"),
        chunk(2, 2, "Title Two", "Second slide"),
      ],
    });

    const result = await run(ctx, session.id, "read_document", {
      fileId: "deck",
      pageStart: 2,
      pageEnd: 2,
    });

    expect(result.content).toContain("[File: deck.pptx, Slide 2]");
    expect(result.content).not.toContain("First slide");
    expect(result.display).toBe("deck.pptx · slide 2");
  }));

  it("reads an artifact version from the current project", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const sessions = createSessionRepository(ctx);
    const mine = await projects.create({ name: "Mine" });
    const other = await projects.create({ name: "Other" });
    const session = await sessions.create({ projectId: mine.id });

    await seedArtifact(ctx, {
      id: "deck",
      projectId: mine.id,
      sessionId: session.id,
      kind: "deck",
      title: "Q4 review",
      versions: [1, 2],
      currentVersion: 2,
    });
    await seedArtifact(ctx, {
      id: "foreign",
      projectId: other.id,
      sessionId: null,
      kind: "doc",
      title: "Foreign",
      versions: [1],
      currentVersion: 1,
    });

    const current = await run(ctx, session.id, "get_artifact", { artifactId: "deck" });
    expect(current.isError).not.toBe(true);
    expect(current.content).toContain('"version": 2');
    expect(current.display).toBe("Q4 review · v2");

    const old = await run(ctx, session.id, "get_artifact", { artifactId: "deck", version: 1 });
    expect(old.content).toContain('"version": 1');

    const foreign = await run(ctx, session.id, "get_artifact", { artifactId: "foreign" });
    expect(foreign.isError).toBe(true);
  }));
});

interface SeedArtifactOptions {
  readonly id: string;
  readonly projectId: string | null;
  readonly sessionId: string | null;
  readonly kind: "deck" | "sheet" | "doc";
  readonly title: string;
  readonly versions: readonly number[];
  readonly currentVersion: number;
}

async function seedArtifact(ctx: DbContext, options: SeedArtifactOptions): Promise<void> {
  await ctx.db.execute(
    `INSERT INTO artifacts
       (id, session_id, project_id, kind, title, current_version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, 1)`,
    [options.id, options.sessionId, options.projectId, options.kind, options.title, options.currentVersion],
  );
  for (const version of options.versions) {
    await ctx.db.execute(
      `INSERT INTO artifact_versions (artifact_id, version, spec_json, created_by, created_at)
       VALUES (?, ?, ?, 'model', 1)`,
      [options.id, version, JSON.stringify({ version })],
    );
  }
}
