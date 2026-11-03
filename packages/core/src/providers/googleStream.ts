import { AppError } from "../errors";
import { parseSse } from "./sse";
import type { ProviderEvent } from "./types";

interface GooglePart {
  text?: string;
  thought?: boolean;
  functionCall?: { name?: string; args?: unknown };
}

interface GoogleChunk {
  candidates?: Array<{
    content?: { parts?: GooglePart[] };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
  };
  error?: { message?: string };
}

export async function* streamGoogleEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<ProviderEvent> {
  let callIndex = 0;
  let hasCalls = false;
  let stopReason: "stop" | "tool_calls" | "length" = "stop";
  let usage: Extract<ProviderEvent, { type: "usage" }> | undefined;

  for await (const event of parseSse(stream)) {
    const chunk = parseChunk(event.data);
    if (chunk.error) {
      throw new AppError("provider_invalid_response", chunk.error.message ?? "Google stream error");
    }
    if (chunk.usageMetadata) {
      usage = {
        type: "usage",
        inputTokens: chunk.usageMetadata.promptTokenCount ?? 0,
        outputTokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
        cachedTokens: chunk.usageMetadata.cachedContentTokenCount,
      };
    }
    const candidate = chunk.candidates?.[0];
    if (!candidate) {
      continue;
    }
    for (const part of candidate.content?.parts ?? []) {
      if (part.functionCall?.name) {
        hasCalls = true;
        yield* functionCallEvents(part.functionCall.name, part.functionCall.args, callIndex);
        callIndex += 1;
      } else if (part.text && part.thought) {
        yield { type: "reasoning_delta", text: part.text };
      } else if (part.text) {
        yield { type: "text_delta", text: part.text };
      }
    }
    if (candidate.finishReason) {
      stopReason = mapFinishReason(candidate.finishReason);
    }
  }

  if (usage) {
    yield usage;
  }
  yield { type: "done", stopReason: hasCalls ? "tool_calls" : stopReason };
}

function* functionCallEvents(name: string, args: unknown, index: number): Generator<ProviderEvent> {
  const id = `call_${index}`;
  yield { type: "tool_call_start", id, name };
  yield { type: "tool_call_delta", id, argumentsJson: JSON.stringify(args ?? {}) };
  yield { type: "tool_call_end", id };
}

function parseChunk(data: string): GoogleChunk {
  try {
    return JSON.parse(data) as GoogleChunk;
  } catch (error) {
    throw new AppError("provider_invalid_response", "Malformed Google stream event", {
      cause: error,
    });
  }
}

function mapFinishReason(reason: string): "stop" | "length" {
  return reason === "MAX_TOKENS" ? "length" : "stop";
}
