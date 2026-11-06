import { describe, expect, it } from "vitest";

import {
  createChunkRepository,
  createDocumentRepository,
  createFileRepository,
  createProjectRepository,
  createSessionRepository,
} from "../../db";
import type { DbContext } from "../../db";
import type { SqlValue } from "../../db/types";
import type { FileStoragePort } from "../../ports";
import { createFileImporter } from "../index";
import { withContext } from "../../db/__tests__/helpers";

interface RecordingStorage extends FileStoragePort {
  readonly copies: string[];
  readonly removed: string[];
}

function createStorage(): RecordingStorage {
  const copies: string[] = [];
  const removed: string[] = [];
  return {
    copies,
    removed,
    async copyFromUri(_sourceUri, relativePath) {
      copies.push(relativePath);
      return { size: 2048 };
    },
    async readBytes() {
      throw new Error("the importer must not read stored bytes");
    },
    async readText() {
      throw new Error("the importer must not read stored text");
    },
    async writeText(_relativePath, text) {
      return { size: text.length };
    },
    async remove(relativePath) {
      removed.push(relativePath);
    },
    async removeDirectory(relativePath) {
      removed.push(relativePath);
    },
    uriFor(relativePath) {
      return `file:///sandbox/${relativePath}`;
    },
  };
}

async function importPdf(
  ctx: Parameters<typeof createFileImporter>[0],
  storage: FileStoragePort,
  sessionId: string,
) {
  return createFileImporter(ctx, storage).import({
    sessionId,
    sourceUri: "file:///picker/budget.pdf",
    name: "budget.pdf",
    mime: "application/pdf",
  });
}

describe("file importer ownership", () => {
  it("adds a project chat import to the project library", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const sessions = createSessionRepository(ctx);
    const project = await projects.create({ name: "Reports" });
    const session = await sessions.create({ projectId: project.id });
    const storage = createStorage();

    const imported = await importPdf(ctx, storage, session.id);

    expect(imported.file.sessionId).toBeNull();
    expect(imported.file.projectId).toBe(project.id);
    expect(imported.file.path).toBe(`projects/${project.id}/library/${imported.file.id}.pdf`);
    expect(storage.copies).toEqual([imported.file.path]);
    expect(
      (await createFileRepository(ctx).listByProject(project.id)).map((file) => file.id),
    ).toEqual([imported.file.id]);
  }));

  it("keeps a project chat's imports when the chat is deleted", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const sessions = createSessionRepository(ctx);
    const documents = createDocumentRepository(ctx);
    const files = createFileRepository(ctx);
    const project = await projects.create({ name: "Reports" });
    const session = await sessions.create({ projectId: project.id });
    const imported = await importPdf(ctx, createStorage(), session.id);
    await ctx.db.execute(
      `INSERT INTO doc_chunks (id, document_id, ordinal, page, text, token_estimate)
       VALUES ('chunk', ?, 1, 1, 'project text', 2)`,
      [imported.document.id],
    );

    await sessions.remove(session.id);

    expect(await files.get(imported.file.id)).not.toBeNull();
    expect(await documents.get(imported.document.id)).not.toBeNull();
    const chunks = await ctx.db.execute("SELECT id FROM doc_chunks WHERE document_id = ?", [
      imported.document.id,
    ]);
    expect(chunks.rows).toHaveLength(1);
  }));

  it("cascades project files, documents, and chunks when the project is deleted", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const sessions = createSessionRepository(ctx);
    const documents = createDocumentRepository(ctx);
    const project = await projects.create({ name: "Reports" });
    const session = await sessions.create({ projectId: project.id });
    const imported = await importPdf(ctx, createStorage(), session.id);
    await ctx.db.execute(
      `INSERT INTO doc_chunks (id, document_id, ordinal, page, text, token_estimate)
       VALUES ('chunk', ?, 1, 1, 'project text', 2)`,
      [imported.document.id],
    );

    await projects.remove(project.id);

    expect(await createFileRepository(ctx).get(imported.file.id)).toBeNull();
    expect(await documents.get(imported.document.id)).toBeNull();
    const chunks = await ctx.db.execute("SELECT id FROM doc_chunks WHERE document_id = ?", [
      imported.document.id,
    ]);
    expect(chunks.rows).toHaveLength(0);
  }));
});

