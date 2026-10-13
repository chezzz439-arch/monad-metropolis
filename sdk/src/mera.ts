import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getEvmAddress,
  getPasskeyPrfOutput,
  isMeraError,
  type PasskeyCredentialMetadata,
  type Secp256k1SigningSession,
  type WebAuthnClient,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import {
  bytesToHex,
  createWalletClient,
  http,
  sha256,
  stringToBytes,
  type Address,
  type Chain,
  type Hash,
  type LocalAccount,
} from "viem";
import { erc20Abi } from "./client.ts";
import { RECEIPT_POLL_MS, type Deployment } from "./config.ts";
import type { ChitSigner } from "./types.ts";

/**
 * Mera adapter — passkey in, {@link ChitSigner} out.
 *
 * Written against `@category-labs/mera` 0.2.0, reading its shipped type
 * declarations rather than the prose docs. Two things the earlier draft of this
 * file asserted turned out to be wrong, so they are worth stating plainly:
 *
 *  1. There is NO BIP-39/BIP-32 derivation. `grep -ri "bip32|bip39|mnemonic"`
 *     over the package finds nothing. The 32-byte WebAuthn PRF output IS the
 *     secp256k1 private key, handed straight to `createSecp256k1SigningSession`.
 *     Any claim about path m/44'/60'/0'/0/0 is fiction.
 *  2. Mera ships a viem adapter (`@category-labs/mera/viem`), so we do not hand
 *     -roll signing. `toViemAccount(session)` returns a real `LocalAccount` with
 *     signTransaction / signMessage / signTypedData / signAuthorization.
 *
 * WHAT THIS MEANS FOR WHAT WE MAY CLAIM TO JUDGES (concept.md section 5):
 *
 * The account is an ordinary EOA. It pays its own fees in MON; Mera has no
 * paymaster, no sponsorship and no relayer — the package exports exactly four
 * things that touch keys, and none of them is a paymaster. So a brand-new
 * account cannot transact until something funds it: see {@link GasDripper} in
 * ./gas.ts, which is already wired for this.
 *
 * `toViemAccount`'s own documentation says signing "never shows a passkey
 * prompt". That is the good part of the UX and also the whole security story:
 * once a session exists, nothing in Mera limits what it signs. There is no
 * contract allow-list, no per-transaction cap and no expiry in the library.
 * {@link sessionGuard} is therefore the ONLY thing enforcing our limits, and it
 * runs in our own process. Say that honestly rather than implying the protocol
 * enforces it. For actions that deserve a fresh human gesture, use
 * {@link requireFreshPasskey}, which runs a real WebAuthn user-verification
 * ceremony and proves the same key is present.
 */

/** WebAuthn relying-party identity. `rpId` must be the exact host we serve. */
export interface PasskeyAppIdentity {
  /**
   * Relying-party ID: the hostname, no scheme and no port. A passkey is bound
   * to this value, so it must match in production or sign-in silently finds no
   * credential. On a device-hosted dev build use `localhost`.
   */
  rpId: string;
  /** Name the authenticator may display. */
  rpName?: string;
  /**
   * Who runs the WebAuthn ceremony. Omit on web and Mera uses
   * `navigator.credentials`.
   *
   * On React Native there is no `navigator.credentials`, so every call here
   * fails with `PASSKEY_OPERATION_FAILED` until this is supplied:
   *
   * ```ts
   * import { reactNativeWebAuthnClient } from "@category-labs/mera/react-native-webauthn-client";
   * const app = { rpId: "chitcircle.app", webAuthnClient: reactNativeWebAuthnClient };
   * ```
   *
   * It is a const, not a factory — do not call it. Importing that module pulls
   * in React Native, so a web build must never import it; that is why this is a
   * parameter here rather than an import in this file.
   *
   * Kept as config so the React-Native-versus-PWA decision is one object
   * literal, not an edit to this file.
   */
  webAuthnClient?: WebAuthnClient;
}

export interface MeraSessionLimits {
  /** Only allow no-prompt writes to this contract. */
  contract: Address;
  /** Largest no-prompt amount per transaction. */
  maxAmountPerTx: bigint;
  /** Session lifetime; drives the expiry banner in the UI. */
  expiresAt: Date;
}

export interface MeraAccount {
  address: Address;
  limits: MeraSessionLimits | null;
  /**
   * Live signing session holding a copy of the key in memory. Call
   * {@link signOut} to zero it; after that every signing method throws.
   */
  readonly session: Secp256k1SigningSession;
  /** viem account backed by `session`. Signs with no further passkey prompt. */
  readonly viemAccount: LocalAccount<"mera">;
  /** Which passkey produced this account, for a targeted re-assertion later. */
  readonly credential: PasskeyCredentialMetadata;
}

