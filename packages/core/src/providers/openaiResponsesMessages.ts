import type { LlmMessage, LlmPart } from "./types";

type ResponsesContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string };

export type ResponsesInputItem =
  | { role: "user" | "assistant" | "system"; content: string | ResponsesContentPart[] }
  | { type: "function_call"; call_id: string; name: string; arguments: string }
  | { type: "function_call_output"; call_id: string; output: string };

export interface ResponsesInput {
  instructions: string;
  input: ResponsesInputItem[];
}

export function toResponsesInput(system: string, messages: LlmMessage[]): ResponsesInput {
  let instructions = system;
  const input: ResponsesInputItem[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      instructions = [instructions, textOf(message)].filter(Boolean).join("\n\n");
    } else if (message.role === "tool") {
      input.push(...toolOutputs(message));
    } else if (message.role === "assistant") {
      pushAssistant(input, message);
    } else {
      pushUser(input, message);
    }
  }

  return { instructions, input };
}

function pushAssistant(input: ResponsesInputItem[], message: LlmMessage): void {
  const text = textOf(message);
  if (text) {
    input.push({ role: "assistant", content: text });
  }
  for (const part of message.parts.filter(isToolCall)) {
    input.push({
      type: "function_call",
      call_id: part.id,
      name: part.name,
      arguments: JSON.stringify(part.arguments ?? {}),
    });
  }
}

function pushUser(input: ResponsesInputItem[], message: LlmMessage): void {
  const text = textOf(message);
  const images = message.parts.filter(isImage);
  if (images.length === 0) {
    if (text) {
      input.push({ role: "user", content: text });
    }
    return;
  }
  const content: ResponsesContentPart[] = [];
  if (text) {
    content.push({ type: "input_text", text });
  }
  for (const image of images) {
    content.push({
      type: "input_image",
      image_url: `data:${image.mimeType};base64,${image.data}`,
    });
  }
  input.push({ role: "user", content });
}

function toolOutputs(message: LlmMessage): ResponsesInputItem[] {
  return message.parts.filter(isToolResult).map((part) => ({
    type: "function_call_output",
    call_id: part.toolCallId,
    output: part.content,
  }));
}

function textOf(message: LlmMessage): string {
  return message.parts
    .filter(isText)
    .map((part) => part.text)
    .join("\n");
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
