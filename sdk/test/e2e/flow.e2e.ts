import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ChitCircleClient } from "../../src/client.ts";
import { buildInviteLink, checkInviteTarget, parseInviteLink } from "../../src/invite.ts";
import { Mode } from "../../src/types.ts";
import { CHAIN_ID, startHarness, warp, type Harness } from "./harness.ts";

/**
 * The whole chain-facing surface of the SDK, against a real chain.
 *
 * `npm test` covers pure logic. This covers what it cannot: struct decoding,
 * the allowance dance, event-log discovery, chain-time deadlines and the
 * settle path — i.e. everything that was still unverified before the testnet
 * deploy.
 *
 * Needs Foundry on the machine. `npm run test:e2e`.
 */
describe("ChitCircle end to end on anvil", () => {
  let h: Harness;

  const CONTRIBUTION = 100_000_000n; // $100 at 6 decimals
  const ROUND_SECONDS = 120n;
  const MEMBERS = 3;

  before(async () => {
    h = await startHarness();
  });

  after(() => h?.stop());

  it("deploys and reports an empty world", async () => {
    assert.equal(await h.client(0).nextCircleId(), 0n);
    assert.equal(await h.client(0).circleExists(0n), false);
    assert.deepEqual(await h.client(0).circleIdsFor(h.addr(0)), []);
  });

  it("creates a circle and finds it by event scan", async () => {
    const tx = await h.client(0).createCircle({
      token: h.token,
      contribution: CONTRIBUTION,
      maxMembers: MEMBERS,
      roundSeconds: ROUND_SECONDS,
      mode: Mode.Fixed,
    });
    assert.match(tx.hash, /^0x[0-9a-f]{64}$/);

    // The demo's headline number. anvil mines instantly, so anything near a
    // second here means we are timing our own receipt polling rather than the
    // chain — see RECEIPT_POLL_MS in src/config.ts.
    assert.ok(
      tx.settledInSeconds < 1,
      `settledInSeconds was ${tx.settledInSeconds}s on an instant chain; receipt polling is too slow`,
    );

    assert.equal(await h.client(0).nextCircleId(), 1n);
    assert.equal(await h.client(0).circleExists(0n), true);
    assert.equal(await h.client(0).circleExists(1n), false);

    // Creating a circle puts it on the organizer's home screen before they
    // join, because CircleCreated indexes the organizer.
    assert.deepEqual(await h.client(0).circleIdsFor(h.addr(0)), [0n]);
    assert.deepEqual(await h.client(0).circleIdsFor(h.addr(3)), []);
  });

  it("decodes a fresh circle correctly", async () => {
    const view = await h.client(0).getCircleView(0n, h.addr(0));

    assert.equal(view.circleId, 0n);
    assert.equal(view.token.toLowerCase(), h.token.toLowerCase());
    assert.equal(view.contribution, CONTRIBUTION);
    assert.equal(view.maxMembers, MEMBERS);
    assert.equal(view.roundSeconds, ROUND_SECONDS);
    assert.equal(view.mode, Mode.Fixed);
    assert.equal(view.round, 0);
    assert.equal(view.started, false);
    assert.equal(view.finished, false);
    assert.equal(view.pot, 0n);
    assert.equal(view.expectedPot, CONTRIBUTION * BigInt(MEMBERS));
    assert.deepEqual(view.members, []);
    assert.deepEqual(view.payoutOrder, [0, 1, 2]);

    // Nobody has joined, so there is no recipient. This is the case that used
    // to index past the end of `members`.
    assert.equal(view.recipient, null);
    assert.equal(view.settleable, false);
    assert.equal(view.secondsUntilSettle, 0);
    assert.equal(view.me?.isMember, false);
    assert.equal(view.me?.slot, -1);
    assert.equal(view.me?.payoutRound, -1);
  });

  it("approves automatically on join, and the third join starts the circle", async () => {
    for (let i = 0; i < MEMBERS; i++) {
      // No explicit approve anywhere in this test — ensureAllowance handles it.
      await h.client(i).join(0n);
    }

    const view = await h.client(0).getCircleView(0n, h.addr(0));
    assert.equal(view.started, true);
    assert.deepEqual(
      view.members.map((m) => m.toLowerCase()),
      [h.addr(0), h.addr(1), h.addr(2)].map((a) => a.toLowerCase()),
    );
    assert.equal(view.recipient?.toLowerCase(), h.addr(0).toLowerCase());
    assert.ok(view.roundDeadline > 0n);
    assert.ok(view.secondsUntilSettle > 0, "countdown should be running");
    assert.equal(view.settleable, false);

    assert.equal(view.me?.isMember, true);
    assert.equal(view.me?.deposit, CONTRIBUTION);
    assert.equal(view.me?.slot, 0);
    assert.equal(view.me?.payoutRound, 0);
    assert.equal(view.me?.paidThisRound, false);

    assert.equal(view.outstanding.length, MEMBERS, "everyone owes round 0");
  });

  it("puts the circle on every member's home screen", async () => {
    for (let i = 0; i < MEMBERS; i++) {
      const mine = await h.client(i).myCircles(h.addr(i));
      assert.equal(mine.length, 1, `account ${i} should see one circle`);
      assert.equal(mine[0]?.circleId, 0n);
      assert.equal(mine[0]?.me?.slot, i);
    }
    assert.deepEqual(await h.client(3).myCircles(h.addr(3)), []);
  });

  it("returns a roster with per-member status", async () => {
    const roster = await h.client(0).getRoster(0n);
    assert.equal(roster.length, MEMBERS);
    roster.forEach((m, i) => {
      assert.equal(m.address.toLowerCase(), h.addr(i).toLowerCase());
      assert.equal(m.isMember, true);
      assert.equal(m.defaulted, false);
      assert.equal(m.slot, i);
      assert.equal(m.payoutRound, i);
    });
  });

  it("scans in chunks smaller than the chain", async () => {
    // Force many eth_getLogs calls. If chunking were broken this either misses
    // the circle or asks for a range the node rejects.
    const ids = await h.client(0).circleIdsFor(h.addr(0), { maxBlockRange: 1n });
    assert.deepEqual(ids, [0n]);
  });

  it("honours the scan window, which is what deployBlock buys", async () => {
    const head = await h.publicClient.getBlockNumber();
    const ids = await h.client(0).circleIdsFor(h.addr(0), { fromBlock: head });
    assert.deepEqual(ids, [], "a window starting after the create block finds nothing");
  });

  it("pays everyone's contribution into the pot", async () => {
    for (let i = 0; i < MEMBERS; i++) await h.client(i).contribute(0n);

    const view = await h.client(0).getCircleView(0n, h.addr(0));
    assert.equal(view.pot, view.expectedPot);
    assert.deepEqual(view.outstanding, []);
    assert.equal(view.me?.paidThisRound, true);
  });

  it("settles to the right recipient once the deadline passes", async () => {
    const before = await h.client(0).balanceOf(h.token, h.addr(0));

    let view = await h.client(0).getCircleView(0n);
    assert.equal(view.settleable, false, "not settleable before the deadline");

    await warp(Number(ROUND_SECONDS) + 1);

    view = await h.client(0).getCircleView(0n);
    assert.equal(view.settleable, true, "settleable once chain time passes the deadline");
    assert.equal(view.secondsUntilSettle, 0);

    // Anyone may settle — account 2 is neither the organizer nor the recipient.
    await h.client(2).settleRound(0n);

    const after = await h.client(0).balanceOf(h.token, h.addr(0));
    assert.equal(after - before, CONTRIBUTION * BigInt(MEMBERS), "slot 0 takes the whole pot");

    view = await h.client(0).getCircleView(0n, h.addr(1));
    assert.equal(view.round, 1);
    assert.equal(view.pot, 0n);
    assert.equal(view.recipient?.toLowerCase(), h.addr(1).toLowerCase());
    assert.equal(view.finished, false);
    assert.equal(view.outstanding.length, MEMBERS, "round 1 reopens everyone's debt");
  });

  it("seizes the deposit of a member who misses a round", async () => {
    // Round 1: accounts 0 and 1 pay, account 2 does not.
    await h.client(0).contribute(0n);
    await h.client(1).contribute(0n);

    await warp(Number(ROUND_SECONDS) + 1);
    await h.client(0).settleRound(0n);

    const defaulter = await h.client(2).getMemberStatus(0n, h.addr(2));
    assert.equal(defaulter.defaulted, true, "missing a round marks a default");
    assert.equal(defaulter.deposit, 0n, "the deposit was seized to cover the shortfall");

    const roster = await h.client(0).getRoster(0n);
    assert.deepEqual(
      roster.map((m) => m.defaulted),
      [false, false, true],
      "the roster is what drives the Defaulted badges",
    );
  });

  it("sends member to member without touching the circle", async () => {
    const potBefore = (await h.client(0).getCircle(0n)).pot;
    const before = await h.client(0).balanceOf(h.token, h.addr(3));

    const tx = await h.client(0).sendToMember(h.token, h.addr(3), 5_000_000n);
    assert.match(tx.hash, /^0x[0-9a-f]{64}$/);

    const after = await h.client(0).balanceOf(h.token, h.addr(3));
    assert.equal(after - before, 5_000_000n);
    assert.equal((await h.client(0).getCircle(0n)).pot, potBefore, "the pot is untouched");
  });

  it("reads without a signer and refuses writes", async () => {
    const readOnly = new ChitCircleClient(h.chitCircle, h.publicClient, undefined, h.deployBlock);

    // Reads work, which is what lets screens render before passkey sign-in.
    assert.equal(await readOnly.circleExists(0n), true);
    assert.equal((await readOnly.getCircleView(0n)).started, true);
    await assert.rejects(() => readOnly.contribute(0n), /No signer/);
  });

  it("resolves an invite link against the live deployment", async () => {
    const link = buildInviteLink(0n, { chainId: CHAIN_ID, contract: h.chitCircle });
    const target = parseInviteLink(link);
    assert.ok(target, "the link we just built must parse");
    assert.equal(target.circleId, 0n);
    assert.equal(checkInviteTarget(target, { chainId: CHAIN_ID, contract: h.chitCircle }).ok, true);
    assert.equal(await h.client(0).circleExists(target.circleId), true);

    // A link from an earlier deploy of the same app: same circle id, different
    // contract. It must not silently open circle 0 of this deployment.
    const stale = parseInviteLink(
      buildInviteLink(0n, {
        chainId: CHAIN_ID,
        contract: "0x000000000000000000000000000000000000dEaD",
      }),
    );
    assert.ok(stale);
    assert.equal(checkInviteTarget(stale, { chainId: CHAIN_ID, contract: h.chitCircle }).ok, false);
  });

  it("still reverts bid mode, as documented", async () => {
    await assert.rejects(() => h.client(0).commitBid(0n, `0x${"11".repeat(32)}`));
  });
});
