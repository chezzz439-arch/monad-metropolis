/**
 * Discovery must never depend on `eth_getLogs`.
 *
 * This is a regression test for a bug that passed every test we had and broke
 * the live app. Discovery used to scan `CircleCreated`/`Joined` logs from the
 * deploy block. A local anvil has no block-range limit, so the e2e suite was
 * green; `testnet-rpc.monad.xyz` rejects any `eth_getLogs` spanning more than
 * 100 blocks, and the window from our deploy block grows by roughly 16k blocks
 * an hour. On the deployed site the home screen just said "could not load
 * circles" to every user.
 *
 * So these tests do not check that discovery is *fast* — they check that it
 * never asks for logs at all. Any future change that reintroduces a log scan
 * fails here instead of on demo night.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { Address, PublicClient } from "viem";
import { ChitCircleClient } from "../src/client.ts";

const CONTRACT = "0x13ec22E7d0BF5b728549990aA852d03BCC9da73D" as Address;
const ME = "0x0000000000000000000000000000000000000A11" as Address;
const STRANGER = "0x000000000000000000000000000000000000b0b0" as Address;

/** The exact error the Monad testnet RPC returns for too wide a range. */
const RANGE_ERROR = "eth_getLogs is limited to a 100 range";

interface Probe {
  client: PublicClient;
  calls: string[];
}

/**
 * A PublicClient that answers the handful of reads discovery needs, records
 * every method it was asked for, and treats any log request as a hard failure —
 * the way the live RPC does.
 *
 * `members` maps a circle id to its member list, which is all `isMember` needs.
 */
function probeClient(members: Record<string, Address[]>, nextCircleId: bigint): Probe {
  const calls: string[] = [];

  const readContract = async ({ functionName, args }: { functionName: string; args: readonly unknown[] }) => {
    calls.push(functionName);
    if (functionName === "nextCircleId") return nextCircleId;
    if (functionName === "isMember") {
      const [id, who] = args as [bigint, Address];
      const list = members[id.toString()] ?? [];
      return list.some((m) => m.toLowerCase() === who.toLowerCase());
    }
    if (functionName === "getCircle") {
      const [id] = args as [bigint];
      const exists = members[id.toString()] !== undefined;
      return {
        token: CONTRACT,
        contribution: exists ? 100_000_000n : 0n,
        maxMembers: 3,
        roundSeconds: 120n,
        mode: 0,
        round: 0,
        roundDeadline: 0n,
        pot: 0n,
        started: false,
        finished: false,
      };
    }
    // The rest of what a full CircleView needs. All plain state reads, which is
    // the point — resolving a view must not reach for logs either.
    if (functionName === "getMembers") return members[(args[0] as bigint).toString()] ?? [];
    if (functionName === "getPayoutOrder") return [0, 1, 2];
    if (functionName === "outstanding") return [];
    if (functionName === "depositOf") return 0n;
    if (functionName === "defaulted" || functionName === "depositWithdrawn") return false;
    if (functionName === "hasPaid") return false;
    throw new Error(`unexpected read: ${functionName}`);
  };

  const refuse = (method: string) => () => {
    calls.push(method);
    throw new Error(RANGE_ERROR);
  };

  const client = {
    readContract,
    getLogs: refuse("eth_getLogs"),
    getContractEvents: refuse("eth_getLogs"),
    createEventFilter: refuse("eth_newFilter"),
    getFilterLogs: refuse("eth_getFilterLogs"),
    getBlockNumber: async () => {
      calls.push("eth_blockNumber");
      return 70_639_148n;
    },
    getBlock: async () => {
      calls.push("eth_getBlockByNumber");
      return { timestamp: 1_760_000_000n };
    },
  } as unknown as PublicClient;

  return { client, calls };
}

test("circleIdsFor finds membership on an RPC where getLogs always fails", async () => {
  // deployBlock is deliberately ancient: a log scan would span ~115k blocks.
  const { client, calls } = probeClient({ "0": [ME], "1": [STRANGER], "2": [STRANGER, ME] }, 3n);
  const chit = new ChitCircleClient(CONTRACT, client, undefined, 70_523_429n);

  assert.deepEqual(await chit.circleIdsFor(ME), [0n, 2n]);
  assert.deepEqual(await chit.circleIdsFor(STRANGER), [1n, 2n]);
  assert.ok(!calls.includes("eth_getLogs"), `discovery asked for logs: ${calls.join(", ")}`);
});

test("discovery asks only for contract state, never for logs or block ranges", async () => {
  const { client, calls } = probeClient({ "0": [ME] }, 1n);
  const chit = new ChitCircleClient(CONTRACT, client, undefined, 70_523_429n);

  await chit.myCircles(ME);

  const forbidden = ["eth_getLogs", "eth_newFilter", "eth_getFilterLogs"];
  const used = calls.filter((c) => forbidden.includes(c));
  assert.deepEqual(used, [], `discovery must not use ${forbidden.join("/")}`);
});

test("a remembered id is verified against the contract, not trusted", async () => {
  const { client } = probeClient({ "0": [STRANGER] }, 1n);
  const chit = new ChitCircleClient(CONTRACT, client, undefined, 0n);

  // id 0 exists but I am not in it, so a remembered entry still surfaces it —
  // that is the create-then-join bridge, and it is why it must exist on chain.
  assert.deepEqual(await chit.circleIdsFor(ME, { knownIds: [0n] }), [0n]);

  // ids at or past nextCircleId are rejected without even a read.
  assert.deepEqual(await chit.circleIdsFor(ME, { knownIds: [1n, 99n] }), []);
});

test("maxCircles bounds the number of probes, newest first", async () => {
  const members: Record<string, Address[]> = {};
  for (let i = 0; i < 50; i++) members[String(i)] = i >= 45 ? [ME] : [STRANGER];
  const { client, calls } = probeClient(members, 50n);
  const chit = new ChitCircleClient(CONTRACT, client, undefined, 0n);

  assert.deepEqual(await chit.circleIdsFor(ME, { maxCircles: 10 }), [45n, 46n, 47n, 48n, 49n]);
  assert.equal(calls.filter((c) => c === "isMember").length, 10, "probed exactly the window");
});
