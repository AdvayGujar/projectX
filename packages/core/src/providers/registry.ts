import { AppError } from "../errors";
import type { ModelInfo, Protocol, ProviderConfig } from "./types";

export interface ProviderPreset {
  id: string;
  label: string;
  protocol: Protocol;
  baseUrl: string;
  keyHint: string;
}

export interface ProviderConfigOverrides {
  id?: string;
  label?: string;
  baseUrl?: string;
  protocol?: Protocol;
  headers?: Record<string, string>;
}

const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_OUTPUT = 8_192;

export const PRESETS: ProviderPreset[] = [
  { id: "deepseek", label: "DeepSeek", protocol: "openai-chat", baseUrl: "https://api.deepseek.com", keyHint: "sk-..." },
  { id: "opencode-go", label: "OpenCode Go", protocol: "openai-chat", baseUrl: "https://opencode.ai/inference/go/openai/v1", keyHint: "Paste the Go key" },
  { id: "anthropic", label: "Anthropic", protocol: "anthropic", baseUrl: "https://api.anthropic.com", keyHint: "sk-ant-..." },
  { id: "openai", label: "OpenAI", protocol: "openai-responses", baseUrl: "https://api.openai.com/v1", keyHint: "sk-..." },
  { id: "google", label: "Google Gemini", protocol: "google", baseUrl: "https://generativelanguage.googleapis.com/v1beta", keyHint: "AIza..." },
  { id: "openrouter", label: "OpenRouter", protocol: "openai-chat", baseUrl: "https://openrouter.ai/api/v1", keyHint: "sk-or-..." },
  { id: "groq", label: "Groq", protocol: "openai-chat", baseUrl: "https://api.groq.com/openai/v1", keyHint: "gsk_..." },
  { id: "custom", label: "Custom OpenAI-compatible", protocol: "openai-chat", baseUrl: "http://localhost:1234/v1", keyHint: "Optional" },
];

const DEEPSEEK_MODELS: ModelInfo[] = [
  {
    id: "deepseek-chat",
    label: "DeepSeek Chat",
    providerId: "deepseek",
    protocol: "openai-chat",
    contextWindow: 128_000,
    maxOutput: 8_192,
    capabilities: { tools: true, vision: false, reasoning: false },
  },
  {
    id: "deepseek-reasoner",
    label: "DeepSeek Reasoner",
    providerId: "deepseek",
    protocol: "openai-chat",
    contextWindow: 128_000,
    maxOutput: 65_536,
    capabilities: { tools: false, vision: false, reasoning: true },
  },
];

const GO_ROOT = "https://opencode.ai/inference/go";
const GO_CHAT_ENDPOINT = `${GO_ROOT}/openai/v1/chat/completions`;
const GO_RESPONSES_ENDPOINT = `${GO_ROOT}/openai/v1/responses`;
const GO_ANTHROPIC_ENDPOINT = `${GO_ROOT}/anthropic/v1/messages`;
const GO_GOOGLE_ENDPOINT = (id: string) =>
  `${GO_ROOT}/google/v1beta/models/${id}:streamGenerateContent?alt=sse`;

function goModel(
  id: string,
  label: string,
  protocol: Protocol,
  endpoint: string,
  options: { contextWindow?: number; maxOutput?: number; reasoning?: boolean; vision?: boolean } = {},
): ModelInfo {
  return {
    id,
    label,
    providerId: "opencode-go",
    protocol,
    contextWindow: options.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
    maxOutput: options.maxOutput ?? DEFAULT_MAX_OUTPUT,
    capabilities: {
      tools: true,
      vision: options.vision ?? false,
      reasoning: options.reasoning ?? false,
    },
    endpoint,
  };
}

