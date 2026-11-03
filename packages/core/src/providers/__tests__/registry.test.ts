import { describe, expect, it } from "vitest";

import {
  PRESETS,
  createProviderConfig,
  getPreset,
  knownModels,
  mergeModels,
} from "../registry";

describe("provider registry", () => {
  it("exposes the supported presets", () => {
    expect(PRESETS.map((preset) => preset.id)).toEqual([
      "deepseek",
      "opencode-go",
      "anthropic",
      "openai",
      "google",
      "openrouter",
      "groq",
      "custom",
    ]);
    expect(getPreset("deepseek")?.protocol).toBe("openai-chat");
  });

  it("creates a config with overrides", () => {
    const config = createProviderConfig("deepseek", {
      id: "deepseek-work",
      baseUrl: "https://example.test",
    });
    expect(config.id).toBe("deepseek-work");
    expect(config.presetId).toBe("deepseek");
    expect(config.baseUrl).toBe("https://example.test");
  });

  it("rejects unknown presets", () => {
    let thrown: unknown;
    try {
      createProviderConfig("nope");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ code: "db_invalid" });
  });

  it("merges fetched ids with known models", () => {
    const config = createProviderConfig("deepseek", { id: "deepseek-work" });
    const models = mergeModels(config, ["deepseek-chat", "unknown-model"]);

    expect(models.map((model) => model.id)).toEqual(["deepseek-chat", "unknown-model"]);
    expect(models[0]?.providerId).toBe("deepseek-work");
    expect(models[1]?.capabilities.tools).toBe(true);
  });

  it("routes OpenCode Go models by wire protocol", () => {
    const models = knownModels("opencode-go");
    const anthropic = models.find((model) => model.id === "claude-haiku-5-5");
    const responses = models.find((model) => model.id === "gpt-6-luna");
    const google = models.find((model) => model.id === "gemini-4-argon");

    expect(anthropic?.protocol).toBe("anthropic");
    expect(anthropic?.endpoint).toBe("https://opencode.ai/inference/go/anthropic/v1/messages");
    expect(responses?.protocol).toBe("openai-responses");
    expect(responses?.endpoint).toBe("https://opencode.ai/inference/go/openai/v1/responses");
    expect(google?.protocol).toBe("google");
    expect(google?.endpoint).toContain("gemini-4-argon:streamGenerateContent");
  });

  it("returns known Go models when the fetched list is empty", () => {
    const models = mergeModels(createProviderConfig("opencode-go"), []);
    expect(models.some((model) => model.id === "deepseek-v4.1-flash")).toBe(true);
    expect(models.length).toBeGreaterThan(20);
  });

  it("keeps known routing when merging fetched Go ids", () => {
    const config = createProviderConfig("opencode-go");
    const models = mergeModels(config, ["claude-haiku-5-5", "unknown-go-model"]);
    expect(models[0]?.protocol).toBe("anthropic");
    expect(models[1]?.protocol).toBe("openai-chat");
  });
});
