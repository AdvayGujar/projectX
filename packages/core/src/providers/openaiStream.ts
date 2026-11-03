import { AppError } from "../errors";
import { parseSse } from "./sse";
import type { ProviderEvent } from "./types";

interface OpenAiToolCallDelta {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface OpenAiChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: OpenAiToolCallDelta[];
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}

interface ToolState {
  id: string;
  name: string;
  arguments: string;
  started: boolean;
  ended: boolean;
}

export async function* streamOpenAiEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<ProviderEvent> {
  const toolCalls = new Map<number, ToolState>();
  let stopReason: "stop" | "tool_calls" | "length" = "stop";

  for await (const event of parseSse(stream)) {
    if (event.data === "[DONE]") {
      break;
    }
    const chunk = parseChunk(event.data);
    if (chunk.usage) {
      yield {
        type: "usage",
        inputTokens: chunk.usage.prompt_tokens ?? 0,
        outputTokens: chunk.usage.completion_tokens ?? 0,
        cachedTokens: chunk.usage.prompt_tokens_details?.cached_tokens,
      };
    }
    const choice = chunk.choices?.[0];
    if (!choice) {
      continue;
    }
    if (choice.delta?.content) {
      yield { type: "text_delta", text: choice.delta.content };
    }
    if (choice.delta?.reasoning_content) {
      yield { type: "reasoning_delta", text: choice.delta.reasoning_content };
    }
    if (choice.delta?.tool_calls) {
      for (const call of choice.delta.tool_calls) {
        yield* handleToolCall(call, toolCalls);
      }
    }
    if (choice.finish_reason) {
      stopReason = mapStopReason(choice.finish_reason);
    }
  }

  for (const state of toolCalls.values()) {
    if (state.started && !state.ended) {
      state.ended = true;
      yield { type: "tool_call_end", id: state.id };
    }
  }

  yield {
    type: "done",
    stopReason: hasToolCalls(toolCalls) && stopReason === "stop" ? "tool_calls" : stopReason,
  };
}

function* handleToolCall(
  call: OpenAiToolCallDelta,
  toolCalls: Map<number, ToolState>,
): Generator<ProviderEvent> {
  const index = call.index ?? 0;
  const state = toolCalls.get(index) ?? createToolState(index, call.id);
  toolCalls.set(index, state);

  if (call.id) {
    state.id = call.id;
  }
  if (call.function?.name) {
    state.name = call.function.name;
  }
  if (call.function?.arguments) {
    state.arguments += call.function.arguments;
  }

  if (!state.started && state.name) {
    state.started = true;
    yield { type: "tool_call_start", id: state.id, name: state.name };
    if (state.arguments) {
      yield { type: "tool_call_delta", id: state.id, argumentsJson: state.arguments };
    }
    return;
  }

  if (state.started && call.function?.arguments) {
    yield { type: "tool_call_delta", id: state.id, argumentsJson: call.function.arguments };
  }
}

function createToolState(index: number, id?: string): ToolState {
  return {
    id: id ?? `call_${index}`,
    name: "",
    arguments: "",
    started: false,
    ended: false,
  };
}

function parseChunk(data: string): OpenAiChunk {
  try {
    return JSON.parse(data) as OpenAiChunk;
  } catch (error) {
    throw new AppError("provider_invalid_response", "Malformed stream chunk", { cause: error });
  }
}

function mapStopReason(reason: string): "stop" | "tool_calls" | "length" {
  if (reason === "tool_calls" || reason === "function_call") {
    return "tool_calls";
  }
  if (reason === "length") {
    return "length";
  }
  return "stop";
}

function hasToolCalls(toolCalls: Map<number, ToolState>): boolean {
  return Array.from(toolCalls.values()).some((state) => state.started);
}
