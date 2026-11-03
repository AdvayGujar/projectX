import { describe, expect, it } from "vitest";

import { createOpenAiChatAdapter } from "../openaiChat";
import { createProviderConfig, knownModels } from "../registry";
import type {
  CompletionRequest,
  FetchInit,
  FetchLike,
  ModelInfo,
  ProviderEvent,
  ProviderRuntime,
} from "../types";

function fixtureModel(preset: string): ModelInfo {
  const model = knownModels(preset)[0];
  if (!model) {
    throw new Error(`missing fixture model for ${preset}`);
  }
  return model;
}

function streamResponse(chunks: string[], status = 200): Response {
  if (status !== 200) {
    return new Response(JSON.stringify({ error: "nope" }), { status });
  }
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(body, {
    status,
    headers: { "content-type": "text/event-stream" },
  });
}

function chunk(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function makeRequest(model: ModelInfo, overrides: Partial<CompletionRequest> = {}): CompletionRequest {
  return {
    model,
    system: "You are helpful.",
    messages: [{ role: "user", parts: [{ type: "text", text: "Hi" }] }],
    maxOutputTokens: 100,
    sessionId: "session-1",
    ...overrides,
  };
}

function runtime(fetchImpl: FetchLike, preset = "deepseek"): ProviderRuntime {
  return {
    config: createProviderConfig(preset),
    apiKey: "test-key",
    fetch: fetchImpl,
  };
}

async function collect(adapter: ReturnType<typeof createOpenAiChatAdapter>, request: CompletionRequest, provider: ProviderRuntime): Promise<ProviderEvent[]> {
  const events: ProviderEvent[] = [];
  for await (const event of adapter.stream(request, provider)) {
    events.push(event);
  }
  return events;
}

describe("openai-chat adapter", () => {
  it("streams text, usage, and a stop reason", async () => {
    const fetchImpl: FetchLike = async () => streamResponse([
      chunk({ choices: [{ delta: { content: "Hello" } }] }),
      chunk({ choices: [{ delta: { content: " world" }, finish_reason: "stop" }] }),
      chunk({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 2 } }),
      "data: [DONE]\n\n",
    ]);
    const events = await collect(
      createOpenAiChatAdapter(),
      makeRequest(fixtureModel("deepseek")),
      runtime(fetchImpl),
    );

    expect(events).toEqual([
      { type: "text_delta", text: "Hello" },
      { type: "text_delta", text: " world" },
      { type: "usage", inputTokens: 10, outputTokens: 2, cachedTokens: undefined },
      { type: "done", stopReason: "stop" },
    ]);
  });

  it("streams reasoning separately from text", async () => {
    const fetchImpl: FetchLike = async () => streamResponse([
      chunk({ choices: [{ delta: { reasoning_content: "thinking" } }] }),
      chunk({ choices: [{ delta: { content: "answer" }, finish_reason: "stop" }] }),
      "data: [DONE]\n\n",
    ]);
    const events = await collect(
      createOpenAiChatAdapter(),
      makeRequest({ ...fixtureModel("deepseek"), id: "deepseek-reasoner" }),
      runtime(fetchImpl),
    );

    expect(events).toContainEqual({ type: "reasoning_delta", text: "thinking" });
    expect(events).toContainEqual({ type: "text_delta", text: "answer" });
  });

  it("assembles streamed tool calls", async () => {
    const fetchImpl: FetchLike = async () => streamResponse([
      chunk({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "read_document", arguments: '{"page":' } }] } }] }),
      chunk({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "1}" } }] }, finish_reason: "tool_calls" }] }),
      chunk({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
      "data: [DONE]\n\n",
    ]);
    const events = await collect(
      createOpenAiChatAdapter(),
      makeRequest(fixtureModel("deepseek")),
      runtime(fetchImpl),
    );

    expect(events).toContainEqual({ type: "tool_call_start", id: "call_1", name: "read_document" });
    expect(events.filter((event) => event.type === "tool_call_delta")).toHaveLength(2);
    expect(events).toContainEqual({ type: "tool_call_end", id: "call_1" });
    expect(events.at(-1)).toEqual({ type: "done", stopReason: "tool_calls" });
  });

  it("lists models and merges known capabilities", async () => {
    const fetchImpl: FetchLike = async () => new Response(JSON.stringify({
      data: [{ id: "deepseek-chat" }, { id: "deepseek-reasoner" }],
    }), { status: 200, headers: { "content-type": "application/json" } });
    const models = await createOpenAiChatAdapter().listModels(runtime(fetchImpl));

    expect(models.map((model) => model.id)).toEqual(["deepseek-chat", "deepseek-reasoner"]);
    expect(models[1]?.capabilities.reasoning).toBe(true);
  });

  it("maps authentication failures", async () => {
    const fetchImpl: FetchLike = async () => streamResponse([], 401);
    await expect(
      collect(
        createOpenAiChatAdapter(),
        makeRequest(fixtureModel("deepseek")),
        runtime(fetchImpl),
      ),
    ).rejects.toMatchObject({ code: "provider_auth", retryable: false });
  });

  it("sends OpenCode Go session and user-agent headers", async () => {
    let url = "";
    let init: FetchInit | undefined;
    const fetchImpl: FetchLike = async (input, requestInit) => {
      url = input;
      init = requestInit;
      return streamResponse(["data: [DONE]\n\n"]);
    };

    await collect(
      createOpenAiChatAdapter(),
      makeRequest(fixtureModel("opencode-go")),
      runtime(fetchImpl, "opencode-go"),
    );

    expect(url).toBe("https://opencode.ai/inference/go/openai/v1/chat/completions");
    expect(init?.headers?.["x-opencode-session"]).toBe("session-1");
    expect(init?.headers?.["User-Agent"]).toBe("ProjectX/0.0.0");
  });

  it("forwards the abort signal", async () => {
    const controller = new AbortController();
    let captured: AbortSignal | undefined;
    const fetchImpl: FetchLike = async (_input, init) => {
      captured = init?.signal;
      return streamResponse(["data: [DONE]\n\n"]);
    };

    await collect(
      createOpenAiChatAdapter(),
      makeRequest(fixtureModel("deepseek"), { signal: controller.signal }),
      runtime(fetchImpl),
    );

    expect(captured).toBe(controller.signal);
  });
});
