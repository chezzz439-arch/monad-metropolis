import assert from "node:assert/strict";
import { test } from "node:test";
import type { Address } from "viem";
import {
  BID_SALT_PREFIX,
  bidSalt,
  friendlyPasskeyError,
  meraSigner,
  sessionGuard,
  setSessionLimits,
  type MeraAccount,
  type MeraSessionLimits,
} from "../src/mera.ts";
import { monadTestnet } from "../src/config.ts";

const CIRCLE = "0x13ec22E7d0BF5b728549990aA852d03BCC9da73D" as Address;
const TOKEN = "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC" as Address;
const ME = "0x37B474295Af1989bD53d7A7B90746FD6E3290373" as Address;
const FRIEND = "0x8fbd38532aB74419aA12fc309b2A2c4002c9d2bB" as Address;

function limits(over: Partial<MeraSessionLimits> = {}): MeraSessionLimits {
  return {
    contract: CIRCLE,
    maxAmountPerTx: 100_000000n, // $100
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    ...over,
  };
}

/**
 * A MeraAccount without an authenticator. The session and viem account are
 * never reached: every test here asserts the guard rejects BEFORE signing, so
 * if one ever does reach them the thrown error is the test failing loudly.
 */
function fakeAccount(l: MeraSessionLimits | null): MeraAccount {
  const explode = (): never => {
    throw new Error("guard let a forbidden write through to signing");
  };
  return {
    address: ME,
    limits: l,
    session: {
      publicKey: new Uint8Array(65),
      signDigest: explode,
      end() {},
      [Symbol.dispose]() {},
    } as unknown as MeraAccount["session"],
    viemAccount: { address: ME, type: "local", signTransaction: explode } as unknown as MeraAccount["viemAccount"],
    credential: { credentialId: "dGVzdA" },
  };
}

// -- sessionGuard: the only thing enforcing limits -------------------------

test("no session means nothing is allowed", () => {
  const v = sessionGuard(null, CIRCLE, 1n);
  assert.equal(v.allowed, false);
  assert.match(v.reason!, /No active signing session/);
});

test("a write to the scoped contract within the cap is allowed", () => {
  assert.equal(sessionGuard(limits(), CIRCLE, 100_000000n).allowed, true);
});

test("one unit over the cap is refused", () => {
  const v = sessionGuard(limits(), CIRCLE, 100_000001n);
  assert.equal(v.allowed, false);
  assert.match(v.reason!, /per-transaction cap/);
});

test("a different contract is refused even within the cap", () => {
  const v = sessionGuard(limits(), TOKEN, 1n);
  assert.equal(v.allowed, false);
  assert.match(v.reason!, /not scoped to this contract/);
});

test("scope check is case-insensitive, so a lowercased address still passes", () => {
  // Addresses arrive from links, logs and user input in every casing. A guard
  // that refused a lowercased address would look like a random failure.
  assert.equal(sessionGuard(limits(), CIRCLE.toLowerCase() as Address, 1n).allowed, true);
});

test("an expired session is refused", () => {
  const v = sessionGuard(limits({ expiresAt: new Date(Date.now() - 1000) }), CIRCLE, 1n);
  assert.equal(v.allowed, false);
  assert.match(v.reason!, /expired/);
});

test("expiry is checked before the cap, so the message names the real problem", () => {
  const v = sessionGuard(
    limits({ expiresAt: new Date(Date.now() - 1000), maxAmountPerTx: 1n }),
    CIRCLE,
    999n,
  );
  assert.match(v.reason!, /expired/, "an expired session is the thing to tell the user");
});

// -- meraSigner: the guard must run before any signing --------------------

test("the signer refuses a write with no session, without signing", async () => {
  const signer = meraSigner(fakeAccount(null), monadTestnet);
  await assert.rejects(
    signer.write({ address: CIRCLE, abi: [], functionName: "contribute", args: [0n] }),
    /No active signing session/,
  );
});

test("the signer refuses a write to an out-of-scope contract", async () => {
  const signer = meraSigner(fakeAccount(limits()), monadTestnet);
  await assert.rejects(
    signer.write({ address: TOKEN, abi: [], functionName: "approve", args: [] }),
    /not scoped to this contract/,
  );
});

test("the signer refuses a send over the cap", async () => {
  const signer = meraSigner(fakeAccount(limits()), monadTestnet);
  await assert.rejects(
    signer.transferToken({ token: TOKEN, to: FRIEND, amount: 500_000000n }),
    /per-transaction cap/,
  );
});

test("the signer refuses a send once the session has expired", async () => {
  const signer = meraSigner(fakeAccount(limits({ expiresAt: new Date(Date.now() - 1) })), monadTestnet);
  await assert.rejects(
    signer.transferToken({ token: TOKEN, to: FRIEND, amount: 1n }),
    /expired/,
  );
});

test("the signer reports the account address the hooks will display", () => {
  assert.equal(meraSigner(fakeAccount(limits()), monadTestnet).address, ME);
});

// -- setSessionLimits ------------------------------------------------------

test("setSessionLimits turns a signed-in account into one that can write", () => {
  const account = fakeAccount(null);
  assert.equal(sessionGuard(account.limits, CIRCLE, 1n).allowed, false);
  setSessionLimits(account, limits());
  assert.equal(sessionGuard(account.limits, CIRCLE, 1n).allowed, true);
});

// -- bid secrets ----------------------------------------------------------

test("a bid salt is 32 bytes, as WebAuthn PRF requires", () => {
  assert.equal(bidSalt(0n, 0).length, 32, "Mera rejects a salt that is not 32 bytes");
});

test("the same circle and round always give the same salt", () => {
  // This is the cross-device test: commit a bid on one phone, reveal on
  // another. Any nondeterminism here strands the bid forever.
  assert.deepEqual(bidSalt(7n, 3), bidSalt(7n, 3));
});

test("different rounds and circles give unrelated salts", () => {
  assert.notDeepEqual(bidSalt(7n, 3), bidSalt(7n, 4));
  assert.notDeepEqual(bidSalt(7n, 3), bidSalt(8n, 3));
});

test("the salt prefix is namespaced, so a bid secret cannot collide with the account key", () => {
  assert.match(BID_SALT_PREFIX, /^chitcircle:/);
});

// -- user-facing error copy ------------------------------------------------

test("error copy never uses the words the team guide bans", () => {
  const banned = /\b(wallet|gas|seed phrase|private key|blockchain|token)\b/i;
  const codes = [
    "PRF_UNAVAILABLE",
    "PASSKEY_OPERATION_FAILED",
    "CRYPTO_UNAVAILABLE",
    "SESSION_ENDED",
    "INPUT_INVALID",
    "SOMETHING_NEW_WE_HAVE_NOT_SEEN",
  ];
  for (const code of codes) {
    const msg = friendlyPasskeyError(Object.assign(new Error("boom"), { name: "MeraError", code }));
    assert.doesNotMatch(msg, banned, `copy for ${code} leaks a forbidden word: ${msg}`);
    assert.ok(msg.length > 0);
  }
});

test("a non-Mera error still gets safe copy rather than leaking internals", () => {
  const msg = friendlyPasskeyError(new Error("ECONNREFUSED 127.0.0.1:8545"));
  assert.doesNotMatch(msg, /ECONNREFUSED|8545/);
});
