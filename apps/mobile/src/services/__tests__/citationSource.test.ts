import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../db/client", () => ({ getDbContext: jest.fn() }));

import { filterCitationChunks } from "../citationSource";

const chunks = [
  { page: 1, section: null, text: "first page" },
  { page: 2, section: null, text: "second page" },
  { page: null, section: "Risks", text: "risk section" },
];

describe("citation source", () => {
  it("selects the cited page", () => {
    expect(filterCitationChunks(chunks, { page: 2, section: null })).toBe("second page");
  });

  it("selects the cited section", () => {
    expect(filterCitationChunks(chunks, { page: null, section: "Risks" })).toBe(
      "risk section",
    );
  });

  it("returns nothing for a missing location", () => {
    expect(filterCitationChunks(chunks, { page: 9, section: null })).toBe("");
  });
});
