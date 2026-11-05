import { describe, expect, it } from "vitest";

import { chunkPages } from "../../documents";
import pdfPages from "../../documents/__tests__/fixtures/pdf-pages.json";
import {
  createChunkRepository,
  createDocumentRepository,
  createFileRepository,
  createSearchRepository,
  createSessionRepository,
} from "../index";
import type { DbContext } from "../index";
import { withContext } from "./helpers";

interface SeededDocument {
  readonly fileId: string;
  readonly documentId: string;
}

async function seedDocument(ctx: DbContext): Promise<SeededDocument> {
  const sessions = createSessionRepository(ctx);
  const files = createFileRepository(ctx);
  const documents = createDocumentRepository(ctx);
  const session = await sessions.create({});
  const fileId = ctx.ids();
  const file = await files.add({
    id: fileId,
    sessionId: session.id,
    name: "report.pdf",
    mime: "application/pdf",
    size: 4096,
    path: `sessions/${session.id}/files/${fileId}.pdf`,
    kind: "pdf",
  });
  const document = await documents.create({ fileId: file.id });
  return { fileId: file.id, documentId: document.id };
}

describe("chunk repository", () => {
  it("replaces existing chunks in one call", () => withContext(async (ctx) => {
    const { documentId } = await seedDocument(ctx);
    const chunks = createChunkRepository(ctx);

    await chunks.replaceForDocument(documentId, [
      { ordinal: 1, page: 1, section: null, text: "old one", tokenEstimate: 2 },
      { ordinal: 2, page: 1, section: null, text: "old two", tokenEstimate: 2 },
    ]);
    expect(await chunks.count(documentId)).toBe(2);

    const replaced = await chunks.replaceForDocument(documentId, [
      { ordinal: 1, page: 2, section: "Results", text: "new text", tokenEstimate: 2 },
    ]);

    expect(replaced).toHaveLength(1);
    expect(replaced[0]?.documentId).toBe(documentId);
    expect(replaced[0]?.id).toBeTruthy();
    expect((await chunks.listByDocument(documentId)).map((chunk) => chunk.text)).toEqual([
      "new text",
    ]);
    expect(await chunks.count(documentId)).toBe(1);
  }));

  it("lists chunks in ordinal order regardless of insert order", () => withContext(async (ctx) => {
    const { documentId } = await seedDocument(ctx);
    const chunks = createChunkRepository(ctx);

    const inserted = await chunks.replaceForDocument(documentId, [
      { ordinal: 2, page: 2, section: null, text: "second", tokenEstimate: 1 },
      { ordinal: 1, page: 1, section: null, text: "first", tokenEstimate: 1 },
    ]);

    expect(inserted.map((chunk) => chunk.ordinal)).toEqual([2, 1]);
    expect((await chunks.listByDocument(documentId)).map((chunk) => chunk.ordinal)).toEqual([
      1, 2,
    ]);
  }));

  it("counts only the requested document", () => withContext(async (ctx) => {
    const first = await seedDocument(ctx);
    const second = await seedDocument(ctx);
    const chunks = createChunkRepository(ctx);

    await chunks.replaceForDocument(first.documentId, [
      { ordinal: 1, page: 1, section: null, text: "first document", tokenEstimate: 1 },
    ]);
    await chunks.replaceForDocument(second.documentId, [
      { ordinal: 1, page: 1, section: null, text: "second document", tokenEstimate: 1 },
      { ordinal: 2, page: 1, section: null, text: "second document again", tokenEstimate: 1 },
    ]);

    expect(await chunks.count(first.documentId)).toBe(1);
    expect(await chunks.count(second.documentId)).toBe(2);
    expect(await chunks.count("missing")).toBe(0);
  }));

  it("rejects empty text and non-positive ordinals", () => withContext(async (ctx) => {
    const { documentId } = await seedDocument(ctx);
    const chunks = createChunkRepository(ctx);

    await expect(chunks.replaceForDocument(documentId, [
      { ordinal: 1, page: 1, section: null, text: "   ", tokenEstimate: 1 },
    ])).rejects.toMatchObject({ code: "db_invalid" });

    await expect(chunks.replaceForDocument(documentId, [
      { ordinal: 0, page: 1, section: null, text: "text", tokenEstimate: 1 },
    ])).rejects.toMatchObject({ code: "db_invalid" });

    await expect(chunks.replaceForDocument(documentId, [
      { ordinal: 1, page: 0, section: null, text: "text", tokenEstimate: 1 },
    ])).rejects.toMatchObject({ code: "db_invalid" });

    await expect(chunks.replaceForDocument(documentId, [
      { ordinal: 1, page: 1, section: null, text: "text", tokenEstimate: -1 },
    ])).rejects.toMatchObject({ code: "db_invalid" });

    expect(await chunks.count(documentId)).toBe(0);
  }));

  it("clears all chunks when replacing with an empty list", () => withContext(async (ctx) => {
    const { documentId } = await seedDocument(ctx);
    const chunks = createChunkRepository(ctx);

    await chunks.replaceForDocument(documentId, [
      { ordinal: 1, page: 1, section: null, text: "will be removed", tokenEstimate: 2 },
    ]);
    await chunks.replaceForDocument(documentId, []);

    expect(await chunks.count(documentId)).toBe(0);
    expect(await chunks.listByDocument(documentId)).toEqual([]);
  }));

  it("rolls back the delete when an insert fails", () => withContext(async (ctx) => {
    const { documentId } = await seedDocument(ctx);
    const chunks = createChunkRepository(ctx);
    const documents = createDocumentRepository(ctx);
    const search = createSearchRepository(ctx);

    await chunks.replaceForDocument(documentId, [
      { ordinal: 1, page: 1, section: null, text: "original keyword", tokenEstimate: 2 },
    ]);
    await documents.update(documentId, { status: "ready" });
    expect(await search.chunks("original")).toHaveLength(1);

    await expect(chunks.replaceForDocument(documentId, [
      { ordinal: 1, page: 1, section: null, text: "first", tokenEstimate: 1 },
      { ordinal: 1, page: 1, section: null, text: "duplicate", tokenEstimate: 1 },
    ])).rejects.toMatchObject({ code: "db_constraint" });

    expect((await chunks.listByDocument(documentId)).map((chunk) => chunk.text)).toEqual([
      "original keyword",
    ]);
    expect(await search.chunks("original")).toHaveLength(1);
  }));

  it("indexes chunks for full-text search once the document is ready", () => withContext(async (ctx) => {
    const { fileId, documentId } = await seedDocument(ctx);
    const chunks = createChunkRepository(ctx);
    const documents = createDocumentRepository(ctx);
    await chunks.replaceForDocument(documentId, chunkPages(pdfPages));
    await documents.update(documentId, { status: "ready" });

    const hits = await createSearchRepository(ctx).chunks("photovoltaic");

    expect(hits).toHaveLength(1);
    expect(hits[0]?.documentId).toBe(documentId);
    expect(hits[0]?.fileId).toBe(fileId);
    expect(hits[0]?.page).toBe(2);
  }));

  it("hides chunks from search until extraction is ready", () => withContext(async (ctx) => {
    const { documentId } = await seedDocument(ctx);
    const chunks = createChunkRepository(ctx);
    const documents = createDocumentRepository(ctx);
    const search = createSearchRepository(ctx);

    await chunks.replaceForDocument(documentId, [
      { ordinal: 1, page: 1, section: null, text: "pending keyword", tokenEstimate: 2 },
    ]);
    expect(await search.chunks("pending")).toHaveLength(0);

    await documents.update(documentId, { status: "ready" });
    expect(await search.chunks("pending")).toHaveLength(1);
  }));

  it("cascades chunks and FTS entries when the document or its file is deleted", () => withContext(async (ctx) => {
    const first = await seedDocument(ctx);
    const second = await seedDocument(ctx);
    const chunks = createChunkRepository(ctx);
    const documents = createDocumentRepository(ctx);
    const files = createFileRepository(ctx);
    const search = createSearchRepository(ctx);
    const documentChunk = [
      { ordinal: 1, page: 1, section: null, text: "cascade keyword", tokenEstimate: 2 },
    ];

    await chunks.replaceForDocument(first.documentId, documentChunk);
    await chunks.replaceForDocument(second.documentId, documentChunk);
    await documents.update(first.documentId, { status: "ready" });
    await documents.update(second.documentId, { status: "ready" });
    expect(await search.chunks("cascade")).toHaveLength(2);

    await ctx.db.execute("DELETE FROM documents WHERE id = ?", [first.documentId]);
    expect(await chunks.count(first.documentId)).toBe(0);
    expect(await search.chunks("cascade")).toHaveLength(1);

    await files.remove(second.fileId);
    expect(await chunks.count(second.documentId)).toBe(0);
    expect(await search.chunks("cascade")).toHaveLength(0);
  }));
});
