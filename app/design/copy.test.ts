import assert from "node:assert/strict";
import { test } from "node:test";
import { friendlyError, money } from "./copy.ts";

/**
 * Words the team guide keeps off every screen. Duplicated from the SDK's own
 * check on purpose: these sentences are written here, so they have to be
 * checked here too.
 */
const BANNED = /\b(wallet|gas|MON|testnet|chain|transaction|hash|address|seed|private key|blockchain|AUSD|token)\b/i;

test("running out of fee money is not reported as running out of money", () => {
  // The bug. An organizer who had just created and joined a circle had spent
  // their fee allowance, and viem reports that as "insufficient funds" — the
  // same words as a real shortfall. They were told their balance was short
  // while their $400 sat untouched.
  const outOfFees = new Error(
    "Insufficient funds for gas * price + value: address 0xabc have 4086128000000000 want 20962000000000000",
  );
  const message = friendlyError(outOfFees);

  assert.match(message, /topped up/i, "says what is actually happening");
  assert.doesNotMatch(message, /enough in your balance/i, "and not that their money ran out");
  assert.doesNotMatch(message, BANNED);
});

test("an actual shortfall still reads as one", () => {
  const broke = new Error("ERC20: transfer amount exceeds balance");
  assert.match(friendlyError(broke), /enough in your balance/i);
});

test("Monad's rate limit reads as a busy network", () => {
  // Arrives inside an HTTP 200, and its wording contains none of the usual
  // signals — no 429, no "rate limit". It fell through to the generic
  // sentence on a brand-new account's very first screen.
  const limited = new Error('RPC Request failed. Details: requests limited to 15/sec');
  const message = friendlyError(limited);

  assert.match(message, /busy/i);
  assert.doesNotMatch(message, /check your connection/i, "the connection is fine");
  assert.doesNotMatch(message, BANNED);
});

test("the error code alone is enough to recognise it", () => {
  assert.match(friendlyError(new Error("server error -32011")), /busy/i);
});

test("a genuine network failure still says so", () => {
  assert.match(friendlyError(new Error("fetch failed")), /could not reach/i);
});

test("a cancelled passkey prompt is not an error to apologise for", () => {
  assert.match(friendlyError(new Error("NotAllowedError")), /cancelled/i);
});

test("nothing unrecognised leaks internals", () => {
  for (const raw of [
    "execution reverted: 0xdeadbeef at 0x13ec22E7d0BF5b728549990aA852d03BCC9da73D",
    "could not coalesce error",
    "",
  ]) {
    assert.doesNotMatch(friendlyError(new Error(raw)), BANNED, `leaked for: ${raw}`);
  }
});

test("money reads as dollars, never as six-decimal units", () => {
  assert.equal(money(100_000_000n), "$100");
  assert.equal(money(0n), "$0");
  assert.equal(money(500_000_000n), "$500");
});
