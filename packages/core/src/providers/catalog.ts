import { createAdapter } from "./adapterFactory";
import { providerError } from "./errors";
import { mergeModels } from "./registry";
import type { FetchLike, ModelInfo, ProviderConfig } from "./types";

const GO_MODELS_URL = "https://opencode.ai/inference/go/v1/models";
const USER_AGENT = "ProjectX/0.0.0";

export async function listProviderModels(
  config: ProviderConfig,
  apiKey: string,
  fetchImpl: FetchLike,
): Promise<ModelInfo[]> {
  if (config.presetId === "opencode-go") {
    return listGoModels(config, apiKey, fetchImpl);
  }
  return createAdapter(config.protocol).listModels({ config, apiKey, fetch: fetchImpl });
}

async function listGoModels(
  config: ProviderConfig,
  apiKey: string,
  fetchImpl: FetchLike,
): Promise<ModelInfo[]> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    ...config.headers,
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  let response: Response;
  try {
    response = await fetchImpl(GO_MODELS_URL, { headers });
  } catch {
    // Offline onboarding still gets the curated Go catalog.
    return mergeModels(config, []);
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw await providerError(response, config.label);
    }
    return mergeModels(config, []);
  }
  const payload = await response.json() as { data?: Array<{ id?: unknown }> };
  const ids = Array.isArray(payload.data)
    ? payload.data.map((item) => item.id).filter((id): id is string => typeof id === "string")
    : [];
  return mergeModels(config, ids);
}
