import * as SecureStore from "expo-secure-store";
import { isAddress, type Address } from "viem";

export interface StoredPasskeyAccount {
  address: Address;
  credentialId: string;
  rpId: string;
}

const storageKey = (rpId: string) => `chitcircle.passkey.v1.${rpId}`;

export async function loadStoredPasskeyAccount(rpId: string): Promise<StoredPasskeyAccount | null> {
  const raw = await SecureStore.getItemAsync(storageKey(rpId));
  if (!raw) return null;

  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    if (
      typeof record.address !== "string" || !isAddress(record.address) ||
      typeof record.credentialId !== "string" || record.credentialId.length === 0 || record.credentialId.length > 2048 ||
      record.rpId !== rpId
    ) return null;
    return {
      address: record.address as Address,
      credentialId: record.credentialId,
      rpId,
    };
  } catch {
    return null;
  }
}

export async function saveStoredPasskeyAccount(account: StoredPasskeyAccount): Promise<void> {
  await SecureStore.setItemAsync(storageKey(account.rpId), JSON.stringify(account), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearStoredPasskeyAccount(rpId: string): Promise<void> {
  await SecureStore.deleteItemAsync(storageKey(rpId));
}
