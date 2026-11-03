import { describe, expect, it } from "vitest";

import { createAnthropicAdapter } from "../anthropic";
import { toAnthropicMessages } from "../anthropicMessages";
import { knownModels } from "../registry";
import type { FetchInit, FetchLike, ModelInfo } from "../types";
import {
  collect,
  data,
  event,
  requestFor,
  runtimeFor,
  sseResponse,
} from "./helpers";

function fixtureModel(id = "claude-haiku-5-5"): ModelInfo {
  const model = knownModels("anthropic").find((item) => item.id === id);
  if (!model) {
    throw new Error("missing anthropic fixture model");
  }
  return model;
}

describe("anthropic messages conversion", () => {
  it("merges tool results into a user message and keeps the system prompt", () => {
    const result = toAnthropicMessages("System", [
      { role: "user", parts: [{ type: "text", text: "Read it" }] },
      {
        role: "assistant",
        parts: [
          { type: "text", text: "Reading" },
          { type: "tool_call", id: "t1", name: "read_document", arguments: { page: 1 } },
        ],
      },
      {
        role: "tool",
        parts: [{ type: "tool_result", toolCallId: "t1", name: "read_document", content: "page one" }],
      },
    ]);

    expect(result.system).toBe("System");
    expect(result.messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    expect(result.messages[2]?.content[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
  });
});

describe("anthropic adapter", () => {
  it("streams text, thinking, usage, and stop reason", async () => {
    const fetchImpl: FetchLike = async () => sseResponse([
      event("message_start", { type: "message_start", message: { usage: { input_tokens: 12, cache_read_input_tokens: 3 } } }),
      event("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text" } }),
      event("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello" } }),
      event("content_block_stop", { type: "content_block_stop", index: 0 }),
      event("content_block_start", { type: "content_block_start", index: 1, content_block: { type: "thinking" } }),
      event("content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "thinking_delta", thinking: "plan" } }),
      event("content_block_stop", { type: "content_block_stop", index: 1 }),
      event("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } }),
      event("message_stop", { type: "message_stop" }),
    ]);
    const events = await collect(
      createAnthropicAdapter(),
      requestFor(fixtureModel()),
      runtimeFor(fetchImpl, "anthropic"),
    );

    expect(events).toContainEqual({ type: "text_delta", text: "Hello" });
    expect(events).toContainEqual({ type: "reasoning_delta", text: "plan" });
    expect(events).toContainEqual({ type: "usage", inputTokens: 12, outputTokens: 5, cachedTokens: 3 });
    expect(events.at(-1)).toEqual({ type: "done", stopReason: "stop" });
  });

  it("assembles tool use blocks", async () => {
    const fetchImpl: FetchLike = async () => sseResponse([
      event("message_start", { type: "message_start", message: { usage: { input_tokens: 8 } } }),
      event("content_block_start", {
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "toolu_1", name: "read_document", input: {} },
      }),
      event("content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: '{"page":' },
      }),
      event("content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: "1}" },
      }),
      event("content_block_stop", { type: "content_block_stop", index: 0 }),
      event("message_delta", { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 7 } }),
      event("message_stop", { type: "message_stop" }),
    ]);
    const events = await collect(
      createAnthropicAdapter(),
      requestFor(fixtureModel()),
      runtimeFor(fetchImpl, "anthropic"),
    );

    expect(events).toContainEqual({ type: "tool_call_start", id: "toolu_1", name: "read_document" });
    expect(events.filter((item) => item.type === "tool_call_delta")).toHaveLength(2);
    expect(events).toContainEqual({ type: "tool_call_end", id: "toolu_1" });
    expect(events.at(-1)).toEqual({ type: "done", stopReason: "tool_calls" });
  });

  it("sends Anthropic headers and the Go session header", async () => {
    let init: FetchInit | undefined;
    const fetchImpl: FetchLike = async (_url, requestInit) => {
      init = requestInit;
      return sseResponse([data({ type: "message_stop" })]);
    };
    const model = knownModels("opencode-go").find((item) => item.id === "claude-haiku-5-5");
    if (!model) {
      throw new Error("missing go anthropic model");
    }

    await collect(
      createAnthropicAdapter(),
      requestFor(model),
      runtimeFor(fetchImpl, "opencode-go"),
    );

    expect(init?.headers?.["x-api-key"]).toBe("test-key");
    expect(init?.headers?.["anthropic-version"]).toBe("2023-06-01");
    expect(init?.headers?.["x-opencode-session"]).toBe("session-1");
  });

  it("maps authentication failures", async () => {
    const fetchImpl: FetchLike = async () => sseResponse([], 401);
    await expect(
      collect(
        createAnthropicAdapter(),
        requestFor(fixtureModel()),
        runtimeFor(fetchImpl, "anthropic"),
      ),
    ).rejects.toMatchObject({ code: "provider_auth" });
  });
});
