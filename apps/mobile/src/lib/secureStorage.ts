import * as SecureStore from "expo-secure-store";

/** Encrypted storage for offline submit queue (may contain form PII). */
export async function secureGet(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function secureSet(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value);
}

export async function secureRemove(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key);
}
