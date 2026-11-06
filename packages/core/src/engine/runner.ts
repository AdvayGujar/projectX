import { AppError } from "../errors";
import { createMessageRepository } from "../db";
import type { MessageRepository, Usage } from "../db";
import { assertReasoningRequest } from "../providers";
import type { CompletionRequest, ProviderEvent, ReasoningRequest, ToolSchema } from "../providers";
import { buildContext } from "./context";
import {
  appendStreamingText,
  createStreamingPart,
  flushStreamingPart,
  type StreamingPart,
} from "./streamingPart";
import type {
  AssistantOutcome,
  EngineDeps,
  RunTurnOptions,
  ToolCall,
  ToolExecutor,
  ToolResult,
  ToolRole,
  TurnEvent,
  TurnResult,
  TurnStatus,
} from "./types";

const DEFAULT_MAX_STEPS = 12;
const MIN_CONTEXT_TOKENS = 4_000;

interface StreamState {
  text: StreamingPart;
  reasoning: StreamingPart;
  captureReasoning: boolean;
  pending: Map<string, { name: string; args: string; signature?: string }>;
  toolCalls: ToolCall[];
  usage?: Usage;
  stopReason: "stop" | "tool_calls" | "length" | "error";
}

type Emit = (event: TurnEvent) => void;

export function createTurnEngine({ db, adapter, tools }: EngineDeps) {
  const messages = createMessageRepository(db);

  return {
    async runTurn(options: RunTurnOptions): Promise<TurnResult> {
      const emit: Emit = (event) => options.onEvent?.(event);
      const reasoning = reasoningOf(options);
      assertReasoningRequest(options.model, reasoning);
      const user = options.userParts.length > 0
        ? await messages.append({
          sessionId: options.sessionId,
          role: "user",
          parts: options.userParts,
        })
        : null;
      emit({ type: "turn_started", sessionId: options.sessionId, userMessageId: user?.id ?? null });

      const assistantIds: string[] = [];
      const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
      const executedCalls = new Set<string>();
      const schemas = options.tools ?? tools.schemas;

      for (let step = 1; step <= maxSteps; step += 1) {
        if (options.signal?.aborted) {
          return finish(emit, "aborted", user?.id ?? null, assistantIds);
        }
        const context = await buildContext(db, options.sessionId, {
          system: options.system,
          maxTokens: contextBudget(options),
          includeReasoning: reasoning.mode === "on",
        });
        const assistant = await messages.append({
          sessionId: options.sessionId,
          role: "assistant",
          providerId: options.provider.config.id,
          modelId: options.model.id,
          status: "streaming",
          effort: options.effort,
          parts: [],
        });
        assistantIds.push(assistant.id);
        emit({ type: "message_started", messageId: assistant.id, step });

        const outcome = await streamAssistant(
          adapter,
          messages,
          db.now,
          options,
          context.system,
          context.messages,
          schemas,
          assistant.id,
          emit,
          tools.roleOf,
        );
        if (outcome.status !== "done") {
          return finish(emit, outcome.status, user?.id ?? null, assistantIds, outcome.error);
        }
        if (outcome.toolCalls.length === 0) {
          return finish(emit, "done", user?.id ?? null, assistantIds, undefined, outcome.stopReason);
        }
        const repeated = findRepeatedCall(outcome.toolCalls, executedCalls);
        if (repeated) {
          const error = repeatedCallError(repeated);
          emit({
            type: "error",
            code: error.code,
            message: error.userMessage,
            retryable: false,
          });
          return finish(
            emit,
            "repeated_tool",
            user?.id ?? null,
            assistantIds,
            error,
          );
        }
        for (const call of outcome.toolCalls) {
          executedCalls.add(callSignature(call));
        }
        await executeTools(
          tools,
          messages,
          outcome.toolCalls,
          options.sessionId,
          assistant.id,
          options.signal,
          emit,
        );
      }

      return finish(emit, "max_steps", user?.id ?? null, assistantIds);
    },
  };
}

export type TurnEngine = ReturnType<typeof createTurnEngine>;

