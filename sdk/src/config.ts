import { createPublicClient, http, type Address, type PublicClient, type Transport } from "viem";
import { ChitCircleClient } from "./client.ts";
import type { ChitSigner } from "./types.ts";

export const MONAD_TESTNET_CHAIN_ID = 10143;
export const ANVIL_CHAIN_ID = 31337;
/**
 * Agora's AUSD on Monad testnet — what circles are denominated in.
 *
 * Confirmed against the chain rather than taken from the docs: `name()` and
 * `symbol()` both return "AUSD" and `decimals()` is 6, which is what
 * {@link AUSD_DECIMALS} and every amount shown in the UI assume.
 */
export const MONAD_TESTNET_AUSD_ADDRESS: Address = "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC";

/**
 * Agora's AUSD faucet — how the team and the judges get test money. It is a
 * transparent proxy; the logic lives at 0xba804DF5c476E8EaeF87BF8085F295300ccE2a49.
 *
 *     requestFunds(address receiver)   // permissionless, selector 0x544c7cf9
 *
 * Read off the live contract: $10,000 AUSD per call, a 60-second cooldown, and
 * it refuses once the receiver already holds $100,000 (`MaxAmountToOwn`). One
 * call funds a member many times over — a $100 x 5 circle needs $600 a head.
 *
 * THE COOLDOWN IS GLOBAL TO THE FAUCET, NOT PER CALLER OR PER RECEIVER.
 * Confirmed on 12 Oct 2026: a second account that had never touched the faucet
 * was rejected with `MaxFrequencyExceeded` (0x20e5bc67) seconds after an
 * unrelated address claimed. So members cannot all fund themselves at once —
 * one claim per minute across the whole world. For the demo, claim once to a
 * single address and `transfer` onward; do not put a "get test money" button in
 * a flow several people run together.
 *
 *     cast send 0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C \
 *       "requestFunds(address)" <ADDRESS> \
 *       --rpc-url https://testnet-rpc.monad.xyz --interactive
 */
export const MONAD_TESTNET_AUSD_FAUCET_ADDRESS: Address = "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C";

/**
 * One deployed instance of the app. Everything chain-specific lives here, so
 * screens never hardcode an address.
 *
 * `deployBlock` is not optional on purpose. Discovery scans event logs, and
 * without it every scan starts at genesis — on Monad, where blocks are fast,
 * that is thousands of wasted `eth_getLogs` round trips within a day of
 * deploying. Record it when you deploy; `forge create`/`forge script` print the
 * block in their receipt.
 */
export interface Deployment {
  chainId: number;
  rpcUrl: string;
  /** The ChitCircle contract. */
  chitCircle: Address;
  /** The stablecoin circles are denominated in (AUSD on testnet). */
  token: Address;
  /** Block the ChitCircle deploy transaction landed in. */
  deployBlock: bigint;
  /** Where invite links point. */
  inviteBaseUrl?: string;
}

/**
 * Monad testnet — live and complete as of 12 Oct 2026.
 *
 * Deployed by `contracts/script/Deploy.s.sol`, verified on Sourcify (`match`):
 *
 *     ChitCircle  0x13ec22E7d0BF5b728549990aA852d03BCC9da73D
 *     deploy tx   0xd25a188cc64b65e4a9ff289a5cc9d2cf78031100cc28e233d1bec1288acd3bde
 *     block       70523429   (2,075,050 gas)
 *
 * `deployBlock` is the receipt's block, not an earlier guess: discovery scans
 * logs from here, so a number before the deploy wastes requests and a number
 * after it silently hides circles.
 */
export const monadTestnet: Deployment = {
  chainId: MONAD_TESTNET_CHAIN_ID,
  rpcUrl: "https://testnet-rpc.monad.xyz",
  chitCircle: "0x13ec22E7d0BF5b728549990aA852d03BCC9da73D" as Address,
  token: MONAD_TESTNET_AUSD_ADDRESS,
  deployBlock: 70523429n,
  inviteBaseUrl: "https://chit-circle.vercel.app",
};

