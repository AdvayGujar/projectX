import { fetch } from "expo/fetch";

import type { SpikeResult } from "./types";

export type Provider = "deepseek" | "opencode-go" | "mock";

const ENDPOINTS: Record<Provider, string> = {
  deepseek: "https://api.deepseek.com/chat/completions",
  "opencode-go": "https://opencode.ai/inference/go/openai/v1/chat/completions",
  mock: "http://10.0.2.2:8099/v1/chat/completions",
};

const MODELS: Record<Provider, string> = {
  deepseek: "deepseek-chat",
  "opencode-go": "deepseek-v4.1-flash",
  mock: "mock-model",
};

export async function testStreaming(provider: Provider, apiKey: string): Promise<SpikeResult> {
  const started = Date.now();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "ProjectX/0.0.0",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  if (provider === "opencode-go") {
    headers["x-opencode-session"] = "m0-spike";
  }

  const response = await fetch(ENDPOINTS[provider], {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: MODELS[provider],
      messages: [{ role: "user", content: "Reply with exactly: stream ok" }],
      stream: true,
      max_tokens: 20,
    }),
  });

  if (!response.ok) {
    const body = (await response.text()).slice(0, 200);
    throw new Error(`HTTP ${response.status}: ${body}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("response has no body");
  }

  const decoder = new TextDecoder();
  let bytes = 0;
  let firstEventMs = 0;
  let content = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    bytes += value.byteLength;
    const text = decoder.decode(value, { stream: true });
    if (!firstEventMs && text.includes("data:")) {
      firstEventMs = Date.now() - started;
    }
    content += text;
  }

  return {
    label: provider === "deepseek" ? "DeepSeek" : provider === "opencode-go" ? "OpenCode Go" : "Mock",
    detail: `first event ${firstEventMs} ms · ${bytes} bytes · ${content.includes("stream ok") ? "content ok" : "content not seen"}`,
    ms: Date.now() - started,
  };
}
