import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MOCK_CONTRIBUTION,
  MOCK_ME,
  MOCK_PEOPLE,
  MOCK_ROUND_SECONDS,
  MOCK_TOKEN,
  MockRevert,
  mockClient,
} from "../src/mock.ts";

/**
 * These pin the mock to the two things the screens depend on: that each
 * scenario really is the situation HOOKS.md advertises, and that the state
 * machine matches `ChitCircle.sol` (the Foundry suite asserts the same facts
 * against the real contract). If a screen behaves one way here and another on
 * testnet, one of these tests should have caught it.
 */

const fast = { latencyMs: 0 } as const;
const [you, priya, arun] = MOCK_PEOPLE.map((p) => p.address) as [
  `0x${string}`,
  `0x${string}`,
  `0x${string}`,
];

test("filling: 3 of 5 joined and the circle has not started", async () => {
  const c = mockClient({ scenario: "filling", ...fast });
  const view = await c.getCircleView(0n, MOCK_ME);

  assert.equal(view.members.length, 3);
  assert.equal(view.started, false);
  assert.equal(view.recipient, null, "no recipient before the circle fills");
  assert.equal(view.roundDeadline, 0n);
  assert.equal(view.settleable, false);
  assert.equal(view.me?.isMember, true);
  assert.equal(view.me?.deposit, MOCK_CONTRIBUTION, "joining locks one contribution");
  assert.equal(view.expectedPot, MOCK_CONTRIBUTION * 5n);
});

test("midRound: you still owe, the countdown is live, settling is refused", async () => {
  const c = mockClient({ scenario: "midRound", ...fast });
  const view = await c.getCircleView(0n, MOCK_ME);

  assert.equal(view.started, true);
  assert.equal(view.round, 0);
  assert.equal(view.me?.paidThisRound, false);
  assert.equal(view.pot, MOCK_CONTRIBUTION * 2n, "two members have paid");
  assert.ok(view.outstanding.some((m) => m === you), "you are outstanding");
  assert.equal(view.settleable, false);
  assert.ok(view.secondsUntilSettle > 0 && view.secondsUntilSettle <= Number(MOCK_ROUND_SECONDS));

  await assert.rejects(c.settleRound(0n), (e: MockRevert) => e.reason === "RoundStillOpen");
});

test("midRound: paying moves the pot and clears you from outstanding", async () => {
  const c = mockClient({ scenario: "midRound", ...fast });

  const res = await c.contribute(0n);
  assert.match(res.hash, /^0x[0-9a-f]{64}$/, "screens show this hash");
  assert.ok(res.settledInSeconds >= 0, "Sohan's timer reads this");

  const view = await c.getCircleView(0n, MOCK_ME);
  assert.equal(view.me?.paidThisRound, true);
  assert.equal(view.pot, MOCK_CONTRIBUTION * 3n);
  assert.ok(!view.outstanding.includes(you));

  await assert.rejects(c.contribute(0n), (e: MockRevert) => e.reason === "AlreadyPaid");
});

test("settleable: anyone may settle, and the recipient receives the whole pot", async () => {
  const c = mockClient({ scenario: "settleable", ...fast });
  const before = await c.getCircleView(0n, MOCK_ME);

  assert.equal(before.settleable, true);
  assert.equal(before.secondsUntilSettle, 0);
  assert.equal(before.pot, MOCK_CONTRIBUTION * 5n);

  const recipient = before.recipient!;
  const had = await c.balanceOf(MOCK_TOKEN, recipient);
  await c.settleRound(0n);

  assert.equal(
    await c.balanceOf(MOCK_TOKEN, recipient),
    had + MOCK_CONTRIBUTION * 5n,
    "the whole $500 lands in one payout",
  );

  const after = await c.getCircleView(0n, MOCK_ME);
  assert.equal(after.round, 1);
  assert.equal(after.pot, 0n);
  assert.equal(after.settleable, false, "the next round opens on a fresh deadline");
});

test("defaulted: the missed payment is covered by the deposit, pot stays whole", async () => {
  const c = mockClient({ scenario: "defaulted", ...fast });
  const view = await c.getCircleView(0n, priya);

  assert.equal(view.round, 1, "round 1 was settled");
  assert.equal(view.me?.defaulted, true, "Priya shows the Defaulted badge");
  assert.equal(view.me?.deposit, 0n, "her deposit was seized to fill the pot");

  // The recipient of round 1 was paid in full even though Priya never paid.
  const roster = await c.getRoster(0n);
  const paidIn = roster.filter((m) => !m.defaulted).length;
  assert.equal(paidIn, 4);

  const recipientOfRound0 = (await c.getMembers(0n))[(await c.getPayoutOrder(0n))[0]!]!;
  assert.equal(
    await c.balanceOf(MOCK_TOKEN, recipientOfRound0),
    // started with $1,000, paid $100 deposit + $100 round 1, received $500
    1_000_000000n - MOCK_CONTRIBUTION * 2n + MOCK_CONTRIBUTION * 5n,
    "the pot was whole despite the default",
  );

  await assert.rejects(
    mockClient({ scenario: "defaulted", me: priya, ...fast }).contribute(0n),
    (e: MockRevert) => e.reason === "HasDefaulted",
    "a defaulted member cannot pay back in",
  );
});

