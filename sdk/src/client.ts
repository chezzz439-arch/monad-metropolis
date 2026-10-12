import { getAbiItem, type Address, type Hash, type PublicClient } from "viem";
import { chitCircleAbi } from "./abi.ts";
import {
  Mode,
  type Circle,
  type CircleView,
  type CreateCircleArgs,
  type ChitSigner,
  type DiscoveryOptions,
  type MemberStatus,
  type TxResult,
} from "./types.ts";

const circleCreatedEvent = getAbiItem({ abi: chitCircleAbi, name: "CircleCreated" });
const joinedEvent = getAbiItem({ abi: chitCircleAbi, name: "Joined" });

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
   * Scan logs in chunks. Public RPCs cap how many blocks one `eth_getLogs` may
   * span, so a single wide query fails on a chain that has been alive a while.
   */
  private async scanLogs(
    event: typeof circleCreatedEvent | typeof joinedEvent,
    args: Record<string, unknown>,
    opts: DiscoveryOptions = {},
  ): Promise<readonly { args: Record<string, unknown> }[]> {
    const from = opts.fromBlock ?? this.deployBlock;
    const to = opts.toBlock ?? (await this.publicClient.getBlockNumber());
    const step = opts.maxBlockRange ?? 10_000n;

    const collected: { args: Record<string, unknown> }[] = [];
    for (let start = from; start <= to; start += step) {
      const end = start + step - 1n > to ? to : start + step - 1n;
      const logs = await this.publicClient.getLogs({
        address: this.address,
        event,
        args,
        fromBlock: start,
        toBlock: end,
      } as unknown as Parameters<PublicClient["getLogs"]>[0]);
      collected.push(...(logs as unknown as { args: Record<string, unknown> }[]));
    }
    return collected;
  }

  /**
   * Circle ids `who` organized or joined, ascending.
   *
   * Reads `CircleCreated` and `Joined`, both of which index the member, so the
   * RPC does the filtering. Good enough for the demo and for small real use;
   * swap in an Envio index if a user ever has many circles.
   */
  async circleIdsFor(who: Address, opts: DiscoveryOptions = {}): Promise<bigint[]> {
    const [created, joined] = await Promise.all([
      this.scanLogs(circleCreatedEvent, { organizer: who }, opts),
      this.scanLogs(joinedEvent, { member: who }, opts),
    ]);

    const ids = new Set<bigint>();
    for (const log of [...created, ...joined]) {
      const id = log.args["circleId"];
      if (typeof id === "bigint") ids.add(id);
    }
    return [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
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
    const [circle, members, payoutOrder] = await Promise.all([
      this.getCircle(circleId),
      this.getMembers(circleId),
      this.getPayoutOrder(circleId),
    ]);
    return Promise.all(
      members.map((m) => this.getMemberStatus(circleId, m, circle, members, payoutOrder)),
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
  private async send(hash: Hash, startedAt: number): Promise<TxResult> {
    await this.publicClient.waitForTransactionReceipt({ hash });
    return { hash, settledInSeconds: (Date.now() - startedAt) / 1000 };
  }

  private write(functionName: string, args: readonly unknown[]): Promise<TxResult> {
    const signer = this.requireSigner();
    const startedAt = Date.now();
    return signer
      .write({ address: this.address, abi: chitCircleAbi, functionName, args })
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

  async createCircle(args: CreateCircleArgs): Promise<TxResult> {
    const payoutOrder =
      args.payoutOrder ?? Array.from({ length: args.maxMembers }, (_, i) => i);

    if (payoutOrder.length !== args.maxMembers) {
      throw new Error(`payoutOrder must have ${args.maxMembers} entries, got ${payoutOrder.length}`);
    }
    const seen = new Set(payoutOrder);
    if (seen.size !== payoutOrder.length || payoutOrder.some((s) => s < 0 || s >= args.maxMembers)) {
      throw new Error("payoutOrder must be a permutation of 0..maxMembers-1");
    }

    return this.write("createCircle", [
      args.token,
      args.contribution,
      args.maxMembers,
      args.roundSeconds,
      args.mode ?? Mode.Fixed,
      payoutOrder,
    ]);
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
    return this.write("contribute", [circleId]);
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
