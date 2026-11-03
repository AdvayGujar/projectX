import { describe, expect, it } from "vitest";

import { parseBlocks, parseInline } from "../parse";

describe("parseBlocks", () => {
  it("splits headings, paragraphs and blank lines", () => {
    const blocks = parseBlocks("# Title\n\nFirst line.\nSecond line.\n\nAnother.");
    expect(blocks).toEqual([
      { kind: "heading", level: 1, text: "Title" },
      { kind: "paragraph", text: "First line. Second line." },
      { kind: "paragraph", text: "Another." },
    ]);
  });

  it("keeps bullet and numbered lists separate", () => {
    const blocks = parseBlocks("- One\n- Two\n\n1. First\n2. Second");
    expect(blocks).toEqual([
      { kind: "list", ordered: false, items: ["One", "Two"] },
      { kind: "list", ordered: true, items: ["First", "Second"] },
    ]);
  });

  it("renders a fenced block, even while streaming", () => {
    expect(parseBlocks("```ts\nconst a = 1;\n```")).toEqual([
      { kind: "code", text: "const a = 1;" },
    ]);
    expect(parseBlocks("```ts\nconst a = 1;")).toEqual([
      { kind: "code", text: "const a = 1;" },
    ]);
  });

  it("handles quotes and nested-looking content", () => {
    expect(parseBlocks("> quoted\n> more")).toEqual([
      { kind: "quote", text: "quoted\nmore" },
    ]);
  });
});

describe("parseInline", () => {
  it("splits bold, italic, code and links", () => {
    expect(parseInline("a **b** c *d* `e` [f](https://x.y)")).toEqual([
      { kind: "text", text: "a " },
      { kind: "bold", text: "b" },
      { kind: "text", text: " c " },
      { kind: "italic", text: "d" },
      { kind: "text", text: " " },
      { kind: "code", text: "e" },
      { kind: "text", text: " " },
      { kind: "link", text: "f" },
    ]);
  });

  it("leaves plain text untouched", () => {
    expect(parseInline("nothing to parse")).toEqual([{ kind: "text", text: "nothing to parse" }]);
  });

  it("does not treat an unfinished marker as formatting", () => {
    expect(parseInline("a **b")).toEqual([{ kind: "text", text: "a **b" }]);
  });
});