async function streamAssistant(
  adapter: EngineDeps["adapter"],
  messages: MessageRepository,
  now: () => number,
  options: RunTurnOptions,
  system: string,
  history: CompletionRequest["messages"],
  schemas: readonly ToolSchema[],
  assistantId: string,
  emit: Emit,
  roleOf: (name: string) => ToolRole | undefined,
): Promise<AssistantOutcome> {
  const state: StreamState = {
    text: createStreamingPart(),
    reasoning: createStreamingPart(),
    captureReasoning: reasoningOf(options).mode === "on",
    pending: new Map(),
    toolCalls: [],
    stopReason: "stop",
  };

  try {
    for await (const event of adapter.stream(buildRequest(options, system, history, schemas), options.provider)) {
      await handleEvent(event, state, messages, assistantId, emit, now, roleOf);
    }
    await finalizePending(state, messages, assistantId, emit, roleOf);
    await flushStreamingPart(messages, assistantId, state.text, "text", now());
    await flushStreamingPart(messages, assistantId, state.reasoning, "reasoning", now());
    await messages.updateStatus(assistantId, "done", state.usage);
    return { status: "done", stopReason: state.stopReason, toolCalls: state.toolCalls, usage: state.usage };
  } catch (error) {
    await flushQuietly(messages, assistantId, state, now);
    if (options.signal?.aborted) {
      await messages.updateStatus(assistantId, "aborted");
      return { status: "aborted", toolCalls: [] };
    }
    return handleStreamFailure(error, messages, assistantId, emit);
  }
}

async function handleEvent(
  event: ProviderEvent,
  state: StreamState,
  messages: MessageRepository,
  assistantId: string,
  emit: Emit,
  now: () => number,
  roleOf: (name: string) => ToolRole | undefined,
): Promise<void> {
  if (event.type === "text_delta") {
    await appendStreamingText(messages, assistantId, state.text, "text", event.text, now());
    emit({ type: "text_delta", messageId: assistantId, text: event.text });
  } else if (event.type === "reasoning_delta") {
    if (!state.captureReasoning) {
      return;
    }
    await appendStreamingText(messages, assistantId, state.reasoning, "reasoning", event.text, now());
    emit({ type: "reasoning_delta", messageId: assistantId, text: event.text });
  } else if (event.type === "reasoning_signature") {
    if (!state.captureReasoning) {
      return;
    }
    state.reasoning.signature = event.signature;
    await flushStreamingPart(messages, assistantId, state.reasoning, "reasoning", now());
  } else if (event.type === "tool_call_start") {
    state.pending.set(event.id, { name: event.name, args: "" });
  } else if (event.type === "tool_call_delta") {
    const pending = state.pending.get(event.id);
    if (pending) {
      pending.args += event.argumentsJson;
    }
  } else if (event.type === "tool_call_signature") {
    const pending = state.pending.get(event.id);
    if (pending) {
      pending.signature = event.signature;
    }
  } else if (event.type === "tool_call_end") {
    await finishToolCall(state, event.id, messages, assistantId, emit, roleOf);
  } else if (event.type === "usage") {
    state.usage = {
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens,
      cachedTokens: event.cachedTokens,
    };
    emit({ type: "usage", messageId: assistantId, usage: state.usage });
  } else if (event.type === "done") {
    state.stopReason = event.stopReason;
  } else {
    throw new AppError(event.code, event.message, { retryable: event.retryable });
  }
}

async function finishToolCall(
  state: StreamState,
  id: string,
  messages: MessageRepository,
  assistantId: string,
  emit: Emit,
  roleOf: (name: string) => ToolRole | undefined,
): Promise<void> {
  const pending = state.pending.get(id);
  if (!pending) {
    return;
  }
  state.pending.delete(id);
  const name = pending.name || "tool";
  const call: ToolCall = {
    id,
    name,
    arguments: parseArguments(pending.args),
    role: roleOf(name),
    ...(pending.signature ? { thoughtSignature: pending.signature } : {}),
  };
  state.toolCalls.push(call);
  await messages.appendPart(assistantId, { type: "tool_call", data: call });
  emit({ type: "tool_call", messageId: assistantId, call });
}

async function finalizePending(
  state: StreamState,
  messages: MessageRepository,
  assistantId: string,
  emit: Emit,
  roleOf: (name: string) => ToolRole | undefined,
): Promise<void> {
  const ids = Array.from(state.pending.keys());
  for (const id of ids) {
    await finishToolCall(state, id, messages, assistantId, emit, roleOf);
  }
}

async function executeTools(
  tools: ToolExecutor,
  messages: MessageRepository,
  calls: ToolCall[],
  sessionId: string,
  assistantMessageId: string,
  signal: AbortSignal | undefined,
  emit: Emit,
): Promise<void> {
  for (const call of calls) {
    if (signal?.aborted) {
      return;
    }
    const result = normalizeResult(
      await runTool(tools, call, sessionId, signal),
      call,
      tools,
    );
    const message = await messages.append({
      sessionId,
      role: "tool",
      parts: [{ type: "tool_result", data: result }],
    });
    emit({
      type: "tool_result",
      messageId: message.id,
      assistantMessageId,
      role: result.role ?? "read",
      result,
    });
  }
}

