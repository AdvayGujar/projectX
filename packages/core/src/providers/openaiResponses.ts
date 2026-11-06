import { AppError } from "../errors";
import { providerError } from "./errors";
import { toResponsesInput } from "./openaiResponsesMessages";
import { streamOpenAiResponsesEvents } from "./openaiResponsesStream";
import { mergeModels } from "./registry";
import type {
  CompletionRequest,
  ModelInfo,
  ProviderAdapter,
  ProviderEvent,
  ProviderRuntime,
} from "./types";

const USER_AGENT = "ProjectX/0.0.0";

export function createOpenAiResponsesAdapter(): ProviderAdapter {
  return {
    async listModels(runtime: ProviderRuntime): Promise<ModelInfo[]> {
      if (runtime.config.presetId === "opencode-go") {
        return mergeModels(runtime.config, [])
          .filter((model) => model.protocol === "openai-responses");
      }
      const response = await runtime.fetch(`${trimUrl(runtime.config.baseUrl)}/models`, {
        headers: buildHeaders(runtime),
      });
      if (!response.ok) {
        throw await providerError(response, runtime.config.label);
      }
      const payload = await response.json() as { data?: Array<{ id?: unknown }> };
      const ids = Array.isArray(payload.data)
        ? payload.data.map((item) => item.id).filter((id): id is string => typeof id === "string")
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
        throw new AppError("provider_invalid_response", "OpenAI returned an empty body", {
          userMessage: "OpenAI returned an empty response.",
        });
      }
      yield* streamOpenAiResponsesEvents(response.body);
    },
  };
}

function buildBody(request: CompletionRequest): Record<string, unknown> {
  const { instructions, input } = toResponsesInput(request.system, request.messages);
  const body: Record<string, unknown> = {
    model: request.model.id,
    input,
    stream: true,
    max_output_tokens: request.maxOutputTokens,
  };
  if (instructions) {
    body.instructions = instructions;
  }
  if (request.temperature !== undefined) {
    body.temperature = request.temperature;
  }
  if (request.tools && request.tools.length > 0) {
    body.tools = request.tools.map((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }
  if (request.reasoning.mode === "off") {
    body.reasoning = { effort: "none" };
  } else if (request.reasoning.effort) {
    body.reasoning = { effort: request.reasoning.effort };
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
  return request.model.endpoint ?? `${trimUrl(runtime.config.baseUrl)}/responses`;
}

function trimUrl(url: string): string {
  return url.replace(/\/+$/, "");
}
