import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { ChitCircleClient } from "./client.ts";
import type { ChitSigner } from "./types.ts";

export const MONAD_TESTNET_CHAIN_ID = 10143;
export const ANVIL_CHAIN_ID = 31337;
export const MONAD_TESTNET_AUSD_ADDRESS: Address = "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC";
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
 * ChitCircle and its deploy block are populated after deployment. AUSD is the
 * official Monad testnet token published in Agora's deployment table.
 */
export const monadTestnet: Partial<Deployment> & Pick<Deployment, "chainId" | "rpcUrl"> = {
  chainId: MONAD_TESTNET_CHAIN_ID,
  rpcUrl: "https://testnet-rpc.monad.xyz",
  token: MONAD_TESTNET_AUSD_ADDRESS,
  inviteBaseUrl: "https://chitcircle.app",
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
