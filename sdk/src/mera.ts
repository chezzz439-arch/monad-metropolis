import type { Address, Hash } from "viem";
import type { ChitSigner } from "./types.ts";

/**
 * Mera adapter — THE ONE FILE THAT IS STILL A STUB.
 *
 * Everything else in this package is written against {@link ChitSigner} and is
 * finished. This file is the single seam where Mera's real SDK plugs in, and it
 * is deliberately unimplemented because the call shapes are unconfirmed as of
 * Oct 9. Do not guess them — read the docs first:
 *
 *   https://mera.category.xyz/getting-started/
 *   https://mera.category.xyz/recipes/use-mera-with-react-native/
 *   https://mera.category.xyz/concepts/passkeys-and-prf/
 *
 * Two things to settle while you are in there (both affect what we may claim
 * to judges, per concept.md section 5):
 *
 *  1. What can a signing session actually limit — by contract? by amount? If it
 *     cannot do either, enforce the cap in {@link sessionGuard} below and say so
 *     plainly rather than implying protocol-level enforcement.
 *  2. Does clearing app storage really lose nothing? That is the "stateless
 *     test" in the Mera UX bounty and it is demoed live.
 */

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
}

/**
 * TODO(kaushik): one passkey ceremony -> an account, no seed phrase, no email
 * code. This is the Agora bounty's required onboarding step.
 */
export async function signInWithPasskey(): Promise<MeraAccount> {
  throw new Error("Not implemented: wire Mera passkey onboarding (see links in mera.ts)");
}

/**
 * TODO(kaushik): open a scoped signing session so `contribute()` needs no
 * prompt, while joins, sends and anything else still re-prompt.
 */
export async function openSigningSession(_limits: MeraSessionLimits): Promise<void> {
  throw new Error("Not implemented: wire Mera signing session (see links in mera.ts)");
}

/**
 * TODO(kaushik): derive bid key material from the passkey using salt
 * `chitcircle:bid:<circleId>:<round>`. Must be re-derivable on another device
 * with no stored secret — that is the Many Keys cross-device test.
 */
export async function deriveBidSecret(_circleId: bigint, _round: number): Promise<`0x${string}`> {
  throw new Error("Not implemented: wire Mera PRF derivation (see links in mera.ts)");
}

/**
 * Client-side backstop for session limits. Call before any no-prompt write.
 * If Mera turns out to enforce limits itself this becomes belt-and-braces; if
 * it does not, this is the only thing standing between a session and an
 * unbounded transfer, so keep it.
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
 * TODO(kaushik): build a {@link ChitSigner} backed by `account`. Once this
 * returns a real signer, every hook in this package works unchanged.
 */
export function meraSigner(_account: MeraAccount): ChitSigner {
  return {
    get address(): Address {
      throw new Error("Not implemented: meraSigner");
    },
    write(): Promise<Hash> {
      throw new Error("Not implemented: meraSigner.write");
    },
    transferToken(): Promise<Hash> {
      throw new Error("Not implemented: meraSigner.transferToken");
    },
  };
}
