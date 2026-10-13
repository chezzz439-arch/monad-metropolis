import { createPublicClient, http, type Address, type PublicClient } from "viem";
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

/** The one call an app needs at startup. */
export function clientFor(deployment: Deployment, signer?: ChitSigner): ChitCircleClient {
  const publicClient = createPublicClient({
    transport: http(deployment.rpcUrl),
    pollingInterval: RECEIPT_POLL_MS,
  }) as PublicClient;
  return new ChitCircleClient(
    deployment.chitCircle,
    publicClient,
    signer,
    deployment.deployBlock,
  );
}
