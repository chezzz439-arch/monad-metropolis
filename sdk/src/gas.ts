import { createPublicClient, createWalletClient, formatEther, http, parseEther, type Address, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { erc20Abi } from "./client.ts";
import { RECEIPT_POLL_MS, RPC_CALLS_PER_SECOND, paced } from "./config.ts";
// Aliased: this package already exports a `monadTestnet` *deployment* config.
import { monadTestnet as monadTestnetChain } from "viem/chains";

/**
 * Seeds a brand-new passkey account with enough MON to transact.
 *
 * WHY THIS EXISTS. Mera derives an ordinary secp256k1 key from the passkey's
 * PRF output, so each user's account is a plain EOA that pays its own gas.
 * There is no paymaster in the Mera docs as of 11 Oct 2026. An account created
 * live in the demo therefore has a zero balance and cannot `join` — and the
 * demo creates accounts on camera (concept.md §7: one passkey prompt at 0:20,
 * join at 0:45, and a fresh-device restore at 2:10), so there is no moment at
 * which we could have funded them by hand.
 *
 * WHAT IT IS NOT. This is a demo-grade stand-in for gas sponsorship, not
 * sponsorship itself. The honest production answer is ERC-3009/ERC-2612
 * signatures plus a relayer, which needs permit-shaped entry points on
 * ChitCircle. Say that plainly in the video and the README rather than
 * implying the network fee has been abolished.
 *
 * COST. From `forge test --gas-report`: join ~144k, contribute ~92k, settle
 * ~82k, withdraw ~53k. A member's whole five-round circle is ~740k gas, about
 * 0.08 MON at 100 gwei. The defaults below leave roughly 3x headroom.
 *
 * THE FUNDER KEY NEVER LIVES IN THIS REPO. Pass a {@link GasFunder} built from
 * a key the app reads at runtime. See the warning on {@link GasFunder}.
 */

/**
 * Top up when the account falls below this.
 *
 * SIZED FROM MONAD'S RESERVE RULE, not from what a transaction actually costs.
 * Monad admits a transaction only if the signer can cover the whole gas limit
 * at `maxFeePerGas` — `gas_limit * maxFeePerGas`, reserved up front and
 * refunded after. It is not the fee that gets charged: the priciest write here
 * burns about 0.021 MON but must *reserve* 0.0375.
 *
 * Worked example from the rejection this constant was rewritten for, with
 * viem's own numbers (`maxFeePerGas = baseFee * 1.2 + priority`, which came to
 * 182.4 gwei at a ~150 gwei base fee):
 *
 *   join that fills a circle   205,514 gas -> 0.0375 MON reserved
 *   contribute                 151,721 gas -> 0.0277 MON reserved
 *
 * So this floor has to clear a single `join`'s reserve with room for the base
 * fee to climb, or an account that looks funded cannot send anything. At the
 * old 0.02 an account sitting on 0.021 MON was declared fine and then had its
 * payment refused by the node.
 */
export const DEFAULT_MIN_BALANCE = parseEther("0.06");

/**
 * Top up to this.
 *
 * MEASURED ON CHAIN, not from the gas report. Receipts from the live site at
 * 102 gwei: `createCircle` 173,174 gas = 0.0177 MON, and the `join` that fills
 * a circle 205,514 = 0.0210 MON. An ERC-20 `approve` adds about 0.005.
 *
 * Those are well above the `forge --gas-report` figures this constant was
 * first sized from — the join that starts a circle also pulls everyone's
 * deposit — and the error was not theoretical: an organizer who created a
 * circle and joined it had spent 0.043 of their 0.05 and could not pay the
 * first round. The app told them "You do not have enough in your balance",
 * which is about dollars, and their dollars were fine.
 *
 * SIZED TO SURVIVE A WHOLE SIGN-UP-TO-PAYMENT RUN. 0.05 did not, and the live
 * site proved it: an organizer spent 0.0177 creating, ~0.005 approving and
 * 0.021 joining, which left 0.006 — and Monad then refused their payment with
 * "Signer had insufficient balance", because admitting a `contribute` needs
 * 0.0277 MON *reserved* (see {@link DEFAULT_MIN_BALANCE}). Four writes back to
 * back have to stay clear of that floor the whole way, so this is the floor
 * plus one join's reserve.
 *
 * Kept as small as that allows, because {@link GasDripper.ensure} runs before
 * every write rather than only at sign-in, so an account that runs low
 * mid-circle is topped straight back up. A larger grant would strand MON in
 * accounts that never spend it, and the funder is the scarcest thing in a demo
 * — about 8 sign-ups per MON at this size.
 */
export const DEFAULT_TOP_UP_TO = parseEther("0.12");

/**
 * Test dollars handed to a new account, in AUSD's 6-decimal units — $500.
 *
 * WHY THIS EXISTS AT ALL. Funding gas was only half the problem. A new account
 * could pay the network fee and still not join anything, because a circle asks
 * for a $100 deposit and a fresh account holds zero AUSD. Every judge who
 * signed up hit "Join for $100" and got a revert. The only self-serve source is
 * Agora's faucet, whose 60-second cooldown is global to the faucet rather than
 * per account — so it cannot be called per user, and a queue of judges would
 * serialise behind each other. Instead the faucet is drained into the dripper
 * ahead of time, by hand, and the dripper pays out from its own stock.
 *
 * $500 is five $100 deposits: enough to join the demo circle, pay every round,
 * and still have something left to send a friend on the Send screen.
 */
export const DEFAULT_DOLLAR_GRANT = 500_000_000n;

/**
 * Grant dollars when the account holds less than this — $100, one deposit.
 *
 * Deliberately not zero. An account that spent most of its grant should be
 * topped back up before it is stuck, but one that is merely mid-circle should
 * be left alone rather than handed more every time it signs in.
 */
export const DEFAULT_DOLLAR_MIN = 100_000_000n;

/**
 * The narrow surface the drip needs from whatever holds MON — deliberately
 * tiny, like {@link import("./types.ts").ChitSigner}, so this is trivial to
 * fake in tests and does not tie us to one wallet library.
 *
 * SECURITY: whatever backs this controls real testnet MON. Build it from a key
 * supplied at runtime (an app env var, a dev-only config), never a literal in
 * the repo — the hackathon rules are explicit that no private key may be
 * committed. Give it only what the demo needs; it is a hot key.
 */
export interface GasFunder {
  address: Address;
  /** Send native MON. Resolves with the tx hash once submitted. */
  sendNative(args: { to: Address; amount: bigint }): Promise<Hash>;
  /**
   * Send an ERC-20. Optional: absent in a gas-only setup, which is why the
   * dollar grant reports {@link DollarOutcome} "not-configured" rather than
   * failing when it is missing.
   */
  sendToken?(args: { token: Address; to: Address; amount: bigint }): Promise<Hash>;
}

/** The slice of a viem PublicClient this needs. */
export interface GasChainReader {
  getBalance(args: { address: Address }): Promise<bigint>;
  waitForTransactionReceipt(args: { hash: Hash }): Promise<unknown>;
  /** ERC-20 `balanceOf`. Optional, for the same reason as `sendToken`. */
  getTokenBalance?(args: { token: Address; address: Address }): Promise<bigint>;
}

/** What the dollar grant did. Never thrown — see {@link GasDripper.ensure}. */
export type DollarOutcome =
  | { kind: "not-configured" }
  | { kind: "already-funded"; balance: bigint }
  | { kind: "granted"; sent: bigint; balance: bigint; hash: Hash }
  /** The dripper itself is out of test dollars. The one the demo will hit. */
  | { kind: "funder-empty"; balance: bigint }
  | { kind: "failed"; balance: bigint };

/** Hand a new account enough test dollars to actually join something. */
export interface DollarGrant {
  /** The ERC-20 circles are denominated in (AUSD on Monad testnet). */
  token: Address;
  /** Default {@link DEFAULT_DOLLAR_MIN}. */
  minBalance?: bigint;
  /** Default {@link DEFAULT_DOLLAR_GRANT}. */
  topUpTo?: bigint;
}

/**
 * Build a funder from a private key the app supplies at runtime.
 *
 * ```ts
 * // App startup. The key comes from the environment — NEVER a literal here.
 * const key = process.env.GAS_FUNDER_KEY as `0x${string}`;
 * if (!key) throw new Error("GAS_FUNDER_KEY is not set");
 * const dripper = new GasDripper({ funder: funderFromPrivateKey(key), publicClient });
 * ```
 *
 * Use a throwaway key that holds nothing but testnet MON. On React Native,
 * remember that anything bundled into the app ships to the device — for the
 * demo that is an accepted risk on a testnet-only key, and it is one more
 * reason the production answer is a relayer rather than this.
 */
/**
 * Shape check for a funder key read from the environment.
 *
 * Without it, a typo reaches {@link funderFromPrivateKey} and viem throws an
 * error that quotes the malformed value — which then lands in a log or on an
 * error screen. An unset or malformed key should instead read as "funding is
 * not configured", a state the caller can handle quietly.
 */
export function isFunderKey(value: string | null | undefined): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-f]{64}$/i.test(value) && !/^0x0+$/.test(value);
}

