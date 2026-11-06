import { describe, expect, it } from "@jest/globals";

import { composeSystemPrompt, parseSelectionId, priceTurn } from "../turnMath";

describe("parseSelectionId", () => {
  it("splits on the first colon", () => {
    expect(parseSelectionId("provider-1:claude-sonnet-4-5")).toEqual({
      providerId: "provider-1",
      modelId: "claude-sonnet-4-5",
    });
  });

  it("keeps colons inside the model id", () => {
    expect(parseSelectionId("p:a:b")).toEqual({ providerId: "p", modelId: "a:b" });
  });

  it("rejects malformed ids", () => {
    expect(parseSelectionId("nocolon")).toBeNull();
    expect(parseSelectionId(":model")).toBeNull();
    expect(parseSelectionId("provider:")).toBeNull();
  });
});

describe("composeSystemPrompt", () => {
  it("wraps trimmed project instructions", () => {
    expect(composeSystemPrompt("  Keep answers short.  ")).toBe(
      "Project instructions:\nKeep answers short.",
    );
  });

  it("adds retrieved library text and the artifact catalog", () => {
    expect(
      composeSystemPrompt("Keep answers short.", "[File: brief.pdf]\nRevenue grew.", [
        { id: "a1", kind: "deck", title: "Q3 Review", currentVersion: 3 },
        { id: "a2", kind: "sheet", title: "Forecast", currentVersion: 1 },
      ]),
    ).toBe(
      [
        "Project instructions:\nKeep answers short.",
        "Project library:\n[File: brief.pdf]\nRevenue grew.",
        "Project artifacts:\n- Deck: Q3 Review (v3, id a1)\n- Sheet: Forecast (v1, id a2)",
      ].join("\n\n"),
    );
  });

  it("omits empty sections and returns nothing when everything is empty", () => {
    expect(composeSystemPrompt("", "   ", [])).toBe("");
    expect(composeSystemPrompt(null, "", [])).toBe("");
    expect(composeSystemPrompt(undefined, undefined, [])).toBe("");
    expect(
      composeSystemPrompt("  ", "[File: brief.pdf]\nRevenue grew.", []),
    ).toBe("Project library:\n[File: brief.pdf]\nRevenue grew.");
  });
});

describe("priceTurn", () => {
  const model = {
    label: "Claude Sonnet 4.5",
    pricing: { input: 3, output: 15 },
  };

  it("prices a turn from per-million rates", () => {
    const priced = priceTurn({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, model, "High");

    expect(priced.model).toBe("Claude Sonnet 4.5");
    expect(priced.effort).toBe("High");
    expect(priced.costUsd).toBeCloseTo(18);
  });

  it("returns null when the model has no pricing", () => {
    expect(
      priceTurn({ inputTokens: 10, outputTokens: 5 }, { label: "Beam Free" }, "Standard").costUsd,
    ).toBeNull();
  });

  it("prefers a cost reported by the provider", () => {
    const priced = priceTurn(
      { inputTokens: 10, outputTokens: 5, costUsd: 0.42 },
      model,
      "Low",
    );

    expect(priced.costUsd).toBeCloseTo(0.42);
  });

  it("defaults missing token counts to zero", () => {
    const priced = priceTurn({}, model, "Low");

    expect(priced.inputTokens).toBe(0);
    expect(priced.outputTokens).toBe(0);
    expect(priced.costUsd).toBe(0);
  });
});
