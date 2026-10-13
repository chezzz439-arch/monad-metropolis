import assert from "node:assert/strict";
import { test } from "node:test";
import type { Address } from "viem";
import { primaryActionFor } from "../src/hooks.ts";
import type { CircleView, MemberStatus } from "../src/types.ts";

const ME = "0x00000000000000000000000000000000000000a1" as Address;
const OTHER = "0x00000000000000000000000000000000000000b2" as Address;

function member(over: Partial<MemberStatus> = {}): MemberStatus {
  return {
    address: ME,
    isMember: true,
    deposit: 100n,
    defaulted: false,
    depositWithdrawn: false,
    paidThisRound: false,
    slot: 0,
    payoutRound: 0,
    ...over,
  };
}

/** A two-person circle mid-flight. Override the one field a case is about. */
function circle(over: Partial<CircleView> = {}): CircleView {
  return {
    circleId: 1n,
    token: OTHER,
    contribution: 100n,
    maxMembers: 2,
    roundSeconds: 120n,
    mode: 0,
    round: 0,
    roundDeadline: 0n,
    pot: 0n,
    started: true,
    finished: false,
    members: [ME, OTHER],
    payoutOrder: [0, 1],
    recipient: ME,
    outstanding: [ME, OTHER],
    secondsUntilSettle: 60,
    settleable: false,
    expectedPot: 200n,
    me: member(),
    ...over,
  };
}

test("a member who has not paid is asked to pay", () => {
  assert.equal(primaryActionFor(circle()).kind, "pay");
});

test("a member who has paid waits on the others", () => {
  const action = primaryActionFor(circle({ me: member({ paidThisRound: true }), outstanding: [OTHER] }));
  assert.equal(action.kind, "waiting");
  assert.equal(action.label, "1 still to pay");
});

test("a past deadline lets a paid-up member settle", () => {
  const paid = circle({ settleable: true, me: member({ paidThisRound: true }), outstanding: [OTHER] });
  assert.equal(primaryActionFor(paid).kind, "settle");
});

// Found on the live site. A round timer ran out while a payment was in flight,
// and the screen replaced "Pay $100" with "Settle round" underneath the person
// who still owed — the one button that would seize their own deposit and mark
// them defaulted. The contract puts no deadline on `contribute`, so paying is
// still open to them and must stay the offer.
test("a member who still owes is asked to pay, deadline or not", () => {
  const late = circle({ settleable: true, secondsUntilSettle: 0 });
  const action = primaryActionFor(late);
  assert.equal(action.kind, "pay", "settling would cost them their deposit");
  assert.equal(action.label, "Pay");
});

test("a defaulter past the deadline can still settle the round", () => {
  // Nothing left to lose — their deposit is already seized — and someone has
  // to be able to move a stuck round along.
  const out = circle({ settleable: true, me: member({ defaulted: true, deposit: 0n }) });
  assert.equal(primaryActionFor(out).kind, "settle");
});

test("an open circle invites a stranger to join", () => {
  assert.equal(primaryActionFor(circle({ started: false, members: [OTHER], me: null })).kind, "join");
});

// The bug this file was written for. A visitor who follows an invite link to a
// circle that filled up without them used to be handed whatever the member
// branches produced: "2 still to pay", as if they owed it, or — once the
// deadline passed — a "Settle round" button on a circle they have no stake in.
// Both are offers we cannot honour, so the screen must get nothing to render.
test("a stranger is offered nothing on a circle that already started", () => {
  const visitor = circle({ me: null });
  assert.equal(primaryActionFor(visitor).kind, "none");
  assert.equal(primaryActionFor({ ...visitor, settleable: true }).kind, "none");
});

test("a non-member with a status object is still a stranger", () => {
  // `me` is non-null for any connected account, member or not, so isMember is
  // the only thing that may decide this.
  const action = primaryActionFor(circle({ me: member({ isMember: false, deposit: 0n, slot: -1, payoutRound: -1 }) }));
  assert.equal(action.kind, "none");
});

test("a finished circle returns a member's deposit", () => {
  const done = circle({ finished: true, me: member({ paidThisRound: true }) });
  assert.equal(primaryActionFor(done).kind, "withdraw");
});

test("a defaulter gets no deposit back", () => {
  const done = circle({ finished: true, me: member({ defaulted: true, deposit: 0n }) });
  assert.equal(primaryActionFor(done).kind, "none");
});

test("no circle means no action", () => {
  assert.equal(primaryActionFor(null).kind, "none");
});
