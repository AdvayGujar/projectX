import type { FetchLike, ModelInfo, ProviderRecord } from "@projectx/core";
import {
  AppError,
  createProviderConfig,
  createProviderRepository,
  listProviderModels,
} from "@projectx/core";

import { getDbContext } from "../db/client";
import { newKeyRef, saveProviderKey } from "./keyStore";

export interface AddProviderInput {
  readonly presetId: string;
  readonly label?: string;
  readonly apiKey: string;
  readonly baseUrl?: string;
}

export interface SavedProvider {
  readonly provider: ProviderRecord;
  readonly models: readonly ModelInfo[];
}

const fetchImpl: FetchLike = (url, init) => fetch(url, init);

/**
 * Validates the key by fetching the model list *before* anything is persisted, so a bad
 * key leaves no provider row and no keychain entry behind.
 */
export async function addProvider(input: AddProviderInput): Promise<SavedProvider> {
  const apiKey = input.apiKey.trim();
  if (apiKey.length === 0) {
    throw new AppError("provider_auth", "An API key is required", {
      userMessage: "Paste the provider key.",
    });
  }

  const config = createProviderConfig(input.presetId, {
    label: input.label?.trim() || undefined,
    baseUrl: input.baseUrl?.trim() || undefined,
  });

  const models = await listProviderModels(config, apiKey, fetchImpl);

  const keyRef = newKeyRef();
  await saveProviderKey(keyRef, apiKey);

  const context = await getDbContext();
  const repository = createProviderRepository(context);
  const provider = await repository.add({
    presetId: config.presetId,
    label: config.label,
    protocol: config.protocol,
    baseUrl: config.baseUrl,
    keyRef,
  });
  await repository.saveModels(provider.id, models);

  return { provider, models };
}

export async function listProviders(): Promise<ProviderRecord[]> {
  const context = await getDbContext();
  return createProviderRepository(context).list();
}

export async function listModels(providerId: string): Promise<ModelInfo[]> {
  const context = await getDbContext();
  return createProviderRepository(context).listModels(providerId);
}
