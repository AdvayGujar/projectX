import type { AppErrorCode } from "../errors";

export type Protocol = "openai-chat" | "openai-responses" | "anthropic" | "google";

export interface ProviderConfig {
  id: string;
  presetId: string;
  label: string;
  protocol: Protocol;
  baseUrl: string;
  headers?: Record<string, string>;
}

/** The reasoning effort levels a model can be asked for, in display order. */
export const REASONING_EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export interface ReasoningCapabilities {
  supported: boolean;
  /** False means the model reasons whether the user wants it or not. */
  canDisable: boolean;
  /** Empty when the provider exposes no effort control for this model. */
  efforts: ReasoningEffort[];
}

/** One neutral value that every adapter maps to its own dialect. */
export type ReasoningRequest =
  | { mode: "off" }
  | { mode: "on"; effort?: ReasoningEffort };

export interface ModelCapabilities {
  tools: boolean;
  vision: boolean;
  reasoning: ReasoningCapabilities;
}

export interface ModelPricing {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface ModelInfo {
  id: string;
  label: string;
  providerId: string;
  protocol: Protocol;
  contextWindow: number;
  maxOutput: number;
  capabilities: ModelCapabilities;
  pricing?: ModelPricing;
  endpoint?: string;
}

export type LlmRole = "system" | "user" | "assistant" | "tool";

export type LlmPart =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; data: string }
  | {
    type: "reasoning";
    text: string;
    /** Anthropic thinking signature or Google thought signature, when the provider sent one. */
    signature?: string;
  }
  | {
    type: "tool_call";
    id: string;
    name: string;
    arguments: unknown;
    /** Google attaches a thought signature to the function call it must be replayed with. */
    thoughtSignature?: string;
  }
  | { type: "tool_result"; toolCallId: string; name: string; content: string; isError?: boolean };

export interface LlmMessage {
  role: LlmRole;
  parts: LlmPart[];
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface CompletionRequest {
  model: ModelInfo;
  system: string;
  messages: LlmMessage[];
  tools?: readonly ToolSchema[];
  temperature?: number;
  maxOutputTokens: number;
  reasoning: ReasoningRequest;
  sessionId: string;
  signal?: AbortSignal;
}

export type ProviderEvent =
  | { type: "text_delta"; text: string }
  | { type: "reasoning_delta"; text: string }
  | { type: "reasoning_signature"; signature: string }
  | { type: "tool_call_start"; id: string; name: string }
  | { type: "tool_call_delta"; id: string; argumentsJson: string }
  | { type: "tool_call_signature"; id: string; signature: string }
  | { type: "tool_call_end"; id: string }
  | { type: "usage"; inputTokens: number; outputTokens: number; cachedTokens?: number }
  | { type: "done"; stopReason: "stop" | "tool_calls" | "length" | "error" }
  | { type: "error"; code: AppErrorCode; message: string; retryable: boolean };

export type FetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
};

export type FetchLike = (url: string, init?: FetchInit) => Promise<Response>;

export interface ProviderRuntime {
  config: ProviderConfig;
  apiKey: string;
  fetch: FetchLike;
}

export interface ProviderAdapter {
  listModels(runtime: ProviderRuntime): Promise<ModelInfo[]>;
  stream(request: CompletionRequest, runtime: ProviderRuntime): AsyncIterable<ProviderEvent>;
}
