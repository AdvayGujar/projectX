import { describe, expect, it } from "vitest";

import { parseChunkRange, parseRange, rangesOverlap } from "../sheetRange";

describe("sheet ranges", () => {
  it("parses a rectangular range", () => {
    expect(parseRange("b1:D4")).toEqual({
      startColumn: 1,
      startRow: 0,
      endColumn: 3,
      endRow: 3,
    });
  });

  it("parses a single cell and rejects malformed input", () => {
    expect(parseRange("A1")).toEqual({
      startColumn: 0,
      startRow: 0,
      endColumn: 0,
      endRow: 0,
    });
    expect(parseRange("$A$1:$B$2")).toEqual({
      startColumn: 0,
      startRow: 0,
      endColumn: 1,
      endRow: 1,
    });
    expect(parseRange("1A")).toBeNull();
    expect(parseRange("A0")).toBeNull();
  });

  it("parses a chunk section and detects overlap", () => {
    const chunk = parseChunkRange("Budget!A1:C10");
    expect(chunk?.sheet).toBe("Budget");

    const range = parseRange("B8:D20");
    const outside = parseRange("D1:D2");
    expect(chunk && range ? rangesOverlap(chunk.range, range) : false).toBe(true);
    expect(chunk && outside ? rangesOverlap(chunk.range, outside) : true).toBe(false);
  });
});
