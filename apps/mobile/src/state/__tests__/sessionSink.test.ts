import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../sessionsStore", () => ({
  useSessionsStore: { getState: () => ({ refresh: jest.fn(async () => undefined) }) },
}));

import { createSessionStoreSink } from "../sessionSink";
import { useSessionStore } from "../sessionStore";

const store = () => useSessionStore.getState();
const sink = createSessionStoreSink();

beforeEach(() => {
  store().beginSession("session-1", "Title", []);
});

describe("session sink", () => {
  it("marks the session as streaming when a turn starts", () => {
    sink.onUserTurn("user-1", "hello");

    expect(store().streaming).toBe(true);
    expect(store().turns).toEqual([{ id: "user-1", role: "user", text: "hello" }]);
  });

  it("keeps attachment names on the user turn", () => {
    sink.onUserTurn("user-1", "look", [
      { index: 0, name: "photo.png", mimeType: "image/png", kind: "image" },
    ]);

    expect(store().turns[0]?.attachments).toEqual([
      { index: 0, name: "photo.png", mimeType: "image/png", kind: "image" },
    ]);
  });

  it("clears streaming when the turn settles", () => {
    sink.onUserTurn("user-1", "hello");
    sink.onSettled();

    expect(store().streaming).toBe(false);
  });

  it("keeps a multi-step turn on one row and adopts the final message id", () => {
    sink.onUserTurn("user-1", "read the report");
    sink.onAssistantStart("assistant-1", true, 1);
    sink.onToolActivity("assistant-1", {
      kind: "read",
      tool: "read_document",
      detail: "report.pdf · 2 pages",
    });
    sink.onAssistantStart("assistant-2", true, 2);
    sink.onText("assistant-2", "The report grew.");
    sink.onUsage("assistant-1", {
      model: "Model",
      effort: "High",
      inputTokens: 10,
      outputTokens: 2,
      costUsd: 0.01,
    });
    sink.onUsage("assistant-2", {
      model: "Model",
      effort: "High",
      inputTokens: 20,
      outputTokens: 4,
      costUsd: 0.02,
    });
    sink.onTurnFinished("assistant-2");

    const assistant = store().turns.find((turn) => turn.role === "assistant");
    expect(store().turns).toHaveLength(2);
    expect(assistant?.id).toBe("assistant-2");
    expect(assistant?.text).toBe("The report grew.");
    expect(assistant?.activity).toHaveLength(1);
    expect(assistant?.cost?.tokens).toBe("30 in / 6 out");
    expect(assistant?.cost?.usd).toBe("$0.0300");
  });
});