/** Shown to the authenticator, not to our own UI. */
const DEFAULT_LABEL = "Chit Circle";

/**
 * Sign-up: one passkey ceremony, one account. No seed phrase, no email code.
 * This is the Agora bounty's required onboarding step.
 *
 * The new account holds nothing and pays its own fees, so the caller must fund
 * it before its first write:
 *
 * ```ts
 * const account = await createAccountWithPasskey({ rpId: location.hostname });
 * await dripper.ensure(account.address);   // one on-chain tx, not instant
 * ```
 */
export async function createAccountWithPasskey(
  app: PasskeyAppIdentity,
  label: string = DEFAULT_LABEL,
): Promise<MeraAccount> {
  const created = await createPasskeyWithPrfOutput({
    rp: { id: app.rpId, name: app.rpName ?? DEFAULT_LABEL },
    user: { name: label, displayName: label },
    webAuthnClient: app.webAuthnClient,
  });
  return accountFromPrf(created.prfOutput, {
    credentialId: created.credentialId,
    transports: created.transports,
  });
}

/**
 * Sign-in, and the same call restores an account on a device that has never
 * seen this app — which is the Mera UX bounty's "stateless test".
 *
 * Nothing is stored and nothing needs to be: with `credential` omitted,
 * WebAuthn offers any discoverable passkey for `rpId`, and the PRF output for a
 * given credential + rpId + salt is deterministic. Same passkey, same key, same
 * address, on any device. Clearing app storage loses nothing.
 */
export async function signInWithPasskey(
  app: PasskeyAppIdentity,
  credential?: PasskeyCredentialMetadata,
): Promise<MeraAccount> {
  const got = await getPasskeyPrfOutput({ rpId: app.rpId, credential, webAuthnClient: app.webAuthnClient });
  return accountFromPrf(got.prfOutput, { credentialId: got.credentialId });
}

/**
 * Turn a 32-byte PRF output into an account, then wipe our copy of it. The
 * session keeps its own copy, which {@link signOut} zeroes.
 */
function accountFromPrf(
  prfOutput: Uint8Array,
  credential: PasskeyCredentialMetadata,
): MeraAccount {
  const session = createSecp256k1SigningSession({ privateKey: prfOutput });
  prfOutput.fill(0);

  const viemAccount = toViemAccount(session);
  const address = getEvmAddress(session.publicKey) as Address;

  // Mera derives the address two ways here — getEvmAddress from the session's
  // public key, and internally inside toViemAccount. If they ever disagree we
  // would sign for one address and display another, so fail loudly instead.
  if (viemAccount.address.toLowerCase() !== address.toLowerCase()) {
    session.end();
    throw new Error(
      `Mera address mismatch: session=${address} viem=${viemAccount.address}. Refusing to continue.`,
    );
  }

  return { address, limits: null, session, viemAccount, credential };
}

/**
 * Record the limits this session is allowed to sign without a prompt.
 *
 * Deliberately not `async` and deliberately not called "open": Mera has no
 * session-limits concept, so there is nothing to negotiate with it. The session
 * already exists from the moment of sign-in. All this does is store what
 * {@link sessionGuard} will enforce on our side.
 */
export function setSessionLimits(account: MeraAccount, limits: MeraSessionLimits): MeraAccount {
  account.limits = limits;
  return account;
}

/**
 * Client-side enforcement of session limits. Call before any no-prompt write.
 *
 * This is not belt-and-braces — it is the only belt. See the file header.
 */
export function sessionGuard(
  limits: MeraSessionLimits | null,
  target: Address,
  amount: bigint,
): { allowed: boolean; reason?: string } {
  if (!limits) return { allowed: false, reason: "No active signing session" };
  if (Date.now() > limits.expiresAt.getTime()) return { allowed: false, reason: "Session expired" };
  if (target.toLowerCase() !== limits.contract.toLowerCase()) {
    return { allowed: false, reason: "Session is not scoped to this contract" };
  }
  if (amount > limits.maxAmountPerTx) return { allowed: false, reason: "Over the session's per-transaction cap" };
  return { allowed: true };
}

/**
 * Re-prove the human is present, for actions a silent session should not cover
 * (sending money to another member, say).
 *
 * Mera cannot make `signDigest` prompt, so this runs a fresh WebAuthn
 * user-verification ceremony and checks it yields the same key. Returns true
 * only if the gesture succeeded AND re-derived this exact account; a different
 * passkey on the same device returns false rather than throwing.
 */
