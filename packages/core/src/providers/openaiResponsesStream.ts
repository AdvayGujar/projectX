import { AppError } from "../errors";
import { parseSse } from "./sse";
import type { ProviderEvent } from "./types";

interface ResponsesFunctionItem {
  type?: string;
  id?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
}

interface ResponsesEvent {
  type: string;
  delta?: string;
  item?: ResponsesFunctionItem;
  item_id?: string;
  output_index?: number;
  arguments?: string;
  response?: {
    status?: string;
    output?: ResponsesFunctionItem[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      input_tokens_details?: { cached_tokens?: number };
    };
    error?: { message?: string };
  };
  error?: { message?: string; code?: string };
}

interface ToolState {
  id: string;
  name: string;
  args: string;
  started: boolean;
  ended: boolean;
}

export async function* streamOpenAiResponsesEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<ProviderEvent> {
  const tools = new Map<string, ToolState>();
  let usage: Extract<ProviderEvent, { type: "usage" }> | undefined;
  let stopReason: "stop" | "tool_calls" | "length" = "stop";
  let hasCalls = false;

  for await (const event of parseSse(stream)) {
    const payload = parseEvent(event.data);
    if (payload.type === "response.output_item.added") {
      yield* startItem(payload, tools);
    } else if (payload.type === "response.function_call_arguments.delta") {
      yield* appendArguments(payload, tools);
    } else if (payload.type === "response.function_call_arguments.done") {
      yield* finishArguments(payload, tools);
    } else if (payload.type === "response.output_item.done") {
      yield* finishItem(payload, tools);
      hasCalls = hasCalls || payload.item?.type === "function_call";
    } else if (payload.type === "response.output_text.delta" && payload.delta) {
      yield { type: "text_delta", text: payload.delta };
    } else if (payload.type === "response.reasoning_summary_text.delta" && payload.delta) {
      yield { type: "reasoning_delta", text: payload.delta };
    } else if (payload.type === "response.reasoning_text.delta" && payload.delta) {
      yield { type: "reasoning_delta", text: payload.delta };
    } else if (payload.type === "response.completed" || payload.type === "response.incomplete") {
      usage = usageFrom(payload);
      if (payload.type === "response.incomplete") {
        stopReason = "length";
      }
      hasCalls = hasCalls || (payload.response?.output ?? []).some((item) => item.type === "function_call");
    } else if (payload.type === "response.failed") {
      throw new AppError("provider_invalid_response", payload.response?.error?.message ?? "OpenAI response failed", {
        userMessage: "OpenAI could not complete the response.",
      });
    } else if (payload.type === "error") {
      throw new AppError("provider_invalid_response", payload.error?.message ?? "OpenAI stream error");
    }
  }

  for (const state of tools.values()) {
    if (state.started && !state.ended) {
      state.ended = true;
      yield { type: "tool_call_end", id: state.id };
    }
  }
  if (usage) {
    yield usage;
  }
  yield {
    type: "done",
    stopReason: hasCalls || tools.size > 0 ? "tool_calls" : stopReason,
  };
}

function* startItem(
  payload: ResponsesEvent,
  tools: Map<string, ToolState>,
): Generator<ProviderEvent> {
  if (payload.item?.type !== "function_call") {
    return;
  }
  const key = payload.item.id ?? payload.item.call_id ?? String(payload.output_index ?? 0);
  const state: ToolState = {
    id: payload.item.call_id ?? payload.item.id ?? `call_${key}`,
    name: payload.item.name ?? "tool",
    args: payload.item.arguments ?? "",
    started: true,
    ended: false,
  };
  tools.set(key, state);
  yield { type: "tool_call_start", id: state.id, name: state.name };
  if (state.args) {
    yield { type: "tool_call_delta", id: state.id, argumentsJson: state.args };
  }
}

function* appendArguments(
  payload: ResponsesEvent,
  tools: Map<string, ToolState>,
): Generator<ProviderEvent> {
  const state = findTool(payload, tools);
  if (!state || !payload.delta) {
    return;
  }
  state.args += payload.delta;
  yield { type: "tool_call_delta", id: state.id, argumentsJson: payload.delta };
}

function* finishArguments(
  payload: ResponsesEvent,
  tools: Map<string, ToolState>,
): Generator<ProviderEvent> {
  const state = findTool(payload, tools);
  if (!state || state.args) {
    return;
  }
  state.args = payload.arguments ?? "";
  if (state.args) {
    yield { type: "tool_call_delta", id: state.id, argumentsJson: state.args };
  }
}

function* finishItem(
  payload: ResponsesEvent,
  tools: Map<string, ToolState>,
): Generator<ProviderEvent> {
  if (payload.item?.type !== "function_call") {
    return;
  }
  const key = payload.item.id ?? payload.item.call_id ?? String(payload.output_index ?? 0);
  const state = tools.get(key);
  if (!state || state.ended) {
    return;
  }
  state.ended = true;
  yield { type: "tool_call_end", id: state.id };
}

function findTool(payload: ResponsesEvent, tools: Map<string, ToolState>): ToolState | undefined {
  return tools.get(payload.item_id ?? String(payload.output_index ?? 0));
}

function usageFrom(payload: ResponsesEvent): Extract<ProviderEvent, { type: "usage" }> | undefined {
  const value = payload.response?.usage;
  if (!value) {
    return undefined;
  }
  return {
    type: "usage",
    inputTokens: value.input_tokens ?? 0,
    outputTokens: value.output_tokens ?? 0,
    cachedTokens: value.input_tokens_details?.cached_tokens,
  };
}

function parseEvent(data: string): ResponsesEvent {
  try {
    return JSON.parse(data) as ResponsesEvent;
  } catch (error) {
    throw new AppError("provider_invalid_response", "Malformed OpenAI response event", {
      cause: error,
    });
  }
}
