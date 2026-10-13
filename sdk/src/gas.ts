import { createWalletClient, formatEther, http, parseEther, type Address, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
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

/** Top up when the account falls below this. ~5 writes of headroom. */
export const DEFAULT_MIN_BALANCE = parseEther("0.05");
/** Top up to this. Covers a full five-round circle several times over. */
export const DEFAULT_TOP_UP_TO = parseEther("0.25");

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
}

/** The slice of a viem PublicClient this needs. */
export interface GasChainReader {
  getBalance(args: { address: Address }): Promise<bigint>;
  waitForTransactionReceipt(args: { hash: Hash }): Promise<unknown>;
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

export function funderFromPrivateKey(
  privateKey: `0x${string}`,
  rpcUrl = "https://testnet-rpc.monad.xyz",
): GasFunder {
  const account = privateKeyToAccount(privateKey);
  const wallet = createWalletClient({
    account,
    chain: monadTestnetChain,
    transport: http(rpcUrl),
  });

  return {
    address: account.address,
    sendNative: ({ to, amount }) => wallet.sendTransaction({ to, value: amount }),
  };
}

export interface GasDripConfig {
  funder: GasFunder;
  publicClient: GasChainReader;
  /** Default {@link DEFAULT_MIN_BALANCE}. */
  minBalance?: bigint;
  /** Default {@link DEFAULT_TOP_UP_TO}. */
  topUpTo?: bigint;
}

export interface GasDripResult {
  /** False when the account already had enough and nothing was sent. */
  topped: boolean;
  balanceBefore: bigint;
  /** Amount sent; `0n` when nothing was needed. */
  sent: bigint;
  hash?: Hash;
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
      return { topped: false, balanceBefore, sent: 0n };
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

    return { topped: true, balanceBefore, sent, hash };
  }
}
