import assert from "node:assert/strict";
import { test } from "node:test";
import type { Transport } from "viem";
import { RPC_CALLS_PER_SECOND, paced } from "../src/config.ts";

/**
 * A transport that records when each call reached it.
 *
 * Deliberately instant: the pacer's job is to space calls out, so anything it
 * fails to delay shows up as calls landing in the same millisecond.
 */
function recording() {
  const at: number[] = [];
  const transport = ((() => ({
    config: {},
    value: {},
    request: async () => {
      at.push(Date.now());
      return "0x";
    },
  })) as unknown) as Transport;
  return { transport, at };
}

/** Highest number of calls that landed inside any one-second window. */
function busiestSecond(at: readonly number[]): number {
  let worst = 0;
  for (const start of at) {
    const inWindow = at.filter((t) => t >= start && t - start < 1000).length;
    if (inWindow > worst) worst = inWindow;
  }
  return worst;
}

test("a burst is held under the ceiling", async () => {
  // The shape that broke the live site: a screen mounts and asks for
  // everything at once. Thirty calls would have gone out together.
  const { transport, at } = recording();
  const limit = 5;
  const request = paced(transport, limit, "burst-test")({})!.request;

  await Promise.all(Array.from({ length: 30 }, () => request({ method: "eth_call" })));

  assert.equal(at.length, 30, "every call still happened");
  assert.ok(
    busiestSecond(at) <= limit,
    `never more than ${limit} in a second, saw ${busiestSecond(at)}`,
  );
});

test("calls under the ceiling are not delayed", async () => {
  // Pacing must not cost latency when there is nothing to pace, or every
  // screen in the app pays for a problem only the busy ones have.
  const { transport, at } = recording();
  const request = paced(transport, 10, "idle-test")({})!.request;

  const started = Date.now();
  await Promise.all(Array.from({ length: 5 }, () => request({ method: "eth_call" })));

  assert.equal(at.length, 5);
  assert.ok(Date.now() - started < 120, "no artificial wait below the ceiling");
});

test("a failing call does not wedge the queue behind it", async () => {
  // The pacer serialises through one promise chain. An unhandled rejection in
  // that chain would stall every later call — which on a flaky network means
  // one refused read freezing the app rather than one screen retrying.
  let n = 0;
  const transport = ((() => ({
    config: {},
    value: {},
    request: async () => {
      n += 1;
      if (n === 1) throw new Error("refused");
      return "0x";
    },
  })) as unknown) as Transport;

  const request = paced(transport, 5, "failure-test")({})!.request;
  const results = await Promise.allSettled([
    request({ method: "eth_call" }),
    request({ method: "eth_call" }),
    request({ method: "eth_call" }),
  ]);

  assert.equal(results[0]!.status, "rejected", "the failure still surfaces to its caller");
  assert.equal(results[1]!.status, "fulfilled", "and the queue keeps moving");
  assert.equal(results[2]!.status, "fulfilled");
});

test("the configured ceiling leaves room under Monad's real limit", () => {
  // The RPC refuses above 15 a second, as `{"code":-32011,"message":"requests
  // limited to 15/sec"}` inside an HTTP 200. The margin absorbs what the pacer
  // cannot see: viem's own internal retries, and a second browser profile on
  // the same IP — which is how this app gets demoed.
  assert.ok(RPC_CALLS_PER_SECOND < 15, "must sit under the documented ceiling");
  assert.ok(RPC_CALLS_PER_SECOND >= 8, "but not so low that a screen crawls");
});

test("two clients on the same endpoint share one budget", async () => {
  // The bug this guards. Reads go through the public client and writes through
  // the signer's wallet client, but the RPC counts them together against our
  // IP. Two independent pacers each believed they had the whole ceiling, and a
  // join on the live site still earned "requests limited to 15/sec".
  const reads = recording();
  const writes = recording();
  const limit = 6;

  const readReq = paced(reads.transport, limit, "shared-endpoint")({})!.request;
  const writeReq = paced(writes.transport, limit, "shared-endpoint")({})!.request;

  await Promise.all([
    ...Array.from({ length: 12 }, () => readReq({ method: "eth_call" })),
    ...Array.from({ length: 12 }, () => writeReq({ method: "eth_sendRawTransaction" })),
  ]);

  const together = [...reads.at, ...writes.at].sort((a, b) => a - b);
  assert.equal(together.length, 24, "every call still happened");
  assert.ok(
    busiestSecond(together) <= limit,
    `both clients together must stay under ${limit}, saw ${busiestSecond(together)}`,
  );
});

test("different endpoints do not throttle each other", () => {
  // The window is keyed by URL, so pointing the app at a dedicated RPC must
  // not inherit the public one's queue.
  const a = paced(recording().transport, 5, "endpoint-a");
  const b = paced(recording().transport, 5, "endpoint-b");
  assert.notEqual(a, b);
});
