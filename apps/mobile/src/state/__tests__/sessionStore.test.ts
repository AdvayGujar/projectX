import { beforeEach, describe, expect, it } from "@jest/globals";

import { useSessionStore } from "../sessionStore";

const store = () => useSessionStore.getState();

beforeEach(() => {
  store().beginSession("session-1", "Title", []);
});

describe("session store", () => {
  it("adds and updates turns immutably", () => {
    store().addTurn({ id: "a", role: "assistant", text: "", status: "streaming" });
    store().appendText("a", "Hel");
    store().appendText("a", "lo");
    store().appendReasoning("a", "why");

    expect(store().turns).toEqual([
      { id: "a", role: "assistant", text: "Hello", status: "streaming", reasoning: "why" },
    ]);
  });

  it("marks streaming turns as done on settle", () => {
    store().addTurn({ id: "a", role: "assistant", text: "", status: "streaming" });
    store().settleStreaming();

    expect(store().turns[0]?.status).toBe("done");
  });

  it("accumulates tokens and cost", () => {
    store().addUsage({ inputTokens: 10, outputTokens: 5, costUsd: 0.002 });
    store().addUsage({ inputTokens: 1, outputTokens: 2, costUsd: 0.001 });

    expect(store().usage.inputTokens).toBe(11);
    expect(store().usage.outputTokens).toBe(7);
    expect(store().usage.costUsd).toBeCloseTo(0.003);
    expect(store().usage.costComplete).toBe(true);
  });

  it("keeps the total incomplete when a turn has no price", () => {
    store().addUsage({ inputTokens: 10, outputTokens: 5, costUsd: 0.002 });
    store().addUsage({ inputTokens: 3, outputTokens: 1, costUsd: null });

    expect(store().usage.inputTokens).toBe(13);
    expect(store().usage.costComplete).toBe(false);
  });

  it("clears everything when a new session begins", () => {
    store().addTurn({ id: "a", role: "assistant", text: "x" });
    store().addUsage({ inputTokens: 10, outputTokens: 5, costUsd: 0.002 });
    store().beginSession("session-2", "Other", []);

    expect(store().activeSessionId).toBe("session-2");
    expect(store().turns).toEqual([]);
    expect(store().usage.inputTokens).toBe(0);
  });
});
