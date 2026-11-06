import type { ChunkSearchHit, MessageSearchHit } from "@projectx/core";
import { createSearchRepository, toFtsQuery } from "@projectx/core";
import type { DrawerSearchGroup, DrawerSearchItem } from "@projectx/ui";

import { getDbContext } from "../db/client";

const SEARCH_LIMIT = 20;
const MAX_GROUPS = 8;
const MAX_ITEMS_PER_GROUP = 4;

/** Messages and document chunks, grouped for the drawer's result list. */
export async function searchWorkspace(query: string): Promise<readonly DrawerSearchGroup[]> {
  if (!toFtsQuery(query)) {
    return [];
  }
  const context = await getDbContext();
  const search = createSearchRepository(context);
  const [messages, chunks] = await Promise.all([
    search.messages(query, { limit: SEARCH_LIMIT }),
    search.chunks(query, { limit: SEARCH_LIMIT }),
  ]);
  return groupSearchHits(messages, chunks);
}

interface GroupHeader {
  readonly key: string;
  readonly title: string;
  readonly subtitle: string;
}

interface GroupDraft extends GroupHeader {
  readonly items: DrawerSearchItem[];
}

/** Pure grouping so the drawer's shape can be tested without a database. */
export function groupSearchHits(
  messages: readonly MessageSearchHit[],
  chunks: readonly ChunkSearchHit[],
): readonly DrawerSearchGroup[] {
  const drafts: GroupDraft[] = [];
  const hitCount = Math.max(messages.length, chunks.length);

  // Interleave the two hit lists so a page of chat matches cannot starve document results.
  for (let index = 0; index < hitCount; index += 1) {
    const message = messages[index];
    if (message) {
      appendHit(drafts, sessionHeader(message), messageItem(message));
    }
    const chunk = chunks[index];
    if (chunk) {
      appendHit(drafts, fileHeader(chunk), chunkItem(chunk));
    }
  }

  return drafts.slice(0, MAX_GROUPS).map((draft) => ({ ...draft, items: [...draft.items] }));
}

function sessionHeader(hit: MessageSearchHit): GroupHeader {
  return {
    key: `session:${hit.sessionId}`,
    title: hit.sessionTitle,
    subtitle: hit.projectName ?? "Chat",
  };
}

function fileHeader(hit: ChunkSearchHit): GroupHeader {
  return {
    key: `file:${hit.fileId}`,
    title: hit.sourceTitle ?? hit.fileName,
    subtitle: hit.projectName ?? "File",
  };
}

function appendHit(groups: GroupDraft[], header: GroupHeader, item: DrawerSearchItem): void {
  const existing = groups.find((group) => group.key === header.key);
  if (existing) {
    if (existing.items.length < MAX_ITEMS_PER_GROUP) {
      existing.items.push(item);
    }
    return;
  }
  if (groups.length >= MAX_GROUPS) {
    return;
  }
  groups.push({ ...header, items: [item] });
}

function messageItem(hit: MessageSearchHit): DrawerSearchItem {
  return {
    key: `message:${hit.partId}`,
    kind: "message",
    snippet: hit.snippet,
    meta: "",
    sessionId: hit.sessionId,
    messageId: hit.messageId,
  };
}

function chunkItem(hit: ChunkSearchHit): DrawerSearchItem {
  return {
    key: `chunk:${hit.chunkId}`,
    kind: "chunk",
    snippet: hit.snippet,
    meta: hit.page === null ? "Summary" : `p.${hit.page}`,
    fileId: hit.fileId,
    sourceUrl: hit.sourceUrl ?? undefined,
  };
}
