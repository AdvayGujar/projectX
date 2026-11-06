import { AppError } from "../errors";
import { REASONING_EFFORTS } from "./types";
import type {
  ModelInfo,
  ReasoningCapabilities,
  ReasoningEffort,
  ReasoningRequest,
} from "./types";

/**
 * Reasoning is a per-model capability, not a per-protocol one. The request is neutral;
 * adapters map it to the dialect their preset actually understands (plan §6.2).
 */

export const NO_REASONING: ReasoningCapabilities = {
  supported: false,
  canDisable: false,
  efforts: [],
};

const DEEPSEEK_EFFORTS: readonly ReasoningEffort[] = ["low", "high", "max"];
const ANTHROPIC_EFFORTS: readonly ReasoningEffort[] = ["low", "medium", "high", "xhigh", "max"];
const OPENAI_EFFORTS: readonly ReasoningEffort[] = REASONING_EFFORTS;
const GOOGLE_EFFORTS: readonly ReasoningEffort[] = ["minimal", "low", "medium", "high"];
const GROQ_EFFORTS: readonly ReasoningEffort[] = ["low", "medium", "high", "xhigh"];

export function reasoningCapabilities(
  supported: boolean,
  canDisable: boolean,
  efforts: readonly ReasoningEffort[] = [],
): ReasoningCapabilities {
  return supported
    ? { supported: true, canDisable, efforts: [...efforts] }
    : { ...NO_REASONING, efforts: [] };
}

/** A model that always reasons, with no effort control the app has verified. */
export function alwaysOnReasoning(
  efforts: readonly ReasoningEffort[] = [],
): ReasoningCapabilities {
  return reasoningCapabilities(true, false, efforts);
}

/** OpenRouter reports reasoning support per model through `supported_parameters`. */
export function openRouterReasoning(): ReasoningCapabilities {
  return reasoningCapabilities(true, true, REASONING_EFFORTS);
}

/** Go's catalog only says whether a model reasons; it does not expose a control. */
export function reasoningFromCatalog(supported: boolean): ReasoningCapabilities {
  return supported ? alwaysOnReasoning() : NO_REASONING;
}

/**
 * Curated and inferred capabilities for a preset. Anything the app cannot verify is
 * reported as unsupported so the composer never shows a toggle the provider would ignore.
 */
export function reasoningForPreset(presetId: string, modelId: string): ReasoningCapabilities {
  const id = modelId.toLowerCase();
  switch (presetId) {
    case "deepseek":
      return id.startsWith("deepseek")
        ? reasoningCapabilities(true, true, DEEPSEEK_EFFORTS)
        : NO_REASONING;
    case "anthropic":
      return id.startsWith("claude")
        ? reasoningCapabilities(true, canDisableAnthropic(id), ANTHROPIC_EFFORTS)
        : NO_REASONING;
    case "openai":
      return /^(gpt-5|gpt-6|o[0-9])/.test(id)
        ? reasoningCapabilities(true, id.includes("luna"), OPENAI_EFFORTS)
        : NO_REASONING;
    case "google":
      return id.startsWith("gemini")
        ? reasoningCapabilities(true, id.includes("2.5-flash"), GOOGLE_EFFORTS)
        : NO_REASONING;
    case "groq":
      if (id.includes("qwen")) {
        return reasoningCapabilities(true, true, GROQ_EFFORTS);
      }
      return id.includes("gpt-oss") ? alwaysOnReasoning(GROQ_EFFORTS) : NO_REASONING;
    default:
      return NO_REASONING;
  }
}

/**
 * Haiku 5.5 and Sonnet 5 can turn thinking off; Opus 5.5, Fable, and Mythos cannot.
 * Unknown Claude ids stay always-on rather than exposing a toggle that may 400.
 */
function canDisableAnthropic(id: string): boolean {
  if (id.includes("opus") || id.includes("fable") || id.includes("mythos")) {
    return false;
  }
  return id.includes("haiku-5-5") || id.includes("sonnet-5");
}

export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === "string"
    && (REASONING_EFFORTS as readonly string[]).includes(value);
}

/** Accepts stored display values such as `High` and returns the neutral value. */
export function normalizeReasoningEffort(
  value: string | null | undefined,
): ReasoningEffort | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return isReasoningEffort(normalized) ? normalized : null;
}

/** Rebuilds the request a stored assistant turn ran with, for regenerate. */
export function reasoningFromStoredEffort(
  effort: string | null | undefined,
): ReasoningRequest {
  const normalized = effort?.trim().toLowerCase();
  if (!normalized || normalized === "off" || normalized === "standard") {
    return { mode: "off" };
  }
  const level = normalizeReasoningEffort(normalized);
  return level ? { mode: "on", effort: level } : { mode: "off" };
}

/**
 * Rejects a request the selected model cannot honour. Callers must do this before a
 * request is built, so a toggle can never be silently dropped (plan §6.1).
 */
export function assertReasoningRequest(model: ModelInfo, request: ReasoningRequest): void {
  const capabilities = model.capabilities.reasoning;
  if (request.mode === "off") {
    if (capabilities.supported && !capabilities.canDisable) {
      throw new AppError(
        "invalid_request",
        `Model ${model.id} cannot disable reasoning`,
        { userMessage: "This model cannot turn reasoning off." },
      );
    }
    return;
  }
  if (!capabilities.supported) {
    throw new AppError(
      "invalid_request",
      `Model ${model.id} does not support reasoning`,
      { userMessage: "This model does not support reasoning." },
    );
  }
  if (request.effort && !capabilities.efforts.includes(request.effort)) {
    throw new AppError(
      "invalid_request",
      `Model ${model.id} does not support effort ${request.effort}`,
      { userMessage: "This model does not support that reasoning effort." },
    );
  }
}

/**
 * Heals a cached model whose capability was stored before the model catalog gained
 * per-model reasoning details. Curated truth wins over a stale boolean-only value.
 */
export function healReasoningCapabilities(
  cached: ReasoningCapabilities,
  curated: ReasoningCapabilities,
): ReasoningCapabilities {
  if (!curated.supported) {
    return cached;
  }
  if (!cached.supported) {
    return curated;
  }
  return {
    supported: true,
    canDisable: cached.canDisable || curated.canDisable,
    efforts: cached.efforts.length > 0 ? cached.efforts : curated.efforts,
  };
}