const GO_MODELS: ModelInfo[] = [
  goModel("deepseek-v4.1-flash", "DeepSeek V4.1 Flash", "openai-chat", GO_CHAT_ENDPOINT, { reasoning: true, vision: true }),
  goModel("deepseek-v4-pro", "DeepSeek V4 Pro", "openai-chat", GO_CHAT_ENDPOINT, { reasoning: true }),
  goModel("glm-5.3-flash", "GLM 5.3 Flash", "openai-chat", GO_CHAT_ENDPOINT, { vision: true }),
  goModel("glm-5.3", "GLM 5.3", "openai-chat", GO_CHAT_ENDPOINT),
  goModel("glm-5.2", "GLM 5.2", "openai-chat", GO_CHAT_ENDPOINT),
  goModel("kimi-k3.1-pro", "Kimi K3.1 Pro", "openai-chat", GO_CHAT_ENDPOINT, { vision: true }),
  goModel("kimi-k3", "Kimi K3", "openai-chat", GO_CHAT_ENDPOINT, { vision: true }),
  goModel("kimi-k2.7-code", "Kimi K2.7 Code", "openai-chat", GO_CHAT_ENDPOINT, { vision: true }),
  goModel("minimax-m3.1-flash", "MiniMax M3.1 Flash", "openai-chat", GO_CHAT_ENDPOINT, { vision: true }),
  goModel("longcat-2.0", "LongCat 2.0", "openai-chat", GO_CHAT_ENDPOINT),
  goModel("mimo-v2.6-flash", "MiMo V2.6 Flash", "openai-chat", GO_CHAT_ENDPOINT, { vision: true }),
  goModel("mimo-v2.6-pro", "MiMo V2.6 Pro", "openai-chat", GO_CHAT_ENDPOINT, { vision: true }),
  goModel("step-5-preview", "Step 5 Preview", "openai-chat", GO_CHAT_ENDPOINT, { vision: true }),
  goModel("hy4-preview", "Hy4 Preview", "openai-chat", GO_CHAT_ENDPOINT),
  goModel("hy3", "Hy3", "openai-chat", GO_CHAT_ENDPOINT),
  goModel("mimo-v2.5", "MiMo V2.5", "openai-chat", GO_CHAT_ENDPOINT, { vision: true }),
  goModel("mimo-v2.5-pro", "MiMo V2.5 Pro", "openai-chat", GO_CHAT_ENDPOINT, { vision: true }),
  goModel("beam-free", "Beam Free", "openai-chat", GO_CHAT_ENDPOINT),
  goModel("iceman-contributor-free", "Iceman Contributor Free", "openai-chat", GO_CHAT_ENDPOINT),
  goModel("grok-4.7", "Grok 4.7", "openai-responses", GO_RESPONSES_ENDPOINT, { reasoning: true, vision: true }),
  goModel("gpt-6-luna", "GPT 6 Luna", "openai-responses", GO_RESPONSES_ENDPOINT, { reasoning: true, vision: true }),
  goModel("gpt-5.6-luna", "GPT 5.6 Luna", "openai-responses", GO_RESPONSES_ENDPOINT, { reasoning: true, vision: true }),
  goModel("muse-spark-1.3-contributor", "Muse Spark 1.3 Contributor", "openai-responses", GO_RESPONSES_ENDPOINT, { reasoning: true, vision: true }),
  goModel("muse-spark-1.2-contributor", "Muse Spark 1.2 Contributor", "openai-responses", GO_RESPONSES_ENDPOINT, { reasoning: true, vision: true }),
  goModel("claude-haiku-5-5", "Claude Haiku 5.5", "anthropic", GO_ANTHROPIC_ENDPOINT, { contextWindow: 200_000, vision: true }),
  goModel("minimax-m3", "MiniMax M3", "anthropic", GO_ANTHROPIC_ENDPOINT, { vision: true }),
  goModel("qwen3.8-max", "Qwen3.8 Max", "anthropic", GO_ANTHROPIC_ENDPOINT, { vision: true }),
  goModel("qwen3.8-flash", "Qwen3.8 Flash", "anthropic", GO_ANTHROPIC_ENDPOINT, { vision: true }),
  goModel("qwen3.7-plus", "Qwen3.7 Plus", "anthropic", GO_ANTHROPIC_ENDPOINT, { vision: true }),
  goModel("gemini-4-argon", "Gemini 4 Argon", "google", GO_GOOGLE_ENDPOINT("gemini-4-argon"), { contextWindow: 1_000_000, vision: true, reasoning: true }),
];

const ANTHROPIC_MODELS: ModelInfo[] = [
  {
    id: "claude-haiku-5-5",
    label: "Claude Haiku 5.5",
    providerId: "anthropic",
    protocol: "anthropic",
    contextWindow: 200_000,
    maxOutput: 8_192,
    capabilities: { tools: true, vision: true, reasoning: true },
  },
];

const OPENAI_MODELS: ModelInfo[] = [
  {
    id: "gpt-6-luna",
    label: "GPT 6 Luna",
    providerId: "openai",
    protocol: "openai-responses",
    contextWindow: 272_000,
    maxOutput: 16_384,
    capabilities: { tools: true, vision: true, reasoning: true },
  },
];

