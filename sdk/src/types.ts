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

/**
 * Knobs for finding the circles an account belongs to.
 *
 * Deliberately has no block-range fields. Discovery used to scan
 * `CircleCreated`/`Joined` logs, which broke on Monad's public RPC: it caps
 * `eth_getLogs` at a 100-block range, and the window from the deploy block
 * grows by roughly 16k blocks an hour, so the scan needed over a thousand
 * chunked requests and simply failed. Discovery reads contract state instead.
 * See {@link import("./client.ts").ChitCircleClient.circleIdsFor}.
 */
export interface DiscoveryOptions {
  /**
   * Circle ids the caller already knows about, kept if they turn out to exist.
   *
   * This covers exactly one gap: `createCircle` stores no organizer and only
   * emits an event, so between creating a circle and joining it there is
   * nothing on chain tying it to its creator. The app passes the ids it
   * remembers locally; everything else is read from the contract, which is why
   * clearing local storage still restores every circle you have joined.
   */
  knownIds?: readonly bigint[];
  /**
   * Ceiling on how many circle ids one pass inspects. When the contract holds
   * more than this, the newest `maxCircles` are checked and older ones are
   * not — the point at which this should read from an index (Envio) rather
   * than probing ids one at a time. Defaults to `DEFAULT_MAX_CIRCLES`.
   */
  maxCircles?: number;
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
 * {@link TxResult} plus the id the contract assigned.
 *
 * Read out of the `CircleCreated` log in the receipt, not from a
 * `nextCircleId()` call before sending: between that read and the transaction
 * landing, anyone else's `createCircle` would take the id we just claimed and
 * the app would open a stranger's circle.
 */
export interface CreateCircleResult extends TxResult {
  circleId: bigint;
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
    noPromptAmount?: bigint;
  }): Promise<Hash>;
  /** Plain ERC20 transfer — the member-to-member send. */
  transferToken(args: { token: Address; to: Address; amount: bigint }): Promise<Hash>;
}
