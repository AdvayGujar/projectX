import { AppError } from "../errors";
import {
  createChunkRepository,
  createDocumentRepository,
  createFileRepository,
  createProjectLinkRepository,
  createProjectRepository,
} from "../db";
import type {
  ChunkRepository,
  DbContext,
  DocumentRepository,
  FileRepository,
  ProjectLink,
  ProjectLinkRepository,
  ProjectRepository,
} from "../db";
import type { FileStoragePort, WebFetchPort, WebFetchResult } from "../ports";
import { chunkPages } from "./chunking";
import { buildSummary, extractPage } from "./linkSummary";
import { projectFileRelativePath, safeDisplayName } from "./paths";

const CANCELLED_MESSAGE = "Fetch cancelled.";
const NO_TEXT_MESSAGE = "No readable text was found on that page.";
const DEFAULT_FAILURE_MESSAGE = "Could not read that link.";
const SUMMARY_MIME = "text/plain";

const HTTP_URL = /^https?:\/\/\S+$/i;
const HOST = /^https?:\/\/(?:[^@/?#]+@)?([^/?#]+)/i;

export interface AddProjectLinkRequest {
  readonly projectId: string;
  readonly url: string;
  readonly signal?: AbortSignal;
}

export interface ProjectLinkImporter {
  /** Stores the link, fetches it, and indexes a bounded summary. Never throws for a fetch. */
  add(input: AddProjectLinkRequest): Promise<ProjectLink>;
}

interface SummaryDeps {
  readonly ctx: DbContext;
  readonly files: FileRepository;
  readonly documents: DocumentRepository;
  readonly chunks: ChunkRepository;
  readonly links: ProjectLinkRepository;
  readonly storage: FileStoragePort;
}

/**
 * A link is a library item: the URL is stored immediately, then fetched once. HTML becomes a
 * project-owned text snapshot so search and retrieval see a normal document; media links stay
 * metadata-only because there is nothing to read without transcription.
 */
export function createProjectLinkImporter(
  ctx: DbContext,
  web: WebFetchPort,
  storage: FileStoragePort,
): ProjectLinkImporter {
  const projects = createProjectRepository(ctx);
  const deps: SummaryDeps = {
    ctx,
    files: createFileRepository(ctx),
    documents: createDocumentRepository(ctx),
    chunks: createChunkRepository(ctx),
    links: createProjectLinkRepository(ctx),
    storage,
  };

  return {
    async add(input: AddProjectLinkRequest): Promise<ProjectLink> {
      const url = parseLinkUrl(input.url);
      await requireProject(projects, input.projectId);

      const created = await deps.links.add({
        projectId: input.projectId,
        url,
        title: titleFromUrl(url),
      });
      const fetching = await deps.links.update(created.id, { status: "fetching", error: null });

      try {
        throwIfAborted(input.signal);
        const page = await web.fetch({ url, signal: input.signal });
        throwIfAborted(input.signal);
        return isTextual(page.contentType)
          ? await saveSummary(deps, fetching, page, url)
          : await markMediaReady(deps, fetching, page);
      } catch (error) {
        return markFailed(deps.links, fetching.id, error, input.signal);
      }
    },
  };
}

async function saveSummary(
  deps: SummaryDeps,
  link: ProjectLink,
  page: WebFetchResult,
  originalUrl: string,
): Promise<ProjectLink> {
  const extracted = extractPage(page.body, titleFromUrl(originalUrl));
  if (!extracted.text) {
    throw new AppError("unknown", "No readable text in the fetched page", {
      userMessage: NO_TEXT_MESSAGE,
    });
  }

  const summary = buildSummary(extracted);
  const fileId = deps.ctx.ids();
  const name = summaryFileName(extracted.title);
  const relativePath = projectFileRelativePath(link.projectId, fileId, name, SUMMARY_MIME);

  try {
    const written = await deps.storage.writeText(relativePath, summary);
    const stored = await deps.files.addWithDocument({
      id: fileId,
      projectId: link.projectId,
      name,
      mime: SUMMARY_MIME,
      size: written.size,
      path: relativePath,
      kind: "text",
    });
    await indexSnapshot(deps, stored.document.id, summary);
    return await deps.links.update(link.id, {
      title: extracted.title,
      mediaType: page.contentType ?? "text/html",
      snapshotFileId: fileId,
      status: "ready",
      fetchedAt: deps.ctx.now(),
      error: null,
    });
  } catch (error) {
    await discardSnapshot(deps, fileId, relativePath, error);
    throw error;
  }
}

async function indexSnapshot(
  deps: SummaryDeps,
  documentId: string,
  summary: string,
): Promise<void> {
  const drafts = chunkPages([{ page: 1, text: summary }]);
  await deps.chunks.replaceForDocument(documentId, drafts);
  await deps.documents.update(documentId, {
    status: "ready",
    pageCount: 1,
    error: null,
    extractedAt: deps.ctx.now(),
  });
}

async function markMediaReady(
  deps: SummaryDeps,
  link: ProjectLink,
  page: WebFetchResult,
): Promise<ProjectLink> {
  return deps.links.update(link.id, {
    title: titleFromUrl(page.finalUrl || link.url),
    mediaType: page.contentType,
    status: "ready",
    fetchedAt: deps.ctx.now(),
    error: null,
  });
}

async function markFailed(
  links: ProjectLinkRepository,
  linkId: string,
  error: unknown,
  signal: AbortSignal | undefined,
): Promise<ProjectLink> {
  return links.update(linkId, {
    status: "error",
    error: failureMessage(error, signal),
    fetchedAt: null,
  });
}

function failureMessage(error: unknown, signal: AbortSignal | undefined): string {
  if (isCancellation(error, signal)) {
    return CANCELLED_MESSAGE;
  }
  return error instanceof AppError ? error.userMessage : DEFAULT_FAILURE_MESSAGE;
}

/** A snapshot row cascades its document and chunks; the bytes are removed separately. */
async function discardSnapshot(
  deps: SummaryDeps,
  fileId: string,
  relativePath: string,
  primary: unknown,
): Promise<void> {
  const failures: unknown[] = [];
  try {
    await deps.files.remove(fileId);
  } catch (error) {
    failures.push(error);
  }
  try {
    await deps.storage.remove(relativePath);
  } catch (error) {
    failures.push(error);
  }
  if (failures.length > 0) {
    throw new AppError("unknown", "Could not clean up the link snapshot", {
      cause: { primary, failures },
      userMessage: "The link summary could not be saved.",
    });
  }
}

function summaryFileName(title: string): string {
  const base = safeDisplayName(title).replace(/\.txt$/i, "");
  return `${base || "Link summary"}.txt`;
}

function parseLinkUrl(value: string): string {
  const trimmed = value.trim();
  if (!HTTP_URL.test(trimmed) || !HOST.test(trimmed)) {
    throw new AppError("db_invalid", `Not an HTTP(S) link: ${trimmed}`, {
      userMessage: "Enter a web address that starts with http:// or https://.",
    });
  }
  return trimmed;
}

function titleFromUrl(url: string): string {
  const host = HOST.exec(url)?.[1] ?? "";
  const withoutPort = host.replace(/:\d+$/u, "").replace(/^www\./iu, "");
  return withoutPort || "Web link";
}

function isTextual(contentType: string | null): boolean {
  if (contentType === null) {
    return true;
  }
  const base = contentType.trim().toLowerCase();
  return (
    base.startsWith("text/") ||
    base === "application/xhtml+xml" ||
    base === "application/xml" ||
    base === "application/json" ||
    base.endsWith("+xml") ||
    base.endsWith("+json")
  );
}

async function requireProject(
  projects: ProjectRepository,
  projectId: string,
): Promise<void> {
  if (!(await projects.get(projectId))) {
    throw new AppError("db_not_found", `Project ${projectId} not found`, {
      userMessage: "That project no longer exists.",
    });
  }
}

function isCancellation(error: unknown, signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true || (error instanceof AppError && error.code === "cancelled");
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new AppError("cancelled", "Link fetch cancelled", {
      userMessage: CANCELLED_MESSAGE,
    });
  }
}
