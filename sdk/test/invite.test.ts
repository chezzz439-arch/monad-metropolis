import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDeepLink,
  buildInviteLink,
  checkInviteTarget,
  parseInviteLink,
} from "../src/invite.ts";
import { formatAmount, formatCountdown, formatUsd, parseAmount } from "../src/format.ts";

const CONTRACT = "0x1111111111111111111111111111111111111111" as const;

test("https link round-trips", () => {
  const link = buildInviteLink(7n, { chainId: 10143, contract: CONTRACT });
  assert.equal(link, `https://chitcircle.app/c/7?chain=10143&at=${CONTRACT}`);

  const target = parseInviteLink(link);
  assert.deepEqual(target, { circleId: 7n, chainId: 10143, contract: CONTRACT });
});

test("deep link round-trips", () => {
  const link = buildDeepLink(42n, { chainId: 10143 });
  const target = parseInviteLink(link);
  assert.equal(target?.circleId, 42n);
  assert.equal(target?.chainId, 10143);
});

test("bare links parse without query params", () => {
  assert.equal(parseInviteLink("https://chitcircle.app/c/0")?.circleId, 0n);
  assert.equal(parseInviteLink("chitcircle://circle/3")?.circleId, 3n);
});

test("custom base url is honoured", () => {
  const link = buildInviteLink(1n, { baseUrl: "https://chit.example.com/" });
  assert.equal(link, "https://chit.example.com/c/1");
  assert.equal(parseInviteLink(link)?.circleId, 1n);
});

test("large circle ids keep precision", () => {
  const big = 123456789012345678901234567890n;
  assert.equal(parseInviteLink(buildInviteLink(big))?.circleId, big);
});

test("junk returns null rather than throwing", () => {
  for (const bad of [
    "",
    "not a url",
    "https://chitcircle.app/",
    "https://chitcircle.app/c/",
    "https://chitcircle.app/c/abc",
    "https://chitcircle.app/c/-1",
    "https://chitcircle.app/circle/7",
    "ftp://chitcircle.app/c/7",
    "chitcircle://notcircle/7",
  ]) {
    assert.equal(parseInviteLink(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test("malformed query params are ignored, not fatal", () => {
  const target = parseInviteLink("https://chitcircle.app/c/5?chain=abc&at=0xnope");
  assert.deepEqual(target, { circleId: 5n });
});

test("wrong chain and wrong contract are both rejected", () => {
  const target = { circleId: 1n, chainId: 1, contract: CONTRACT };
  const wrongChain = checkInviteTarget(target, { chainId: 10143, contract: CONTRACT });
  assert.equal(wrongChain.ok, false);

  const other = "0x2222222222222222222222222222222222222222" as const;
  const wrongContract = checkInviteTarget(target, { chainId: 1, contract: other });
  assert.equal(wrongContract.ok, false);

  assert.equal(checkInviteTarget(target, { chainId: 1, contract: CONTRACT }).ok, true);
  // A link carrying no context cannot be checked, so it passes.
  assert.equal(checkInviteTarget({ circleId: 1n }, { chainId: 1, contract: CONTRACT }).ok, true);
});

test("contract comparison is case-insensitive", () => {
  const upper = CONTRACT.toUpperCase().replace("0X", "0x") as `0x${string}`;
  assert.equal(checkInviteTarget({ circleId: 1n, contract: upper }, { chainId: 1, contract: CONTRACT }).ok, true);
});

test("amount formatting matches AUSD's 6 decimals", () => {
  assert.equal(formatUsd(100_000_000n), "$100.00");
  assert.equal(formatAmount(100_500_000n), "100.50");
  assert.equal(formatAmount(1n), "0.00");
  assert.equal(formatAmount(0n), "0.00");
  assert.equal(parseAmount("100.5"), 100_500_000n);
  assert.equal(parseAmount("100"), 100_000_000n);
  assert.equal(parseAmount(".5"), 500_000n);
  assert.throws(() => parseAmount("1.1234567"), /decimal places/);
  assert.throws(() => parseAmount("abc"));
  assert.throws(() => parseAmount(""));
});

test("round trip through parse and format is stable", () => {
  for (const input of ["0", "1", "100", "100.5", "0.01", "999999.99"]) {
    assert.equal(formatAmount(parseAmount(input)), formatAmount(parseAmount(formatAmount(parseAmount(input)))));
  }
});

test("countdown formatting", () => {
  assert.equal(formatCountdown(92), "1:32");
  assert.equal(formatCountdown(0), "0:00");
  assert.equal(formatCountdown(-5), "0:00");
  assert.equal(formatCountdown(59), "0:59");
  assert.equal(formatCountdown(3700), "1:01:40");
});
