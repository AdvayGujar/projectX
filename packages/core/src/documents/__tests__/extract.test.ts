import { describe, expect, it } from "vitest";

import type { DbContext } from "../../db";
import {
  createChunkRepository,
  createDocumentRepository,
  createFileRepository,
  createSearchRepository,
  createSessionRepository,
} from "../../db";
import { withContext } from "../../db/__tests__/helpers";
import { AppError } from "../../errors";
import type { PdfPort } from "../../ports";
import { createPdfExtractionService } from "../index";

interface FakePdf extends PdfPort {
  readonly calls: string[];
}

interface FakePdfOptions {
  readonly failPage?: number;
  readonly onPage?: (page: number) => void;
  readonly pageCount?: number;
}

function createFakePdf(
  pages: readonly string[],
  options: FakePdfOptions = {},
): FakePdf {
  const calls: string[] = [];
  return {
    calls,
    async getPageCount(fileUri: string): Promise<number> {
      calls.push(`count:${fileUri}`);
      return options.pageCount ?? pages.length;
    },
    async extractPage(fileUri: string, page: number): Promise<string> {
      calls.push(`page:${page}:${fileUri}`);
      options.onPage?.(page);
      if (options.failPage === page) {
        throw new Error("native extraction failed");
      }
      return pages[page - 1] ?? "";
    },
  };
}

interface SeededDocument {
  readonly fileUri: string;
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
  return {
    fileUri: `file:///sandbox/${file.id}.pdf`,
    documentId: document.id,
  };
}

describe("PDF extraction service", () => {
  it("extracts pages in order, stores chunks, and marks the document ready", () => withContext(async (ctx) => {
    const { fileUri, documentId } = await seedDocument(ctx);
    const pdf = createFakePdf(["A page about apples.", "A page about bananas."]);
    const service = createPdfExtractionService(ctx, pdf);

    const result = await service.extract({ documentId, fileUri });

    expect(result).toEqual({ status: "ready", pageCount: 2, chunkCount: 2 });
    expect(pdf.calls).toEqual([
      `count:${fileUri}`,
      `page:1:${fileUri}`,
      `page:2:${fileUri}`,
    ]);

    const stored = await createChunkRepository(ctx).listByDocument(documentId);
    expect(stored.map((chunk) => chunk.page)).toEqual([1, 2]);
    expect(stored.map((chunk) => chunk.ordinal)).toEqual([1, 2]);
    expect(stored[0]?.text).toContain("apples");
    expect(stored[1]?.text).toContain("bananas");

    const document = await createDocumentRepository(ctx).get(documentId);
    expect(document).toMatchObject({ status: "ready", pageCount: 2, error: null });
    expect(document?.extractedAt).not.toBeNull();
  }));

  it("marks the document as failed and stores no chunks when a page fails", () => withContext(async (ctx) => {
    const { fileUri, documentId } = await seedDocument(ctx);
    const pdf = createFakePdf(["First page.", "Second page."], { failPage: 2 });
    const service = createPdfExtractionService(ctx, pdf);

    const result = await service.extract({ documentId, fileUri });

    expect(result.status).toBe("error");
    if (result.status !== "error") {
      throw new Error("expected an error result");
    }
    expect(result.error).toBeInstanceOf(AppError);
    expect(result.error.code).toBe("unknown");
    expect(result.error.userMessage).toBe("Could not read this PDF.");

    const document = await createDocumentRepository(ctx).get(documentId);
    expect(document?.status).toBe("error");
    expect(document?.error).toBe("Could not read this PDF.");
    expect(await createChunkRepository(ctx).count(documentId)).toBe(0);
  }));

  it("returns to pending and reports cancellation when aborted mid-extraction", () => withContext(async (ctx) => {
    const { fileUri, documentId } = await seedDocument(ctx);
    const controller = new AbortController();
    const pdf = createFakePdf(["First page.", "Second page."], {
      onPage: () => controller.abort(),
    });
    const service = createPdfExtractionService(ctx, pdf);

    const result = await service.extract({
      documentId,
      fileUri,
      signal: controller.signal,
    });

    expect(result).toEqual({ status: "cancelled" });
    expect(pdf.calls).toEqual([`count:${fileUri}`, `page:1:${fileUri}`]);
    const document = await createDocumentRepository(ctx).get(documentId);
    expect(document?.status).toBe("pending");
    expect(await createChunkRepository(ctx).count(documentId)).toBe(0);
  }));

  it("returns db_not_found for a missing document", () => withContext(async (ctx) => {
    const pdf = createFakePdf(["First page."]);
    const service = createPdfExtractionService(ctx, pdf);

    const result = await service.extract({
      documentId: "missing",
      fileUri: "file:///sandbox/missing.pdf",
    });

    expect(result.status).toBe("error");
    if (result.status !== "error") {
      throw new Error("expected an error result");
    }
    expect(result.error.code).toBe("db_not_found");
    expect(pdf.calls).toEqual([]);
  }));

  it("treats a scanned or empty PDF as ready with no chunks", () => withContext(async (ctx) => {
    const { fileUri, documentId } = await seedDocument(ctx);
    const pdf = createFakePdf(["", "   \n\t "]);
    const service = createPdfExtractionService(ctx, pdf);

    const result = await service.extract({ documentId, fileUri });

    expect(result).toEqual({ status: "ready", pageCount: 2, chunkCount: 0 });
    const document = await createDocumentRepository(ctx).get(documentId);
    expect(document?.status).toBe("ready");
    expect(await createChunkRepository(ctx).count(documentId)).toBe(0);
  }));

  it.each([-1, 0, 5_001])("rejects page count %i", (pageCount) => withContext(async (ctx) => {
    const { fileUri, documentId } = await seedDocument(ctx);
    const pdf = createFakePdf(["First page."], { pageCount });
    const service = createPdfExtractionService(ctx, pdf);

    const result = await service.extract({ documentId, fileUri });

    expect(result.status).toBe("error");
    if (result.status !== "error") {
      throw new Error("expected an error result");
    }
    expect(result.error.userMessage).toMatch(/Could not read this PDF|more than 5000 pages/);
    const document = await createDocumentRepository(ctx).get(documentId);
    expect(document?.status).toBe("error");
    expect(pdf.calls).toEqual([`count:${fileUri}`]);
  }));

  it("keeps the last successful chunks but hides them when re-extraction fails", () => withContext(async (ctx) => {
    const { fileUri, documentId } = await seedDocument(ctx);
    const search = createSearchRepository(ctx);

    await createPdfExtractionService(ctx, createFakePdf(["old apples"]))
      .extract({ documentId, fileUri });
    expect(await search.chunks("apples")).toHaveLength(1);

    const failed = await createPdfExtractionService(
      ctx,
      createFakePdf(["new bananas"], { failPage: 1 }),
    ).extract({ documentId, fileUri });

    expect(failed.status).toBe("error");
    expect(await createChunkRepository(ctx).count(documentId)).toBe(1);
    expect(await createDocumentRepository(ctx).get(documentId)).toMatchObject({
      status: "error",
    });
    expect(await search.chunks("apples")).toHaveLength(0);
  }));
});
