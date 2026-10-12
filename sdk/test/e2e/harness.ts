import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createPublicClient, createWalletClient, defineChain, http, type Address, type Hash, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ChitCircleClient, erc20Abi } from "../../src/client.ts";
import type { ChitSigner } from "../../src/types.ts";

export const RPC_PORT = 8599;
export const RPC_URL = `http://127.0.0.1:${RPC_PORT}`;
export const CHAIN_ID = 31337;

const require = createRequire(import.meta.url);

export const anvilChain = defineChain({
  id: CHAIN_ID,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

/**
 * Anvil's deterministic accounts. These keys are printed by anvil on every
 * start and are in Foundry's docs — they are test fixtures, not secrets, and
 * hold no value on any real network.
 */
export const ACCOUNTS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
] as const;

/** Prefer a directly killable Foundry binary, then a system installation. */
function foundryBin(name: string): string {
  if (name === "anvil") {
    const arch = process.arch === "x64" ? "amd64" : process.arch;
    try {
      const packageJson = require.resolve(`@foundry-rs/${name}-${process.platform}-${arch}/package.json`);
      const binary = join(dirname(packageJson), "bin", name);
      if (existsSync(binary)) return binary;
    } catch {
      // The platform-specific npm binary is optional; use the system install below.
    }
  }

  const local = join(homedir(), ".foundry", "bin", name);
  return existsSync(local) ? local : name;
}

async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as { result?: T; error?: { message: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result as T;
}

/** Move the chain clock forward and mine, so a round deadline can pass. */
export async function warp(seconds: number): Promise<void> {
  await rpc("evm_increaseTime", [seconds]);
  await rpc("evm_mine", []);
}

export async function mine(blocks = 1): Promise<void> {
  for (let i = 0; i < blocks; i++) await rpc("evm_mine", []);
}

export interface Harness {
  anvil: ChildProcess;
  publicClient: PublicClient;
  chitCircle: Address;
  token: Address;
  deployBlock: bigint;
  /**
   * Client and address for anvil account `i`, both signed. Accessors rather
   * than arrays so `noUncheckedIndexedAccess` does not litter the tests with
   * `!` — an out-of-range index is a bug in the test, so it throws.
   */
  client(i: number): ChitCircleClient;
  addr(i: number): Address;
  stop(): void;
}

function at<T>(list: readonly T[], i: number, what: string): T {
  const value = list[i];
  if (value === undefined) throw new Error(`no ${what} at index ${i}`);
  return value;
}

function localSigner(privateKey: `0x${string}`): ChitSigner {
  const account = privateKeyToAccount(privateKey);
  const wallet = createWalletClient({ account, chain: anvilChain, transport: http(RPC_URL) });

  return {
    address: account.address,
    write({ address, abi, functionName, args }) {
      return wallet.writeContract({
        address,
        abi,
        functionName,
        args,
      } as never) as Promise<Hash>;
    },
    transferToken({ token, to, amount }) {
      return wallet.writeContract({
        address: token,
        abi: erc20Abi,
        functionName: "transfer",
        args: [to, amount],
      });
    },
  };
}

async function waitForRpc(timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await rpc("eth_chainId");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  throw new Error(`anvil did not answer on ${RPC_URL} within ${timeoutMs}ms`);
}

/**
 * Start anvil, deploy ChitCircle + MockUSD, and hand back wired-up clients.
 *
 * Everything the SDK does against a chain is exercised here rather than mocked,
 * which is the point: the read decoding, the log scanning and the allowance
 * dance are exactly the parts a unit test cannot cover.
 */
export async function startHarness(): Promise<Harness> {
  // No --block-time: anvil mines each transaction immediately, which is what
  // the test wants. Deadlines are advanced with evm_increaseTime instead.
  const anvil = spawn(foundryBin("anvil"), ["--port", String(RPC_PORT), "--silent"], {
    stdio: ["ignore", "ignore", "pipe"],
  });

  // Keep anvil's own complaints — a bad flag or a busy port is otherwise
  // indistinguishable from a timeout.
  let anvilErr = "";
  anvil.stderr?.on("data", (d) => (anvilErr += d));
  anvil.on("error", (e) => (anvilErr += `spawn failed: ${e.message}\n`));

  const stop = () => {
    if (!anvil.killed) anvil.kill("SIGKILL");
  };

  try {
    await waitForRpc().catch((e) => {
      throw new Error(`${e.message}${anvilErr ? `\nanvil said:\n${anvilErr}` : ""}`);
    });

    // Mine a few blocks before deploying, so deployBlock > 0 and the scan
    // window is genuinely being honoured rather than accidentally covering
    // the whole chain.
    await mine(5);
    const blockBeforeDeploy = BigInt(await rpc<string>("eth_blockNumber"));

    const out = await runForgeScript();
    const chitCircle = parseAddress(out, "CHIT");
    const token = parseAddress(out, "TOKEN");

    const publicClient = createPublicClient({
      chain: anvilChain,
      transport: http(RPC_URL),
      // Same reason as RECEIPT_POLL_MS in src/config.ts: viem's 4s default
      // makes every write look like it took 4 seconds. Tighter here because
      // anvil mines instantly.
      pollingInterval: 20,
    }) as PublicClient;

    const deployBlock = blockBeforeDeploy + 1n;
    const clients = ACCOUNTS.map((key) =>
      new ChitCircleClient(chitCircle, publicClient, localSigner(key), deployBlock),
    );
    const addresses = ACCOUNTS.map((k) => privateKeyToAccount(k).address);

    return {
      anvil,
      publicClient,
      chitCircle,
      token,
      deployBlock,
      client: (i) => at(clients, i, "client"),
      addr: (i) => at(addresses, i, "address"),
      stop,
    };
  } catch (e) {
    stop();
    throw e;
  }
}

function runForgeScript(): Promise<string> {
  return new Promise((resolve, reject) => {
    const forge = spawn(
      foundryBin("forge"),
      [
        "script",
        "script/DeployLocal.s.sol:DeployLocal",
        "--rpc-url",
        RPC_URL,
        "--broadcast",
        "--unlocked",
        "--sender",
        privateKeyToAccount(ACCOUNTS[0]).address,
      ],
      { cwd: new URL("../../../contracts/", import.meta.url).pathname },
    );

    let stdout = "";
    let stderr = "";
    forge.stdout.on("data", (d) => (stdout += d));
    forge.stderr.on("data", (d) => (stderr += d));
    forge.on("error", (e) => reject(new Error(`could not run forge: ${e.message}`)));
    forge.on("close", (code) =>
      code === 0 ? resolve(stdout) : reject(new Error(`forge script failed (${code}):\n${stderr}\n${stdout}`)),
    );
  });
}

function parseAddress(out: string, label: string): Address {
  const match = out.match(new RegExp(`${label}=\\s*(0x[0-9a-fA-F]{40})`));
  if (!match?.[1]) throw new Error(`no ${label}= in forge output:\n${out}`);
  return match[1] as Address;
}
