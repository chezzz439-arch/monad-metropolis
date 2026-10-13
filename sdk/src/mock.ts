import type { Address, Hash, PublicClient } from "viem";
import { ChitCircleClient } from "./client.ts";
import {
  Mode,
  type Circle,
  type CircleView,
  type ChitSigner,
  type CreateCircleArgs,
  type CreateCircleResult,
  type DiscoveryOptions,
  type MemberStatus,
  type TxResult,
} from "./types.ts";

/**
 * An in-memory ChitCircle, so screens can be built and demoed with no chain,
 * no testnet AUSD and no passkey.
 *
 * The important property: this is a {@link ChitCircleClient} subclass, so the
 * screens use the **real hooks** (`useCircle`, `useContribute`, ...) against it.
 * Swapping to Monad is one line at the app entry point and no screen changes:
 *
 * ```tsx
 * const client = mockClient({ scenario: "midRound" });          // today
 * const client = clientFor(requireDeployment(monadTestnet));    // after deploy
 *
 * <ChitCircleProvider value={client}><App /></ChitCircleProvider>
 * ```
 *
 * Only the leaf reads and the writes are overridden. `getCircleView`,
 * `getRoster`, `getCircleViews` and `circleExists` are inherited, so the
 * derived fields a screen renders (`recipient`, `settleable`,
 * `secondsUntilSettle`, `expectedPot`, `me`) are computed by the same code that
 * will run against the chain — a mock that agreed with the UI but not with
 * production would be worse than no mock.
 *
 * The state machine below mirrors `ChitCircle.sol` rule for rule, including
 * which calls revert and under what name, so error paths are real too.
 */

// -- people and money ------------------------------------------------------

const addr = (suffix: string) => `0x${suffix.padStart(40, "0")}` as Address;

/** Stands in for AUSD until Agora confirms the testnet address. */
export const MOCK_TOKEN = addr("a05d");

/**
 * A believable circle: five people who'd actually run a committee together.
 * Names are here so screens can show "Priya" instead of `0x…00a2` — the chain
 * has no names, so when this is swapped for the real client the UI falls back
 * to `shortAddress()`. Build for that now rather than discovering it on Sunday.
 */
export const MOCK_PEOPLE: readonly { address: Address; name: string }[] = [
  // A real name, not "You": the screens decide who "you" is by comparing the
  // signed-in address, so baking it into the fixture made every roster claim
  // this person was the viewer — including on screens rendered as someone else.
  { address: addr("a1"), name: "Kavya" },
  { address: addr("a2"), name: "Priya" },
  { address: addr("a3"), name: "Arun" },
  { address: addr("a4"), name: "Meera" },
  { address: addr("a5"), name: "Dev" },
];

/** The account the mock is "signed in" as. */
export const MOCK_ME = MOCK_PEOPLE[0]!.address;

/** $100 a round, AUSD's 6 decimals. */
export const MOCK_CONTRIBUTION = 100_000000n;
/** Demo-speed rounds, per the team guide. Real circles would be monthly. */
export const MOCK_ROUND_SECONDS = 120n;
/** Everyone starts with $1,000 so joins and payments actually clear. */
const STARTING_BALANCE = 1_000_000000n;

export function nameFor(who: Address): string | undefined {
  return MOCK_PEOPLE.find((p) => p.address.toLowerCase() === who.toLowerCase())?.name;
}

// -- reverts ---------------------------------------------------------------

/**
 * Carries the contract's error name, so a screen can branch on
 * `err.reason === "AlreadyPaid"` here and against the chain alike.
 */
export class MockRevert extends Error {
  readonly reason: string;
  constructor(reason: string, message?: string) {
    super(message ?? `reverted: ${reason}`);
    this.name = "MockRevert";
    this.reason = reason;
  }
}

// -- state -----------------------------------------------------------------

const key = (a: Address) => a.toLowerCase();

interface MockCircleState {
  id: bigint;
  organizer: Address;
  token: Address;
  contribution: bigint;
  maxMembers: number;
  roundSeconds: bigint;
  mode: Mode;
  round: number;
  roundDeadline: bigint;
  pot: bigint;
  started: boolean;
  finished: boolean;
  members: Address[];
  payoutOrder: number[];
  deposit: Map<string, bigint>;
  defaulted: Set<string>;
  withdrawn: Set<string>;
  /** `${round}:${address}` */
  paid: Set<string>;
}

