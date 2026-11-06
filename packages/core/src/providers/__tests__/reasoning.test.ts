import { describe, expect, it } from "vitest";

import {
  assertReasoningRequest,
  healReasoningCapabilities,
  normalizeReasoningEffort,
  reasoningForPreset,
  reasoningFromStoredEffort,
} from "../reasoning";
import { knownModels } from "../registry";
import type { ModelInfo, ReasoningCapabilities } from "../types";

function model(id: string, reasoning: ReasoningCapabilities): ModelInfo {
  return {
    id,
    label: id,
    providerId: "provider-1",
    protocol: "openai-chat",
    contextWindow: 128_000,
    maxOutput: 8_192,
    capabilities: { tools: true, vision: false, reasoning },
  };
}

describe("reasoning capabilities", () => {
  it("reports DeepSeek effort levels and lets thinking be disabled", () => {
    const capabilities = reasoningForPreset("deepseek", "deepseek-flash");
    expect(capabilities).toEqual({
      supported: true,
      canDisable: true,
      efforts: ["low", "high", "max"],
    });
  });

  it("marks models that always reason as undisableable", () => {
    expect(reasoningForPreset("google", "gemini-4-argon").canDisable).toBe(false);
    expect(reasoningForPreset("anthropic", "claude-opus-5-5").canDisable).toBe(false);
    expect(reasoningForPreset("anthropic", "claude-haiku-5-5").canDisable).toBe(true);
    expect(reasoningForPreset("anthropic", "claude-sonnet-5").canDisable).toBe(true);
    expect(reasoningForPreset("openai", "gpt-6-luna").canDisable).toBe(true);
    expect(reasoningForPreset("groq", "gpt-oss-120b")).toEqual({
      supported: true,
      canDisable: false,
      efforts: ["low", "medium", "high", "xhigh"],
    });
    expect(reasoningForPreset("groq", "qwen-3.8-27b").canDisable).toBe(true);
  });

  it("does not claim reasoning for a custom endpoint", () => {
    expect(reasoningForPreset("custom", "anything").supported).toBe(false);
  });

  it("rejects turning reasoning off on an always-on model", () => {
    const argon = knownModels("google")[0];
    if (!argon) {
      throw new Error("missing fixture model");
    }
    expect(() => assertReasoningRequest(argon, { mode: "off" })).toThrowError(
      expect.objectContaining({ code: "invalid_request" }),
    );
    expect(() => assertReasoningRequest(argon, { mode: "on", effort: "high" })).not.toThrow();
  });

  it("rejects an effort the model does not accept", () => {
    const deepseek = knownModels("deepseek")[0];
    if (!deepseek) {
      throw new Error("missing fixture model");
    }
    expect(() => assertReasoningRequest(deepseek, { mode: "on", effort: "medium" }))
      .toThrowError(expect.objectContaining({ code: "invalid_request" }));
    expect(() => assertReasoningRequest(deepseek, { mode: "on", effort: "high" })).not.toThrow();
    expect(() => assertReasoningRequest(deepseek, { mode: "off" })).not.toThrow();
  });

  it("rejects reasoning on a model that does not support it", () => {
    const off = model("plain", { supported: false, canDisable: false, efforts: [] });
    expect(() => assertReasoningRequest(off, { mode: "on" })).toThrowError(
      expect.objectContaining({ code: "invalid_request" }),
    );
    expect(() => assertReasoningRequest(off, { mode: "off" })).not.toThrow();
  });

  it("normalises stored display values", () => {
    expect(normalizeReasoningEffort("High")).toBe("high");
    expect(normalizeReasoningEffort("xhigh")).toBe("xhigh");
    expect(normalizeReasoningEffort("standard")).toBeNull();
    expect(normalizeReasoningEffort(undefined)).toBeNull();
  });

  it("rebuilds a reasoning request from the stored effort", () => {
    expect(reasoningFromStoredEffort("High")).toEqual({ mode: "on", effort: "high" });
    expect(reasoningFromStoredEffort("Off")).toEqual({ mode: "off" });
    expect(reasoningFromStoredEffort("Standard")).toEqual({ mode: "off" });
    expect(reasoningFromStoredEffort(null)).toEqual({ mode: "off" });
  });

  it("heals a boolean-only cached capability from curated truth", () => {
    const curated: ReasoningCapabilities = {
      supported: true,
      canDisable: true,
      efforts: ["low", "high", "max"],
    };
    expect(healReasoningCapabilities(
      { supported: true, canDisable: false, efforts: [] },
      curated,
    )).toEqual(curated);
    expect(healReasoningCapabilities(
      { supported: false, canDisable: false, efforts: [] },
      curated,
    )).toEqual(curated);
    expect(healReasoningCapabilities(
      { supported: true, canDisable: true, efforts: ["medium"] },
      curated,
    )).toEqual({ supported: true, canDisable: true, efforts: ["medium"] });
  });

  it("serves per-model capabilities through the curated catalogs", () => {
    const anthropic = knownModels("anthropic")[0];
    const openai = knownModels("openai")[0];
    expect(anthropic?.capabilities.reasoning.efforts).toContain("xhigh");
    expect(openai?.capabilities.reasoning.efforts).toContain("minimal");
  });
});
