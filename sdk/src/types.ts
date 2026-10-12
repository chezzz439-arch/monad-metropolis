import type { Address, Hash } from "viem";

/** Mirrors `ChitCircle.Mode`. */
export const Mode = {
  Fixed: 0,
  Bid: 1,
} as const;
export type Mode = (typeof Mode)[keyof typeof Mode];

/** Mirrors the `Circle` struct returned by `getCircle`. */
export interface Circle {
  token: Address;
  /** Per-round amount, in the token's smallest unit (AUSD has 6 decimals). */
  contribution: bigint;
  maxMembers: number;
  roundSeconds: bigint;
  mode: Mode;
  /** 0-based index of the round in progress. */
  round: number;
  /** Unix seconds. `0n` until the circle fills. */
  roundDeadline: bigint;
  /** Contributions held for the round in progress. */
  pot: bigint;
  started: boolean;
  finished: boolean;
}

/**
 * Everything a screen needs for one circle, in one object. Derived fields are
 * computed here so the UI never has to do arithmetic on deadlines or slots.
 */
export interface CircleView extends Circle {
  circleId: bigint;
  /** Join order. Index into this array is the member's slot. */
  members: Address[];
  /** Slot indices in payout order. */
  payoutOrder: number[];
  /** Who receives the pot this round. `null` until the circle fills. */
  recipient: Address | null;
  /** Members who still owe the round in progress. */
  outstanding: Address[];
  /** Seconds until `settleRound` becomes callable. `0` once it is. */
  secondsUntilSettle: number;
  /** True once the deadline has passed and anyone may settle. */
  settleable: boolean;
  /** `maxMembers * contribution` — what a healthy pot pays out. */
  expectedPot: bigint;
  /** Caller-relative flags. Null when there is no connected account. */
  me: MemberStatus | null;
}

export interface MemberStatus {
  address: Address;
  isMember: boolean;
  /** Deposit still held for this member. Zero once seized or withdrawn. */
  deposit: bigint;
  defaulted: boolean;
  depositWithdrawn: boolean;
  /** Has this member paid the round in progress? */
  paidThisRound: boolean;
  /** Slot index, or -1 if not a member. */
  slot: number;
  /** Round index at which this member receives the pot, or -1. */
  payoutRound: number;
}

export interface DiscoveryOptions {
  /** Defaults to the client's `deployBlock`. */
  fromBlock?: bigint;
  /** Defaults to the current head. */
  toBlock?: bigint;
  /** Blocks per `eth_getLogs` call. Lower it if the RPC rejects the range. */
  maxBlockRange?: bigint;
}

export interface CreateCircleArgs {
  token: Address;
  contribution: bigint;
  maxMembers: number;
  roundSeconds: bigint;
  mode?: Mode;
  /**
   * Slot indices in payout order; must be a permutation of 0..maxMembers-1.
   * Defaults to join order, i.e. [0, 1, ... maxMembers-1].
   */
  payoutOrder?: number[];
}

/** Result of any state-changing call. */
export interface TxResult {
  hash: Hash;
  /** Wall-clock seconds from submission to inclusion — the demo's "settled in X.Xs". */
  settledInSeconds: number;
}

/**
 * Minimal signer contract the data layer needs. Mera is injected through this
 * rather than imported directly, so the UI, the tests and the Mera adapter all
 * depend on the same narrow surface.
 *
 * NOTE: the Mera implementation of this lives in `src/mera.ts` and is still a
 * stub — its real SDK call shapes are unconfirmed. See that file.
 */
export interface ChitSigner {
  address: Address;
  /** Write to a contract and resolve once mined. */
  write(args: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args: readonly unknown[];
  }): Promise<Hash>;
  /** Plain ERC20 transfer — the member-to-member send. */
  transferToken(args: { token: Address; to: Address; amount: bigint }): Promise<Hash>;
}
