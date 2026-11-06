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
import type { CitationRef, ToolCall, ToolExecutor, TurnEvent } from "../types";

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

function toolExecutor(
  content = "ok",
  citations?: readonly CitationRef[],
): { tools: ToolExecutor; calls: ToolCall[] } {
  const calls: ToolCall[] = [];
  return {
    calls,
    tools: {
      schemas: [{ name: "read_document", description: "Read a page", parameters: { type: "object" } }],
      roleOf: () => "read",
      async execute(call) {
        calls.push(call);
        return {
          toolCallId: call.id,
          name: call.name,
          content,
          display: "document",
          ...(citations ? { citations } : {}),
        };
      },
    },
  };
}

const noTools: ToolExecutor = {
  schemas: [],
  roleOf: () => undefined,
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

  it("treats a raw abort rejection as cancelled", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const messages = createMessageRepository(ctx);
    const session = await sessions.create({});
    const controller = new AbortController();
    const adapter: ProviderAdapter = {
      async listModels() {
        return [];
      },
      async *stream() {
        controller.abort();
        throw new Error("signal is aborted without reason");
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
      signal: controller.signal,
      onEvent: (event) => events.push(event),
    });

    const history = await messages.list(session.id);
    expect(result.status).toBe("aborted");
    expect(history.at(-1)?.status).toBe("aborted");
    expect(events.some((event) => event.type === "error")).toBe(false);
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

  it("uses the executor's schemas when a turn does not override them", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const session = await sessions.create({});
    const { adapter, requests } = scripted([[
      { type: "text_delta", text: "Hello" },
      { type: "done", stopReason: "stop" },
    ]]);
    const tool = toolExecutor();
    const engine = createTurnEngine({ db: ctx, adapter, tools: tool.tools });

    await engine.runTurn({
      sessionId: session.id,
      model: fixtureModel(),
      provider,
      system: "",
      userParts: [{ type: "text", data: { text: "Hi" } }],
      maxOutputTokens: 100,
    });

    expect(requests[0]?.tools?.map((schema) => schema.name)).toEqual(["read_document"]);
  }));

  it("labels tool results for the transcript", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const messages = createMessageRepository(ctx);
    const session = await sessions.create({});
    const { adapter } = scripted([
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
    const citation: CitationRef = {
      fileId: "f1",
      fileName: "report.pdf",
      fileKind: "pdf",
      page: 1,
      section: null,
    };
    const tool = toolExecutor("page 1", [citation]);
    const events: TurnEvent[] = [];
    const engine = createTurnEngine({ db: ctx, adapter, tools: tool.tools });

    const result = await engine.runTurn({
      sessionId: session.id,
      model: fixtureModel(),
      provider,
      system: "",
      userParts: [{ type: "text", data: { text: "Read" } }],
      maxOutputTokens: 100,
      onEvent: (event) => events.push(event),
    });

    const history = await messages.list(session.id);
    const toolCall = history[1]?.parts.find((part) => part.type === "tool_call");
    const toolResult = events.find((event) => event.type === "tool_result");
    expect(result.status).toBe("done");
    expect(toolCall?.data).toMatchObject({ name: "read_document", role: "read" });
    expect(toolResult).toMatchObject({
      type: "tool_result",
      role: "read",
      assistantMessageId: history[1]?.id,
      result: { display: "document", citations: [citation] },
    });
  }));

  it("stops when the model repeats the same tool call", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const session = await sessions.create({});
    const repeated: ProviderEvent[] = [
      { type: "tool_call_start", id: "c1", name: "read_document" },
      { type: "tool_call_delta", id: "c1", argumentsJson: '{"page":1}' },
      { type: "tool_call_end", id: "c1" },
      { type: "done", stopReason: "tool_calls" },
    ];
    const second: ProviderEvent[] = [
      { type: "tool_call_start", id: "c2", name: "read_document" },
      { type: "tool_call_delta", id: "c2", argumentsJson: '{"page":1}' },
      { type: "tool_call_end", id: "c2" },
      { type: "done", stopReason: "tool_calls" },
    ];
    const { adapter } = scripted([repeated, second, repeated]);
    const tool = toolExecutor();
    const events: TurnEvent[] = [];
    const engine = createTurnEngine({ db: ctx, adapter, tools: tool.tools });

    const result = await engine.runTurn({
      sessionId: session.id,
      model: fixtureModel(),
      provider,
      system: "",
      userParts: [{ type: "text", data: { text: "Loop" } }],
      maxOutputTokens: 100,
      maxSteps: 3,
      onEvent: (event) => events.push(event),
    });

    expect(result.status).toBe("repeated_tool");
    expect(result.error?.userMessage).toContain("repeated the same tool call");
    expect(tool.calls).toHaveLength(1);
    expect(events.some((event) => event.type === "error")).toBe(true);
  }));

  it("stops at the step limit", () => withContext(async (ctx) => {
    const sessions = createSessionRepository(ctx);
    const messages = createMessageRepository(ctx);
    const session = await sessions.create({});
    const toolCall = (page: number): ProviderEvent[] => [
      { type: "tool_call_start", id: `c${page}`, name: "read_document" },
      { type: "tool_call_delta", id: `c${page}`, argumentsJson: `{"page":${page}}` },
      { type: "tool_call_end", id: `c${page}` },
      { type: "done", stopReason: "tool_calls" },
    ];
    const { adapter } = scripted([toolCall(1), toolCall(2), toolCall(3)]);
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