test("finished: everyone paid in $500 and received $500, deposits come back", async () => {
  const c = mockClient({ scenario: "finished", ...fast });
  const view = await c.getCircleView(0n, MOCK_ME);

  assert.equal(view.finished, true);
  assert.equal(view.round, 5);
  assert.equal(view.me?.deposit, MOCK_CONTRIBUTION, "still held until withdrawn");

  // Paid 5 x $100 plus a $100 deposit, received one $500 pot: down the deposit.
  assert.equal(await c.balanceOf(MOCK_TOKEN, you), 1_000_000000n - MOCK_CONTRIBUTION);

  await c.withdrawDeposit(0n);
  assert.equal(await c.balanceOf(MOCK_TOKEN, you), 1_000_000000n, "whole again at the end");
  await assert.rejects(c.withdrawDeposit(0n), (e: MockRevert) => e.reason === "NothingToWithdraw");
});

test("empty: home screen has nothing, and create then join works end to end", async () => {
  const c = mockClient({ scenario: "empty", ...fast });
  assert.deepEqual(await c.myCircles(MOCK_ME), []);

  const created = await c.createCircle({
    token: MOCK_TOKEN,
    contribution: MOCK_CONTRIBUTION,
    maxMembers: 2,
    roundSeconds: MOCK_ROUND_SECONDS,
  });
  assert.equal(created.circleId, 0n, "the id comes back from the create itself");

  // Creating is not joining. The contract stores no organizer, so until the
  // organizer joins there is nothing on chain tying the circle to them and
  // state-based discovery correctly finds nothing.
  assert.deepEqual(await c.myCircles(MOCK_ME), [], "create alone does not make you a member");

  // Which is why the app passes the ids it remembers locally.
  const remembered = await c.myCircles(MOCK_ME, { knownIds: [created.circleId] });
  assert.equal(remembered.length, 1, "a remembered id bridges create and join");
  assert.equal(remembered[0]?.started, false);

  await c.join(created.circleId);
  const mine = await c.myCircles(MOCK_ME);
  assert.equal(mine.length, 1, "once joined it needs no local memory at all");

  await assert.rejects(c.join(created.circleId), (e: MockRevert) => e.reason === "AlreadyMember");
});

test("a made-up remembered id cannot conjure a circle onto the home screen", async () => {
  const c = mockClient({ scenario: "empty", ...fast });
  assert.deepEqual(await c.myCircles(MOCK_ME, { knownIds: [41n, 42n] }), []);
});

test("a circle starts by itself when the last member joins", async () => {
  const c = mockClient({ scenario: "empty", ...fast });
  await c.createCircle({
    token: MOCK_TOKEN,
    contribution: MOCK_CONTRIBUTION,
    maxMembers: 2,
    roundSeconds: MOCK_ROUND_SECONDS,
  });

  await c.join(0n);
  assert.equal((await c.getCircle(0n)).started, false);

  await c.withSigner({ address: arun } as never).join(0n);
  const view = await c.getCircleView(0n, MOCK_ME);
  assert.equal(view.started, true);
  assert.ok(view.roundDeadline > 0n, "the deadline is set on the last join");
  assert.equal(view.recipient, you, "default payout order is join order");
});

test("signed out: reads work, writes ask for a passkey", async () => {
  const c = mockClient({ scenario: "midRound", signedOut: true, ...fast });

  const view = await c.getCircleView(0n, MOCK_ME);
  assert.equal(view.members.length, 5, "screens still render before sign-in");

  await assert.rejects(c.contribute(0n), /sign in with a passkey/);
});

test("sendToMember moves AUSD one hop, the Agora send/receive", async () => {
  const c = mockClient({ scenario: "midRound", ...fast });
  const before = await c.balanceOf(MOCK_TOKEN, arun);

  const res = await c.sendToMember(MOCK_TOKEN, arun, 25_000000n);
  assert.ok(res.settledInSeconds >= 0);
  assert.equal(await c.balanceOf(MOCK_TOKEN, arun), before + 25_000000n);

  await assert.rejects(
    c.sendToMember(MOCK_TOKEN, arun, 10_000_000000n),
    (e: MockRevert) => e.reason === "TransferFailed",
    "sending more than the balance fails rather than going negative",
  );
});

test("bidding mode is honestly unavailable, as on-chain", async () => {
  const c = mockClient({ ...fast });
  await assert.rejects(c.commitBid(), (e: MockRevert) => e.reason === "NotImplemented");
});