export function isComplete(d: Partial<Deployment>): d is Deployment {
  return Boolean(d.chainId && d.rpcUrl && d.chitCircle && d.token && d.deployBlock !== undefined);
}

/** Throws with a useful message instead of handing back half a config. */
export function requireDeployment(d: Partial<Deployment>, label = "deployment"): Deployment {
  const missing = (["chainId", "rpcUrl", "chitCircle", "token", "deployBlock"] as const).filter(
    (k) => d[k] === undefined,
  );
  if (missing.length) {
    throw new Error(`${label} is missing: ${missing.join(", ")}. Not deployed yet?`);
  }
  return d as Deployment;
}

/**
 * How often to poll for a transaction receipt, in ms.
 *
 * viem defaults to 4000, which would make every write in the app report
 * "settled in ~4.0s" however fast the chain is — the demo's headline number
 * would be measuring our own polling loop, not Monad. Found by timing the e2e
 * suite against anvil, where blocks are instant and writes still took 4s each.
 *
 * 250ms is well under Monad's block time, so the number we show is the chain's.
 */
export const RECEIPT_POLL_MS = 250;

/**
 * Calls a second to allow, against the RPC's ceiling of 15.
 *
 * PER TAB, SO IT MUST BE THE CEILING DIVIDED BY THE TABS A DEMO OPENS — not
 * the ceiling itself. The earlier 10 was documented as leaving room for a
 * second profile and did not: the window is per JS context, so two profiles
 * side by side asked for 20 against a ceiling of 15. That is not hypothetical,
 * it is the demo, and it broke a live run the moment both tabs were polling —
 * with the first payment already settled on chain and the screen still
 * reporting a busy network.
 *
 * 7 keeps two tabs at 14. Three tabs would breach it again, which the retry in
 * {@link paced} now absorbs rather than surfaces; a genuine shared budget needs
 * BroadcastChannel, noted where the window is defined.
 */
export const RPC_CALLS_PER_SECOND = 7;

/**
 * How many times to quietly retry Monad's own rate-limit refusal.
 *
 * viem will not do this for us. The refusal arrives as HTTP 200 carrying
 * `{"code":-32011,"message":"requests limited to 15/sec"}`, so its transport
 * sees a successful request with an error payload, not a failure worth
 * retrying — `retryCount` never fires. Waiting out a sliding window takes about
 * a second, so a handful of backed-off attempts turns a visible error into a
 * short pause.
 */
const RATE_LIMIT_RETRIES = 4;

/** Monad's refusal, in every shape it has arrived in. */
function isRateLimited(error: unknown): boolean {
  const text =
    error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error ?? "");
  return /-32011|limited to \d+\s*\/\s*sec|rate.?limit|\b429\b|too many requests/i.test(text);
}

/**
 * NOT SHARED ACROSS TABS, AND DELIBERATELY SO AFTER TRYING IT.
 *
 * Sharing the window through localStorage looks right — it is synchronous and
 * every same-origin tab can see it — and it cost a live run. localStorage
 * writes are synchronous main-thread I/O, so a read, parse, stringify and write
 * on *every* RPC call, from two tabs contending on one key, stalled the
 * renderer badly enough that a WebAuthn prompt timed out and a join was lost to
 * "That confirmation was cancelled".
 *
 * The budget is therefore per-context again, and {@link RPC_CALLS_PER_SECOND}
 * is divided by the number of tabs a demo actually runs rather than multiplied
 * by it. Real cross-tab coordination wants BroadcastChannel — asynchronous, no
 * disk, no main-thread cost — which is the right fix and is not a thing to
 * write for the first time hours before a deadline.
 */

/**
 * Hold a transport under a calls-per-second ceiling.
 *
 * A sliding window rather than a fixed one: a fixed window lets a burst at the
 * end of one second and another at the start of the next sail through at twice
 * the rate, which is exactly the shape of traffic here — a screen mounting
 * fires everything it needs at once.
 *
 * Queued rather than dropped. Every call this app makes is one some screen is
 * waiting on, so refusing is never better than arriving a few hundred
 * milliseconds later.
 */
