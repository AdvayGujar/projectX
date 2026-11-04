import { describe, expect, it } from "vitest";

import { AppError } from "../../errors";
import { createMessageRepository, createSessionRepository } from "../../db";
import { withContext } from "../../db/__tests__/helpers";
import {
  createProviderConfig,
  knownModels,
  type CompletionRequest,
  type ModelInfo,
  type ProviderAdapter,
  type ProviderEvent,
  type ProviderRuntime,
} from "../../providers";
import { createTurnEngine } from "../runner";
import type { ToolCall, ToolExecutor, TurnEvent } from "../types";

function fixtureModel(): ModelInfo {
  const model = knownModels("deepseek")[0];
  if (!model) {
    throw new Error("missing fixture model");
  }
  return model;
}

const provider: ProviderRuntime = {
  config: createProviderConfig("deepseek"),
  apiKey: "test-key",
  fetch: async () => new Response(""),
};

function scripted(scripts: ProviderEvent[][]): { adapter: ProviderAdapter; requests: CompletionRequest[] } {
  const requests: CompletionRequest[] = [];
  let index = 0;
  const adapter: ProviderAdapter = {
    async listModels() {
      return [];
    },
    async *stream(request) {
      requests.push(request);
      const script = scripts[index] ?? [{ type: "done", stopReason: "stop" }];
      index += 1;
      for (const event of script) {
        yield event;
      }
    },
  };
  return { adapter, requests };
}

function toolExecutor(content = "ok"): { tools: ToolExecutor; calls: ToolCall[] } {
  const calls: ToolCall[] = [];
  return {
    calls,
    tools: {
      async execute(call) {
        calls.push(call);
        return { toolCallId: call.id, name: call.name, content };
      },
    },
  };
}

const noTools: ToolExecutor = {
  async execute(call) {
    return { toolCallId: call.id, name: call.name, content: "unused" };
  },
};

describe("turn engine", () => {
  it("persists a streamed text turn with usage", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const messages = createMessageRepository(ctx);
    const session = await sessions.create({});
    const { adapter } = scripted([[
      { type: "text_delta", text: "Hel" },
      { type: "text_delta", text: "lo" },
      { type: "usage", inputTokens: 10, outputTokens: 2 },
      { type: "done", stopReason: "stop" },
    ]]);
    const events: TurnEvent[] = [];
    const engine = createTurnEngine({ db: ctx, adapter, tools: noTools });

    const result = await engine.runTurn({
      sessionId: session.id,
      model: fixtureModel(),
      provider,
      system: "You are helpful.",
      userParts: [{ type: "text", data: { text: "Hi" }, searchText: "Hi" }],
      maxOutputTokens: 100,
      effort: "High",
      onEvent: (event) => events.push(event),
    });

    const history = await messages.list(session.id);
    expect(result.status).toBe("done");
    expect(history.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(history[1]?.parts[0]?.data).toEqual({ text: "Hello" });
    expect(history[1]?.inputTokens).toBe(10);
    expect(history[1]?.effort).toBe("High");
    expect(history[1]?.status).toBe("done");
    expect(events.some((event) => event.type === "turn_finished" && event.status === "done")).toBe(true);
  }));

  it("executes a tool call and continues the turn", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const messages = createMessageRepository(ctx);
    const session = await sessions.create({});
    const { adapter, requests } = scripted([
      [
        { type: "tool_call_start", id: "c1", name: "read_document" },
        { type: "tool_call_delta", id: "c1", argumentsJson: '{"page":1}' },
        { type: "tool_call_end", id: "c1" },
        { type: "done", stopReason: "tool_calls" },
      ],
      [
        { type: "text_delta", text: "Finished" },
        { type: "done", stopReason: "stop" },
      ],
    ]);
    const tool = toolExecutor("page 1");
    const engine = createTurnEngine({ db: ctx, adapter, tools: tool.tools });

    const result = await engine.runTurn({
      sessionId: session.id,
      model: fixtureModel(),
      provider,
      system: "You are helpful.",
      userParts: [{ type: "text", data: { text: "Read page 1" }, searchText: "Read page 1" }],
      tools: [{ name: "read_document", description: "Read a page", parameters: { type: "object" } }],
      maxOutputTokens: 100,
    });

    const history = await messages.list(session.id);
    expect(result.status).toBe("done");
    expect(tool.calls).toHaveLength(1);
    expect(tool.calls[0]?.arguments).toEqual({ page: 1 });
    expect(history.map((message) => message.role)).toEqual(["user", "assistant", "tool", "assistant"]);
    expect(history[2]?.parts[0]?.data).toMatchObject({ content: "page 1", toolCallId: "c1" });
    expect(requests[1]?.messages.some((message) => message.role === "tool")).toBe(true);
  }));

  it("marks a cancelled stream as aborted", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const messages = createMessageRepository(ctx);
    const session = await sessions.create({});
    const adapter: ProviderAdapter = {
      async listModels() {
        return [];
      },
      async *stream() {
        throw new AppError("cancelled", "Aborted");
      },
    };
    const engine = createTurnEngine({ db: ctx, adapter, tools: noTools });

    const result = await engine.runTurn({
      sessionId: session.id,
      model: fixtureModel(),
      provider,
      system: "",
      userParts: [{ type: "text", data: { text: "Hi" } }],
      maxOutputTokens: 100,
    });

    const history = await messages.list(session.id);
    expect(result.status).toBe("aborted");
    expect(history.at(-1)?.status).toBe("aborted");
  }));

  it("records provider failures", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const messages = createMessageRepository(ctx);
    const session = await sessions.create({});
    const adapter: ProviderAdapter = {
      async listModels() {
        return [];
      },
      async *stream() {
        throw new AppError("provider_rate_limit", "Too many requests", { retryable: true });
      },
    };
    const events: TurnEvent[] = [];
    const engine = createTurnEngine({ db: ctx, adapter, tools: noTools });

    const result = await engine.runTurn({
      sessionId: session.id,
      model: fixtureModel(),
      provider,
      system: "",
      userParts: [{ type: "text", data: { text: "Hi" } }],
      maxOutputTokens: 100,
      onEvent: (event) => events.push(event),
    });

    const history = await messages.list(session.id);
    expect(result.status).toBe("error");
    expect(result.error?.code).toBe("provider_rate_limit");
    expect(history.at(-1)?.status).toBe("error");
    expect(events.some((event) => event.type === "error")).toBe(true);
  }));

  it("stops at the step limit", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const messages = createMessageRepository(ctx);
    const session = await sessions.create({});
    const toolCall: ProviderEvent[] = [
      { type: "tool_call_start", id: "c1", name: "read_document" },
      { type: "tool_call_delta", id: "c1", argumentsJson: "{}" },
      { type: "tool_call_end", id: "c1" },
      { type: "done", stopReason: "tool_calls" },
    ];
    const { adapter } = scripted([toolCall, toolCall, toolCall]);
    const tool = toolExecutor();
    const engine = createTurnEngine({ db: ctx, adapter, tools: tool.tools });

    const result = await engine.runTurn({
      sessionId: session.id,
      model: fixtureModel(),
      provider,
      system: "",
      userParts: [{ type: "text", data: { text: "Loop" } }],
      maxOutputTokens: 100,
      maxSteps: 2,
    });

    expect(result.status).toBe("max_steps");
    expect(tool.calls).toHaveLength(2);
    expect(await messages.count(session.id)).toBe(5);
  }));
});