/**
 * The chain reader the dripper needs, built here rather than by the app.
 *
 * Keeping every viem client inside the SDK means one copy of viem decides what
 * a Transport is. The app resolves its own, and handing a transport across that
 * boundary is a type error for reasons that have nothing to do with this code.
 * It also means the pacing and the gentler receipt polling cannot be forgotten
 * by a caller.
 */
export function gasChainReader(rpcUrl: string): GasChainReader {
  const client = createPublicClient({
    chain: monadTestnetChain,
    transport: paced(http(rpcUrl), RPC_CALLS_PER_SECOND, rpcUrl),
    // Receipt polling is one call per tick, and setup waits on two receipts.
    // 250ms is right for timing a write; here it only spends the budget.
    pollingInterval: RECEIPT_POLL_MS * 4,
  });

  return {
    getBalance: (args) => client.getBalance(args),
    waitForTransactionReceipt: (args) => client.waitForTransactionReceipt(args),
    getTokenBalance: ({ token, address }) =>
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      }) as Promise<bigint>,
  };
}

export function funderFromPrivateKey(
  privateKey: `0x${string}`,
  rpcUrl = "https://testnet-rpc.monad.xyz",
): GasFunder {
  const account = privateKeyToAccount(privateKey);
  const wallet = createWalletClient({
    account,
    chain: monadTestnetChain,
    // Same shared rate window as every other client pointed at this endpoint.
    // The funder sends two transactions during sign-up, each ~5 calls, at the
    // exact moment the app is also reading — and the RPC counts the lot.
    transport: paced(http(rpcUrl), RPC_CALLS_PER_SECOND, rpcUrl),
  });

  return {
    address: account.address,
    sendNative: ({ to, amount }) => wallet.sendTransaction({ to, value: amount }),
    sendToken: ({ token, to, amount }) =>
      wallet.writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [to, amount] }),
  };
}

