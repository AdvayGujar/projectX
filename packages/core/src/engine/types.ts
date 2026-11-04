import type { AppError } from "../errors";
import type { AppErrorCode } from "../errors";
import type { DbContext, PartInput, Usage } from "../db";
import type {
  LlmMessage,
  ModelInfo,
  ProviderAdapter,
  ProviderRuntime,
  ToolSchema,
} from "../providers";

export interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  content: string;
  isError?: boolean;
}

export interface ToolExecutionContext {
  sessionId: string;
  signal?: AbortSignal;
}

export interface ToolExecutor {
  execute(call: ToolCall, context: ToolExecutionContext): Promise<ToolResult>;
}

export type TurnStatus = "done" | "aborted" | "error" | "max_steps";

export type TurnEvent =
  | { type: "turn_started"; sessionId: string; userMessageId: string | null }
  | { type: "message_started"; messageId: string }
  | { type: "text_delta"; messageId: string; text: string }
  | { type: "reasoning_delta"; messageId: string; text: string }
  | { type: "tool_call"; messageId: string; call: ToolCall }
  | { type: "tool_result"; messageId: string; result: ToolResult }
  | { type: "usage"; messageId: string; usage: Usage }
  | { type: "turn_finished"; status: TurnStatus; messageId: string | null }
  | { type: "error"; code: AppErrorCode; message: string; retryable: boolean };

export interface RunTurnOptions {
  sessionId: string;
  model: ModelInfo;
  provider: ProviderRuntime;
  system: string;
  userParts: PartInput[];
  tools?: ToolSchema[];
  maxOutputTokens: number;
  temperature?: number;
  maxSteps?: number;
  /** Reasoning effort the user chose for this turn, stored with the assistant message. */
  effort?: string;
  signal?: AbortSignal;
  onEvent?: (event: TurnEvent) => void;
}

export interface TurnResult {
  status: TurnStatus;
  userMessageId: string | null;
  assistantMessageIds: string[];
  stopReason?: string;
  error?: AppError;
}

export interface AssistantOutcome {
  status: "done" | "aborted" | "error";
  stopReason?: "stop" | "tool_calls" | "length" | "error";
  toolCalls: ToolCall[];
  usage?: Usage;
  error?: AppError;
}

export interface EngineDeps {
  db: DbContext;
  adapter: ProviderAdapter;
  tools: ToolExecutor;
}

export interface ContextOptions {
  system: string;
  maxTokens: number;
  messageLimit?: number;
}

export interface BuiltContext {
  system: string;
  messages: LlmMessage[];
}
