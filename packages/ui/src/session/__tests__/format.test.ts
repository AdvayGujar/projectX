import { describe, expect, it } from "vitest";

import type { ViewTurn } from "../../types";
import { costLine, streamingLabel, summarise } from "../format";

const base: ViewTurn = { id: "t1", role: "assistant", text: "hi" };

describe("summarise", () => {
  it("is just Thought with no activity", () => {
    expect(summarise(base)).toBe("Thought");
  });

  it("counts tools and documents read", () => {
    expect(
      summarise({
        ...base,
        activity: [
          { kind: "read", tool: "read_document", detail: "a.pdf" },
          { kind: "read", tool: "read_document", detail: "b.pdf" },
          { kind: "wrote", tool: "create_presentation", detail: "6 slides" },
        ],
      }),
    ).toBe("Thought · 3 tools · 2 documents read");
  });

  it("uses singular labels", () => {
    expect(
      summarise({ ...base, activity: [{ kind: "read", tool: "read_document", detail: "a.pdf" }] }),
    ).toBe("Thought · 1 tool · 1 document read");
  });
});

describe("costLine", () => {
  it("joins every present part", () => {
    expect(
      costLine({ model: "Beam Free", effort: "High", tokens: "10 in / 5 out", usd: "$0.0001" }),
    ).toBe("Beam Free · High · 10 in / 5 out · $0.0001");
  });

  it("omits effort and usd when unknown", () => {
    expect(costLine({ model: "Beam Free", tokens: "10 in / 5 out" })).toBe(
      "Beam Free · 10 in / 5 out",
    );
  });
});

describe("streamingLabel", () => {
  it("says Thinking when reasoning was requested", () => {
    expect(streamingLabel(true)).toBe("Thinking…");
    expect(streamingLabel(undefined)).toBe("Thinking…");
  });

  it("says Generating when Think is off", () => {
    expect(streamingLabel(false)).toBe("Generating…");
  });
});
