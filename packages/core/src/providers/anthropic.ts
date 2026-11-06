import { AppError } from "../errors";
import { toAnthropicMessages } from "./anthropicMessages";
import { streamAnthropicEvents } from "./anthropicStream";
import { providerError } from "./errors";
import { mergeModels } from "./registry";
import type {
  CompletionRequest,
  ModelInfo,
  ProviderAdapter,
  ProviderEvent,
  ProviderRuntime,
} from "./types";

const ANTHROPIC_VERSION = "2023-06-01";
const USER_AGENT = "ProjectX/0.0.0";

export function createAnthropicAdapter(): ProviderAdapter {
  return {
    async listModels(runtime: ProviderRuntime): Promise<ModelInfo[]> {
      if (runtime.config.presetId === "opencode-go") {
        return mergeModels(runtime.config, []).filter((model) => model.protocol === "anthropic");
      }
      const response = await runtime.fetch(`${trimUrl(runtime.config.baseUrl)}/v1/models`, {
        headers: buildHeaders(runtime),
      });
      if (!response.ok) {
        throw await providerError(response, runtime.config.label);
      }
      const payload = await response.json() as { data?: Array<{ id?: unknown; display_name?: unknown }> };
      const ids = Array.isArray(payload.data)
        ? payload.data.map((item) => item.id).filter((id): id is string => typeof id === "string")
        : [];
      return mergeModels(runtime.config, ids);
    },

    async *stream(
      request: CompletionRequest,
      runtime: ProviderRuntime,
    ): AsyncGenerator<ProviderEvent> {
      const { system, messages } = toAnthropicMessages(request.system, request.messages);
      const body = buildBody(request, system, messages);
      const response = await runtime.fetch(endpointFor(request, runtime), {
        method: "POST",
        headers: buildHeaders(runtime, request.sessionId),
        body: JSON.stringify(body),
        signal: request.signal,
      });
      if (!response.ok) {
        throw await providerError(response, runtime.config.label);
      }
      if (!response.body) {
        throw new AppError("provider_invalid_response", "Anthropic returned an empty body", {
          userMessage: "Anthropic returned an empty response.",
        });
      }
      yield* streamAnthropicEvents(response.body);
    },
  };
}

function buildBody(
  request: CompletionRequest,
  system: string,
  messages: ReturnType<typeof toAnthropicMessages>["messages"],
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model.id,
    max_tokens: request.maxOutputTokens,
    messages,
    stream: true,
  };
  if (system) {
    body.system = system;
  }
  if (request.temperature !== undefined) {
    body.temperature = request.temperature;
  }
  if (request.tools && request.tools.length > 0) {
    body.tools = request.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  }
  if (request.reasoning.mode === "off") {
    body.thinking = { type: "disabled" };
  } else if (request.reasoning.effort) {
    body.output_config = { effort: request.reasoning.effort };
  }
  return body;
}

function buildHeaders(runtime: ProviderRuntime, sessionId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "anthropic-version": ANTHROPIC_VERSION,
    "User-Agent": USER_AGENT,
    ...runtime.config.headers,
  };
  if (runtime.apiKey) {
    headers["x-api-key"] = runtime.apiKey;
  }
  if (runtime.config.presetId === "opencode-go" && sessionId) {
    headers["x-opencode-session"] = sessionId;
  }
  return headers;
}

function endpointFor(request: CompletionRequest, runtime: ProviderRuntime): string {
  return request.model.endpoint ?? `${trimUrl(runtime.config.baseUrl)}/v1/messages`;
}

function trimUrl(url: string): string {
  return url.replace(/\/+$/, "");
}
