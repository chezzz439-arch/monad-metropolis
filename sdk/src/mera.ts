import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getEvmAddress,
  getPasskeyPrfOutput,
  isMeraError,
  type PasskeyCredentialMetadata,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { createWalletClient, defineChain, http, toHex, type Address, type Chain, type Hash } from "viem";
import type { ChitSigner } from "./types.ts";

export interface MeraSessionLimits {
  contract: Address;
  maxAmountPerTx: bigint;
  expiresAt: Date;
}

export interface MeraAccount {
  address: Address;
  credentialId: string;
  rpId: string;
  limits: MeraSessionLimits;
  session: Secp256k1SigningSession;
}

export interface PasskeyAccountOptions {
  rpId: string;
  contract: Address;
  credential?: PasskeyCredentialMetadata;
  maxAmountPerTx?: bigint;
  userName?: string;
  displayName?: string;
}

const SESSION_TTL_MS = 30 * 60 * 1000;
const DEFAULT_PROMPT_FREE_CAP = 100_000_000n;
/**
 * Namespace for bid-reveal salts. Exported so a test can assert it stays
 * distinct from anything used to derive the account key itself: the same
 * passkey produces both, and a collision would leak one from the other.
 */
export const BID_SALT_PREFIX = "chitcircle:bid:";

const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: { default: { name: "Monad Explorer", url: "https://testnet.monadexplorer.com" } },
  testnet: true,
});

const erc20TransferAbi = [{
  type: "function",
  name: "transfer",
  stateMutability: "nonpayable",
  inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ type: "bool" }],
}] as const;

/**
 * Picks the WebAuthn client for wherever this is running.
 *
 * In a browser, returning undefined leaves Mera on its own default client,
 * which calls `navigator.credentials` — that is the whole web fallback, and it
 * is why the app can be served over HTTPS and used from a phone browser
 * without an app build. React Native has no `navigator.credentials`, so it
 * needs Mera's react-native-passkey bridge instead.
 *
 * `document` is the discriminator rather than `navigator`: React Native
 * defines a partial `navigator` global, but never a `document`.
 */
async function webAuthnClientForPlatform() {
  if (typeof document !== "undefined") return undefined;
  try {
    return (await import("@category-labs/mera/react-native-webauthn-client")).reactNativeWebAuthnClient;
  } catch {
    throw new Error("Passkeys require a native development build; they are not available in Expo Go.");
  }
}

