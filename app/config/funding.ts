import { createPublicClient, http } from "viem";
import { monadTestnet as monadTestnetChain } from "viem/chains";
import { GasDripper, funderFromPrivateKey, isFunderKey, type Deployment } from "../../sdk/src/index";

declare const process: {
  env: {
    EXPO_PUBLIC_GAS_FUNDER_KEY?: string;
  };
};

/**
 * A brand-new passkey account is a plain EOA with a zero balance, so its very
 * first action on chain would fail. This funds it from a throwaway account
 * before the user can reach anything that spends.
 *
 * TESTNET ONLY, AND THE KEY SHIPS IN THE BUNDLE. Metro inlines every
 * `EXPO_PUBLIC_*` variable into the JavaScript bundle, so this key travels
 * inside the installed app and anyone with the app has it. It must therefore
 * hold nothing but testnet MON and must never be the deployer key or reused
 * anywhere else. The production answer is sponsorship — a paymaster, or
 * EIP-7702 delegation — not a key on the device. See the README.
 */
const funderKey = process.env.EXPO_PUBLIC_GAS_FUNDER_KEY?.trim();

/**
 * One dripper per endpoint for the life of the process. GasDripper
 * de-duplicates concurrent top-ups per address in instance state, so handing
 * out a fresh instance on every render would reintroduce the double-send it
 * exists to prevent.
 */
const cache = new Map<string, GasDripper>();

/** Null when no funder key is configured: the app then runs without funding. */
export function dripperFor(deployment: Deployment): GasDripper | null {
  if (!isFunderKey(funderKey)) return null;

  const existing = cache.get(deployment.rpcUrl);
  if (existing) return existing;

  const dripper = new GasDripper({
    funder: funderFromPrivateKey(funderKey, deployment.rpcUrl),
    publicClient: createPublicClient({
      chain: monadTestnetChain,
      transport: http(deployment.rpcUrl),
    }),
  });
  cache.set(deployment.rpcUrl, dripper);
  return dripper;
}
