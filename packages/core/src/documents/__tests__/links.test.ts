import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createDocumentRepository,
  createFileRepository,
  createProjectLinkRepository,
  createProjectRepository,
  createSearchRepository,
} from "../../db";
import type { DbContext } from "../../db";
import { withContext } from "../../db/__tests__/helpers";
import { AppError } from "../../errors";
import type { FileStoragePort, WebFetchInput, WebFetchPort, WebFetchResult } from "../../ports";
import { createProjectLinkImporter } from "../index";

const HTML_PAGE = readFileSync(
  join(import.meta.dirname, "fixtures", "samplePage.html"),
  "utf8",
);
const PAGE_URL = "https://example.com/reports/bridge";

interface FakeStorage extends FileStoragePort {
  readonly written: Map<string, string>;
  readonly removed: string[];
}

function createStorage(): FakeStorage {
  const written = new Map<string, string>();
  const removed: string[] = [];
  return {
    written,
    removed,
    async copyFromUri() {
      throw new Error("the link importer must not copy picker files");
    },
    async readBytes() {
      throw new Error("the link importer must not read stored bytes");
    },
    async readText() {
      throw new Error("the link importer must not read stored text");
    },
    async writeText(relativePath, text) {
      written.set(relativePath, text);
      return { size: text.length };
    },
    async remove(relativePath) {
      written.delete(relativePath);
      removed.push(relativePath);
    },
    async removeDirectory() {
      throw new Error("the link importer must not remove directories");
    },
    uriFor(relativePath) {
      return `file:///sandbox/${relativePath}`;
    },
  };
}

interface FakeWeb extends WebFetchPort {
  readonly calls: WebFetchInput[];
}

function createWeb(
  respond: (input: WebFetchInput) => Promise<WebFetchResult>,
): FakeWeb {
  const calls: WebFetchInput[] = [];
  return {
    calls,
    async fetch(input) {
      calls.push(input);
      return respond(input);
    },
  };
}

function htmlPage(body: string = HTML_PAGE): WebFetchResult {
  return { status: 200, contentType: "text/html", body, finalUrl: PAGE_URL };
}

async function createProject(ctx: DbContext): Promise<string> {
  return (await createProjectRepository(ctx).create({ name: "Reports" })).id;
}

async function readyLink(
  ctx: DbContext,
  storage: FakeStorage,
): Promise<{ projectId: string; linkId: string; fileId: string }> {
  const projectId = await createProject(ctx);
  const link = await createProjectLinkImporter(
    ctx,
    createWeb(async () => htmlPage()),
    storage,
  ).add({ projectId, url: PAGE_URL });
  if (!link.snapshotFileId) {
    throw new Error("expected an HTML link to store a snapshot");
  }
  return { projectId, linkId: link.id, fileId: link.snapshotFileId };
}

