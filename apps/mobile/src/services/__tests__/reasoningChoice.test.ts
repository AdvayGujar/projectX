import { describe, expect, it } from "@jest/globals";
import type { ModelOption } from "@projectx/ui";

import {
  clampReasoningRequest,
  reasoningRequestFor,
  recordedEffort,
  thinkPresentation,
} from "../reasoningChoice";

function model(overrides: Partial<ModelOption> = {}): ModelOption {
  return {
    id: "provider-1:deepseek-flash",
    label: "DeepSeek Flash",
    provider: "DeepSeek",
    effort: "high",
    reasoning: true,
    canDisableReasoning: true,
    reasoningEfforts: ["low", "high", "max"],
    vision: false,
    tools: true,
    ...overrides,
  };
}

describe("reasoning choice", () => {
  it("maps the think pill and request for a model that can turn reasoning off", () => {
    expect(thinkPresentation(model(), false)).toEqual({
      active: true,
      label: "Think",
      locked: false,
    });
    expect(reasoningRequestFor(model(), false)).toEqual({ mode: "on", effort: "high" });

    expect(thinkPresentation(model(), true)).toEqual({
      active: false,
      label: "Think",
      locked: false,
    });
    expect(reasoningRequestFor(model(), true)).toEqual({ mode: "off" });
  });

  it("keeps an always-on model on and locks the pill", () => {
    const alwaysOn = model({
      effort: "on",
      canDisableReasoning: false,
      reasoningEfforts: [],
    });
    expect(thinkPresentation(alwaysOn, true)).toEqual({
      active: true,
      label: "Always on",
      locked: true,
    });
    expect(reasoningRequestFor(alwaysOn, true)).toEqual({ mode: "on" });
  });

  it("does not request reasoning from a model that has none", () => {
    const plain = model({
      effort: "standard",
      reasoning: false,
      canDisableReasoning: false,
      reasoningEfforts: [],
    });
    expect(thinkPresentation(plain, false)).toEqual({
      active: false,
      label: "Think",
      locked: true,
    });
    expect(reasoningRequestFor(plain, false)).toEqual({ mode: "off" });
    expect(reasoningRequestFor(null, false)).toEqual({ mode: "off" });
  });

  it("records off, the chosen effort, or plain on for the cost line", () => {
    expect(recordedEffort({ mode: "off" })).toBe("off");
    expect(recordedEffort({ mode: "on", effort: "xhigh" })).toBe("xhigh");
    expect(recordedEffort({ mode: "on" })).toBe("on");
  });

  it("clamps a stored request to the model's current capabilities", () => {
    const flexible = model();
    expect(clampReasoningRequest(flexible, { mode: "on", effort: "medium" }))
      .toEqual({ mode: "on", effort: "high" });
    expect(clampReasoningRequest(flexible, { mode: "on", effort: "max" }))
      .toEqual({ mode: "on", effort: "max" });

    const alwaysOn = model({ effort: "on", canDisableReasoning: false, reasoningEfforts: [] });
    expect(clampReasoningRequest(alwaysOn, { mode: "on", effort: "high" }))
      .toEqual({ mode: "on" });
    expect(clampReasoningRequest(alwaysOn, { mode: "off" })).toEqual({ mode: "on" });

    expect(clampReasoningRequest(null, { mode: "on", effort: "high" })).toEqual({ mode: "off" });
  });
});