/**
 * The chain, minus the chain. Mutators here are synchronous and mirror
 * `ChitCircle.sol`; the client wraps them with latency and signer checks.
 *
 * Synchronous on purpose: it lets {@link mockClient} seed a scenario by
 * *driving these same mutators* rather than hand-writing fixture objects. A
 * scenario therefore cannot describe a state the contract could not reach.
 */
export class MockWorld {
  private circles = new Map<string, MockCircleState>();
  private balances = new Map<string, bigint>();
  private nextId = 0n;
  /** Seconds added to wall-clock time; lets scenarios start mid-round. */
  private offset = 0;

  constructor(people: readonly Address[] = MOCK_PEOPLE.map((p) => p.address)) {
    for (const p of people) this.balances.set(`${key(MOCK_TOKEN)}:${key(p)}`, STARTING_BALANCE);
  }

  now(): number {
    return Math.floor(Date.now() / 1000) + this.offset;
  }

  /** Move the clock forward, e.g. to put a round deadline in the past. */
  warp(seconds: number): void {
    this.offset += seconds;
  }

  balanceOf(token: Address, who: Address): bigint {
    return this.balances.get(`${key(token)}:${key(who)}`) ?? 0n;
  }

  private move(token: Address, from: Address | null, to: Address | null, amount: bigint): void {
    if (from) {
      const have = this.balanceOf(token, from);
      if (have < amount) throw new MockRevert("TransferFailed", "Not enough AUSD.");
      this.balances.set(`${key(token)}:${key(from)}`, have - amount);
    }
    if (to) this.balances.set(`${key(token)}:${key(to)}`, this.balanceOf(token, to) + amount);
  }

  getNextId(): bigint {
    return this.nextId;
  }

  load(circleId: bigint): MockCircleState {
    const c = this.circles.get(circleId.toString());
    if (!c) throw new MockRevert("UnknownCircle");
    return c;
  }

  has(circleId: bigint): boolean {
    return this.circles.has(circleId.toString());
  }

