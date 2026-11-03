import * as SecureStore from "expo-secure-store";

const PREFIX = "projectx.provider.key.";

/**
 * Provider secrets live in the Keychain/Keystore and never in SQLite (project rule 4).
 * The database stores only the alias returned by `newKeyRef`.
 */
export function newKeyRef(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function saveProviderKey(ref: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(PREFIX + ref, value);
}

export async function readProviderKey(ref: string): Promise<string | null> {
  return SecureStore.getItemAsync(PREFIX + ref);
}

export async function deleteProviderKey(ref: string): Promise<void> {
  await SecureStore.deleteItemAsync(PREFIX + ref);
}
