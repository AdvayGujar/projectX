import { createMessageRepository, createSessionRepository } from "../db";
import type { DbContext, MessageWithParts, Part } from "../db";
import type { LlmMessage, LlmPart } from "../providers";
import type { BuiltContext, ContextOptions } from "./types";

const DEFAULT_MESSAGE_LIMIT = 100;
const SUMMARY_LIMIT = 4_000;

export async function buildContext(
  db: DbContext,
  sessionId: string,
  options: ContextOptions,
): Promise<BuiltContext> {
  const [session, history] = await Promise.all([
    createSessionRepository(db).get(sessionId),
    createMessageRepository(db).list(sessionId, {
      limit: options.messageLimit ?? DEFAULT_MESSAGE_LIMIT,
    }),
  ]);

  const system = withSummary(options.system, session?.summary ?? null);
  const messages = history
    .filter((message) => !message.superseded)
    .map((message) => toLlmMessage(message, options.includeReasoning === true))
    .filter((message): message is LlmMessage => message !== null);
  const budget = Math.max(options.maxTokens - estimateText(system), 1_000);

  return { system, messages: trimToBudget(messages, budget) };
}

function withSummary(system: string, summary: string | null): string {
  if (!summary) {
    return system;
  }
  const clipped = summary.length > SUMMARY_LIMIT ? summary.slice(0, SUMMARY_LIMIT) : summary;
  return `${system}\n\nConversation summary so far:\n${clipped}`;
}

function toLlmMessage(message: MessageWithParts, includeReasoning: boolean): LlmMessage | null {
  if (message.role === "tool") {
    const results = message.parts
      .map(toolResultOf)
      .filter((part): part is LlmPart => part !== null);
    return results.length > 0 ? { role: "tool", parts: results } : null;
  }

  const hasToolCalls = message.parts.some((part) => part.type === "tool_call");
  const parts: LlmPart[] = [];
  for (const part of message.parts) {
    if (part.type === "text") {
      const text = textOf(part);
      if (text) {
        parts.push({ type: "text", text });
      }
    } else if (part.type === "reasoning" && includeReasoning && hasToolCalls) {
      const reasoning = reasoningOf(part);
      if (reasoning) {
        parts.push(reasoning);
      }
    } else if (part.type === "tool_call" && message.role === "assistant") {
      const call = toolCallOf(part);
      if (call) {
        parts.push(call);
      }
    } else if (part.type === "attachment" && message.role === "user") {
      const image = imageOf(part);
      if (image) {
        parts.push(image);
      }
    }
  }

  if (parts.length === 0) {
    return null;
  }
  return { role: message.role, parts };
}

function textOf(part: Part): string | null {
  const data = part.data;
  if (typeof data === "object" && data !== null && "text" in data) {
    const text = (data as { text?: unknown }).text;
    return typeof text === "string" ? text : null;
  }
  return null;
}

function imageOf(part: Part): LlmPart | null {
  const data = part.data;
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const value = data as { kind?: unknown; mimeType?: unknown; data?: unknown };
  if (
    value.kind !== "image" ||
    typeof value.mimeType !== "string" ||
    typeof value.data !== "string"
  ) {
    return null;
  }
  return { type: "image", mimeType: value.mimeType, data: value.data };
}

function reasoningOf(part: Part): LlmPart | null {
  const data = part.data;
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const value = data as { text?: unknown; signature?: unknown };
  if (typeof value.text !== "string") {
    return null;
  }
  return {
    type: "reasoning",
    text: value.text,
    ...(typeof value.signature === "string" && value.signature.length > 0
      ? { signature: value.signature }
      : {}),
  };
}

function toolCallOf(part: Part): LlmPart | null {
  const data = part.data;
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const value = data as {
    id?: unknown;
    name?: unknown;
    arguments?: unknown;
    thoughtSignature?: unknown;
  };
  if (typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }
  return {
    type: "tool_call",
    id: value.id,
    name: value.name,
    arguments: value.arguments,
    ...(typeof value.thoughtSignature === "string" && value.thoughtSignature.length > 0
      ? { thoughtSignature: value.thoughtSignature }
      : {}),
  };
}

function toolResultOf(part: Part): LlmPart | null {
  if (part.type !== "tool_result") {
    return null;
  }
  const data = part.data;
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const value = data as {
    toolCallId?: unknown;
    name?: unknown;
    content?: unknown;
    isError?: unknown;
  };
  if (typeof value.toolCallId !== "string" || typeof value.content !== "string") {
    return null;
  }
  return {
    type: "tool_result",
    toolCallId: value.toolCallId,
    name: typeof value.name === "string" ? value.name : "tool",
    content: value.content,
    isError: value.isError === true,
  };
}

function trimToBudget(messages: LlmMessage[], budget: number): LlmMessage[] {
  let remaining = budget;
  const kept: LlmMessage[] = [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) {
      continue;
    }
    const cost = estimateMessage(message);
    if (kept.length > 0 && cost > remaining) {
      break;
    }
    remaining -= cost;
    kept.unshift(message);
  }
  return kept;
}

function estimateMessage(message: LlmMessage): number {
  return message.parts.reduce((total, part) => {
    if (part.type === "text") {
      return total + estimateText(part.text);
    }
    return total + 60;
  }, 0);
}

function estimateText(text: string): number {
  return Math.ceil(text.length / 4);
}
