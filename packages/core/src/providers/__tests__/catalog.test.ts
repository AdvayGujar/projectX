import { describe, expect, it } from "vitest";

import { listProviderModels } from "../catalog";
import { createProviderConfig } from "../registry";
import type { FetchInit, FetchLike } from "../types";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("provider catalog", () => {
  it("lists OpenCode Go models across protocols from one key", async () => {
    let url = "";
    let init: FetchInit | undefined;
    const fetchImpl: FetchLike = async (input, requestInit) => {
      url = input;
      init = requestInit;
      return jsonResponse({
        data: [
          {
            id: "deepseek-v4.1-flash",
            name: "DeepSeek V4.1 Flash",
            modalities: { input: ["text", "image/png"] },
            capabilities: { tools: { supported: true }, reasoning: { supported: true } },
            limit: { context: 1_000_000, output: 384_000 },
          },
          { id: "deepseek-v4-pro", modalities: { input: ["text"] } },
          { id: "claude-haiku-5-5" },
          { id: "gpt-6-luna" },
        ],
      });
    };

    const models = await listProviderModels(
      createProviderConfig("opencode-go"),
      "go-key",
      fetchImpl,
    );

    expect(url).toBe("https://opencode.ai/inference/go/v1/models");
    expect(init?.headers?.Authorization).toBe("Bearer go-key");
    expect(models.find((model) => model.id === "claude-haiku-5-5")?.protocol).toBe("anthropic");
    expect(models.find((model) => model.id === "gpt-6-luna")?.protocol).toBe("openai-responses");
  });

  it("takes vision and limits from the Go catalog modalities", async () => {
    const fetchImpl: FetchLike = async () =>
      jsonResponse({
        data: [
          {
            id: "deepseek-v4.1-flash",
            name: "DeepSeek V4.1 Flash",
            modalities: { input: ["text", "image/jpeg", "image/png"] },
            capabilities: { tools: { supported: true }, reasoning: { supported: true } },
            limit: { context: 1_000_000, output: 384_000 },
          },
          { id: "deepseek-v4-pro", modalities: { input: ["text"] } },
        ],
      });

    const models = await listProviderModels(
      createProviderConfig("opencode-go"),
      "go-key",
      fetchImpl,
    );
    const flash = models.find((model) => model.id === "deepseek-v4.1-flash");
    const pro = models.find((model) => model.id === "deepseek-v4-pro");

    expect(flash?.capabilities.vision).toBe(true);
    expect(flash?.contextWindow).toBe(1_000_000);
    expect(flash?.maxOutput).toBe(384_000);
    expect(flash?.label).toBe("DeepSeek V4.1 Flash");
    expect(pro?.capabilities.vision).toBe(false);
  });

  it("falls back to known Go models when the catalog is unavailable", async () => {
    const fetchImpl: FetchLike = async () => jsonResponse({ error: "down" }, 500);
    const models = await listProviderModels(
      createProviderConfig("opencode-go"),
      "go-key",
      fetchImpl,
    );
    expect(models.length).toBeGreaterThan(20);
  });

  it("rejects an invalid Go key", async () => {
    const fetchImpl: FetchLike = async () => jsonResponse({ error: "bad key" }, 401);
    await expect(
      listProviderModels(createProviderConfig("opencode-go"), "bad", fetchImpl),
    ).rejects.toMatchObject({ code: "provider_auth" });
  });

  it("lists direct provider models through the matching adapter", async () => {
    let url = "";
    const fetchImpl: FetchLike = async (input) => {
      url = input;
      return jsonResponse({ data: [{ id: "deepseek-chat" }, { id: "deepseek-reasoner" }] });
    };

    const models = await listProviderModels(
      createProviderConfig("deepseek"),
      "key",
      fetchImpl,
    );

    expect(url).toBe("https://api.deepseek.com/models");
    expect(models.map((model) => model.id)).toEqual(["deepseek-chat", "deepseek-reasoner"]);
  });
});
