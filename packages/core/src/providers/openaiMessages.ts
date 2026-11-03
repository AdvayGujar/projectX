import type { LlmMessage, LlmPart } from "./types";

interface OpenAiToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

type OpenAiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type OpenAiMessage =
  | {
    role: "system" | "user" | "assistant";
    content: string | OpenAiContentPart[] | null;
    tool_calls?: OpenAiToolCall[];
  }
  | { role: "tool"; tool_call_id: string; content: string };

export function toOpenAiMessages(system: string, messages: LlmMessage[]): OpenAiMessage[] {
  const result: OpenAiMessage[] = [];
  if (system.trim()) {
    result.push({ role: "system", content: system });
  }
  for (const message of messages) {
    if (message.role === "tool") {
      result.push(...toolResults(message));
      continue;
    }
    appendConversationMessage(result, message, message.role);
  }
  return result;
}

function appendConversationMessage(
  result: OpenAiMessage[],
  message: LlmMessage,
  role: "system" | "user" | "assistant",
): void {
  const text = message.parts.filter(isText).map((part) => part.text).join("\n");
  if (role === "assistant") {
    const toolCalls = message.parts.filter(isToolCall).map(toToolCall);
    if (text || toolCalls.length > 0) {
      result.push({
        role: "assistant",
        content: text || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
    }
    return;
  }
  const images = message.parts.filter(isImage);
  if (images.length > 0) {
    const content: OpenAiContentPart[] = [];
    if (text) {
      content.push({ type: "text", text });
    }
    for (const image of images) {
      content.push({
        type: "image_url",
        image_url: { url: `data:${image.mimeType};base64,${image.data}` },
      });
    }
    result.push({ role, content });
    return;
  }
  if (text) {
    result.push({ role, content: text });
  }
}

function toolResults(message: LlmMessage): OpenAiMessage[] {
  return message.parts.filter(isToolResult).map((part) => ({
    role: "tool",
    tool_call_id: part.toolCallId,
    content: part.content,
  }));
}

function toToolCall(part: Extract<LlmPart, { type: "tool_call" }>): OpenAiToolCall {
  return {
    id: part.id,
    type: "function",
    function: {
      name: part.name,
      arguments: JSON.stringify(part.arguments ?? {}),
    },
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

function isToolResult(part: LlmPart): part is Extract<LlmPart, { type: "tool_result" }> {
  return part.type === "tool_result";
}
