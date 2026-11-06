import type { AppError } from "../errors";
import type { AppErrorCode } from "../errors";
import type { DbContext, PartInput, Usage } from "../db";
import type {
  LlmMessage,
  ModelInfo,
  ProviderAdapter,
  ProviderRuntime,
  ReasoningRequest,
  ToolSchema,
} from "../providers";
import type {
  ToolCall,
  ToolExecutor,
  ToolResult,
  ToolRole,
} from "../tools";

export type {
  CitationRef,
  ToolCall,
  ToolExecutionContext,
  ToolExecutor,
  ToolResult,
  ToolRole,
} from "../tools";

export type TurnStatus = "done" | "aborted" | "error" | "max_steps" | "repeated_tool";

export type TurnEvent =
  | { type: "turn_started"; sessionId: string; userMessageId: string | null }
  | { type: "message_started"; messageId: string; step: number }
  | { type: "text_delta"; messageId: string; text: string }
  | { type: "reasoning_delta"; messageId: string; text: string }
  | { type: "tool_call"; messageId: string; call: ToolCall }
  | {
    type: "tool_result";
    messageId: string;
    assistantMessageId: string;
    role: ToolRole;
    result: ToolResult;
  }
  | { type: "usage"; messageId: string; usage: Usage }
  | { type: "turn_finished"; status: TurnStatus; messageId: string | null }
  | { type: "error"; code: AppErrorCode; message: string; retryable: boolean };

export interface RunTurnOptions {
  sessionId: string;
  model: ModelInfo;
  provider: ProviderRuntime;
  system: string;
  userParts: PartInput[];
  tools?: readonly ToolSchema[];
  maxOutputTokens: number;
  temperature?: number;
  maxSteps?: number;
  /** Reasoning control for this turn. Omitted means reasoning is off. */
  reasoning?: ReasoningRequest;
  /** Reasoning effort label stored with the assistant message. */
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
  /** Reasoning history is only replayed when the current turn has reasoning on. */
  includeReasoning?: boolean;
}

export interface BuiltContext {
  system: string;
  messages: LlmMessage[];
}
