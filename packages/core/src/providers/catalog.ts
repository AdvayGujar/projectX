import { z } from "zod";

import { createAdapter } from "./adapterFactory";
import { providerError } from "./errors";
import { mergeFetchedModels } from "./registry";
import type { FetchedModelInfo } from "./registry";
import type { FetchLike, ModelInfo, ProviderConfig } from "./types";

const GO_MODELS_URL = "https://opencode.ai/inference/go/v1/models";
const USER_AGENT = "ProjectX/0.0.0";

const goModelSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  modalities: z.object({ input: z.array(z.string()) }).optional(),
  capabilities: z
    .object({
      tools: z.object({ supported: z.boolean() }).optional(),
      reasoning: z.object({ supported: z.boolean() }).optional(),
    })
    .optional(),
  limit: z
    .object({
      context: z.number().optional(),
      output: z.number().optional(),
    })
    .optional(),
});

const goCatalogSchema = z.object({
  data: z.array(z.unknown()).optional(),
});

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
    return mergeFetchedModels(config, []);
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw await providerError(response, config.label);
    }
    return mergeFetchedModels(config, []);
  }
  const parsed = goCatalogSchema.safeParse(await response.json());
  const fetched = parsed.success
    ? parsed.data.data?.flatMap(toFetchedModel) ?? []
    : [];
  return mergeFetchedModels(config, fetched);
}

function toFetchedModel(raw: unknown): FetchedModelInfo[] {
  const parsed = goModelSchema.safeParse(raw);
  if (!parsed.success) {
    return [];
  }
  const model = parsed.data;
  const inputs = model.modalities?.input;
  const vision = inputs ? inputs.some((mime) => mime.startsWith("image/")) : undefined;
  return [{
    id: model.id,
    ...(model.name ? { label: model.name } : {}),
    ...(vision === undefined ? {} : { vision }),
    ...(model.capabilities?.tools
      ? { tools: model.capabilities.tools.supported }
      : {}),
    ...(model.capabilities?.reasoning
      ? { reasoning: model.capabilities.reasoning.supported }
      : {}),
    ...(model.limit?.context === undefined ? {} : { contextWindow: model.limit.context }),
    ...(model.limit?.output === undefined ? {} : { maxOutput: model.limit.output }),
  }];
}
