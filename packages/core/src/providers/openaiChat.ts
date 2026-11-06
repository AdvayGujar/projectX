import { AppError } from "../errors";
import { providerError } from "./errors";
import { toOpenAiMessages } from "./openaiMessages";
import { streamOpenAiEvents } from "./openaiStream";
import { openRouterReasoning } from "./reasoning";
import { mergeFetchedModels } from "./registry";
import type { FetchedModelInfo } from "./registry";
import type {
  CompletionRequest,
  ModelInfo,
  ProviderAdapter,
  ProviderEvent,
  ProviderRuntime,
  ReasoningRequest,
} from "./types";

const USER_AGENT = "ProjectX/0.0.0";

export function createOpenAiChatAdapter(): ProviderAdapter {
  return {
    async listModels(runtime: ProviderRuntime): Promise<ModelInfo[]> {
      const response = await runtime.fetch(`${trimUrl(runtime.config.baseUrl)}/models`, {
        headers: buildHeaders(runtime),
      });
      if (!response.ok) {
        const known = mergeFetchedModels(runtime.config, []);
        if (response.status === 404 && known.length > 0) {
          return known;
        }
        throw await providerError(response, runtime.config.label);
      }
      const payload = await response.json() as {
        data?: Array<{ id?: unknown; supported_parameters?: unknown }>;
      };
      const fetched = toFetchedModels(runtime.config.presetId, payload.data);
      return mergeFetchedModels(runtime.config, fetched);
    },

    async *stream(
      request: CompletionRequest,
      runtime: ProviderRuntime,
    ): AsyncGenerator<ProviderEvent> {
      const response = await runtime.fetch(endpointFor(request, runtime), {
        method: "POST",
        headers: buildHeaders(runtime, request.sessionId),
        body: JSON.stringify(buildBody(request, runtime.config.presetId)),
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

function buildBody(request: CompletionRequest, presetId: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model.id,
    messages: toOpenAiMessages(request.system, request.messages, {
      includeReasoningContent: presetId === "deepseek",
    }),
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
  applyReasoning(body, presetId, request.reasoning);
  return body;
}

/** Each openai-chat preset names the same idea differently (plan §6.2). */
function applyReasoning(
  body: Record<string, unknown>,
  presetId: string,
  reasoning: ReasoningRequest,
): void {
  if (presetId === "deepseek") {
    if (reasoning.mode === "off") {
      body.thinking = { type: "disabled" };
    } else if (reasoning.effort) {
      body.reasoning_effort = reasoning.effort;
    }
    return;
  }
  if (presetId === "openrouter") {
    if (reasoning.mode === "off") {
      body.reasoning = { effort: "none" };
    } else if (reasoning.effort) {
      body.reasoning = { effort: reasoning.effort };
    }
    return;
  }
  if (presetId === "groq") {
    if (reasoning.mode === "off") {
      body.reasoning_effort = "none";
    } else if (reasoning.effort) {
      body.reasoning_effort = reasoning.effort;
    }
  }
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

function toFetchedModels(
  presetId: string,
  data: Array<{ id?: unknown; supported_parameters?: unknown }> | undefined,
): FetchedModelInfo[] {
  if (!Array.isArray(data)) {
    return [];
  }
  const fetched: FetchedModelInfo[] = [];
  for (const item of data) {
    if (typeof item.id !== "string") {
      continue;
    }
    const reasoning = presetId === "openrouter" && supportsReasoning(item.supported_parameters)
      ? openRouterReasoning()
      : undefined;
    fetched.push({ id: item.id, ...(reasoning ? { reasoning } : {}) });
  }
  return fetched;
}

function supportsReasoning(parameters: unknown): boolean {
  if (!Array.isArray(parameters)) {
    return false;
  }
  return parameters.includes("reasoning") || parameters.includes("reasoning_effort");
}
