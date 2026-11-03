import { AppError } from "../errors";
import { providerError } from "./errors";
import { toOpenAiMessages } from "./openaiMessages";
import { streamOpenAiEvents } from "./openaiStream";
import { knownModels, mergeModels } from "./registry";
import type {
  CompletionRequest,
  ModelInfo,
  ProviderAdapter,
  ProviderEvent,
  ProviderRuntime,
} from "./types";

const USER_AGENT = "ProjectX/0.0.0";

export function createOpenAiChatAdapter(): ProviderAdapter {
  return {
    async listModels(runtime: ProviderRuntime): Promise<ModelInfo[]> {
      const response = await runtime.fetch(`${trimUrl(runtime.config.baseUrl)}/models`, {
        headers: buildHeaders(runtime),
      });
      if (!response.ok) {
        const known = knownModels(runtime.config.presetId);
        if (response.status === 404 && known.length > 0) {
          return known;
        }
        throw await providerError(response, runtime.config.label);
      }
      const payload = await response.json() as { data?: Array<{ id?: unknown }> };
      const ids = Array.isArray(payload.data)
        ? payload.data
          .map((item) => item.id)
          .filter((id): id is string => typeof id === "string")
        : [];
      return mergeModels(runtime.config, ids);
    },

    async *stream(
      request: CompletionRequest,
      runtime: ProviderRuntime,
    ): AsyncGenerator<ProviderEvent> {
      const response = await runtime.fetch(endpointFor(request, runtime), {
        method: "POST",
        headers: buildHeaders(runtime, request.sessionId),
        body: JSON.stringify(buildBody(request)),
        signal: request.signal,
      });
      if (!response.ok) {
        throw await providerError(response, runtime.config.label);
      }
      if (!response.body) {
        throw new AppError("provider_invalid_response", "Provider returned an empty body", {
          userMessage: "The provider returned an empty response.",
        });
      }
      yield* streamOpenAiEvents(response.body);
    },
  };
}

function buildBody(request: CompletionRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model.id,
    messages: toOpenAiMessages(request.system, request.messages),
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: request.maxOutputTokens,
  };
  if (request.temperature !== undefined) {
    body.temperature = request.temperature;
  }
  if (request.tools && request.tools.length > 0) {
    body.tools = request.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
    body.tool_choice = "auto";
  }
  return body;
}

function buildHeaders(runtime: ProviderRuntime, sessionId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
    ...runtime.config.headers,
  };
  if (runtime.apiKey) {
    headers.Authorization = `Bearer ${runtime.apiKey}`;
  }
  if (runtime.config.presetId === "opencode-go" && sessionId) {
    headers["x-opencode-session"] = sessionId;
  }
  return headers;
}

function endpointFor(request: CompletionRequest, runtime: ProviderRuntime): string {
  return request.model.endpoint ?? `${trimUrl(runtime.config.baseUrl)}/chat/completions`;
}

function trimUrl(url: string): string {
  return url.replace(/\/+$/, "");
}