export interface GasDripConfig {
  funder: GasFunder;
  publicClient: GasChainReader;
  /** Default {@link DEFAULT_MIN_BALANCE}. */
  minBalance?: bigint;
  /** Default {@link DEFAULT_TOP_UP_TO}. */
  topUpTo?: bigint;
  /** Omit to fund gas only. */
  dollars?: DollarGrant;
}

export interface GasDripResult {
  /** False when the account already had enough and nothing was sent. */
  topped: boolean;
  balanceBefore: bigint;
  /** Amount sent; `0n` when nothing was needed. */
  sent: bigint;
  hash?: Hash;
  /** What happened to the test dollars. Reported, never thrown. */
  dollars: DollarOutcome;
}

/** Thrown when the funder itself is empty — the one failure a demo will hit. */
export class FunderEmptyError extends Error {
  constructor(funder: Address, have: bigint, need: bigint) {
    super(
      `Gas funder ${funder} has ${formatEther(have)} MON but needs ${formatEther(need)}. ` +
        `Top it up at a Monad testnet faucet.`,
    );
    this.name = "FunderEmptyError";
  }
}

/**
 * Tops accounts up to a target balance.
 *
 * Construct one at app start and call {@link ensure} after a passkey sign-in,
 * before the first write.
 */
export class GasDripper {
  private readonly funder: GasFunder;
  private readonly publicClient: GasChainReader;
  private readonly minBalance: bigint;
  private readonly topUpTo: bigint;
  private readonly dollars?: Required<DollarGrant>;

