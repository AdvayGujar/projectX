import { describe, expect, it } from "vitest";

import {
  createDocumentRepository,
  createFileRepository,
  createProjectRepository,
  createSessionRepository,
} from "../../db";
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
    async writeText(_relativePath, text) {
      return { size: text.length };
    },
    async remove(relativePath) {
      removed.push(relativePath);
    },
    async removeDirectory(relativePath) {
      removed.push(relativePath);
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
