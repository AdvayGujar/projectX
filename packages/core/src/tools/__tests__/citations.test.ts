import { describe, expect, it } from "vitest";

import { citationsFromChunks, mergeCitations } from "../index";
import type { CitationRef } from "../types";

const page: CitationRef = {
  fileId: "file-1",
  fileName: "report.pdf",
  fileKind: "pdf",
  page: 2,
  section: null,
};

describe("tool citations", () => {
  it("drops a page/section read twice", () => {
    expect(mergeCitations([page], [page, { ...page, page: 3 }])).toEqual([
      page,
      { ...page, page: 3 },
    ]);
  });

  it("builds citations from context chunks without duplicates", () => {
    const citations = citationsFromChunks([
      {
        chunkId: "c1",
        documentId: "d1",
        fileId: "file-1",
        fileName: "report.pdf",
        fileKind: "pdf",
        ordinal: 1,
        page: 2,
        section: null,
        text: "one",
        tokenEstimate: 1,
      },
      {
        chunkId: "c2",
        documentId: "d1",
        fileId: "file-1",
        fileName: "report.pdf",
        fileKind: "pdf",
        ordinal: 2,
        page: 2,
        section: null,
        text: "two",
        tokenEstimate: 1,
      },
    ]);

    expect(citations).toEqual([page]);
  });
});
