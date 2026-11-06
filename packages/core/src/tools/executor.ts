import { z } from "zod";

import { AppError } from "../errors";
import type { ToolSchema } from "../providers";
import { capToolOutput } from "./output";
import { toToolParameters } from "./schema";
import type {
  ToolCall,
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutor,
  ToolOutcome,
  ToolResult,
  ToolSpec,
} from "./types";

/** Validates arguments with Zod before calling the typed implementation. */
export function defineTool<T>(spec: ToolSpec<T>): ToolDefinition {
  return {
    name: spec.name,
    description: spec.description,
    role: spec.role,
    parameters: toToolParameters(spec.input),
    async run(input: unknown, context: ToolExecutionContext): Promise<ToolOutcome> {
      const parsed = spec.input.safeParse(input);
      if (!parsed.success) {
        return {
          content: `Invalid arguments for ${spec.name}:\n${formatIssues(parsed.error)}`,
          display: "invalid arguments",
          isError: true,
        };
      }
      try {
        return capOutcome(await spec.execute(parsed.data, context));
      } catch (error) {
        return failureOutcome(error);
      }
    },
  };
}

/** Turns definitions into the executor the engine calls. */
export function createToolExecutor(
  definitions: readonly ToolDefinition[],
): ToolExecutor {
  const byName = new Map(definitions.map((definition) => [definition.name, definition]));
  const schemas: ToolSchema[] = definitions.map((definition) => ({
    name: definition.name,
    description: definition.description,
    parameters: definition.parameters,
  }));

  return {
    schemas,

    roleOf(name: string) {
      return byName.get(name)?.role;
    },

    async execute(call: ToolCall, context: ToolExecutionContext): Promise<ToolResult> {
      const definition = byName.get(call.name);
      if (!definition) {
        return {
          toolCallId: call.id,
          name: call.name,
          content: `There is no tool named ${call.name}.`,
          isError: true,
          display: "unknown tool",
          role: call.role ?? "read",
        };
      }
      try {
        const outcome = capOutcome(await definition.run(call.arguments, context));
        return {
          toolCallId: call.id,
          name: call.name,
          ...outcome,
          role: definition.role,
        };
      } catch (error) {
        return {
          toolCallId: call.id,
          name: call.name,
          ...failureOutcome(error),
          role: definition.role,
        };
      }
    },
  };
}

function capOutcome(outcome: ToolOutcome): ToolOutcome {
  return { ...outcome, content: capToolOutput(outcome.content) };
}

function failureOutcome(error: unknown): ToolOutcome {
  const message = error instanceof AppError
    ? error.userMessage
    : "The tool could not complete.";
  return { content: message, display: "failed", isError: true };
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 6)
    .map((issue) => {
      const path = issue.path.map(String).join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("\n");
}
