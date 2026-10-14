import * as SecureStore from "expo-secure-store";
import { isAddress, type Address } from "viem";

export interface StoredPasskeyAccount {
  address: Address;
  credentialId: string;
  rpId: string;
}

const storageKey = (rpId: string) => `chitcircle.passkey.v1.${rpId}`;

interface MetadataStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * expo-secure-store has no web implementation — its native module is an empty
 * object in a browser, so calling into it throws — and the web build is how a
 * phone reaches the app without an installed dev client. localStorage is the
 * fallback, and it is sound for exactly what is kept here: a credential ID and
 * a public address, neither of them secret. No key material is stored on any
 * platform; the signing key is re-derived from the passkey on every sign-in,
 * which is why losing this store only costs the user a "Sign in" tap.
 */
const store: MetadataStore = typeof document !== "undefined"
  ? {
      async get(key) {
        return localStorage.getItem(key);
      },
      async set(key, value) {
        localStorage.setItem(key, value);
      },
      async remove(key) {
        localStorage.removeItem(key);
      },
    }
  : {
      get: (key) => SecureStore.getItemAsync(key),
      set: (key, value) =>
        SecureStore.setItemAsync(key, value, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        }),
      remove: async (key) => {
        await SecureStore.deleteItemAsync(key);
      },
    };

export async function loadStoredPasskeyAccount(rpId: string): Promise<StoredPasskeyAccount | null> {
  const raw = await store.get(storageKey(rpId));
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
  await store.set(storageKey(account.rpId), JSON.stringify(account));
}

export async function clearStoredPasskeyAccount(rpId: string): Promise<void> {
  await store.remove(storageKey(rpId));
}
