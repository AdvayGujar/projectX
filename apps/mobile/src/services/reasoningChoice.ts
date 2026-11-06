import type { ReasoningRequest } from "@projectx/core";
import { normalizeReasoningEffort } from "@projectx/core";
import type { ModelOption } from "@projectx/ui";

/** The composer's Think pill and the neutral request are derived from one model choice. */

export interface ThinkPresentation {
  readonly active: boolean;
  readonly label: "Think" | "Always on";
  readonly locked: boolean;
}

export function thinkPresentation(
  model: ModelOption | null,
  thinkOff: boolean,
): ThinkPresentation {
  if (!model?.reasoning) {
    return { active: false, label: "Think", locked: true };
  }
  if (!model.canDisableReasoning) {
    return { active: true, label: "Always on", locked: true };
  }
  return { active: !thinkOff, label: "Think", locked: false };
}

export function reasoningRequestFor(
  model: ModelOption | null,
  thinkOff: boolean,
): ReasoningRequest {
  if (!model?.reasoning || (thinkOff && model.canDisableReasoning)) {
    return { mode: "off" };
  }
  return clampReasoningRequest(model, { mode: "on" });
}

/**
 * Re-runs a stored request against today's capabilities: an effort the model no longer
 * exposes falls back to its default, and a disabled mode is refused when it is always on.
 */
export function clampReasoningRequest(
  model: ModelOption | null,
  request: ReasoningRequest,
): ReasoningRequest {
  if (!model?.reasoning) {
    return { mode: "off" };
  }
  if (request.mode === "off") {
    return model.canDisableReasoning ? request : { mode: "on" };
  }
  if (request.effort && model.reasoningEfforts.includes(request.effort)) {
    return request;
  }
  const fallback = normalizeReasoningEffort(model.effort);
  if (fallback && model.reasoningEfforts.includes(fallback)) {
    return { mode: "on", effort: fallback };
  }
  return { mode: "on" };
}

/** What the cost line and stored message record for this turn. */
export function recordedEffort(request: ReasoningRequest): string {
  return request.mode === "off" ? "off" : request.effort ?? "on";
}
