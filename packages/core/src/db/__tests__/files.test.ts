import { describe, expect, it } from "vitest";

import {
  createDbContext,
  createDocumentRepository,
  createFileRepository,
  createSessionRepository,
  migrate,
} from "../index";
import { createNodeDatabase, withContext } from "./helpers";
import { addSessionFile } from "./fileFixtures";

describe("file repository", () => {
  it("adds and reads a file", () => withContext(async (ctx) => {
    const files = createFileRepository(ctx);
    const sessions = createSessionRepository(ctx);
    const session = await sessions.create({});
    const added = await addSessionFile(ctx, session.id);

    expect(added.sessionId).toBe(session.id);
    expect(added.projectId).toBeNull();
    expect(added.name).toBe("report.pdf");
    expect(added.kind).toBe("pdf");
    expect((await files.get(added.id))?.id).toBe(added.id);
    expect(await files.get("missing")).toBeNull();
  }));

  it("rejects an empty name and a negative size", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const session = await sessions.create({});

    await expect(addSessionFile(ctx, session.id, { name: "   " })).rejects.toMatchObject({
      code: "db_invalid",
    });
    await expect(addSessionFile(ctx, session.id, { size: -1 })).rejects.toMatchObject({
      code: "db_invalid",
    });
  }));

  it("rejects a path that escapes the sandbox", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const session = await sessions.create({});

    await expect(addSessionFile(ctx, session.id, { path: "../escape.pdf" })).rejects.toMatchObject({
      code: "db_invalid",
    });
    await expect(addSessionFile(ctx, session.id, { path: "/absolute.pdf" })).rejects.toMatchObject({
      code: "db_invalid",
    });
  }));

  it("writes the file and its pending document in one transaction", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const files = createFileRepository(ctx);
    const documents = createDocumentRepository(ctx);
    const session = await sessions.create({});
    const id = ctx.ids();

    const result = await files.addWithDocument({
      id,
      sessionId: session.id,
      name: "report.pdf",
      mime: "application/pdf",
      size: 10,
      path: `sessions/${session.id}/files/${id}.pdf`,
      kind: "pdf",
    });

    expect(result.file.id).toBe(id);
    expect(result.document).toMatchObject({ fileId: id, status: "pending" });
    expect(await documents.getByFile(id)).toMatchObject({ id: result.document.id });
  }));

  it("rolls back the file row when the document insert fails", async () => {
    const db = createNodeDatabase();
    try {
      await migrate(db);
      let sequence = 0;
      const ctx = createDbContext(db, {
        ids: () => `id-${(sequence += 1)}`,
        now: () => 1_700_000_000_000,
      });
      const sessions = createSessionRepository(ctx);
      const files = createFileRepository(ctx);
      const documents = createDocumentRepository(ctx);
      const session = await sessions.create({});

      await ctx.db.execute(
        `INSERT INTO files (id, session_id, name, mime, size, path, kind, created_at)
         VALUES ('seed-file', ?, 'seed.pdf', 'application/pdf', 1,
                 'sessions/${session.id}/files/seed-file.pdf', 'pdf', 1)`,
        [session.id],
      );
      await ctx.db.execute(
        "INSERT INTO documents (id, file_id, status) VALUES ('id-2', 'seed-file', 'pending')",
      );

      await expect(files.addWithDocument({
        id: "file-2",
        sessionId: session.id,
        name: "report.pdf",
        mime: "application/pdf",
        size: 10,
        path: `sessions/${session.id}/files/file-2.pdf`,
        kind: "pdf",
      })).rejects.toMatchObject({ code: "db_constraint" });

      expect(await files.get("file-2")).toBeNull();
      expect(await documents.getByFile("file-2")).toBeNull();
    } finally {
      await db.close();
    }
  });

  it("removes a file row directly", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const files = createFileRepository(ctx);
    const session = await sessions.create({});
    const file = await addSessionFile(ctx, session.id);

    await files.remove(file.id);
    expect(await files.get(file.id)).toBeNull();
  }));

  it("cascades files, documents, and chunks when a session is removed", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const documents = createDocumentRepository(ctx);
    const session = await sessions.create({});
    const file = await addSessionFile(ctx, session.id);
    const document = await documents.create({ fileId: file.id });

    await ctx.db.execute(
      `INSERT INTO doc_chunks (id, document_id, ordinal, page, text, token_estimate)
       VALUES ('chunk', ?, 1, 1, 'hello', 2)`,
      [document.id],
    );

    await sessions.remove(session.id);
    expect(await createFileRepository(ctx).get(file.id)).toBeNull();
    expect(await documents.get(document.id)).toBeNull();
    const chunks = await ctx.db.execute("SELECT id FROM doc_chunks WHERE document_id = ?", [
      document.id,
    ]);
    expect(chunks.rows).toHaveLength(0);
  }));

  it("keeps artifacts and their versions when a session is removed", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const session = await sessions.create({});

    await ctx.db.execute(
      `INSERT INTO artifacts (id, session_id, kind, title, current_version, created_at, updated_at)
       VALUES ('artifact', ?, 'deck', 'Deck', 1, 1, 1)`,
      [session.id],
    );
    await ctx.db.execute(
      `INSERT INTO artifact_versions (artifact_id, version, spec_json, created_by, created_at)
       VALUES ('artifact', 1, '{}', 'model', 1)`,
    );

    await sessions.remove(session.id);

    const artifact = await ctx.db.execute("SELECT session_id FROM artifacts WHERE id = 'artifact'");
    expect(artifact.rows[0]?.session_id).toBeNull();
    const versions = await ctx.db.execute(
      "SELECT version FROM artifact_versions WHERE artifact_id = 'artifact'",
    );
    expect(versions.rows).toHaveLength(1);
  }));
});

describe("document repository", () => {
  it("creates pending documents and updates extraction state", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const documents = createDocumentRepository(ctx);
    const session = await sessions.create({});
    const file = await addSessionFile(ctx, session.id);

    const document = await documents.create({ fileId: file.id });
    expect(document.status).toBe("pending");
    expect(document.pageCount).toBeNull();
    expect(await documents.getByFile(file.id)).toMatchObject({ id: document.id });

    const extracting = await documents.update(document.id, { status: "extracting" });
    expect(extracting.status).toBe("extracting");

    const ready = await documents.update(document.id, {
      status: "ready",
      pageCount: 12,
      extractedAt: 123,
    });
    expect(ready.pageCount).toBe(12);
    expect(ready.extractedAt).toBe(123);

    const failed = await documents.update(document.id, {
      status: "error",
      error: "Encrypted",
    });
    expect(failed.error).toBe("Encrypted");

    const recovered = await documents.update(document.id, { status: "ready", pageCount: 4 });
    expect(recovered.error).toBeNull();
    expect(recovered.pageCount).toBe(4);
  }));

  it("sets extractedAt when a document becomes ready", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const documents = createDocumentRepository(ctx);
    const session = await sessions.create({});
    const file = await addSessionFile(ctx, session.id);
    const document = await documents.create({ fileId: file.id });

    const ready = await documents.update(document.id, { status: "ready", pageCount: 3 });
    expect(ready.extractedAt).not.toBeNull();
  }));

  it("allows only one document per file", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const documents = createDocumentRepository(ctx);
    const session = await sessions.create({});
    const file = await addSessionFile(ctx, session.id);

    await documents.create({ fileId: file.id });
    await expect(documents.create({ fileId: file.id })).rejects.toMatchObject({
      code: "db_constraint",
    });
  }));
});
