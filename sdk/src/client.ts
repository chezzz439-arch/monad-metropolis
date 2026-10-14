import { parseEventLogs, type Address, type Hash, type PublicClient, type TransactionReceipt } from "viem";
import { chitCircleAbi } from "./abi.ts";
import {
  Mode,
  type Circle,
  type CircleView,
  type CreateCircleArgs,
  type CreateCircleResult,
  type ChitSigner,
  type DiscoveryOptions,
  type MemberStatus,
  type TxResult,
} from "./types.ts";

/**
 * Default ceiling on how many circle ids {@link ChitCircleClient.circleIdsFor}
 * will probe in one pass. Generous for a demo; see the note there on why this
 * is a count of circles rather than a range of blocks.
 */
export const DEFAULT_MAX_CIRCLES = 256;

/**
 * Membership probes in flight at once.
 *
 * The transport paces itself under the RPC's 15-calls-a-second ceiling, so
 * this no longer decides whether we get rate-limited — it decides how long a
 * queue discovery hands the pacer. Sixteen was enough to monopolise the whole
 * budget for a second and leave a screen mounting behind it waiting.
 */
const PROBE_CONCURRENCY = 8;

/**
 * Run `fn` over `items`, at most `size` at a time.
 *
 * `Promise.all` over every id at once is what gets a public RPC to start
 * refusing connections, and an unbounded fan-out is exactly the kind of thing
 * that works on anvil and falls over on demo night.
 */
