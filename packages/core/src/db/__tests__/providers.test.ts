import { describe, expect, it } from "vitest";

import { createProviderRepository } from "../index";
import type { ModelInfo } from "../../providers";
import { withContext } from "./helpers";

const ANTHROPIC_MODEL: ModelInfo = {
  id: "claude-sonnet-4-5",
  label: "Claude Sonnet 4.5",
  providerId: "provider-1",
  protocol: "anthropic",
  contextWindow: 200_000,
  maxOutput: 8_192,
  capabilities: {
    tools: true,
    vision: true,
    reasoning: { supported: true, canDisable: true, efforts: ["low", "medium", "high"] },
  },
  pricing: { input: 3, output: 15 },
};

describe("provider repository", () => {
  it("adds, lists and reads a provider", () => withContext(async (ctx) => {
    const providers = createProviderRepository(ctx);
    const created = await providers.add({
      presetId: "anthropic",
      label: "  Anthropic  ",
      protocol: "anthropic",
      baseUrl: "https://api.anthropic.com",
      keyRef: "provider-key-1",
    });

    expect(created.label).toBe("Anthropic");
    expect(created.enabled).toBe(true);
    expect(created.keyRef).toBe("provider-key-1");
    expect((await providers.get(created.id))?.id).toBe(created.id);
    expect((await providers.list()).map((provider) => provider.id)).toEqual([created.id]);
  }));

  it("rejects an empty label", () => withContext(async (ctx) => {
    const providers = createProviderRepository(ctx);
    await expect(
      providers.add({
        presetId: "openai",
        label: "   ",
        protocol: "openai-responses",
        baseUrl: "https://api.openai.com/v1",
        keyRef: "key",
      }),
    ).rejects.toMatchObject({ code: "db_invalid" });
  }));

  it("toggles and removes a provider with its cached models", () => withContext(async (ctx) => {
    const providers = createProviderRepository(ctx);
    const created = await providers.add({
      presetId: "anthropic",
      label: "Anthropic",
      protocol: "anthropic",
      baseUrl: "https://api.anthropic.com",
      keyRef: "key-2",
    });

    await providers.setEnabled(created.id, false);
    expect((await providers.get(created.id))?.enabled).toBe(false);

    await providers.saveModels(created.id, [ANTHROPIC_MODEL]);
    expect(await providers.listModels(created.id)).toHaveLength(1);

    await providers.remove(created.id);
    expect(await providers.get(created.id)).toBeNull();
    expect(await providers.listModels(created.id)).toEqual([]);
  }));

  it("round-trips models and drops unreadable rows", () => withContext(async (ctx) => {
    const providers = createProviderRepository(ctx);
    const created = await providers.add({
      presetId: "anthropic",
      label: "Anthropic",
      protocol: "anthropic",
      baseUrl: "https://api.anthropic.com",
      keyRef: "key-3",
    });

    await providers.saveModels(created.id, [ANTHROPIC_MODEL]);
    await ctx.db.execute(
      "INSERT INTO models_cache (provider_id, model_id, json, fetched_at) VALUES (?, ?, ?, ?)",
      [created.id, "broken", "{not json", 1],
    );

    const models = await providers.listModels(created.id);
    expect(models.map((model) => model.id)).toEqual(["claude-sonnet-4-5"]);
    expect(models[0]?.capabilities.vision).toBe(true);
  }));

  it("loads a cached model whose reasoning was stored as a boolean", () => withContext(async (ctx) => {
    const providers = createProviderRepository(ctx);
    const created = await providers.add({
      presetId: "anthropic",
      label: "Anthropic",
      protocol: "anthropic",
      baseUrl: "https://api.anthropic.com",
      keyRef: "key-4",
    });
    const legacy = {
      ...ANTHROPIC_MODEL,
      capabilities: { tools: true, vision: true, reasoning: true },
    };
    await ctx.db.execute(
      "INSERT INTO models_cache (provider_id, model_id, json, fetched_at) VALUES (?, ?, ?, ?)",
      [created.id, legacy.id, JSON.stringify(legacy), 1],
    );

    const [model] = await providers.listModels(created.id);
    expect(model?.capabilities.reasoning).toEqual({
      supported: true,
      canDisable: false,
      efforts: [],
    });
  }));

  it("reports a missing provider", () => withContext(async (ctx) => {
    const providers = createProviderRepository(ctx);
    await expect(providers.setEnabled("missing", false)).rejects.toMatchObject({
      code: "db_not_found",
    });
    await expect(providers.remove("missing")).rejects.toMatchObject({ code: "db_not_found" });
  }));
});
