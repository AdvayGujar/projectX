import type { z } from "zod";

import type { ToolSchema } from "../providers";

/** Whether a tool only reads data or changes it. The Thought disclosure renders this. */
export type ToolRole = "read" | "write";

/** A model-requested tool call as it is persisted on an assistant message. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
  role?: ToolRole;
}

/** A tool result. `display` is the short line the Thought disclosure shows. */
export interface ToolResult {
  toolCallId: string;
  name: string;
  content: string;
  isError?: boolean;
  display?: string;
  role?: ToolRole;
}

export interface ToolExecutionContext {
  sessionId: string;
  signal?: AbortSignal;
}

/** What a tool returns before the executor adds the call id and role. */
export interface ToolOutcome {
  content: string;
  display: string;
  isError?: boolean;
}

/** A registered tool: schema, role, and a typed execute function. */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly role: ToolRole;
  readonly parameters: Record<string, unknown>;
  run(input: unknown, context: ToolExecutionContext): Promise<ToolOutcome>;
}

/** The typed description a feature module passes to `defineTool`. */
export interface ToolSpec<T> {
  readonly name: string;
  readonly description: string;
  readonly role: ToolRole;
  readonly input: z.ZodType<T>;
  execute(input: T, context: ToolExecutionContext): Promise<ToolOutcome>;
}

/**
 * The engine only sees this contract. `schemas` are sent to the provider, `roleOf` labels
 * stored calls, and `execute` must never throw: failures come back as tool results.
 */
export interface ToolExecutor {
  readonly schemas: readonly ToolSchema[];
  roleOf(name: string): ToolRole | undefined;
  execute(call: ToolCall, context: ToolExecutionContext): Promise<ToolResult>;
}
