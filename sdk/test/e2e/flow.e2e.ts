import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createSecp256k1SigningSession, getEvmAddress } from "@category-labs/mera";
import { createPublicClient, hexToBytes, http, type PublicClient } from "viem";
import { ChitCircleClient } from "../../src/client.ts";
import { buildInviteLink, checkInviteTarget, parseInviteLink } from "../../src/invite.ts";
import { meraSigner, type MeraAccount } from "../../src/mera.ts";
import { Mode } from "../../src/types.ts";
import { ACCOUNTS, anvilChain, CHAIN_ID, RPC_URL, startHarness, warp, type Harness } from "./harness.ts";

/**
 * The whole chain-facing surface of the SDK, against a real chain.
 *
 * `npm test` covers pure logic. This covers what it cannot: struct decoding,
 * the allowance dance, state-based discovery, chain-time deadlines and the
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

  it("creates a circle and reports its id from the receipt", async () => {
    const tx = await h.client(0).createCircle({
      token: h.token,
      contribution: CONTRIBUTION,
      maxMembers: MEMBERS,
      roundSeconds: ROUND_SECONDS,
      mode: Mode.Fixed,
    });
    assert.match(tx.hash, /^0x[0-9a-f]{64}$/);

    // Read out of the CircleCreated log, so it is the id this transaction got
    // rather than whatever nextCircleId() happened to say beforehand.
    assert.equal(tx.circleId, 0n);

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

    // Creating is not joining: the contract keeps no organizer, so until the
    // organizer joins, nothing on chain ties this circle to them. This used to
    // come back as [0n] off a CircleCreated scan — the assertion that flaked,
    // because it raced the log index.
    assert.deepEqual(await h.client(0).circleIdsFor(h.addr(0)), []);
    assert.deepEqual(await h.client(0).circleIdsFor(h.addr(0), { knownIds: [0n] }), [0n]);
    assert.deepEqual(await h.client(0).circleIdsFor(h.addr(3)), []);
  });

  it("discovery never calls eth_getLogs, however old the deploy block", async () => {
    // The live failure this guards: Monad's public RPC caps eth_getLogs at a
    // 100-block range, so a scan from the deploy block could not run at all.
    // A transport spy is the only honest check — anvil would happily serve the
    // wide range that the real network refuses.
    const seen: string[] = [];
    const spy = createPublicClient({
      chain: anvilChain,
      pollingInterval: 20,
      transport: http(RPC_URL, {
        onFetchRequest: async (request) => {
          const body = await request.clone().json();
          for (const call of [body].flat()) if (call?.method) seen.push(call.method);
        },
      }),
    }) as PublicClient;

    // Pretend the contract is 115k blocks old, as it is on testnet.
    const stale = new ChitCircleClient(h.chitCircle, spy, undefined, 1n);
    await stale.myCircles(h.addr(0), { knownIds: [0n] });

    const forbidden = seen.filter((m) => m === "eth_getLogs" || m === "eth_newFilter" || m === "eth_getFilterLogs");
    assert.deepEqual(forbidden, [], `discovery asked for logs: ${seen.join(", ")}`);
    assert.ok(seen.includes("eth_call"), "discovery should be reading contract state");
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

  it("finds a joined circle with no help from local state", async () => {
    // The demo's "clear storage, sign in, everything comes back" step. No
    // knownIds, no deployBlock that matters — membership alone is enough.
    const fresh = new ChitCircleClient(h.chitCircle, h.publicClient, undefined, 999_999n);
    assert.deepEqual(await fresh.circleIdsFor(h.addr(0)), [0n]);
  });

  it("honours maxCircles, and says so by finding nothing", async () => {
    // One circle exists at id 0. A window of the newest 0 ids must skip it,
    // which proves the cap is real rather than decorative.
    assert.deepEqual(await h.client(0).circleIdsFor(h.addr(0), { maxCircles: 0 }), []);
    assert.deepEqual(await h.client(0).circleIdsFor(h.addr(0), { maxCircles: 1 }), [0n]);
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

  it("uses a Mera signing session for a scoped prompt-free contribution", async () => {
    const circleId = await h.client(0).nextCircleId();
    await h.client(0).createCircle({
      token: h.token,
      contribution: CONTRIBUTION,
      maxMembers: 2,
      roundSeconds: ROUND_SECONDS,
    });
    await h.client(0).join(circleId);
    await h.client(1).join(circleId);

    const session = createSecp256k1SigningSession({ privateKey: hexToBytes(ACCOUNTS[0]) });
    const meraAccount: MeraAccount = {
      address: getEvmAddress(session.publicKey),
      credentialId: "local-anvil-fixture",
      rpId: "accounts.example",
      limits: {
        contract: h.chitCircle,
        maxAmountPerTx: CONTRIBUTION,
        expiresAt: new Date(Date.now() + 60_000),
      },
      session,
    };
    const signerClient = new ChitCircleClient(
      h.chitCircle,
      h.publicClient,
      meraSigner(meraAccount, RPC_URL, anvilChain),
      h.deployBlock,
    );

    const result = await signerClient.contribute(circleId);
    assert.match(result.hash, /^0x[0-9a-f]{64}$/);
    assert.equal(await h.client(0).getMemberStatus(circleId, h.addr(0)).then((status) => status.paidThisRound), true);
    session.end();
  });
});
