import type { LlmMessage, LlmPart, ToolSchema } from "./types";

type GooglePart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { functionCall: { name: string; args: unknown } }
  | { functionResponse: { name: string; response: { content: string; isError?: boolean } } };

export interface GoogleContent {
  role: "user" | "model";
  parts: GooglePart[];
}

export interface GoogleInput {
  systemInstruction?: { parts: Array<{ text: string }> };
  contents: GoogleContent[];
}

export function toGoogleContents(system: string, messages: LlmMessage[]): GoogleInput {
  let systemPrompt = system;
  const contents: GoogleContent[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      systemPrompt = [systemPrompt, textOf(message)].filter(Boolean).join("\n\n");
      continue;
    }
    if (message.role === "tool") {
      pushContent(contents, "user", message.parts.filter(isToolResult).map(toFunctionResponse));
      continue;
    }
    if (message.role === "assistant") {
      pushContent(contents, "model", assistantParts(message));
      continue;
    }
    pushContent(contents, "user", userParts(message));
  }

  return {
    ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
    contents,
  };
}

export function toGoogleTools(tools: ToolSchema[] | undefined): unknown[] | undefined {
  if (!tools || tools.length === 0) {
    return undefined;
  }
  return [{
    functionDeclarations: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    })),
  }];
}

function assistantParts(message: LlmMessage): GooglePart[] {
  const parts: GooglePart[] = [];
  const text = textOf(message);
  if (text) {
    parts.push({ text });
  }
  for (const part of message.parts.filter(isToolCall)) {
    parts.push({ functionCall: { name: part.name, args: part.arguments ?? {} } });
  }
  return parts;
}

function userParts(message: LlmMessage): GooglePart[] {
  const parts: GooglePart[] = [];
  const text = textOf(message);
  if (text) {
    parts.push({ text });
  }
  for (const part of message.parts.filter(isImage)) {
    parts.push({ inlineData: { mimeType: part.mimeType, data: part.data } });
  }
  return parts;
}

function toFunctionResponse(part: Extract<LlmPart, { type: "tool_result" }>): GooglePart {
  return {
    functionResponse: {
      name: part.name,
      response: { content: part.content, isError: part.isError === true },
    },
  };
}

function pushContent(
  contents: GoogleContent[],
  role: "user" | "model",
  parts: GooglePart[],
): void {
  if (parts.length === 0) {
    return;
  }
  const last = contents.at(-1);
  if (last?.role === role) {
    last.parts.push(...parts);
  } else {
    contents.push({ role, parts });
  }
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
