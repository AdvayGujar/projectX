import { describe, expect, it } from "vitest";

import type { CitationRef } from "../../types";
import {
  citationLocation,
  citedCitations,
  findCitationTokens,
  resolveCitation,
} from "../citations";

const pdfA: CitationRef = {
  fileId: "a",
  fileName: "alpha.pdf",
  fileKind: "pdf",
  page: 2,
  section: null,
};

const pdfB: CitationRef = {
  fileId: "b",
  fileName: "beta.pdf",
  fileKind: "pdf",
  page: 2,
  section: null,
};

const sheet: CitationRef = {
  fileId: "s",
  fileName: "budget.xlsx",
  fileKind: "xlsx",
  page: 1,
  section: "Q4 Budget!A1:C3",
};

describe("citation tokens", () => {
  it("finds pages, slides, and known sheet names", () => {
    const tokens = findCitationTokens(
      "Revenue grew (p.12), see Slide 4 and Q4 Budget!C2.",
      [sheet],
    );

    expect(tokens.map((token) => token.text)).toEqual([
      "p.12",
      "Slide 4",
      "Q4 Budget!C2",
    ]);
  });

  it("matches a multi-word sheet name only when it is known", () => {
    const tokens = findCitationTokens("See Q4 Budget!C2 for the tax.", [sheet]);

    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ kind: "sheet", sheet: "Q4 Budget", range: "C2" });
  });

  it("does not treat version or plain page words as citations", () => {
    expect(findCitationTokens("Version 2.4, page 4, and Step 2.")).toEqual([]);
  });
});

describe("citation resolution", () => {
  it("picks the file named nearest before the page reference", () => {
    const token = findCitationTokens("In beta.pdf, p.2")[0];
    if (!token) {
      throw new Error("missing token");
    }

    expect(resolveCitation(token, [pdfA, pdfB], "In beta.pdf, ")).toEqual(pdfB);
  });

  it("does not guess when several files match and none is named", () => {
    const token = findCitationTokens("p.2")[0];
    if (!token) {
      throw new Error("missing token");
    }

    expect(resolveCitation(token, [pdfA, pdfB], "")).toBeNull();
  });

  it("matches a cell inside a stored sheet range", () => {
    const token = findCitationTokens("Tax is in Q4 Budget!C2", [sheet])[0];
    if (!token) {
      throw new Error("missing token");
    }

    expect(resolveCitation(token, [sheet], "Tax is in Q4 Budget!")).toEqual(sheet);
  });

  it("lists only the references the answer actually made", () => {
    expect(citedCitations("Revenue grew (p.2).", [pdfA, { ...pdfA, page: 3 }])).toEqual([
      { citation: pdfA, label: "p.2" },
    ]);
  });

  it("keeps the model's chip label, including slide and sheet forms", () => {
    expect(
      citedCitations(
        "See Slide 1 and Q4 Budget!C2.",
        [
          { ...pdfA, fileKind: "pptx", fileName: "deck.pptx", page: 1 },
          sheet,
        ],
      ).map((item) => item.label),
    ).toEqual(["Slide 1", "Q4 Budget!C2"]);
  });
});

describe("citationLocation", () => {
  it("uses page, slide, or section labels", () => {
    expect(citationLocation(pdfA)).toBe("p.2");
    expect(
      citationLocation({ ...pdfA, fileKind: "pptx", page: 4 }),
    ).toBe("Slide 4");
    expect(citationLocation(sheet)).toBe("Q4 Budget!A1:C3");
  });
});
