import type { LlmMessage, LlmPart } from "./types";

export type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string; signature: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: AnthropicBlock[];
}

export interface AnthropicRequestMessages {
  system: string;
  messages: AnthropicMessage[];
}

export function toAnthropicMessages(
  system: string,
  messages: LlmMessage[],
): AnthropicRequestMessages {
  let systemPrompt = system;
  const result: AnthropicMessage[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      systemPrompt = [systemPrompt, textOf(message)].filter(Boolean).join("\n\n");
      continue;
    }
    if (message.role === "tool") {
      const blocks = message.parts.filter(isToolResult).map(toToolResult);
      pushMessage(result, "user", blocks);
      continue;
    }
    if (message.role === "assistant") {
      const blocks: AnthropicBlock[] = [];
      const toolCalls = message.parts.filter(isToolCall);
      if (toolCalls.length > 0) {
        blocks.push(...thinkingBlocks(message));
      }
      const text = textOf(message);
      if (text) {
        blocks.push({ type: "text", text });
      }
      for (const part of toolCalls) {
        blocks.push({ type: "tool_use", id: part.id, name: part.name, input: part.arguments });
      }
      pushMessage(result, "assistant", blocks);
      continue;
    }
    const blocks: AnthropicBlock[] = [];
    const text = textOf(message);
    if (text) {
      blocks.push({ type: "text", text });
    }
    for (const part of message.parts.filter(isImage)) {
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: part.mimeType, data: part.data },
      });
    }
    pushMessage(result, "user", blocks);
  }

  return { system: systemPrompt, messages: result };
}

function pushMessage(
  messages: AnthropicMessage[],
  role: "user" | "assistant",
  blocks: AnthropicBlock[],
): void {
  if (blocks.length === 0) {
    return;
  }
  const last = messages.at(-1);
  if (last?.role === role) {
    last.content.push(...blocks);
  } else {
    messages.push({ role, content: blocks });
  }
}

function textOf(message: LlmMessage): string {
  return message.parts
    .filter(isText)
    .map((part) => part.text)
    .join("\n");
}

/** A thinking block without its signature is unusable and must not be replayed. */
function thinkingBlocks(message: LlmMessage): AnthropicBlock[] {
  const blocks: AnthropicBlock[] = [];
  for (const part of message.parts.filter(isReasoning)) {
    if (part.signature) {
      blocks.push({ type: "thinking", thinking: part.text, signature: part.signature });
    }
  }
  return blocks;
}

function toToolResult(part: Extract<LlmPart, { type: "tool_result" }>): AnthropicBlock {
  return {
    type: "tool_result",
    tool_use_id: part.toolCallId,
    content: part.content,
    is_error: part.isError === true,
  };
}

function isText(part: LlmPart): part is Extract<LlmPart, { type: "text" }> {
  return part.type === "text";
}

function isImage(part: LlmPart): part is Extract<LlmPart, { type: "image" }> {
  return part.type === "image";
}

function isToolCall(part: LlmPart): part is Extract<LlmPart, { type: "tool_call" }> {
  return part.type === "tool_call";
}

function isReasoning(part: LlmPart): part is Extract<LlmPart, { type: "reasoning" }> {
  return part.type === "reasoning";
}

function isToolResult(part: LlmPart): part is Extract<LlmPart, { type: "tool_result" }> {
  return part.type === "tool_result";
}