export function accountFromPrfOutput(
  result: { credentialId: string; prfOutput: Uint8Array },
  options: PasskeyAccountOptions,
): MeraAccount {
  let seed: Uint8Array | undefined;
  let privateKey: Uint8Array | undefined;
  try {
    const mnemonic = entropyToMnemonic(result.prfOutput, wordlist);
    result.prfOutput.fill(0);
    seed = mnemonicToSeedSync(mnemonic);
    const node = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0");
    if (!node.privateKey) throw new Error("Passkey key derivation failed.");
    privateKey = node.privateKey;
    const session = createSecp256k1SigningSession({ privateKey });
    return {
      address: getEvmAddress(session.publicKey) as Address,
      credentialId: result.credentialId,
      rpId: options.rpId,
      limits: {
        contract: options.contract,
        maxAmountPerTx: options.maxAmountPerTx ?? DEFAULT_PROMPT_FREE_CAP,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
      session,
    };
  } finally {
    result.prfOutput.fill(0);
    seed?.fill(0);
    privateKey?.fill(0);
  }
}

export async function createPasskeyAccount(options: PasskeyAccountOptions): Promise<MeraAccount> {
  assertRpId(options.rpId);
  const result = await createPasskeyWithPrfOutput({
    rp: { id: options.rpId, name: "Chit Circle" },
    user: { name: options.userName ?? "chit-circle-account", displayName: options.displayName ?? "Chit Circle account" },
    webAuthnClient: await webAuthnClientForPlatform(),
  });
  return accountFromPrfOutput(result, options);
}

export async function signInWithPasskey(options: PasskeyAccountOptions): Promise<MeraAccount> {
  assertRpId(options.rpId);
  const result = await getPasskeyPrfOutput({
    rpId: options.rpId,
    credential: options.credential,
    webAuthnClient: await webAuthnClientForPlatform(),
  });
  return accountFromPrfOutput(result, options);
}

/** Re-prompts for the passkey and opens a fresh, bounded in-memory session. */
export async function openSigningSession(account: MeraAccount): Promise<MeraAccount> {
  const result = await getPasskeyPrfOutput({
    rpId: account.rpId,
    credential: { credentialId: account.credentialId },
    webAuthnClient: await webAuthnClientForPlatform(),
  });
  const renewed = accountFromPrfOutput(result, {
    rpId: account.rpId,
    contract: account.limits.contract,
    maxAmountPerTx: account.limits.maxAmountPerTx,
    credential: { credentialId: account.credentialId },
  });
  account.session.end();
  return renewed;
}

export async function deriveBidSecret(
  account: Pick<MeraAccount, "credentialId" | "rpId">,
  circleId: bigint,
  round: number,
): Promise<`0x${string}`> {
  const prfSalt = sha256(utf8ToBytes(`${BID_SALT_PREFIX}${circleId}:${round}`));
  const result = await getPasskeyPrfOutput({
    rpId: account.rpId,
    credential: { credentialId: account.credentialId },
    prfSalt,
    webAuthnClient: await webAuthnClientForPlatform(),
  });
  try {
    return toHex(result.prfOutput);
  } finally {
    result.prfOutput.fill(0);
    prfSalt.fill(0);
  }
}

export function sessionGuard(
  limits: MeraSessionLimits | null,
  target: Address,
  amount: bigint,
): { allowed: boolean; reason?: string } {
  if (!limits) return { allowed: false, reason: "No active signing session" };
  if (Date.now() >= limits.expiresAt.getTime()) return { allowed: false, reason: "Session expired" };
  if (target.toLowerCase() !== limits.contract.toLowerCase()) return { allowed: false, reason: "Session is not scoped to this contract" };
  if (amount > limits.maxAmountPerTx) return { allowed: false, reason: "Over the session's per-transaction cap" };
  return { allowed: true };
}

export function meraSigner(
  account: MeraAccount,
  rpcUrl = "https://testnet-rpc.monad.xyz",
  chain: Chain = monadTestnet,
): ChitSigner {
  const walletForSession = (session: Secp256k1SigningSession) =>
    createWalletClient({ account: toViemAccount(session), chain, transport: http(rpcUrl) });

  const withFreshSession = async (submit: (wallet: ReturnType<typeof walletForSession>) => Promise<Hash>) => {
    // openSigningSession ends the account's previous session before it returns,
    // so the renewed one has to be adopted BEFORE the write is attempted. If it
    // were only adopted on success, one cancelled or reverted write would leave
    // account.session pointing at the ended session, and the next prompt-free
    // contribute — which signs with account.session directly — would throw
    // SESSION_ENDED for the rest of the run.
    const renewed = await openSigningSession(account);
    account.session = renewed.session;
    account.limits = renewed.limits;
    // A failed write does not make this session unsafe: it is still bounded by
    // its own TTL and by sessionGuard, so it is left live rather than ended,
    // which would strand the account.
    return submit(walletForSession(renewed.session));
  };

  return {
    address: account.address,
    async write(request) {
      const submit = (wallet: ReturnType<typeof walletForSession>) => wallet.writeContract({
        address: request.address,
        abi: request.abi as never,
        functionName: request.functionName as never,
        args: request.args as never,
      } as never);

      const promptFree = request.functionName === "contribute" &&
        request.noPromptAmount !== undefined &&
        sessionGuard(account.limits, request.address, request.noPromptAmount).allowed;
      return promptFree ? submit(walletForSession(account.session)) : withFreshSession(submit);
    },
    async transferToken(request) {
      return withFreshSession((wallet) => wallet.writeContract({
        address: request.token,
        abi: erc20TransferAbi,
        functionName: "transfer",
        args: [request.to, request.amount],
      }));
    },
  };
}

export function endMeraSession(account: MeraAccount): void {
  account.session.end();
}

/**
 * User-facing copy for a failed passkey step.
 *
 * Every branch returns a fixed string. Mera's own `error.message` and raw
 * thrown values are deliberately never shown: they carry internal vocabulary
 * the team guide bans from the UI, and a transport error can contain a URL and
 * port. mera.test.ts asserts the banned-word list over every code plus an
 * unrecognised one.
 */
export function describeMeraError(error: unknown): string {
  if (isMeraError(error)) {
    switch (error.code) {
      case "PRF_UNAVAILABLE":
        return "This phone cannot set up a Chit Circle account yet. It needs iOS 18 or newer, or an up-to-date Android.";
      case "PASSKEY_OPERATION_FAILED":
        return "That confirmation was cancelled. Tap again and confirm with your face, fingerprint or PIN.";
      case "CRYPTO_UNAVAILABLE":
        return "This phone is missing the security features Chit Circle needs. Try updating it, then try again.";
      case "SESSION_ENDED":
        return "You were signed out for safety. Sign in again to continue.";
      case "INPUT_INVALID":
        return "Something about those details was not right. Check them and try again.";
    }
  }
  return "Something went wrong. Please try again.";
}

function assertRpId(rpId: string): void {
  // localhost is the one hostname with no dot that is legitimately usable:
  // WebAuthn treats it as a secure context, so a dev build can point at it.
  if (rpId === "localhost") return;
  if (!rpId || rpId === "example.com" || !/^[a-z0-9.-]+$/i.test(rpId) || !rpId.includes(".")) {
    throw new Error("Set EXPO_PUBLIC_MERA_RP_ID to a hostname your team controls before using passkeys.");
  }
}

export type { PasskeyCredentialMetadata };
