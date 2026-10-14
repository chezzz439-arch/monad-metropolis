import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

/**
 * Minimal localStorage, installed before the module under test is loaded.
 * `circleNames` picks web vs native by looking for `document`, so both have to
 * exist for the web path to run here.
 */
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).document = {};
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

const { circleName, loadCircleNames, rememberCircleName, rememberedCircleIds } = await import(
  "./circleNames.ts"
);

const ALICE = "0xAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaa";
const BOB = "0xBBbbBBbbBBbbBBbbBBbbBBbbBBbbBBbbBBbbBBbb";

beforeEach(async () => {
  store.clear();
  // The module caches names and ownership at module scope, so clearing the
  // store is not enough — resync it to the now-empty storage.
  await loadCircleNames();
});

test("a creator keeps their own circle before they have joined it", async () => {
  // The gap this exists for: the contract records no organizer, so between
  // creating and joining nothing on chain ties the circle to Alice.
  await rememberCircleName(7n, "Sunday Table", ALICE);
  await loadCircleNames();

  assert.deepEqual(rememberedCircleIds(ALICE), [7n]);
});

test("a second account on the same device does not inherit it", async () => {
  // The bug. knownIds is the one discovery input not checked against
  // membership, so anything here lands under "Your circles" unconditionally.
  // Per-device, a fresh account on the live site listed a stranger's circles.
  await rememberCircleName(7n, "Sunday Table", ALICE);
  await loadCircleNames();

  assert.deepEqual(rememberedCircleIds(BOB), [], "Bob never created this");
});

test("signed out, nothing is claimed", async () => {
  await rememberCircleName(7n, "Sunday Table", ALICE);
  await loadCircleNames();

  assert.deepEqual(rememberedCircleIds(null), []);
  assert.deepEqual(rememberedCircleIds(undefined), []);
});

test("the name is shared even though ownership is not", async () => {
  // Two people on one device who are both really in a circle should both see
  // what the group calls it. Only the unconditional home-screen claim is private.
  await rememberCircleName(7n, "Sunday Table", ALICE);
  const names = await loadCircleNames();

  assert.equal(circleName(7n, names), "Sunday Table");
});

test("ownership survives a reload", async () => {
  await rememberCircleName(7n, "Sunday Table", ALICE);
  await loadCircleNames();
  assert.deepEqual(rememberedCircleIds(ALICE), [7n]);
});

test("an address is matched whatever its casing", async () => {
  await rememberCircleName(7n, "Sunday Table", ALICE.toLowerCase());
  await loadCircleNames();

  assert.deepEqual(rememberedCircleIds(ALICE.toUpperCase()), [7n]);
});

test("creating twice does not duplicate the id", async () => {
  await rememberCircleName(7n, "Sunday Table", ALICE);
  await rememberCircleName(7n, "Sunday Table renamed", ALICE);
  await loadCircleNames();

  assert.deepEqual(rememberedCircleIds(ALICE), [7n]);
});

test("an unnamed circle is still remembered", async () => {
  // The name is optional; the ownership record is what keeps it on screen.
  await rememberCircleName(9n, "", ALICE);
  const names = await loadCircleNames();

  assert.deepEqual(rememberedCircleIds(ALICE), [9n]);
  assert.equal(circleName(9n, names), "Circle #10", "falls back to the display number");
});