export async function requireFreshPasskey(
  app: PasskeyAppIdentity,
  account: MeraAccount,
): Promise<boolean> {
  const got = await getPasskeyPrfOutput({
    rpId: app.rpId,
    credential: account.credential,
    webAuthnClient: app.webAuthnClient,
  });
  const probe = createSecp256k1SigningSession({ privateKey: got.prfOutput });
  got.prfOutput.fill(0);
  try {
    return (getEvmAddress(probe.publicKey) as Address).toLowerCase() === account.address.toLowerCase();
  } finally {
    probe.end();
  }
}

/** Salt prefix for bid secrets. Changing it invalidates every existing bid. */
export const BID_SALT_PREFIX = "chitcircle:bid";

/**
 * The 32-byte PRF salt for one circle+round. Exported so its determinism can be
 * tested without an authenticator: the same inputs must always give the same
 * salt, or a bid committed on one device cannot be revealed on another.
 */
export function bidSalt(circleId: bigint, round: number): Uint8Array {
  return sha256(stringToBytes(`${BID_SALT_PREFIX}:${circleId}:${round}`), "bytes");
}

/**
 * Bid secret for the sealed-bid mode (Many Keys stretch goal).
 *
 * Derived from the passkey with a per-round salt, so it is re-derivable on any
 * device with no stored secret — that is the cross-device test. It is NOT
 * derived from the signing key, so a leaked bid secret reveals nothing about
 * the account.
 *
 * Costs one passkey prompt per call, by design: the gesture is the proof.
 */
export async function deriveBidSecret(
  app: PasskeyAppIdentity,
  circleId: bigint,
  round: number,
): Promise<`0x${string}`> {
  const got = await getPasskeyPrfOutput({
    rpId: app.rpId,
    prfSalt: bidSalt(circleId, round),
    webAuthnClient: app.webAuthnClient,
  });
  const secret = bytesToHex(got.prfOutput);
  got.prfOutput.fill(0);
  return secret;
}

/**
 * Build the {@link ChitSigner} every hook in this package already expects. Once
 * this returns, nothing else in the SDK knows Mera exists.
 *
 * Mirrors `test/e2e/harness.ts`'s `localSigner` so the anvil suite and the real
 * app drive writes through the same shape.
 */
export function meraSigner(account: MeraAccount, deployment: Deployment): ChitSigner {
  const chain: Chain = {
    id: deployment.chainId,
    name: "Monad Testnet",
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [deployment.rpcUrl] } },
  };
  const wallet = createWalletClient({
    account: account.viemAccount,
    chain,
    transport: http(deployment.rpcUrl),
    pollingInterval: RECEIPT_POLL_MS,
  });

  return {
    address: account.address,

    write({ address, abi, functionName, args }) {
      // Scope and expiry are checkable without knowing an amount; the per-tx cap
      // is enforced in transferToken, which is the only call that carries one.
      const verdict = sessionGuard(account.limits, address, 0n);
      if (!verdict.allowed) return Promise.reject(new Error(verdict.reason));
      return wallet.writeContract({
        address,
        abi,
        functionName,
        args,
      } as never) as Promise<Hash>;
    },

    transferToken({ token, to, amount }) {
      // A send leaves the circle contract, so the scope check cannot apply; the
      // amount cap and expiry still do. Pair this with requireFreshPasskey.
      if (!account.limits) return Promise.reject(new Error("No active signing session"));
      if (Date.now() > account.limits.expiresAt.getTime()) {
        return Promise.reject(new Error("Session expired"));
      }
      if (amount > account.limits.maxAmountPerTx) {
        return Promise.reject(new Error("Over the session's per-transaction cap"));
      }
      return wallet.writeContract({
        address: token,
        abi: erc20Abi,
        functionName: "transfer",
        args: [to, amount],
      });
    },
  };
}

/** Zero the in-memory key. Safe to call twice. */
export function signOut(account: MeraAccount): void {
  account.limits = null;
  account.session.end();
}

/**
 * Turn a Mera failure into something we can show a user, obeying the vocabulary
 * rule in the team guide: no "wallet", "gas", "seed phrase", "private key",
 * "blockchain" or "token" in anything a user reads.
 */
export function friendlyPasskeyError(err: unknown): string {
  if (!isMeraError(err)) return "Something went wrong. Please try again.";
  switch (err.code) {
    case "PRF_UNAVAILABLE":
      return "This device can't create a secure account yet. Try your phone's built-in screen lock, or another device.";
    case "PASSKEY_OPERATION_FAILED":
      return "That didn't complete. Tap again and confirm with your fingerprint, face, or device PIN.";
    case "CRYPTO_UNAVAILABLE":
      return "Your browser is blocking secure setup. Open the app in a normal tab, not a private or embedded window.";
    case "SESSION_ENDED":
      return "You've been signed out. Sign in again to continue.";
    case "INPUT_INVALID":
      return "Something went wrong setting up your account. Please try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}
