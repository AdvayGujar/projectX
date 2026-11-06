import { AppError } from "../errors";
import { parseSse } from "./sse";
import type { ProviderEvent } from "./types";

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

interface AnthropicStreamEvent {
  type: string;
  index?: number;
  message?: { usage?: AnthropicUsage };
  content_block?: {
    type?: string;
    id?: string;
    name?: string;
    input?: unknown;
    thinking?: string;
  };
  delta?: {
    type?: string;
    text?: string;
    thinking?: string;
    signature?: string;
    partial_json?: string;
    stop_reason?: string;
  };
  usage?: AnthropicUsage;
  error?: { type?: string; message?: string };
}

interface ToolState {
  id: string;
  name: string;
  args: string;
  input: unknown;
  started: boolean;
  ended: boolean;
}

export async function* streamAnthropicEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<ProviderEvent> {
  const tools = new Map<number, ToolState>();
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;
  let stopReason: "stop" | "tool_calls" | "length" = "stop";

  for await (const event of parseSse(stream)) {
    const payload = parseEvent(event.data);
    if (payload.type === "message_start") {
      inputTokens = payload.message?.usage?.input_tokens ?? inputTokens;
      cachedTokens = payload.message?.usage?.cache_read_input_tokens ?? cachedTokens;
    } else if (payload.type === "content_block_start") {
      yield* startBlock(payload, tools);
    } else if (payload.type === "content_block_delta") {
      yield* handleDelta(payload, tools);
    } else if (payload.type === "content_block_stop") {
      yield* stopBlock(payload.index, tools);
    } else if (payload.type === "message_delta") {
      outputTokens = payload.usage?.output_tokens ?? outputTokens;
      stopReason = mapStopReason(payload.delta?.stop_reason);
    } else if (payload.type === "message_stop") {
      break;
    } else if (payload.type === "error") {
      throw anthropicError(payload.error);
    }
  }

  for (const [index, state] of tools) {
    if (state.started && !state.ended) {
      state.ended = true;
      yield { type: "tool_call_end", id: state.id };
    }
    tools.set(index, state);
  }

  if (inputTokens > 0 || outputTokens > 0) {
    yield { type: "usage", inputTokens, outputTokens, cachedTokens };
  }
  yield {
    type: "done",
    stopReason: tools.size > 0 && stopReason === "stop" ? "tool_calls" : stopReason,
  };
}

function* startBlock(
  payload: AnthropicStreamEvent,
  tools: Map<number, ToolState>,
): Generator<ProviderEvent> {
  if (payload.content_block?.type === "thinking" && payload.content_block.thinking) {
    yield { type: "reasoning_delta", text: payload.content_block.thinking };
    return;
  }
  if (payload.content_block?.type !== "tool_use") {
    return;
  }
  const index = payload.index ?? 0;
  const state: ToolState = {
    id: payload.content_block.id ?? `call_${index}`,
    name: payload.content_block.name ?? "tool",
    args: "",
    input: payload.content_block.input,
    started: true,
    ended: false,
  };
  tools.set(index, state);
  yield { type: "tool_call_start", id: state.id, name: state.name };
}

function* handleDelta(
  payload: AnthropicStreamEvent,
  tools: Map<number, ToolState>,
): Generator<ProviderEvent> {
  const delta = payload.delta;
  if (delta?.type === "text_delta" && delta.text) {
    yield { type: "text_delta", text: delta.text };
    return;
  }
  if (delta?.type === "thinking_delta" && delta.thinking) {
    yield { type: "reasoning_delta", text: delta.thinking };
    return;
  }
  if (delta?.type === "signature_delta" && delta.signature) {
    yield { type: "reasoning_signature", signature: delta.signature };
    return;
  }
  if (delta?.type === "input_json_delta" && delta.partial_json) {
    const state = tools.get(payload.index ?? 0);
    if (state) {
      state.args += delta.partial_json;
      yield { type: "tool_call_delta", id: state.id, argumentsJson: delta.partial_json };
    }
  }
}

function* stopBlock(index: number | undefined, tools: Map<number, ToolState>): Generator<ProviderEvent> {
  const state = tools.get(index ?? 0);
  if (!state || state.ended) {
    return;
  }
  if (!state.args && state.input !== undefined) {
    state.args = JSON.stringify(state.input);
    yield { type: "tool_call_delta", id: state.id, argumentsJson: state.args };
  }
  state.ended = true;
  yield { type: "tool_call_end", id: state.id };
}

function parseEvent(data: string): AnthropicStreamEvent {
  try {
    return JSON.parse(data) as AnthropicStreamEvent;
  } catch (error) {
    throw new AppError("provider_invalid_response", "Malformed Anthropic stream event", {
      cause: error,
    });
  }
}

function mapStopReason(reason: string | undefined): "stop" | "tool_calls" | "length" {
  if (reason === "tool_use") {
    return "tool_calls";
  }
  if (reason === "max_tokens") {
    return "length";
  }
  return "stop";
}

function anthropicError(error: AnthropicStreamEvent["error"]): AppError {
  const type = error?.type ?? "";
  const code = type === "authentication_error"
    ? "provider_auth"
    : type === "rate_limit_error"
      ? "provider_rate_limit"
      : type === "overloaded_error" || type === "api_error"
        ? "provider_unavailable"
        : "provider_invalid_response";
  return new AppError(code, error?.message ?? "Anthropic stream error", {
    retryable: code === "provider_rate_limit" || code === "provider_unavailable",
    userMessage: error?.message ?? "Anthropic returned an error.",
  });
}
