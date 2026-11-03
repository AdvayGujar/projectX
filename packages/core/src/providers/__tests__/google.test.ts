import { describe, expect, it } from "vitest";

import { createGoogleAdapter } from "../google";
import { toGoogleContents } from "../googleMessages";
import { knownModels } from "../registry";
import type { FetchInit, FetchLike, ModelInfo } from "../types";
import { collect, data, requestFor, runtimeFor, sseResponse } from "./helpers";

function fixtureModel(id = "gemini-4-argon"): ModelInfo {
  const model = knownModels("google").find((item) => item.id === id);
  if (!model) {
    throw new Error("missing google fixture model");
  }
  return model;
}

describe("google contents conversion", () => {
  it("turns tool calls and results into model and user parts", () => {
    const result = toGoogleContents("System", [
      { role: "user", parts: [{ type: "text", text: "Read it" }] },
      {
        role: "assistant",
        parts: [
          { type: "text", text: "Reading" },
          { type: "tool_call", id: "call_1", name: "read_document", arguments: { page: 1 } },
        ],
      },
      {
        role: "tool",
        parts: [{ type: "tool_result", toolCallId: "call_1", name: "read_document", content: "page one" }],
      },
    ]);

    expect(result.systemInstruction?.parts[0]?.text).toBe("System");
    expect(result.contents.map((content) => content.role)).toEqual(["user", "model", "user"]);
    expect(result.contents[1]?.parts[1]).toEqual({
      functionCall: { name: "read_document", args: { page: 1 } },
    });
    expect(result.contents[2]?.parts[0]).toMatchObject({
      functionResponse: { name: "read_document", response: { content: "page one" } },
    });
  });
});

describe("google adapter", () => {
  it("streams text, usage, and stop reason", async () => {
    const fetchImpl: FetchLike = async () => sseResponse([
      data({
        candidates: [{ content: { parts: [{ text: "Hello" }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2, cachedContentTokenCount: 1 },
      }),
    ]);
    const events = await collect(
      createGoogleAdapter(),
      requestFor(fixtureModel()),
      runtimeFor(fetchImpl, "google"),
    );

    expect(events).toContainEqual({ type: "text_delta", text: "Hello" });
    expect(events).toContainEqual({ type: "usage", inputTokens: 10, outputTokens: 2, cachedTokens: 1 });
    expect(events.at(-1)).toEqual({ type: "done", stopReason: "stop" });
  });

  it("maps thought parts to reasoning", async () => {
    const fetchImpl: FetchLike = async () => sseResponse([
      data({ candidates: [{ content: { parts: [{ text: "plan", thought: true }] } }] }),
      data({ candidates: [{ content: { parts: [{ text: "answer" }] }, finishReason: "STOP" }] }),
    ]);
    const events = await collect(
      createGoogleAdapter(),
      requestFor(fixtureModel()),
      runtimeFor(fetchImpl, "google"),
    );

    expect(events).toContainEqual({ type: "reasoning_delta", text: "plan" });
    expect(events).toContainEqual({ type: "text_delta", text: "answer" });
  });

  it("assembles function calls", async () => {
    const fetchImpl: FetchLike = async () => sseResponse([
      data({
        candidates: [{
          content: { parts: [{ functionCall: { name: "read_document", args: { page: 1 } } }] },
          finishReason: "STOP",
        }],
      }),
    ]);
    const events = await collect(
      createGoogleAdapter(),
      requestFor(fixtureModel()),
      runtimeFor(fetchImpl, "google"),
    );

    expect(events).toContainEqual({ type: "tool_call_start", id: "call_0", name: "read_document" });
    expect(events).toContainEqual({ type: "tool_call_end", id: "call_0" });
    expect(events.at(-1)).toEqual({ type: "done", stopReason: "tool_calls" });
  });

  it("sends the Google key header and the Go endpoint", async () => {
    let url = "";
    let init: FetchInit | undefined;
    const fetchImpl: FetchLike = async (input, requestInit) => {
      url = input;
      init = requestInit;
      return sseResponse([data({ candidates: [{ content: { parts: [] }, finishReason: "STOP" }] })]);
    };
    const model = knownModels("opencode-go").find((item) => item.id === "gemini-4-argon");
    if (!model) {
      throw new Error("missing go google model");
    }

    await collect(
      createGoogleAdapter(),
      requestFor(model),
      runtimeFor(fetchImpl, "opencode-go"),
    );

    expect(url).toBe("https://opencode.ai/inference/go/google/v1beta/models/gemini-4-argon:streamGenerateContent?alt=sse");
    expect(init?.headers?.["x-goog-api-key"]).toBe("test-key");
    expect(init?.headers?.["x-opencode-session"]).toBe("session-1");
  });

  it("maps authentication failures", async () => {
    const fetchImpl: FetchLike = async () => sseResponse([], 401);
    await expect(
      collect(
        createGoogleAdapter(),
        requestFor(fixtureModel()),
        runtimeFor(fetchImpl, "google"),
      ),
    ).rejects.toMatchObject({ code: "provider_auth" });
  });
});