  /**
   * Circles `who` has joined.
   *
   * Membership only, deliberately. The real contract stores no organizer, so it
   * cannot report "circles you created but have not joined" either. Matching on
   * `c.organizer` here would make the mock more capable than the chain and hide
   * the create-then-join gap from both the tests and the screen gallery.
   */
  idsFor(who: Address): bigint[] {
    const mine: bigint[] = [];
    for (const c of this.circles.values()) {
      if (c.members.some((m) => key(m) === key(who))) mine.push(c.id);
    }
    return mine.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  // -- mutators (mirror ChitCircle.sol) ------------------------------------

  createCircle(organizer: Address, args: CreateCircleArgs): bigint {
    const order = args.payoutOrder ?? Array.from({ length: args.maxMembers }, (_, i) => i);
    if (args.contribution === 0n) throw new MockRevert("BadContribution");
    if (args.maxMembers < 2) throw new MockRevert("BadMemberCount");
    if (args.roundSeconds === 0n) throw new MockRevert("BadRoundLength");
    if (order.length !== args.maxMembers) throw new MockRevert("BadPayoutOrder");
    if (new Set(order).size !== order.length || order.some((s) => s < 0 || s >= args.maxMembers)) {
      throw new MockRevert("BadPayoutOrder");
    }

    const id = this.nextId++;
    this.circles.set(id.toString(), {
      id,
      organizer,
      token: args.token,
      contribution: args.contribution,
      maxMembers: args.maxMembers,
      roundSeconds: args.roundSeconds,
      mode: args.mode ?? Mode.Fixed,
      round: 0,
      roundDeadline: 0n,
      pot: 0n,
      started: false,
      finished: false,
      members: [],
      payoutOrder: order,
      deposit: new Map(),
      defaulted: new Set(),
      withdrawn: new Set(),
      paid: new Set(),
    });
    return id;
  }

  join(circleId: bigint, who: Address): void {
    const c = this.load(circleId);
    if (c.started) throw new MockRevert("AlreadyStarted");
    if (c.members.some((m) => key(m) === key(who))) throw new MockRevert("AlreadyMember");
    if (c.members.length >= c.maxMembers) throw new MockRevert("CircleFull");

    c.members.push(who);
    c.deposit.set(key(who), c.contribution);

    // The contract starts the circle on the last join, before pulling funds.
    if (c.members.length === c.maxMembers) {
      c.started = true;
      c.roundDeadline = BigInt(this.now()) + c.roundSeconds;
    }
    this.move(c.token, who, null, c.contribution);
  }

  contribute(circleId: bigint, who: Address): void {
    const c = this.load(circleId);
    if (!c.started) throw new MockRevert("NotStarted");
    if (c.finished) throw new MockRevert("AlreadyFinished");
    if (!c.members.some((m) => key(m) === key(who))) throw new MockRevert("NotAMember");
    if (c.defaulted.has(key(who))) throw new MockRevert("HasDefaulted");
    if (c.paid.has(`${c.round}:${key(who)}`)) throw new MockRevert("AlreadyPaid");

    c.paid.add(`${c.round}:${key(who)}`);
    c.pot += c.contribution;
    this.move(c.token, who, null, c.contribution);
  }

  settleRound(circleId: bigint): void {
    const c = this.load(circleId);
    if (!c.started) throw new MockRevert("NotStarted");
    if (c.finished) throw new MockRevert("AlreadyFinished");
    if (BigInt(this.now()) < c.roundDeadline) throw new MockRevert("RoundStillOpen");
    if (c.mode !== Mode.Fixed) throw new MockRevert("WrongMode");

    const round = c.round;
    for (const m of c.members) {
      if (c.paid.has(`${round}:${key(m)}`)) continue;
      // Miss a payment and the deposit fills the gap — the demo's best moment.
      const seized = c.deposit.get(key(m)) ?? 0n;
      if (seized !== 0n) {
        c.deposit.set(key(m), 0n);
        c.pot += seized;
      }
      c.defaulted.add(key(m));
    }

    const recipient = c.members[c.payoutOrder[round]!]!;
    const amount = c.pot;

    c.pot = 0n;
    c.round = round + 1;
    if (c.round === c.maxMembers) c.finished = true;
    // `+=`, not `now + roundSeconds`: rounds keep a fixed schedule even when a
    // settle comes late. Matches the contract.
    else c.roundDeadline += c.roundSeconds;

    if (amount !== 0n) this.move(c.token, null, recipient, amount);
  }

  withdrawDeposit(circleId: bigint, who: Address): void {
    const c = this.load(circleId);
    if (!c.finished) throw new MockRevert("NotFinished");
    if (!c.members.some((m) => key(m) === key(who))) throw new MockRevert("NotAMember");
    if (c.defaulted.has(key(who))) throw new MockRevert("HasDefaulted");
    if (c.withdrawn.has(key(who))) throw new MockRevert("NothingToWithdraw");

    const amount = c.deposit.get(key(who)) ?? 0n;
    if (amount === 0n) throw new MockRevert("NothingToWithdraw");

    c.withdrawn.add(key(who));
    c.deposit.set(key(who), 0n);
    this.move(c.token, null, who, amount);
  }

  transfer(token: Address, from: Address, to: Address, amount: bigint): void {
    this.move(token, from, to, amount);
  }

  // -- views ---------------------------------------------------------------

  circle(circleId: bigint): Circle {
    const c = this.load(circleId);
    return {
      token: c.token,
      contribution: c.contribution,
      maxMembers: c.maxMembers,
      roundSeconds: c.roundSeconds,
      mode: c.mode,
      round: c.round,
      roundDeadline: c.roundDeadline,
      pot: c.pot,
      started: c.started,
      finished: c.finished,
    };
  }

  members(circleId: bigint): Address[] {
    return [...this.load(circleId).members];
  }

  payoutOrder(circleId: bigint): number[] {
    return [...this.load(circleId).payoutOrder];
  }

  outstanding(circleId: bigint): Address[] {
    const c = this.load(circleId);
    if (!c.started || c.finished) return [];
    return c.members.filter((m) => !c.paid.has(`${c.round}:${key(m)}`));
  }

  memberStatus(circleId: bigint, who: Address): MemberStatus {
    const c = this.load(circleId);
    const slot = c.members.findIndex((m) => key(m) === key(who));
    return {
      address: who,
      isMember: slot !== -1,
      deposit: c.deposit.get(key(who)) ?? 0n,
      defaulted: c.defaulted.has(key(who)),
      depositWithdrawn: c.withdrawn.has(key(who)),
      paidThisRound: c.paid.has(`${c.round}:${key(who)}`),
      slot,
      payoutRound: slot === -1 ? -1 : c.payoutOrder.indexOf(slot),
    };
  }
}

// -- the client ------------------------------------------------------------

export interface MockClientOptions {
  /** Which seeded situation to start in. Default `"midRound"`. */
  scenario?: ScenarioName;
  /** Who the app is signed in as. Default {@link MOCK_ME}. */
  me?: Address;
  /**
   * Pretend writes are signed out, so the "sign in with a passkey" path can be
   * built before Mera is wired.
   */
  signedOut?: boolean;
  /**
   * Fake confirmation time, in ms. Drives `settledInSeconds`, so Sohan's timer
   * shows a plausible number. Set to 0 in tests.
   */
  latencyMs?: number;
  /** Start from an empty world instead of a seeded scenario. */
  world?: MockWorld;
}

export class MockChitCircleClient extends ChitCircleClient {
  readonly world: MockWorld;
  readonly me: Address;
  private readonly signedOut: boolean;
  private readonly latencyMs: number;
  private txNonce = 0;

