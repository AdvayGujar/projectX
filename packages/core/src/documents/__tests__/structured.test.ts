import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import {
  createChunkRepository,
  createDocumentRepository,
  createFileRepository,
  createSessionRepository,
} from "../../db";
import type { DbContext, FileKind } from "../../db";
import { withContext } from "../../db/__tests__/helpers";
import { AppError } from "../../errors";
import type { FileStoragePort } from "../../ports";
import { createReadTools } from "../../tools";
import { createStructuredExtractionService } from "../index";

const DOCX_XML = `<w:document><w:body>
  <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Plan</w:t></w:r></w:p>
  <w:p><w:r><w:t>Read the documents first.</w:t></w:r></w:p>
</w:body></w:document>`;

async function docxBytes(): Promise<Uint8Array> {
  const archive = new JSZip();
  archive.file("word/document.xml", DOCX_XML);
  return archive.generateAsync({ type: "uint8array" });
}

interface FakeStorage extends FileStoragePort {
  readonly bytes: Uint8Array;
  readonly text: string;
}

function createStorage(bytes: Uint8Array, text = ""): FakeStorage {
  return {
    bytes,
    text,
    async readBytes() {
      return bytes;
    },
    async readText() {
      return text;
    },
    async copyFromUri() {
      throw new Error("extraction must not copy");
    },
    async writeText() {
      throw new Error("extraction must not write");
    },
    async remove() {
      throw new Error("extraction must not remove");
    },
    async removeDirectory() {
      throw new Error("extraction must not remove");
    },
    uriFor(relativePath) {
      return `file:///sandbox/${relativePath}`;
    },
  };
}

async function seed(ctx: DbContext, kind: FileKind, mime: string) {
  const sessions = createSessionRepository(ctx);
  const files = createFileRepository(ctx);
  const session = await sessions.create({});
  const stored = await files.addWithDocument({
    id: `file-${kind}`,
    sessionId: session.id,
    name: `document.${kind}`,
    mime,
    size: 100,
    path: `sessions/${session.id}/files/document.${kind}`,
    kind,
  });
  return stored;
}

describe("structured extraction", () => {
  it("parses DOCX bytes, stores section chunks, and marks the document ready", () => withContext(async (ctx) => {
    const stored = await seed(ctx, "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const service = createStructuredExtractionService(ctx, createStorage(await docxBytes()));

    const result = await service.extract({ documentId: stored.document.id });

    expect(result).toMatchObject({ status: "ready", chunkCount: 1 });
    const document = await createDocumentRepository(ctx).get(stored.document.id);
    expect(document).toMatchObject({ status: "ready", error: null });
    const chunks = await createChunkRepository(ctx).listByDocument(stored.document.id);
    expect(chunks[0]?.section).toBe("Plan");
    expect(chunks[0]?.text).toContain("Read the documents first.");
  }));

  it("makes extracted DOCX text readable through read_document", () => withContext(async (ctx) => {
    const stored = await seed(ctx, "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const service = createStructuredExtractionService(ctx, createStorage(await docxBytes()));
    await service.extract({ documentId: stored.document.id });
    if (!stored.file.sessionId) {
      throw new Error("seed file is missing its session");
    }

    const result = await createReadTools(ctx).execute(
      {
        id: "call-1",
        name: "read_document",
        arguments: { fileId: stored.file.id, section: "Plan" },
      },
      { sessionId: stored.file.sessionId },
    );

    expect(result.isError).not.toBe(true);
    expect(result.content).toContain("Read the documents first.");
    expect(result.display).toBe("document.docx");
  }));

  it("reads delimited text through the text reader", () => withContext(async (ctx) => {
    const stored = await seed(ctx, "xlsx", "text/csv");
    const service = createStructuredExtractionService(
      ctx,
      createStorage(new Uint8Array(), "Item,Amount\nA,10"),
    );

    const result = await service.extract({ documentId: stored.document.id });

    expect(result.status).toBe("ready");
    const document = await createDocumentRepository(ctx).get(stored.document.id);
    expect(document?.sheetCount).toBe(1);
    const chunks = await createChunkRepository(ctx).listByDocument(stored.document.id);
    expect(chunks[0]?.section).toBe("Sheet1!A1:B2");
    expect(chunks[0]?.text).toContain("A\t10");
  }));

  it("records an error when the bytes cannot be parsed", () => withContext(async (ctx) => {
    const stored = await seed(ctx, "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const service = createStructuredExtractionService(
      ctx,
      createStorage(new Uint8Array([1, 2, 3])),
    );

    const result = await service.extract({ documentId: stored.document.id });

    expect(result.status).toBe("error");
    const document = await createDocumentRepository(ctx).get(stored.document.id);
    expect(document?.status).toBe("error");
    expect(document?.error).toBe("Could not read this Word document.");
  }));

  it("returns to pending when extraction is cancelled", () => withContext(async (ctx) => {
    const stored = await seed(ctx, "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const storage = createStorage(await docxBytes());
    const controller = new AbortController();
    const service = createStructuredExtractionService(ctx, {
      ...storage,
      async readBytes() {
        controller.abort();
        throw new AppError("cancelled", "aborted");
      },
    });

    const result = await service.extract({
      documentId: stored.document.id,
      signal: controller.signal,
    });

    expect(result).toEqual({ status: "cancelled" });
    expect((await createDocumentRepository(ctx).get(stored.document.id))?.status).toBe("pending");
  }));
});
