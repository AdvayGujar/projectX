import { describe, expect, it } from "vitest";

import { detectFileKind } from "../kinds";

describe("file kind detection", () => {
  it("treats CSV and TSV as spreadsheets even when the picker says text/plain", () => {
    expect(detectFileKind("budget.csv", "text/plain")).toBe("xlsx");
    expect(detectFileKind("budget.tsv", "text/plain")).toBe("xlsx");
    expect(detectFileKind("notes.txt", "text/plain")).toBe("text");
  });

  it("uses the MIME type before the extension", () => {
    expect(detectFileKind("report.pdf", "application/pdf")).toBe("pdf");
    expect(
      detectFileKind(
        "deck.bin",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ),
    ).toBe("pptx");
  });
});
