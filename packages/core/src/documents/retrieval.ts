import { createArtifactRepository, createSearchRepository } from "../db";
import type {
  ArtifactSummary,
  ContextChunk,
  ContextScope,
  DbContext,
  SearchRepository,
} from "../db";

export type { ArtifactSummary } from "../db";

const CHARACTERS_PER_TOKEN = 4;
const BLOCK_SEPARATOR = "\n\n";
const RETRIEVAL_HIT_LIMIT = 10;
const ARTIFACT_LIMIT = 20;

export interface ProjectContextRequest {
  readonly projectId: string;
  readonly sessionId: string;
  readonly query: string;
  readonly maxTokens: number;
}

export interface ProjectContext {
  readonly text: string;
  readonly artifacts: readonly ArtifactSummary[];
}

export interface ProjectContextRetriever {
  retrieve(input: ProjectContextRequest): Promise<ProjectContext>;
}

/**
 * Builds the document portion of a project chat's context: the project library plus the
 * current chat's own files. Small libraries are included whole; larger ones fall back to
 * FTS hits with their neighbouring chunks. The artifact catalog is metadata only.
 */
export function createProjectContextRetriever(ctx: DbContext): ProjectContextRetriever {
  const search = createSearchRepository(ctx);
  const catalog = createArtifactRepository(ctx);

  return {
    async retrieve(input: ProjectContextRequest): Promise<ProjectContext> {
      const [chunks, artifacts] = await Promise.all([
        selectChunks(search, input),
        catalog.listSummaries(
          { projectId: input.projectId, sessionId: input.sessionId },
          ARTIFACT_LIMIT,
        ),
      ]);
      return { text: fitChunks(chunks, input.maxTokens), artifacts };
    },
  };
}

async function selectChunks(
  search: SearchRepository,
  request: ProjectContextRequest,
): Promise<ContextChunk[]> {
  const scope: ContextScope = {
    projectId: request.projectId,
    sessionId: request.sessionId,
  };
  const totals = await search.contextTotals(scope);
  if (totals.chunkCount === 0) {
    return [];
  }
  if (totals.tokenTotal <= request.maxTokens) {
    return search.listContextChunks(scope);
  }
  return searchRelevantChunks(search, scope, request.query);
}

async function searchRelevantChunks(
  search: SearchRepository,
  scope: ContextScope,
  query: string,
): Promise<ContextChunk[]> {
  const hits = await search.contextChunks(query, { ...scope, limit: RETRIEVAL_HIT_LIMIT });
  const chunks: ContextChunk[] = [];
  const seen = new Set<string>();

  for (const hit of hits) {
    const neighbours = await search.contextNeighbors(hit.documentId, hit.ordinal);
    appendUnique(chunks, seen, neighbours);
    appendUnique(chunks, seen, [hit]);
  }

  return chunks;
}

function appendUnique(
  target: ContextChunk[],
  seen: Set<string>,
  chunks: readonly ContextChunk[],
): void {
  for (const chunk of chunks) {
    if (seen.has(chunk.chunkId)) {
      continue;
    }
    seen.add(chunk.chunkId);
    target.push(chunk);
  }
}

/** Fits formatted chunks into the token budget, truncating only the last one to fit. */
function fitChunks(chunks: readonly ContextChunk[], maxTokens: number): string {
  const budget = Math.max(0, Math.floor(maxTokens)) * CHARACTERS_PER_TOKEN;
  const blocks: string[] = [];
  let used = 0;

  for (const chunk of chunks) {
    const separator = blocks.length === 0 ? "" : BLOCK_SEPARATOR;
    const block = formatChunk(chunk);
    const available = budget - used - separator.length;
    if (available <= 0) {
      break;
    }
    if (block.length <= available) {
      blocks.push(block);
      used += separator.length + block.length;
      continue;
    }
    const truncated = truncateChunk(chunk, available);
    if (truncated !== null) {
      blocks.push(truncated);
      used += separator.length + truncated.length;
    }
    break;
  }

  return blocks.join(BLOCK_SEPARATOR);
}

function formatChunk(chunk: ContextChunk): string {
  return `${formatHeader(chunk)}${BLOCK_SEPARATOR}${chunk.text}`;
}

function formatHeader(chunk: ContextChunk): string {
  const location = chunkLocation(chunk);
  return `[File: ${chunk.fileName}${location ? `, ${location}` : ""}]`;
}

/** Page for PDFs, slide for decks, sheet range for spreadsheets, section otherwise. */
export function chunkLocation(chunk: Pick<ContextChunk, "fileKind" | "page" | "section">): string {
  if (chunk.fileKind === "xlsx") {
    return chunk.section ?? "";
  }
  if (chunk.page === null) {
    return chunk.section ?? "";
  }
  if (chunk.fileKind === "pptx") {
    return `Slide ${chunk.page}`;
  }
  return `p.${chunk.page}`;
}

function truncateChunk(chunk: ContextChunk, available: number): string | null {
  const header = formatHeader(chunk);
  const room = available - header.length - BLOCK_SEPARATOR.length;
  if (room <= 0) {
    return null;
  }
  const text = chunk.text.slice(0, room).trimEnd();
  return text.length === 0 ? null : `${header}${BLOCK_SEPARATOR}${text}`;
}