  constructor(world: MockWorld, opts: MockClientOptions = {}) {
    // A stub public client: the only thing inherited code asks it for is the
    // current block timestamp, and it must be the world's clock rather than the
    // device's, or a warped scenario would compute the wrong countdown.
    const publicClient = {
      getBlock: async () => ({ timestamp: BigInt(world.now()) }),
      getBlockNumber: async () => 0n,
    } as unknown as PublicClient;

    super(addr("c1c1e"), publicClient, undefined, 0n);
    this.world = world;
    this.me = opts.me ?? MOCK_ME;
    this.signedOut = opts.signedOut ?? false;
    this.latencyMs = opts.latencyMs ?? 400;
  }

  override withSigner(signer: ChitSigner): MockChitCircleClient {
    return new MockChitCircleClient(this.world, {
      me: signer.address,
      latencyMs: this.latencyMs,
    });
  }

  /** Mirrors the real client: reads work signed out, writes do not. */
  private requireMe(): Address {
    if (this.signedOut) throw new Error("No signer: sign in with a passkey first.");
    return this.me;
  }

  /** Applies a state change behind a fake confirmation delay. */
  private async settle(apply: () => void): Promise<TxResult> {
    const startedAt = Date.now();
    apply();
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
    const hash = `0x${(++this.txNonce).toString(16).padStart(64, "0")}` as Hash;
    return { hash, settledInSeconds: (Date.now() - startedAt) / 1000 };
  }

  // -- reads (leaves only; derived views are inherited) --------------------

  override async getCircle(circleId: bigint): Promise<Circle> {
    return this.world.circle(circleId);
  }

  override async getMembers(circleId: bigint): Promise<Address[]> {
    return this.world.members(circleId);
  }

  override async getPayoutOrder(circleId: bigint): Promise<number[]> {
    return this.world.payoutOrder(circleId);
  }

  override async outstanding(circleId: bigint): Promise<Address[]> {
    return this.world.outstanding(circleId);
  }

  override async nextCircleId(): Promise<bigint> {
    return this.world.getNextId();
  }

  override async balanceOf(token: Address, account: Address): Promise<bigint> {
    return this.world.balanceOf(token, account);
  }

  override async getMemberStatus(circleId: bigint, who: Address): Promise<MemberStatus> {
    return this.world.memberStatus(circleId, who);
  }

  /**
   * The real one issues raw contract reads to keep its call count down, which
   * there is no chain here to answer, so this routes back through the world.
   */
  override async rosterFrom(view: CircleView): Promise<MemberStatus[]> {
    return Promise.all(view.members.map((who) => this.world.memberStatus(view.circleId, who)));
  }

