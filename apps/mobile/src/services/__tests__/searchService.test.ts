import { describe, expect, it, jest } from "@jest/globals";
import type { ChunkSearchHit, MessageSearchHit } from "@projectx/core";

import { groupSearchHits, searchWorkspace } from "../searchService";

jest.mock("../../db/client", () => ({ getDbContext: async () => ({}) }));

function messageHit(overrides: Partial<MessageSearchHit> = {}): MessageSearchHit {
  return {
    partId: "part-1",
    messageId: "message-1",
    sessionId: "session-1",
    sessionTitle: "Quarterly plan",
    projectId: null,
    projectName: null,
    snippet: "the [budget] plan",
    rank: -1,
    ...overrides,
  };
}

function chunkHit(overrides: Partial<ChunkSearchHit> = {}): ChunkSearchHit {
  return {
    chunkId: "chunk-1",
    documentId: "document-1",
    fileId: "file-1",
    fileName: "report.pdf",
    projectId: null,
    projectName: null,
    sourceUrl: null,
    sourceTitle: null,
    page: null,
    section: null,
    snippet: "the [budget] plan",
    rank: -1,
    ...overrides,
  };
}

describe("groupSearchHits", () => {
  it("groups messages by session and keeps relevance order", () => {
    const groups = groupSearchHits(
      [
        messageHit({ partId: "part-1", messageId: "message-1" }),
        messageHit({
          partId: "part-2",
          messageId: "message-2",
          sessionId: "session-2",
          sessionTitle: "Notes",
          projectId: "project-1",
          projectName: "Alpha",
        }),
        messageHit({
          partId: "part-3",
          messageId: "message-3",
          sessionId: "session-1",
          snippet: "the [budget] again",
        }),
      ],
      [],
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      key: "session:session-1",
      title: "Quarterly plan",
      subtitle: "Chat",
    });
    expect(groups[0]?.items.map((item) => item.key)).toEqual([
      "message:part-1",
      "message:part-3",
    ]);
    expect(groups[1]).toMatchObject({
      key: "session:session-2",
      title: "Notes",
      subtitle: "Alpha",
    });
    expect(groups[0]?.items[0]).toMatchObject({
      kind: "message",
      sessionId: "session-1",
      messageId: "message-1",
      meta: "",
    });
  });

  it("groups chunks by file and labels the page or summary", () => {
    const groups = groupSearchHits(
      [],
      [
        chunkHit({
          chunkId: "chunk-1",
          page: 3,
          sourceTitle: "Bridge report",
          projectId: "project-1",
          projectName: "Alpha",
        }),
        chunkHit({ chunkId: "chunk-2", page: null, sourceTitle: "Bridge report" }),
        chunkHit({
          chunkId: "chunk-3",
          fileId: "file-2",
          fileName: "notes.txt",
          snippet: "[notes] on the bridge",
        }),
      ],
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      key: "file:file-1",
      title: "Bridge report",
      subtitle: "Alpha",
    });
    expect(groups[0]?.items.map((item) => item.meta)).toEqual(["p.3", "Summary"]);
    expect(groups[1]).toMatchObject({
      key: "file:file-2",
      title: "notes.txt",
      subtitle: "File",
    });
    expect(groups[1]?.items[0]).toMatchObject({
      kind: "chunk",
      fileId: "file-2",
      sourceUrl: undefined,
    });
  });

  it("interleaves chat and document groups so neither starves the other", () => {
    const messages = Array.from({ length: 12 }, (_, index) =>
      messageHit({
        partId: `part-${index}`,
        messageId: `message-${index}`,
        sessionId: `session-${index}`,
        sessionTitle: `Chat ${index}`,
      }),
    );

    const groups = groupSearchHits(messages, [chunkHit()]);

    expect(groups).toHaveLength(8);
    expect(groups[0]?.key).toBe("session:session-0");
    expect(groups[1]?.key).toBe("file:file-1");
  });

  it("keeps a link summary's source URL on the item", () => {
    const groups = groupSearchHits(
      [],
      [
        chunkHit({
          sourceUrl: "https://example.com/reports/bridge",
          sourceTitle: "Bridge report",
        }),
      ],
    );

    expect(groups[0]?.items[0]?.sourceUrl).toBe("https://example.com/reports/bridge");
  });

  it("caps the number of groups and snippets per group", () => {
    const manySessions = Array.from({ length: 10 }, (_, index) =>
      messageHit({
        partId: `part-${index}`,
        messageId: `message-${index}`,
        sessionId: `session-${index}`,
        sessionTitle: `Chat ${index}`,
      }),
    );
    const manyParts = Array.from({ length: 10 }, (_, index) =>
      messageHit({
        partId: `same-part-${index}`,
        messageId: `same-message-${index}`,
        sessionId: "session-same",
        sessionTitle: "Busy chat",
      }),
    );

    expect(groupSearchHits(manySessions, [])).toHaveLength(8);
    expect(groupSearchHits(manyParts, [])[0]?.items).toHaveLength(4);
  });

  it("returns no groups when nothing matched", () => {
    expect(groupSearchHits([], [])).toEqual([]);
  });
});

describe("searchWorkspace", () => {
  it("returns no groups for an empty or punctuation-only query", async () => {
    await expect(searchWorkspace("")).resolves.toEqual([]);
    await expect(searchWorkspace(" …?! ")).resolves.toEqual([]);
  });
});