async function inBatches<T>(
  items: readonly T[],
  size: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

/** Internal: a {@link TxResult} that still has its receipt attached. */
interface SentTx extends TxResult {
  receipt: TransactionReceipt;
}

export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

const MAX_UINT256 = (1n << 256n) - 1n;

/**
 * Reads and writes for one deployed ChitCircle. Reads need only a
 * {@link PublicClient}; writes need a {@link ChitSigner}, so screens can render
 * a circle before the user has signed in.
 */
export class ChitCircleClient {
  readonly address: Address;
  readonly publicClient: PublicClient;
  readonly deployBlock: bigint;
  private signer: ChitSigner | undefined;

  /**
   * Fields are declared and assigned rather than written as constructor
   * parameter properties, which Node's type stripping rejects — and the e2e
   * test runs this file through Node directly.
   *
   * @param deployBlock Block the contract was deployed in. Discovery scans from
   *        here; without it every lookup walks the chain from genesis, which
   *        most public RPCs will refuse.
   */
  constructor(
    address: Address,
    publicClient: PublicClient,
    signer?: ChitSigner,
    deployBlock: bigint = 0n,
  ) {
    this.address = address;
    this.publicClient = publicClient;
    this.signer = signer;
    this.deployBlock = deployBlock;
  }

  withSigner(signer: ChitSigner): ChitCircleClient {
    return new ChitCircleClient(this.address, this.publicClient, signer, this.deployBlock);
  }

  private requireSigner(): ChitSigner {
    if (!this.signer) throw new Error("No signer: sign in with a passkey first.");
    return this.signer;
  }

  // -- reads ---------------------------------------------------------------

  /**
   * A dynamic `functionName` defeats viem's literal-type inference, so the cast
   * is contained here. The public methods below re-impose return types, which is
   * where callers actually get their safety.
   */
  private read<T>(functionName: string, args: readonly unknown[]): Promise<T> {
    const config = {
      address: this.address,
      abi: chitCircleAbi,
      functionName,
      args,
    } as unknown as Parameters<PublicClient["readContract"]>[0];
    return this.publicClient.readContract(config) as Promise<T>;
  }

  async getCircle(circleId: bigint): Promise<Circle> {
    return this.read<Circle>("getCircle", [circleId]);
  }

  async getMembers(circleId: bigint): Promise<Address[]> {
    return [...(await this.read<readonly Address[]>("getMembers", [circleId]))];
  }

  async getPayoutOrder(circleId: bigint): Promise<number[]> {
    return [...(await this.read<readonly number[]>("getPayoutOrder", [circleId]))];
  }

  async outstanding(circleId: bigint): Promise<Address[]> {
    return [...(await this.read<readonly Address[]>("outstanding", [circleId]))];
  }

  async nextCircleId(): Promise<bigint> {
    return this.read<bigint>("nextCircleId", []);
  }

  async balanceOf(token: Address, account: Address): Promise<bigint> {
    return this.publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account],
    });
  }

  /**
   * One round-trip for everything a circle screen renders. Prefer this over
   * stitching individual reads in the UI.
   */
  async getCircleView(circleId: bigint, me?: Address): Promise<CircleView> {
    const [circle, members, payoutOrder, outstanding, block] = await Promise.all([
      this.getCircle(circleId),
      this.getMembers(circleId),
      this.getPayoutOrder(circleId),
      this.outstanding(circleId),
      this.publicClient.getBlock(),
    ]);

    // Chain time, not device time. `settleRound` compares against block
    // timestamps, so a phone with a skewed clock would otherwise show a wrong
    // countdown and enable the settle button early, producing a revert the user
    // can do nothing about. One extra parallel read is worth that.
    const now = Number(block.timestamp);
    const deadline = Number(circle.roundDeadline);
    const settleable = circle.started && !circle.finished && deadline > 0 && now >= deadline;

    const slotThisRound = circle.started ? payoutOrder[circle.round] : undefined;
    const recipient = slotThisRound === undefined ? null : (members[slotThisRound] ?? null);

    let meStatus: MemberStatus | null = null;
    if (me) meStatus = await this.getMemberStatus(circleId, me, circle, members, payoutOrder);

    return {
      ...circle,
      circleId,
      members,
      payoutOrder,
      recipient,
      outstanding,
      secondsUntilSettle: settleable || deadline === 0 ? 0 : Math.max(0, deadline - now),
      settleable,
      expectedPot: BigInt(circle.maxMembers) * circle.contribution,
      me: meStatus,
    };
  }

  async getMemberStatus(
    circleId: bigint,
    who: Address,
    circle?: Circle,
    members?: Address[],
    payoutOrder?: number[],
  ): Promise<MemberStatus> {
    const c = circle ?? (await this.getCircle(circleId));
    const list = members ?? (await this.getMembers(circleId));
    const order = payoutOrder ?? (await this.getPayoutOrder(circleId));

    const [isMember, deposit, defaulted, depositWithdrawn, paidThisRound] = await Promise.all([
      this.read<boolean>("isMember", [circleId, who]),
      this.read<bigint>("depositOf", [circleId, who]),
      this.read<boolean>("defaulted", [circleId, who]),
      this.read<boolean>("depositWithdrawn", [circleId, who]),
      this.read<boolean>("hasPaid", [circleId, c.round, who]),
    ]);

    const slot = list.findIndex((m) => m.toLowerCase() === who.toLowerCase());
    const payoutRound = slot === -1 ? -1 : order.indexOf(slot);

    return { address: who, isMember, deposit, defaulted, depositWithdrawn, paidThisRound, slot, payoutRound };
  }

  // -- discovery -----------------------------------------------------------

  /**
   * Circle ids `who` is a member of, ascending.
   *
   * READS STATE, NOT LOGS — ON PURPOSE. This used to scan `CircleCreated` and
   * `Joined`, which worked against a local anvil and failed on the live
   * network: `testnet-rpc.monad.xyz` rejects any `eth_getLogs` spanning more
   * than 100 blocks, and Monad adds ~16k blocks an hour, so a scan from the
   * deploy block needed >1,000 chunked requests and grew worse hourly. Home
   * showed "could not load circles" to everyone. Probing `isMember` costs one
   * `eth_call` per circle id instead, with no range limit anywhere.
   *
   * The trade is O(circles in the contract) rather than O(circles you are in).
   * That is the right shape for a demo and small real use; past a few hundred
   * circles this wants an Envio index, which the README says plainly.
   *
   * Only reports circles `who` has actually *joined*. Nothing on chain links a
   * circle to its creator — `createCircle` stores no organizer and only emits
   * an event — so a created-but-unjoined circle arrives via
   * {@link DiscoveryOptions.knownIds}.
   */
  async circleIdsFor(who: Address, opts: DiscoveryOptions = {}): Promise<bigint[]> {
    const next = await this.nextCircleId();
    const window = BigInt(opts.maxCircles ?? DEFAULT_MAX_CIRCLES);
    const first = next > window ? next - window : 0n;

    const candidates: bigint[] = [];
    for (let id = first; id < next; id++) candidates.push(id);

    const found = new Set<bigint>();
    await inBatches(candidates, PROBE_CONCURRENCY, async (id) => {
      if (await this.read<boolean>("isMember", [id, who])) found.add(id);
    });

    // Ids the caller remembers locally. Checked against the contract so a
    // stale or hand-edited entry cannot put a circle on someone's home screen.
    await inBatches(opts.knownIds ?? [], PROBE_CONCURRENCY, async (id) => {
      if (found.has(id) || id < 0n || id >= next) return;
      const circle = await this.getCircle(id);
      if (circle.contribution > 0n) found.add(id);
    });

    return [...found].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  /** {@link circleIdsFor}, resolved to full views. */
  async myCircles(who: Address, opts: DiscoveryOptions = {}): Promise<CircleView[]> {
    const ids = await this.circleIdsFor(who, opts);
    return this.getCircleViews(ids, who);
  }

  /** Several circle views in parallel. */
  async getCircleViews(circleIds: readonly bigint[], me?: Address): Promise<CircleView[]> {
    return Promise.all(circleIds.map((id) => this.getCircleView(id, me)));
  }

  /** Members of a circle, each with their status — for the roster screen. */
  async getRoster(circleId: bigint): Promise<MemberStatus[]> {
    const view = await this.getCircleView(circleId);
    return this.rosterFrom(view);
  }

  /**
   * The roster, built from a {@link CircleView} the caller already has.
   *
   * Exists because the public RPC meters JSON-RPC calls rather than HTTP
   * requests, so batching them changed nothing and the circle screen was
   * spending ~23 calls a poll — ten for the view, thirteen to re-read the same
   * circle for the roster — and earned a 429 that blanked the screen.
   *
   * Two of the five reads per member are already answered by the view:
   * `isMember` is "are they in `members`", and `paidThisRound` is "are they
   * absent from `outstanding`", which is exactly what the contract's
   * `outstanding` returns. That leaves three genuine reads each.
   */
  async rosterFrom(view: CircleView): Promise<MemberStatus[]> {
    const owing = new Set(view.outstanding.map((a) => a.toLowerCase()));

    return Promise.all(
      view.members.map(async (who, slot) => {
        const [deposit, defaulted, depositWithdrawn] = await Promise.all([
          this.read<bigint>("depositOf", [view.circleId, who]),
          this.read<boolean>("defaulted", [view.circleId, who]),
          this.read<boolean>("depositWithdrawn", [view.circleId, who]),
        ]);

        return {
          address: who,
          isMember: true, // they are in `members`, which is the contract's own answer
          deposit,
          defaulted,
          depositWithdrawn,
          paidThisRound: !owing.has(who.toLowerCase()),
          slot,
          payoutRound: view.payoutOrder.indexOf(slot),
        } satisfies MemberStatus;
      }),
    );
  }

  /**
   * Does this circle id exist? Use before rendering an invite link, so a bad
   * link shows "circle not found" rather than an empty screen.
   */
  async circleExists(circleId: bigint): Promise<boolean> {
    const next = await this.nextCircleId();
    if (circleId >= next) return false;
    const circle = await this.getCircle(circleId);
    return circle.contribution > 0n;
  }

  // -- writes --------------------------------------------------------------

  /** Submit, wait for inclusion, and report how long settlement took. */
  private async send(hash: Hash, startedAt: number): Promise<SentTx> {
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    return { hash, settledInSeconds: (Date.now() - startedAt) / 1000, receipt };
  }

  private write(functionName: string, args: readonly unknown[], noPromptAmount?: bigint): Promise<SentTx> {
    const signer = this.requireSigner();
    const startedAt = Date.now();
    return signer
      .write({ address: this.address, abi: chitCircleAbi, functionName, args, noPromptAmount })
      .then((hash) => this.send(hash, startedAt));
  }

  /**
   * Approve the contract to pull `amount` of `token`, if it cannot already.
   * Returns null when no approval was needed.
   *
   * Approves max rather than exact so a member is not re-prompted every round —
   * which is what makes the no-prompt `contribute()` in the demo possible.
   */
  async ensureAllowance(token: Address, amount: bigint): Promise<TxResult | null> {
    const signer = this.requireSigner();
    const current = await this.publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [signer.address, this.address],
    });
    if (current >= amount) return null;

    const startedAt = Date.now();
    const hash = await signer.write({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [this.address, MAX_UINT256],
    });
    return this.send(hash, startedAt);
  }

  /**
   * Create a circle and report the id the contract assigned it.
   *
   * The id comes out of the `CircleCreated` log rather than a `nextCircleId()`
   * read taken before sending: those are two separate round-trips, and anyone
   * else's `createCircle` landing in between would hand us their id. The app
   * then navigates the organizer into a circle that is not theirs.
   */
  async createCircle(args: CreateCircleArgs): Promise<CreateCircleResult> {
    const payoutOrder =
      args.payoutOrder ?? Array.from({ length: args.maxMembers }, (_, i) => i);

    if (payoutOrder.length !== args.maxMembers) {
      throw new Error(`payoutOrder must have ${args.maxMembers} entries, got ${payoutOrder.length}`);
    }
    const seen = new Set(payoutOrder);
    if (seen.size !== payoutOrder.length || payoutOrder.some((s) => s < 0 || s >= args.maxMembers)) {
      throw new Error("payoutOrder must be a permutation of 0..maxMembers-1");
    }

    const sent = await this.write("createCircle", [
      args.token,
      args.contribution,
      args.maxMembers,
      args.roundSeconds,
      args.mode ?? Mode.Fixed,
      payoutOrder,
    ]);

    return { hash: sent.hash, settledInSeconds: sent.settledInSeconds, circleId: this.circleIdFrom(sent.receipt) };
  }

  /**
   * Pull the new circle's id out of a `createCircle` receipt.
   *
   * Filtered to this contract's own logs: decoding by topic alone would let any
   * other contract in the same transaction that happens to share the
   * `CircleCreated` signature supply the id.
   */
  private circleIdFrom(receipt: TransactionReceipt): bigint {
    const logs = parseEventLogs({
      abi: chitCircleAbi,
      eventName: "CircleCreated",
      logs: receipt.logs,
    }).filter((log) => log.address.toLowerCase() === this.address.toLowerCase());

    const id = logs[0]?.args?.circleId;
    if (typeof id !== "bigint") {
      throw new Error(
        "createCircle succeeded but its receipt carried no CircleCreated log, " +
          "so the new circle's id is unknown. Open it from your circles list.",
      );
    }
    return id;
  }

  /** Locks a deposit of one contribution. Approves first if needed. */
  async join(circleId: bigint): Promise<TxResult> {
    const circle = await this.getCircle(circleId);
    await this.ensureAllowance(circle.token, circle.contribution);
    return this.write("join", [circleId]);
  }

  async contribute(circleId: bigint): Promise<TxResult> {
    const circle = await this.getCircle(circleId);
    await this.ensureAllowance(circle.token, circle.contribution);
    return this.write("contribute", [circleId], circle.contribution);
  }

  /** Callable by anyone once the round deadline has passed. */
  async settleRound(circleId: bigint): Promise<TxResult> {
    return this.write("settleRound", [circleId]);
  }

  async withdrawDeposit(circleId: bigint): Promise<TxResult> {
    return this.write("withdrawDeposit", [circleId]);
  }

  /**
   * Member-to-member send ("cover Priya's share", "send my payout to Mom").
   * A plain ERC20 transfer — it deliberately does not touch ChitCircle, so the
   * Agora send/receive demo stays a one-hop stablecoin transfer.
   */
  async sendToMember(token: Address, to: Address, amount: bigint): Promise<TxResult> {
    const signer = this.requireSigner();
    const startedAt = Date.now();
    const hash = await signer.transferToken({ token, to, amount });
    return this.send(hash, startedAt);
  }

  // -- bid mode (stretch; contract reverts NotImplemented) -----------------

  async commitBid(circleId: bigint, commitment: `0x${string}`): Promise<TxResult> {
    return this.write("commitBid", [circleId, commitment]);
  }

  async revealBid(circleId: bigint, discount: bigint, secret: `0x${string}`): Promise<TxResult> {
    return this.write("revealBid", [circleId, discount, secret]);
  }
}