/** A fake or older executor may omit display/role; the Thought row still needs them. */
function normalizeResult(
  result: ToolResult,
  call: ToolCall,
  tools: ToolExecutor,
): ToolResult {
  const role = result.role ?? tools.roleOf(call.name) ?? call.role ?? "read";
  return {
    ...result,
    role,
    display: result.display ?? call.name,
  };
}

async function runTool(
  tools: ToolExecutor,
  call: ToolCall,
  sessionId: string,
  signal: AbortSignal | undefined,
): Promise<ToolResult> {
  try {
    return await tools.execute(call, { sessionId, signal });
  } catch (error) {
    const appError = toAppError(error);
    return {
      toolCallId: call.id,
      name: call.name,
      content: appError.userMessage,
      isError: true,
      display: "failed",
      role: call.role ?? "read",
    };
  }
}

function buildRequest(
  options: RunTurnOptions,
  system: string,
  history: CompletionRequest["messages"],
  schemas: readonly ToolSchema[],
): CompletionRequest {
  return {
    model: options.model,
    system,
    messages: history,
    tools: schemas.length > 0 ? schemas : undefined,
    temperature: options.temperature,
    maxOutputTokens: options.maxOutputTokens,
    sessionId: options.sessionId,
    reasoning: reasoningOf(options),
    signal: options.signal,
  };
}

function reasoningOf(options: RunTurnOptions): ReasoningRequest {
  return options.reasoning ?? { mode: "off" };
}

function contextBudget(options: RunTurnOptions): number {
  return Math.max(
    MIN_CONTEXT_TOKENS,
    options.model.contextWindow - options.maxOutputTokens - 2_000,
  );
}

function parseArguments(value: string): unknown {
  if (!value) {
    return {};
  }
  try {
    return JSON.parse(value);
  } catch {
    return { invalidJson: value };
  }
}

/** Repeated identical calls mean the model is stuck; the loop stops instead of looping. */
function findRepeatedCall(
  calls: readonly ToolCall[],
  executed: ReadonlySet<string>,
): ToolCall | null {
  const seen = new Set(executed);
  for (const call of calls) {
    const signature = callSignature(call);
    if (seen.has(signature)) {
      return call;
    }
    seen.add(signature);
  }
  return null;
}

function callSignature(call: ToolCall): string {
  return `${call.name}:${stableStringify(call.arguments)}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
    return `{${entries.join(",")}}`;
  }
  const json = JSON.stringify(value);
  return json === undefined ? String(value) : json;
}

function repeatedCallError(call: ToolCall): AppError {
  return new AppError("unknown", `Repeated tool call: ${call.name}`, {
    userMessage: "The model repeated the same tool call, so the turn stopped.",
  });
}

async function flushQuietly(
  messages: MessageRepository,
  assistantId: string,
  state: StreamState,
  now: () => number,
): Promise<void> {
  try {
    await flushStreamingPart(messages, assistantId, state.text, "text", now());
    await flushStreamingPart(messages, assistantId, state.reasoning, "reasoning", now());
  } catch {
    // Persisting a partial turn must not mask the provider error.
    return;
  }
}

async function handleStreamFailure(
  error: unknown,
  messages: MessageRepository,
  assistantId: string,
  emit: Emit,
): Promise<AssistantOutcome> {
  const appError = toAppError(error);
  if (appError.code === "cancelled") {
    await messages.updateStatus(assistantId, "aborted");
    return { status: "aborted", toolCalls: [] };
  }
  await messages.updateStatus(assistantId, "error");
  emit({
    type: "error",
    code: appError.code,
    message: appError.message,
    retryable: appError.retryable,
  });
  return { status: "error", toolCalls: [], error: appError };
}

function finish(
  emit: Emit,
  status: TurnStatus,
  userMessageId: string | null,
  assistantMessageIds: string[],
  error?: AppError,
  stopReason?: string,
): TurnResult {
  const lastMessageId = assistantMessageIds.at(-1) ?? null;
  emit({ type: "turn_finished", status, messageId: lastMessageId });
  return { status, userMessageId, assistantMessageIds, stopReason, error };
}

function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  return new AppError("unknown", error instanceof Error ? error.message : String(error), {
    cause: error,
  });
}
