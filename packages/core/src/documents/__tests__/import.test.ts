import { describe, expect, it } from "vitest";

import type { DbContext } from "../../db";
import { createFileRepository, createSessionRepository } from "../../db";
import { AppError } from "../../index";
import type { FileStorageOptions } from "../../ports";
import { createFileImporter } from "../index";
import { withContext } from "../../db/__tests__/helpers";

interface FakeStorage {
  readonly copies: Array<{ sourceUri: string; relativePath: string }>;
  readonly removed: string[];
  lastOptions?: FileStorageOptions;
  copyFromUri(
    sourceUri: string,
    relativePath: string,
    options?: FileStorageOptions,
  ): Promise<{ size: number | null }>;
  writeText(relativePath: string, text: string): Promise<{ size: number }>;
  remove(relativePath: string): Promise<void>;
  removeDirectory(relativePath: string): Promise<void>;
}

function createFakeStorage(options: { failCopy?: boolean } = {}): FakeStorage {
  const copies: Array<{ sourceUri: string; relativePath: string }> = [];
  const removed: string[] = [];
  const storage: FakeStorage = {
    copies,
    removed,
    async copyFromUri(sourceUri, relativePath, copyOptions) {
      storage.lastOptions = copyOptions;
      copies.push({ sourceUri, relativePath });
      if (options.failCopy) {
        throw new Error("copy failed");
      }
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
  return storage;
}

function failingDocumentDb(ctx: DbContext): DbContext {
  return {
    ...ctx,
    db: {
      ...ctx.db,
      async executeBatch(commands) {
        if (commands.some(([sql]) => sql.includes("INSERT INTO documents"))) {
          throw new Error("document insert failed");
        }
        return ctx.db.executeBatch(commands);
      },
    },
  };
}

describe("file importer", () => {
  it("copies into the session folder and queues extraction", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const session = await sessions.create({});
    const storage = createFakeStorage();
    const importer = createFileImporter(ctx, storage);

    const imported = await importer.import({
      sessionId: session.id,
      sourceUri: "file:///picker/report.pdf",
      name: "  Report.PDF  ",
      mime: "application/pdf",
      size: 999,
    });

    expect(imported.file.sessionId).toBe(session.id);
    expect(imported.file.projectId).toBeNull();
    expect(imported.file.name).toBe("Report.PDF");
    expect(imported.file.mime).toBe("application/pdf");
    expect(imported.file.kind).toBe("pdf");
    expect(imported.file.size).toBe(2048);
    expect(imported.file.path).toBe(`sessions/${session.id}/files/${imported.file.id}.pdf`);
    expect(imported.document).toMatchObject({ fileId: imported.file.id, status: "pending" });
    expect(storage.copies).toEqual([{
      sourceUri: "file:///picker/report.pdf",
      relativePath: imported.file.path,
    }]);
    expect(await createFileRepository(ctx).get(imported.file.id)).not.toBeNull();
  }));

  it("uses the reported size when the filesystem reports nothing", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const session = await sessions.create({});
    const storage = createFakeStorage();
    storage.copyFromUri = async (sourceUri, relativePath, copyOptions) => {
      storage.lastOptions = copyOptions;
      storage.copies.push({ sourceUri, relativePath });
      return { size: null };
    };

    const imported = await createFileImporter(ctx, storage).import({
      sessionId: session.id,
      sourceUri: "file:///picker/notes.txt",
      name: "notes.txt",
      mime: "text/plain",
      size: 321,
    });

    expect(imported.file.size).toBe(321);
    expect(imported.file.kind).toBe("text");
    expect(imported.file.path).toMatch(/\.txt$/);
  }));

  it("keeps a genuine zero-byte copy at zero", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const session = await sessions.create({});
    const storage = createFakeStorage();
    storage.copyFromUri = async (sourceUri, relativePath, copyOptions) => {
      storage.lastOptions = copyOptions;
      storage.copies.push({ sourceUri, relativePath });
      return { size: 0 };
    };

    const imported = await createFileImporter(ctx, storage).import({
      sessionId: session.id,
      sourceUri: "file:///picker/empty.txt",
      name: "empty.txt",
      mime: "text/plain",
      size: 321,
    });

    expect(imported.file.size).toBe(0);
  }));

  it("rejects a missing session before copying", () => withContext(async (ctx) => {
    const storage = createFakeStorage();
    const importer = createFileImporter(ctx, storage);

    await expect(importer.import({
      sessionId: "missing",
      sourceUri: "file:///picker/report.pdf",
      name: "report.pdf",
      mime: "application/pdf",
    })).rejects.toMatchObject({ code: "db_not_found" });

    expect(storage.copies).toHaveLength(0);
  }));

  it("does no work when already aborted", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const session = await sessions.create({});
    const storage = createFakeStorage();
    const controller = new AbortController();
    controller.abort();

    await expect(createFileImporter(ctx, storage).import({
      sessionId: session.id,
      sourceUri: "file:///picker/report.pdf",
      name: "report.pdf",
      mime: "application/pdf",
      signal: controller.signal,
    })).rejects.toMatchObject({ code: "cancelled" });

    expect(storage.copies).toHaveLength(0);
  }));

  it("discards a completed copy when aborted before the row is written", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const session = await sessions.create({});
    const storage = createFakeStorage();
    const controller = new AbortController();
    storage.copyFromUri = async (sourceUri, relativePath, copyOptions) => {
      storage.lastOptions = copyOptions;
      storage.copies.push({ sourceUri, relativePath });
      controller.abort();
      return { size: 12 };
    };

    await expect(createFileImporter(ctx, storage).import({
      sessionId: session.id,
      sourceUri: "file:///picker/report.pdf",
      name: "report.pdf",
      mime: "application/pdf",
      signal: controller.signal,
    })).rejects.toMatchObject({ code: "cancelled" });

    expect(storage.lastOptions?.signal).toBe(controller.signal);
    expect(storage.removed).toEqual([storage.copies[0]?.relativePath]);
    expect(await createFileRepository(ctx).listBySession(session.id)).toEqual([]);
  }));

  it("removes a partial copy when the port cancels mid-copy", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const session = await sessions.create({});
    const storage = createFakeStorage();
    storage.copyFromUri = async (sourceUri, relativePath, copyOptions) => {
      storage.lastOptions = copyOptions;
      storage.copies.push({ sourceUri, relativePath });
      throw new AppError("cancelled", "cancelled mid-copy", {
        userMessage: "Import cancelled.",
      });
    };

    await expect(createFileImporter(ctx, storage).import({
      sessionId: session.id,
      sourceUri: "file:///picker/report.pdf",
      name: "report.pdf",
      mime: "application/pdf",
    })).rejects.toMatchObject({ code: "cancelled" });

    expect(storage.removed).toEqual([storage.copies[0]?.relativePath]);
    expect(await createFileRepository(ctx).listBySession(session.id)).toEqual([]);
  }));

  it("removes a partial copy when the copy fails", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const session = await sessions.create({});
    const storage = createFakeStorage({ failCopy: true });

    await expect(createFileImporter(ctx, storage).import({
      sessionId: session.id,
      sourceUri: "file:///picker/report.pdf",
      name: "report.pdf",
      mime: "application/pdf",
    })).rejects.toMatchObject({
      code: "unknown",
      userMessage: "Could not import the file.",
    });

    expect(storage.removed).toEqual([storage.copies[0]?.relativePath]);
    expect(await createFileRepository(ctx).listBySession(session.id)).toEqual([]);
  }));

  it("rolls back the file row when queuing extraction fails", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const session = await sessions.create({});
    const storage = createFakeStorage();
    const importer = createFileImporter(failingDocumentDb(ctx), storage);

    await expect(importer.import({
      sessionId: session.id,
      sourceUri: "file:///picker/report.pdf",
      name: "report.pdf",
      mime: "application/pdf",
    })).rejects.toMatchObject({
      code: "unknown",
      userMessage: "Could not save the file.",
    });

    expect(await createFileRepository(ctx).listBySession(session.id)).toEqual([]);
    expect(storage.removed).toHaveLength(1);
  }));

  it("maps csv to the spreadsheet kind and strips bad MIME parameters", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const session = await sessions.create({});
    const storage = createFakeStorage();

    const imported = await createFileImporter(ctx, storage).import({
      sessionId: session.id,
      sourceUri: "file:///picker/rows.csv",
      name: "rows.csv",
      mime: "text/csv; charset=utf-8",
    });

    expect(imported.file.kind).toBe("xlsx");
    expect(imported.file.mime).toBe("text/csv");
    expect(imported.file.path).toMatch(/\.csv$/);
  }));

  it("keeps unknown files importable", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const session = await sessions.create({});
    const storage = createFakeStorage();

    const imported = await createFileImporter(ctx, storage).import({
      sessionId: session.id,
      sourceUri: "file:///picker/blob",
      name: "blob",
      mime: "",
    });

    expect(imported.file.kind).toBe("other");
    expect(imported.file.mime).toBe("application/octet-stream");
    expect(imported.file.path).toBe(`sessions/${session.id}/files/${imported.file.id}`);
  }));
});