  /**
   * One promise per address while a top-up is in flight. Sign-in and the first
   * write can race at startup; without this they would both send, and the
   * second would fail on a reused nonce — intermittently, which is the worst
   * kind of bug to meet on demo night.
   */
  private readonly inFlight = new Map<string, Promise<GasDripResult>>();

  constructor(config: GasDripConfig) {
    this.funder = config.funder;
    this.publicClient = config.publicClient;
    this.minBalance = config.minBalance ?? DEFAULT_MIN_BALANCE;
    this.topUpTo = config.topUpTo ?? DEFAULT_TOP_UP_TO;
    if (config.dollars) {
      this.dollars = {
        token: config.dollars.token,
        minBalance: config.dollars.minBalance ?? DEFAULT_DOLLAR_MIN,
        topUpTo: config.dollars.topUpTo ?? DEFAULT_DOLLAR_GRANT,
      };
      if (this.dollars.topUpTo <= this.dollars.minBalance) {
        throw new Error(
          `dollars.topUpTo (${this.dollars.topUpTo}) must exceed dollars.minBalance ` +
            `(${this.dollars.minBalance}), or every grant would be zero.`,
        );
      }
    }

    if (this.topUpTo <= this.minBalance) {
      throw new Error(
        `topUpTo (${formatEther(this.topUpTo)}) must exceed minBalance ` +
          `(${formatEther(this.minBalance)}), or every call would top up by zero.`,
      );
    }
  }

  /**
   * Make sure `who` can pay for transactions. Returns what it did, so the UI
   * can stay silent when nothing was needed.
   *
   * Safe to call on every sign-in: it reads the balance first and sends
   * nothing when the account is already funded.
   */
  async ensure(who: Address): Promise<GasDripResult> {
    const key = who.toLowerCase();
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const run = this.topUp(who).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, run);
    return run;
  }

  private async topUp(who: Address): Promise<GasDripResult> {
    const balanceBefore = await this.publicClient.getBalance({ address: who });
    if (balanceBefore >= this.minBalance) {
      return { topped: false, balanceBefore, sent: 0n, dollars: await this.grantDollars(who) };
    }

    const sent = this.topUpTo - balanceBefore;

    // Checked before sending so the error names the real problem. Without it
    // the funder's own transaction reverts and the user sees something
    // unrelated to "the demo wallet is empty".
    const funderBalance = await this.publicClient.getBalance({ address: this.funder.address });
    if (funderBalance <= sent) {
      throw new FunderEmptyError(this.funder.address, funderBalance, sent);
    }

    const hash = await this.funder.sendNative({ to: who, amount: sent });
    // Wait for inclusion: the caller's next action is a write that will fail
    // if the balance has not landed yet.
    await this.publicClient.waitForTransactionReceipt({ hash });

    // Gas first, deliberately: the dollar grant is itself a transaction the
    // funder pays for, and an account with dollars but no gas is still stuck.
    return { topped: true, balanceBefore, sent, hash, dollars: await this.grantDollars(who) };
  }

  /**
   * Hand out test dollars, reporting rather than throwing.
   *
   * A missing grant must not break sign-up. Gas is load-bearing — without it
   * nothing works at all, so {@link topUp} still throws. Dollars are not: an
   * account that can transact but has nothing to spend can still sign in, look
   * around, and be funded by a teammate. So every failure here becomes a value
   * the UI can turn into a sentence, and the one failure a demo actually hits —
   * the dripper running dry — gets its own kind so it can be said plainly.
   */
  private async grantDollars(who: Address): Promise<DollarOutcome> {
    const grant = this.dollars;
    const send = this.funder.sendToken;
    const read = this.publicClient.getTokenBalance;
    if (!grant || !send || !read) return { kind: "not-configured" };

    let balance = 0n;
    try {
      balance = await read.call(this.publicClient, { token: grant.token, address: who });
      if (balance >= grant.minBalance) return { kind: "already-funded", balance };

      const amount = grant.topUpTo - balance;
      const stock = await read.call(this.publicClient, { token: grant.token, address: this.funder.address });
      if (stock < amount) return { kind: "funder-empty", balance };

      const hash = await send.call(this.funder, { token: grant.token, to: who, amount });
      await this.publicClient.waitForTransactionReceipt({ hash });
      return { kind: "granted", sent: amount, balance: balance + amount, hash };
    } catch {
      return { kind: "failed", balance };
    }
  }
}