describe("direct project import", () => {
  it("imports into the project library without a session", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const files = createFileRepository(ctx);
    const project = await projects.create({ name: "Reports" });
    const storage = createStorage();

    const imported = await createProjectFile(ctx, storage, project.id, {
      name: "budget.pdf",
      mime: "application/pdf",
    });

    expect(imported.file.projectId).toBe(project.id);
    expect(imported.file.sessionId).toBeNull();
    expect(imported.file.path).toBe(`projects/${project.id}/library/${imported.file.id}.pdf`);
    expect(imported.document).toMatchObject({ fileId: imported.file.id, status: "pending" });
    expect((await files.listLibrary(project.id)).map((file) => file.id)).toEqual([
      imported.file.id,
    ]);
    expect(storage.copies).toEqual([imported.file.path]);
  }));

  it("rejects an import with both owners or neither", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const sessions = createSessionRepository(ctx);
    const project = await projects.create({ name: "Reports" });
    const session = await sessions.create({});
    const storage = createStorage();
    const importer = createFileImporter(ctx, storage);

    await expect(importer.import({
      sessionId: session.id,
      projectId: project.id,
      sourceUri: "file:///picker/budget.pdf",
      name: "budget.pdf",
      mime: "application/pdf",
    })).rejects.toMatchObject({ code: "db_invalid" });

    await expect(importer.import({
      sourceUri: "file:///picker/budget.pdf",
      name: "budget.pdf",
      mime: "application/pdf",
    })).rejects.toMatchObject({ code: "db_invalid" });

    expect(storage.copies).toHaveLength(0);
    expect(await createFileRepository(ctx).listLibrary(project.id)).toEqual([]);
  }));

  it("marks an image ready with no pages or chunks", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const project = await projects.create({ name: "Reports" });

    const imported = await createProjectFile(ctx, createStorage(), project.id, {
      name: "photo.png",
      mime: "image/png",
    });

    expect(imported.file.kind).toBe("image");
    expect(imported.document).toMatchObject({
      status: "ready",
      pageCount: 0,
      error: null,
    });
    expect(imported.document.extractedAt).not.toBeNull();
    expect(await createChunkRepository(ctx).count(imported.document.id)).toBe(0);
  }));

  it("removes the row and bytes when an image cannot be marked ready", () => withContext(async (ctx) => {
    const projects = createProjectRepository(ctx);
    const files = createFileRepository(ctx);
    const project = await projects.create({ name: "Reports" });
    const storage = createStorage();
    const failing = failingImageDb(ctx);

    await expect(
      createProjectFile(failing, storage, project.id, {
        name: "photo.png",
        mime: "image/png",
      }),
    ).rejects.toMatchObject({ userMessage: "Could not update the document." });

    expect(await files.listLibrary(project.id)).toEqual([]);
    expect(storage.removed).toHaveLength(1);
  }));
});

async function createProjectFile(
  ctx: DbContext,
  storage: FileStoragePort,
  projectId: string,
  file: { readonly name: string; readonly mime: string },
) {
  return createFileImporter(ctx, storage).import({
    projectId,
    sourceUri: `file:///picker/${file.name}`,
    name: file.name,
    mime: file.mime,
  });
}

function failingImageDb(ctx: DbContext): DbContext {
  return {
    ...ctx,
    db: {
      ...ctx.db,
      async execute(sql, params: SqlValue[] = []) {
        if (sql.startsWith("UPDATE documents")) {
          throw new Error("document update failed");
        }
        return ctx.db.execute(sql, params);
      },
    },
  };
}