interface Window {
  sent: number[];
  chain: Promise<unknown>;
}

/**
 * One window per endpoint, shared by every client that talks to it.
 *
 * Module-level on purpose. The limit is enforced by the node against our IP,
 * so it does not care that reads go through a public client and writes go
 * through the signer's wallet client — but two independent pacers would each
 * think they had the whole budget and together blow it. That is exactly what
 * happened: reads were paced, writes were not, and a join still earned
 * "requests limited to 15/sec" because viem issues about five calls per write
 * (chainId, gas estimate, nonce, fees, send) in one burst.
 */
const windows = new Map<string, Window>();

export function paced(inner: Transport, callsPerSecond: number, endpoint: string): Transport {
  let shared = windows.get(endpoint);
  if (!shared) {
    shared = { sent: [], chain: Promise.resolve() };
    windows.set(endpoint, shared);
  }
  const window = shared;
  const sent = window.sent;

  const slot = async (): Promise<void> => {
    for (;;) {
      const now = Date.now();
      while (sent.length > 0 && now - sent[0]! >= 1000) sent.shift();
      if (sent.length < callsPerSecond) {
        sent.push(now);
        return;
      }
      // Wait exactly until the oldest call leaves the window.
      await new Promise((r) => setTimeout(r, 1000 - (now - sent[0]!) + 5));
    }
  };

  return ((opts: Parameters<Transport>[0]) => {
    const transport = inner(opts);
    const inner_ = transport.request as (args: unknown, reqOpts?: unknown) => Promise<unknown>;
    // Serialised through one chain so concurrent callers take slots in order;
    // without it they all read the same window and all decide to proceed.
    const request = (args: unknown, reqOpts?: unknown) => {
      const attempt = async (n: number): Promise<unknown> => {
        const next = window.chain.then(slot).then(() => inner_(args, reqOpts));
        // The chain must never carry a rejection forward, or one refused call
        // wedges every later one behind it.
        window.chain = next.catch(() => {});
        try {
          return await next;
        } catch (error) {
          if (n >= RATE_LIMIT_RETRIES || !isRateLimited(error)) throw error;
          // Backed off, and the next attempt queues for its own slot, so the
          // window has drained by the time it goes out.
          await new Promise((r) => setTimeout(r, 400 * (n + 1)));
          return attempt(n + 1);
        }
      };
      return attempt(0);
    };
    return { ...transport, request: request as typeof transport.request };
  }) as Transport;
}

/** The one call an app needs at startup. */
export function clientFor(deployment: Deployment, signer?: ChitSigner): ChitCircleClient {
  const publicClient = createPublicClient({
    /**
     * Paced, batched and retried, because the public RPC limits by call rate.
     *
     * THE LIMIT IS 15 CALLS A SECOND, enforced per JSON-RPC call rather than
     * per HTTP request — so batching does not buy headroom, because a batch of
     * twenty is twenty calls. Worse, the refusal arrives as HTTP 200 carrying
     * `{"error":{"code":-32011,"message":"requests limited to 15/sec"}}`, so
     * nothing logs it as a failure and it surfaces only as a broken screen.
     *
     * Found by dumping response bodies after a brand-new account's home screen
     * said "Something went wrong" with no console error and no failed request
     * anywhere in devtools.
     *
     * {@link paced} is the load-bearing part: it holds the whole app under the
     * ceiling however many reads a screen asks for at once. Batching and
     * retries stay because they are still worth having, but neither was ever
     * the fix.
     */
    transport: paced(
      http(deployment.rpcUrl, {
        batch: { wait: 16 },
        retryCount: 4,
        retryDelay: 300,
      }),
      RPC_CALLS_PER_SECOND,
      deployment.rpcUrl,
    ),
    pollingInterval: RECEIPT_POLL_MS,
  }) as PublicClient;
  return new ChitCircleClient(
    deployment.chitCircle,
    publicClient,
    signer,
    deployment.deployBlock,
  );
}