  /** Mirrors the real client: membership from state, plus verified `knownIds`. */
  override async circleIdsFor(who: Address, opts: DiscoveryOptions = {}): Promise<bigint[]> {
    const found = new Set(this.world.idsFor(who));
    for (const id of opts.knownIds ?? []) {
      if (this.world.has(id)) found.add(id);
    }
    return [...found].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  override async circleExists(circleId: bigint): Promise<boolean> {
    return this.world.has(circleId);
  }

  // -- writes --------------------------------------------------------------

  override async ensureAllowance(): Promise<TxResult | null> {
    return null; // approvals are invisible in the real client too
  }

  override async createCircle(args: CreateCircleArgs): Promise<CreateCircleResult> {
    const me = this.requireMe();
    let circleId = 0n;
    const sent = await this.settle(() => {
      circleId = this.world.createCircle(me, args);
    });
    return { ...sent, circleId };
  }

  override async join(circleId: bigint): Promise<TxResult> {
    const me = this.requireMe();
    return this.settle(() => this.world.join(circleId, me));
  }

  override async contribute(circleId: bigint): Promise<TxResult> {
    const me = this.requireMe();
    return this.settle(() => this.world.contribute(circleId, me));
  }

  override async settleRound(circleId: bigint): Promise<TxResult> {
    this.requireMe();
    return this.settle(() => this.world.settleRound(circleId));
  }

  override async withdrawDeposit(circleId: bigint): Promise<TxResult> {
    const me = this.requireMe();
    return this.settle(() => this.world.withdrawDeposit(circleId, me));
  }

  override async sendToMember(token: Address, to: Address, amount: bigint): Promise<TxResult> {
    const me = this.requireMe();
    return this.settle(() => this.world.transfer(token, me, to, amount));
  }

  override async commitBid(): Promise<TxResult> {
    throw new MockRevert("NotImplemented", "Bidding mode is not built yet.");
  }

  override async revealBid(): Promise<TxResult> {
    throw new MockRevert("NotImplemented", "Bidding mode is not built yet.");
  }

  /** Move the clock forward — e.g. a "skip to the deadline" demo button. */
  warp(seconds: number): void {
    this.world.warp(seconds);
  }
}

// -- scenarios -------------------------------------------------------------

export type ScenarioName =
  | "empty"
  | "filling"
  | "midRound"
  | "settleable"
  | "defaulted"
  | "finished";

export const SCENARIOS: Record<ScenarioName, string> = {
  empty: "No circles. Home screen's empty state, then Create.",
  filling: "3 of 5 joined, not started. Join screen and 'waiting for members'.",
  midRound: "Round 1 of 5 open. 2 of 5 have paid, you have not — 'Pay $100' and a live countdown.",
  settleable: "Round 1 deadline passed, everyone paid — 'Settle round' is live for any member.",
  defaulted: "Round 1 settled with Priya missing — Defaulted badge and 'deposit covered the pot'.",
  finished: "All 5 rounds done. Everyone paid in $500 and received $500; deposit is withdrawable.",
};

const everyone = MOCK_PEOPLE.map((p) => p.address);

/**
 * Builds a scenario by *running* the state machine — join, pay, warp, settle —
 * so every seeded state is one the contract could actually produce.
 */
function seed(world: MockWorld, scenario: ScenarioName): void {
  if (scenario === "empty") return;

  /*
   * Priya is the one who misses, and the default order would have handed her
   * the pot in the very next round: the screen then said "Priya missed" six
   * lines above "Priya gets the pot this round", which reads as a bug in the
   * demo rather than the feature it is meant to show. Putting her last keeps
   * the story legible — she missed, her deposit covered it, and she collects
   * at the end like everyone else.
   */
  const payoutOrder = scenario === "defaulted" ? [0, 2, 3, 4, 1] : undefined;

  const id = world.createCircle(everyone[1]!, {
    token: MOCK_TOKEN,
    contribution: MOCK_CONTRIBUTION,
    maxMembers: 5,
    roundSeconds: MOCK_ROUND_SECONDS,
    ...(payoutOrder ? { payoutOrder } : {}),
  });

  if (scenario === "filling") {
    for (const who of everyone.slice(0, 3)) world.join(id, who);
    return;
  }

  for (const who of everyone) world.join(id, who);

  const payAll = (except: Address[] = []) => {
    for (const who of everyone) {
      if (except.some((e) => e.toLowerCase() === who.toLowerCase())) continue;
      world.contribute(id, who);
    }
  };
  const toDeadline = () => world.warp(Number(MOCK_ROUND_SECONDS) + 1);

  switch (scenario) {
    case "midRound":
      // You have not paid: that's the screen with the primary action on it.
      world.contribute(id, everyone[1]!);
      world.contribute(id, everyone[2]!);
      return;

    case "settleable":
      payAll();
      toDeadline();
      return;

    case "defaulted":
      payAll([everyone[1]!]); // Priya misses
      toDeadline();
      world.settleRound(id);
      return;

    case "finished":
      for (let round = 0; round < 5; round++) {
        payAll();
        toDeadline();
        world.settleRound(id);
      }
      return;
  }
}

/**
 * A ready-to-use client. Drop it straight into `<ChitCircleProvider>`.
 *
 * ```tsx
 * const client = useMemo(() => mockClient({ scenario: "midRound" }), []);
 * ```
 *
 * Memoize it — a new client each render means new state each render.
 */
export function mockClient(opts: MockClientOptions = {}): MockChitCircleClient {
  const world = opts.world ?? new MockWorld();
  if (!opts.world) seed(world, opts.scenario ?? "midRound");
  return new MockChitCircleClient(world, opts);
}
