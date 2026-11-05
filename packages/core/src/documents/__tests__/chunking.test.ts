import { describe, expect, it } from "vitest";

import { chunkPages } from "../index";
import pdfPages from "./fixtures/pdf-pages.json";

function numberOfWords(count: number): string {
  return Array.from({ length: count }, (_, index) => `word${index + 1}`).join(" ");
}

function overlapLength(first: readonly string[], second: readonly string[]): number {
  const limit = Math.min(first.length, second.length);
  for (let size = limit; size > 0; size -= 1) {
    const suffix = first.slice(first.length - size).join(" ");
    const prefix = second.slice(0, size).join(" ");
    if (suffix === prefix) {
      return size;
    }
  }
  return 0;
}

describe("chunkPages", () => {
  it("keeps a short page as one chunk", () => {
    const text = "A short page with a few words about the quarterly review.";
    const chunks = chunkPages([{ page: 4, text }]);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ ordinal: 1, page: 4, section: null });
    expect(chunks[0]?.tokenEstimate).toBe(Math.ceil(text.length / 4));
  });

  it("splits a long page into chunks between 800 and 1200 tokens", () => {
    const chunks = chunkPages([{ page: 1, text: numberOfWords(2500) }]);

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.map((chunk) => chunk.ordinal)).toEqual(
      chunks.map((_, index) => index + 1),
    );
    for (const chunk of chunks) {
      expect(chunk.page).toBe(1);
      expect(chunk.tokenEstimate).toBeLessThanOrEqual(1200);
    }
    for (const chunk of chunks.slice(0, -1)) {
      expect(chunk.tokenEstimate).toBeGreaterThanOrEqual(800);
    }
  });

  it("overlaps neighbouring chunks with trailing words", () => {
    const chunks = chunkPages([{ page: 1, text: numberOfWords(2500) }]);
    const first = chunks[0]?.text.split(" ") ?? [];
    const second = chunks[1]?.text.split(" ") ?? [];

    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBeGreaterThan(0);
    expect(overlapLength(first, second)).toBeGreaterThan(0);
  });

  it("never combines text from different pages", () => {
    const chunks = chunkPages(pdfPages);
    const byPage = new Map(chunks.map((chunk) => [chunk.page, chunk.text]));

    expect(chunks).toHaveLength(3);
    expect([...byPage.keys()]).toEqual([1, 2, 3]);
    expect(byPage.get(1)).toContain("Northwind");
    expect(byPage.get(1)).not.toContain("photovoltaic");
    expect(byPage.get(2)).toContain("photovoltaic");
    expect(byPage.get(2)).not.toContain("apprenticeship");
    expect(byPage.get(3)).toContain("apprenticeship");
    expect(byPage.get(3)).not.toContain("Northwind");
  });

  it("produces no chunks for empty or whitespace-only pages", () => {
    expect(chunkPages([])).toEqual([]);
    expect(chunkPages([{ page: 1, text: "   \n\t " }])).toEqual([]);

    const chunks = chunkPages([
      { page: 1, text: "" },
      { page: 2, text: "Only the second page has text." },
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ ordinal: 1, page: 2 });
  });

  it("is deterministic for the same pages and options", () => {
    const pages = [...pdfPages, { page: 4, text: numberOfWords(600) }];
    const options = {
      targetTokens: 120,
      minTokens: 90,
      maxTokens: 150,
      overlapRatio: 0.2,
    };

    expect(chunkPages(pages, options)).toEqual(chunkPages(pages, options));
  });

  it("splits a single oversized word by characters instead of cutting the page", () => {
    const text = "x".repeat(10_000);
    const chunks = chunkPages([{ page: 1, text }]);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.tokenEstimate).toBeLessThanOrEqual(1200);
    }
    expect(chunks.map((chunk) => chunk.text).join("")).toBe(text);
  });
});
