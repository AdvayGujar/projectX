import { createProviderConfig } from "../registry";
import type {
  CompletionRequest,
  FetchLike,
  ModelInfo,
  ProviderAdapter,
  ProviderEvent,
  ProviderRuntime,
} from "../types";

export function sseResponse(frames: string[], status = 200): Response {
  if (status !== 200) {
    return new Response(JSON.stringify({ error: "request failed" }), { status });
  }
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(frame));
      }
      controller.close();
    },
  });
  return new Response(body, {
    status,
    headers: { "content-type": "text/event-stream" },
  });
}

export function data(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export function event(name: string, payload: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export function runtimeFor(fetchImpl: FetchLike, preset: string): ProviderRuntime {
  return {
    config: createProviderConfig(preset),
    apiKey: "test-key",
    fetch: fetchImpl,
  };
}

export function requestFor(model: ModelInfo, overrides: Partial<CompletionRequest> = {}): CompletionRequest {
  return {
    model,
    system: "You are helpful.",
    messages: [{ role: "user", parts: [{ type: "text", text: "Hi" }] }],
    maxOutputTokens: 100,
    reasoning: { mode: "off" },
    sessionId: "session-1",
    ...overrides,
  };
}

export async function collect(
  adapter: ProviderAdapter,
  request: CompletionRequest,
  runtime: ProviderRuntime,
): Promise<ProviderEvent[]> {
  const events: ProviderEvent[] = [];
  for await (const providerEvent of adapter.stream(request, runtime)) {
    events.push(providerEvent);
  }
  return events;
}
