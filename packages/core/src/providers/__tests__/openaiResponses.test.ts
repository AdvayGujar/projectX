import { describe, expect, it } from "vitest";

import { createOpenAiResponsesAdapter } from "../openaiResponses";
import { toResponsesInput } from "../openaiResponsesMessages";
import { knownModels } from "../registry";
import type { FetchInit, FetchLike, ModelInfo } from "../types";
import { collect, data, requestFor, runtimeFor, sseResponse } from "./helpers";

function fixtureModel(id = "gpt-6-luna"): ModelInfo {
  const model = knownModels("openai").find((item) => item.id === id);
  if (!model) {
    throw new Error("missing responses fixture model");
  }
  return model;
}

describe("responses input conversion", () => {
  it("converts tool calls and outputs", () => {
    const result = toResponsesInput("System", [
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

    expect(result.instructions).toBe("System");
    expect(result.input).toEqual([
      { role: "user", content: "Read it" },
      { role: "assistant", content: "Reading" },
      { type: "function_call", call_id: "call_1", name: "read_document", arguments: '{"page":1}' },
      { type: "function_call_output", call_id: "call_1", output: "page one" },
    ]);
  });
});

describe("openai responses adapter", () => {
  it("streams text, usage, and stop reason", async () => {
    const fetchImpl: FetchLike = async () => sseResponse([
      data({ type: "response.output_text.delta", delta: "Hello" }),
      data({
        type: "response.completed",
        response: {
          status: "completed",
          output: [],
          usage: { input_tokens: 10, output_tokens: 2, input_tokens_details: { cached_tokens: 1 } },
        },
      }),
    ]);
    const events = await collect(
      createOpenAiResponsesAdapter(),
      requestFor(fixtureModel()),
      runtimeFor(fetchImpl, "openai"),
    );

    expect(events).toContainEqual({ type: "text_delta", text: "Hello" });
    expect(events).toContainEqual({ type: "usage", inputTokens: 10, outputTokens: 2, cachedTokens: 1 });
    expect(events.at(-1)).toEqual({ type: "done", stopReason: "stop" });
  });

  it("assembles function calls", async () => {
    const fetchImpl: FetchLike = async () => sseResponse([
      data({
        type: "response.output_item.added",
        item: { type: "function_call", id: "item_1", call_id: "call_1", name: "read_document", arguments: "" },
      }),
      data({ type: "response.function_call_arguments.delta", item_id: "item_1", delta: '{"page":' }),
      data({ type: "response.function_call_arguments.delta", item_id: "item_1", delta: "1}" }),
      data({
        type: "response.output_item.done",
        item: { type: "function_call", id: "item_1", call_id: "call_1", name: "read_document", arguments: '{"page":1}' },
      }),
      data({
        type: "response.completed",
        response: {
          status: "completed",
          output: [{ type: "function_call", call_id: "call_1" }],
          usage: { input_tokens: 10, output_tokens: 3 },
        },
      }),
    ]);
    const events = await collect(
      createOpenAiResponsesAdapter(),
      requestFor(fixtureModel()),
      runtimeFor(fetchImpl, "openai"),
    );

    expect(events).toContainEqual({ type: "tool_call_start", id: "call_1", name: "read_document" });
    expect(events.filter((item) => item.type === "tool_call_delta")).toHaveLength(2);
    expect(events).toContainEqual({ type: "tool_call_end", id: "call_1" });
    expect(events.at(-1)).toEqual({ type: "done", stopReason: "tool_calls" });
  });

  it("sends bearer auth and the Go endpoint/session", async () => {
    let url = "";
    let init: FetchInit | undefined;
    const fetchImpl: FetchLike = async (input, requestInit) => {
      url = input;
      init = requestInit;
      return sseResponse([data({ type: "response.completed", response: { status: "completed", output: [] } })]);
    };
    const model = knownModels("opencode-go").find((item) => item.id === "gpt-6-luna");
    if (!model) {
      throw new Error("missing go responses model");
    }

    await collect(
      createOpenAiResponsesAdapter(),
      requestFor(model),
      runtimeFor(fetchImpl, "opencode-go"),
    );

    expect(url).toBe("https://opencode.ai/inference/go/openai/v1/responses");
    expect(init?.headers?.Authorization).toBe("Bearer test-key");
    expect(init?.headers?.["x-opencode-session"]).toBe("session-1");
  });

  it("maps authentication failures", async () => {
    const fetchImpl: FetchLike = async () => sseResponse([], 403);
    await expect(
      collect(
        createOpenAiResponsesAdapter(),
        requestFor(fixtureModel()),
        runtimeFor(fetchImpl, "openai"),
      ),
    ).rejects.toMatchObject({ code: "provider_auth" });
  });
});