const GOOGLE_MODELS: ModelInfo[] = [
  {
    id: "gemini-4-argon",
    label: "Gemini 4 Argon",
    providerId: "google",
    protocol: "google",
    contextWindow: 1_000_000,
    maxOutput: 8_192,
    capabilities: { tools: true, vision: true, reasoning: true },
  },
];

export function getPreset(id: string): ProviderPreset | null {
  return PRESETS.find((preset) => preset.id === id) ?? null;
}

export function createProviderConfig(
  presetId: string,
  overrides: ProviderConfigOverrides = {},
): ProviderConfig {
  const preset = getPreset(presetId);
  if (!preset) {
    throw new AppError("db_invalid", `Unknown provider preset: ${presetId}`, {
      userMessage: "Unknown provider.",
    });
  }
  return {
    id: overrides.id ?? preset.id,
    presetId,
    label: overrides.label ?? preset.label,
    protocol: overrides.protocol ?? preset.protocol,
    baseUrl: overrides.baseUrl ?? preset.baseUrl,
    headers: overrides.headers,
  };
}

export function knownModels(presetId: string): ModelInfo[] {
  if (presetId === "deepseek") {
    return DEEPSEEK_MODELS;
  }
  if (presetId === "opencode-go") {
    return GO_MODELS.map((model) => ({ ...model }));
  }
  if (presetId === "anthropic") {
    return ANTHROPIC_MODELS.map((model) => ({ ...model }));
  }
  if (presetId === "openai") {
    return OPENAI_MODELS.map((model) => ({ ...model }));
  }
  if (presetId === "google") {
    return GOOGLE_MODELS.map((model) => ({ ...model }));
  }
  return [];
}

/** Capabilities a provider catalog reports for one model; every field is optional. */
export interface FetchedModelInfo {
  readonly id: string;
  readonly label?: string;
  readonly vision?: boolean;
  readonly tools?: boolean;
  readonly reasoning?: boolean;
  readonly contextWindow?: number;
  readonly maxOutput?: number;
}

export function mergeModels(config: ProviderConfig, ids: string[]): ModelInfo[] {
  return mergeFetchedModels(config, ids.map((id) => ({ id })));
}

/**
 * Catalog metadata wins over the curated entry: providers can add models and correct
 * capabilities without an app release. Curated routing (protocol, endpoint) is kept.
 */
export function mergeFetchedModels(
  config: ProviderConfig,
  fetched: readonly FetchedModelInfo[],
): ModelInfo[] {
  const known = knownModels(config.presetId).map((model) => ({
    ...model,
    providerId: config.id,
  }));
  if (fetched.length === 0) {
    return known;
  }
  const byId = new Map(known.map((model) => [model.id, model]));
  const merged = fetched.map((remote) => {
    const base = byId.get(remote.id) ?? defaultModel(config, remote.id);
    return {
      ...base,
      label: remote.label ?? base.label,
      contextWindow: remote.contextWindow ?? base.contextWindow,
      maxOutput: remote.maxOutput ?? base.maxOutput,
      capabilities: {
        tools: remote.tools ?? base.capabilities.tools,
        vision: remote.vision ?? base.capabilities.vision,
        reasoning: remote.reasoning ?? base.capabilities.reasoning,
      },
    };
  });
  return Array.from(new Map(merged.map((model) => [model.id, model])).values());
}

/**
 * Heals model rows cached before the catalog reported a capability. The union is
 * deliberate: a stale `false` must not win over a known `true`, and provider metadata
 * must still be able to grant a capability the curated list lacks.
 */
export function applyKnownCapabilities(
  presetId: string,
  models: readonly ModelInfo[],
): ModelInfo[] {
  const known = new Map(knownModels(presetId).map((model) => [model.id, model]));
  return models.map((model) => {
    const curated = known.get(model.id);
    if (!curated) {
      return model;
    }
    return {
      ...model,
      capabilities: {
        tools: model.capabilities.tools || curated.capabilities.tools,
        vision: model.capabilities.vision || curated.capabilities.vision,
        reasoning: model.capabilities.reasoning || curated.capabilities.reasoning,
      },
    };
  });
}

function defaultModel(config: ProviderConfig, id: string): ModelInfo {
  return {
    id,
    label: id,
    providerId: config.id,
    protocol: config.protocol,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxOutput: DEFAULT_MAX_OUTPUT,
    capabilities: { tools: true, vision: false, reasoning: false },
  };
}
