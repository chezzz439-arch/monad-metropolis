import { createPublicClient, http, parseEther, parseUnits } from "viem";
import { monadTestnet as monadTestnetChain } from "viem/chains";
import { GasDripper, erc20Abi, funderFromPrivateKey, isFunderKey, type Deployment } from "../../sdk/src/index";

declare const process: {
  env: {
    EXPO_PUBLIC_GAS_FUNDER_KEY?: string;
    EXPO_PUBLIC_GAS_DRIP_TOP_UP?: string;
    EXPO_PUBLIC_GAS_DRIP_MIN?: string;
    EXPO_PUBLIC_DOLLAR_GRANT?: string;
    EXPO_PUBLIC_DOLLAR_GRANT_MIN?: string;
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
 * Drip amounts, in whole MON, overridable without a code change.
 *
 * Demo night is exactly when someone needs to raise the top-up (a longer
 * circle) or lower it (the funder is running out) without waiting on a rebuild
 * of the native app. A malformed value falls back to the SDK default rather
 * than throwing, because a typo here should not stop sign-up working.
 */
function monAmount(raw: string | undefined): bigint | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  try {
    const parsed = parseEther(value as `${number}`);
    return parsed > 0n ? parsed : undefined;
  } catch {
    console.warn(`Ignoring unparseable gas drip amount ${JSON.stringify(value)}; using the default.`);
    return undefined;
  }
}

const topUpTo = monAmount(process.env.EXPO_PUBLIC_GAS_DRIP_TOP_UP);
const minBalance = monAmount(process.env.EXPO_PUBLIC_GAS_DRIP_MIN);

/**
 * The same idea for test dollars, written in whole dollars — `500`, not
 * `500000000`. AUSD has 6 decimals, and asking whoever is fixing the demo at
 * midnight to count them is how you end up granting a fiftieth of a cent.
 */
function dollarAmount(raw: string | undefined): bigint | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  try {
    const parsed = parseUnits(value as `${number}`, 6);
    return parsed > 0n ? parsed : undefined;
  } catch {
    console.warn(`Ignoring unparseable dollar grant ${JSON.stringify(value)}; using the default.`);
    return undefined;
  }
}

const dollarGrant = dollarAmount(process.env.EXPO_PUBLIC_DOLLAR_GRANT);
const dollarMin = dollarAmount(process.env.EXPO_PUBLIC_DOLLAR_GRANT_MIN);

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

  const publicClient = createPublicClient({
    chain: monadTestnetChain,
    transport: http(deployment.rpcUrl),
  });

  const dripper = new GasDripper({
    funder: funderFromPrivateKey(funderKey, deployment.rpcUrl),
    publicClient: {
      getBalance: (args) => publicClient.getBalance(args),
      waitForTransactionReceipt: (args) => publicClient.waitForTransactionReceipt(args),
      getTokenBalance: ({ token, address }) =>
        publicClient.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        }) as Promise<bigint>,
    },
    // The dripper pays out test dollars from its own stock, filled from the
    // faucet by hand ahead of the demo. The faucet is never called per user:
    // its 60-second cooldown is global, so a queue of judges would serialise.
    dollars: {
      token: deployment.token,
      ...(dollarGrant !== undefined ? { topUpTo: dollarGrant } : {}),
      ...(dollarMin !== undefined ? { minBalance: dollarMin } : {}),
    },
    // Spread rather than passed as undefined: GasDripper applies its own
    // documented defaults when a field is absent.
    ...(topUpTo !== undefined ? { topUpTo } : {}),
    ...(minBalance !== undefined ? { minBalance } : {}),
  });
  cache.set(deployment.rpcUrl, dripper);
  return dripper;
}
