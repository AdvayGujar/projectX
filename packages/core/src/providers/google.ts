import { AppError } from "../errors";
import { providerError } from "./errors";
import { toGoogleContents, toGoogleTools } from "./googleMessages";
import { streamGoogleEvents } from "./googleStream";
import { mergeModels } from "./registry";
import type {
  CompletionRequest,
  ModelInfo,
  ProviderAdapter,
  ProviderEvent,
  ProviderRuntime,
} from "./types";

const USER_AGENT = "ProjectX/0.0.0";

export function createGoogleAdapter(): ProviderAdapter {
  return {
    async listModels(runtime: ProviderRuntime): Promise<ModelInfo[]> {
      if (runtime.config.presetId === "opencode-go") {
        return mergeModels(runtime.config, [])
          .filter((model) => model.protocol === "google");
      }
      const response = await runtime.fetch(`${trimUrl(runtime.config.baseUrl)}/models`, {
        headers: buildHeaders(runtime),
      });
      if (!response.ok) {
        throw await providerError(response, runtime.config.label);
      }
      const payload = await response.json() as {
        models?: Array<{ name?: unknown; supportedGenerationMethods?: unknown }>;
      };
      const ids = Array.isArray(payload.models)
        ? payload.models
          .filter((model) => supportsGenerate(model.supportedGenerationMethods))
          .map((model) => typeof model.name === "string" ? model.name.replace(/^models\//, "") : null)
          .filter((id): id is string => id !== null)
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
        throw new AppError("provider_invalid_response", "Google returned an empty body", {
          userMessage: "Google returned an empty response.",
        });
      }
      yield* streamGoogleEvents(response.body);
    },
  };
}

function buildBody(request: CompletionRequest): Record<string, unknown> {
  const input = toGoogleContents(request.system, request.messages);
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: request.maxOutputTokens,
  };
  if (request.temperature !== undefined) {
    generationConfig.temperature = request.temperature;
  }
  if (request.reasoning.mode === "off") {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  } else if (request.reasoning.effort) {
    generationConfig.thinkingConfig = { thinkingLevel: request.reasoning.effort };
  }
  const body: Record<string, unknown> = {
    contents: input.contents,
    generationConfig,
  };
  if (input.systemInstruction) {
    body.systemInstruction = input.systemInstruction;
  }
  const tools = toGoogleTools(request.tools);
  if (tools) {
    body.tools = tools;
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
    headers["x-goog-api-key"] = runtime.apiKey;
  }
  if (runtime.config.presetId === "opencode-go" && sessionId) {
    headers["x-opencode-session"] = sessionId;
  }
  return headers;
}

function endpointFor(request: CompletionRequest, runtime: ProviderRuntime): string {
  if (request.model.endpoint) {
    return request.model.endpoint;
  }
  const base = trimUrl(runtime.config.baseUrl);
  return `${base}/models/${request.model.id}:streamGenerateContent?alt=sse`;
}

function supportsGenerate(methods: unknown): boolean {
  return Array.isArray(methods) && methods.includes("generateContent");
}

function trimUrl(url: string): string {
  return url.replace(/\/+$/, "");
}