describe("project link importer", () => {
  it("stores an HTML page as a project-owned text snapshot", () => withContext(async (ctx) => {
    const projectId = await createProject(ctx);
    const storage = createStorage();
    let statusDuringFetch = "";
    const web = createWeb(async () => {
      const inFlight = await createProjectLinkRepository(ctx).listByProject(projectId);
      statusDuringFetch = inFlight[0]?.status ?? "missing";
      return htmlPage();
    });
    const link = await createProjectLinkImporter(ctx, web, storage)
      .add({ projectId, url: PAGE_URL });

    expect(statusDuringFetch).toBe("fetching");

    expect(link).toMatchObject({
      projectId,
      url: PAGE_URL,
      title: "Harbour Bridge Inspection Report & Findings",
      mediaType: "text/html",
      status: "ready",
      error: null,
    });
    expect(link.fetchedAt).not.toBeNull();
    expect(link.snapshotFileId).not.toBeNull();

    const summary = storage.written.get(
      `projects/${projectId}/library/${link.snapshotFileId}.txt`,
    ) ?? "";
    expect(summary).toContain("Harbour Bridge Inspection Report & Findings");
    expect(summary).toContain("Annual inspection notes for the harbour bridge");
    expect(summary).toContain("passed its annual inspection");
    expect(summary).not.toContain("window.analytics");
    expect(summary).not.toContain("Enable JavaScript");

    const files = createFileRepository(ctx);
    const file = await files.get(link.snapshotFileId ?? "");
    expect(file).toMatchObject({
      projectId,
      sessionId: null,
      kind: "text",
      mime: "text/plain",
      size: summary.length,
    });

    const document = await createDocumentRepository(ctx).getByFile(file?.id ?? "");
    expect(document).toMatchObject({ status: "ready", pageCount: 1 });

    const hits = await createSearchRepository(ctx).chunks("harbour bridge", {
      projectId,
    });
    expect(hits.map((hit) => hit.fileId)).toContain(file?.id);
  }));

  it("keeps media links metadata-only", () => withContext(async (ctx) => {
    const projectId = await createProject(ctx);
    const storage = createStorage();
    const link = await createProjectLinkImporter(
      ctx,
      createWeb(async () => ({
        status: 200,
        contentType: "image/jpeg",
        body: "",
        finalUrl: "https://cdn.example.com/photos/bridge.jpg",
      })),
      storage,
    ).add({ projectId, url: "https://example.com/photos/bridge.jpg" });

    expect(link).toMatchObject({
      title: "cdn.example.com",
      mediaType: "image/jpeg",
      status: "ready",
      snapshotFileId: null,
      error: null,
    });
    expect(storage.written.size).toBe(0);
    expect(await createFileRepository(ctx).listByProject(projectId)).toEqual([]);
  }));

  it("records a failed fetch without throwing", () => withContext(async (ctx) => {
    const projectId = await createProject(ctx);
    const storage = createStorage();
    const link = await createProjectLinkImporter(
      ctx,
      createWeb(async () => {
        throw new AppError("unknown", "HTTP 404", {
          userMessage: "That site returned HTTP 404.",
        });
      }),
      storage,
    ).add({ projectId, url: PAGE_URL });

    expect(link).toMatchObject({
      status: "error",
      error: "That site returned HTTP 404.",
      snapshotFileId: null,
    });
    expect(storage.written.size).toBe(0);
    expect(await createFileRepository(ctx).listByProject(projectId)).toEqual([]);
  }));

  it("fails a page with no readable text", () => withContext(async (ctx) => {
    const projectId = await createProject(ctx);
    const storage = createStorage();
    const link = await createProjectLinkImporter(
      ctx,
      createWeb(async () => htmlPage(
        "<html><head><title>Menu</title></head><body><nav>Home</nav></body></html>",
      )),
      storage,
    ).add({ projectId, url: PAGE_URL });

    expect(link).toMatchObject({
      status: "error",
      error: "No readable text was found on that page.",
      snapshotFileId: null,
    });
    expect(storage.written.size).toBe(0);
    expect(await createFileRepository(ctx).listByProject(projectId)).toEqual([]);
  }));

  it("marks a cancelled fetch as an error", () => withContext(async (ctx) => {
    const projectId = await createProject(ctx);
    const storage = createStorage();
    const controller = new AbortController();
    const link = await createProjectLinkImporter(
      ctx,
      createWeb(async () => {
        controller.abort();
        return htmlPage();
      }),
      storage,
    ).add({ projectId, url: PAGE_URL, signal: controller.signal });

    expect(link).toMatchObject({
      status: "error",
      error: "Fetch cancelled.",
      snapshotFileId: null,
    });
    expect(storage.written.size).toBe(0);
  }));

  it("rejects a non-HTTP URL and an unknown project before storing", () => withContext(async (ctx) => {
    const projectId = await createProject(ctx);
    const storage = createStorage();
    const importer = createProjectLinkImporter(
      ctx,
      createWeb(async () => htmlPage()),
      storage,
    );

    await expect(importer.add({
      projectId,
      url: "javascript:alert(1)",
    })).rejects.toMatchObject({ code: "db_invalid" });
    await expect(importer.add({
      projectId: "missing",
      url: PAGE_URL,
    })).rejects.toMatchObject({ code: "db_not_found" });

    expect(await createProjectLinkRepository(ctx).listByProject(projectId)).toEqual([]);
    expect(storage.written.size).toBe(0);
  }));

  it("cascades the link and its snapshot when the project is deleted", () => withContext(async (ctx) => {
    const storage = createStorage();
    const seeded = await readyLink(ctx, storage);
    const files = createFileRepository(ctx);
    const documents = createDocumentRepository(ctx);
    const document = await documents.getByFile(seeded.fileId);

    await createProjectRepository(ctx).remove(seeded.projectId);

    expect(await createProjectLinkRepository(ctx).listByProject(seeded.projectId)).toEqual([]);
    expect(await files.get(seeded.fileId)).toBeNull();
    expect(await documents.get(document?.id ?? "")).toBeNull();
  }));
});
