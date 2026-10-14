import assert from "node:assert/strict";
import { test } from "node:test";
import { createSecp256k1SigningSession, getEvmAddress, isMeraError } from "@category-labs/mera";
import { hexToBytes, type Address } from "viem";
import {
  BID_SALT_PREFIX,
  accountFromPrfOutput,
  describeMeraError,
  endMeraSession,
  meraSigner,
  sessionGuard,
  signInWithPasskey,
  type MeraAccount,
  type MeraSessionLimits,
} from "../src/mera.ts";

const contract = "0x1111111111111111111111111111111111111111" as const;
const otherContract = "0x2222222222222222222222222222222222222222" as const;
const token = "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC" as const;
const friend = "0x8fbd38532aB74419aA12fc309b2A2c4002c9d2bB" as const;
const activeLimits: MeraSessionLimits = {
  contract,
  maxAmountPerTx: 100_000_000n,
  expiresAt: new Date(Date.now() + 60_000),
};

/**
 * Thrown by `webAuthnClientForPlatform()` under node, where the React Native
 * WebAuthn module cannot be imported. Several tests below use it as proof that
 * a code path reached the re-prompt — there is no other way to observe "a
 * passkey ceremony was requested" without a real authenticator.
 */
const RE_PROMPTED = /native development build/;

/** An address that refuses connections, so a write that reaches the network fails fast. */
const DEAD_RPC = "http://127.0.0.1:1";

function prfAccount(over: Partial<MeraAccount> = {}): MeraAccount {
  const account = accountFromPrfOutput(
    { credentialId: "credential", prfOutput: Uint8Array.from({ length: 32 }, (_, i) => i + 1) },
    { rpId: "accounts.example", contract, maxAmountPerTx: 100_000_000n },
  );
  return Object.assign(account, over);
}

async function errorFrom(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    return String(error instanceof Error ? error.message : error);
  }
  throw new Error("expected the call to fail, but it resolved");
}

// -- sessionGuard: what the prompt-free path is allowed to do ---------------

test("prompt-free guard allows a bounded contribution to the scoped contract", () => {
  assert.deepEqual(sessionGuard(activeLimits, contract, 100_000_000n), { allowed: true });
});

test("prompt-free guard rejects missing or expired sessions", () => {
  assert.equal(sessionGuard(null, contract, 1n).allowed, false);
  assert.equal(sessionGuard({ ...activeLimits, expiresAt: new Date(Date.now() - 1) }, contract, 1n).allowed, false);
});

test("prompt-free guard rejects another contract and amounts over the cap", () => {
  assert.equal(sessionGuard(activeLimits, otherContract, 1n).allowed, false);
  assert.equal(sessionGuard(activeLimits, contract, 100_000_001n).allowed, false);
});

test("each refusal names the real reason, because the UI shows it", () => {
  assert.match(sessionGuard(null, contract, 1n).reason!, /No active signing session/);
  assert.match(sessionGuard(activeLimits, contract, 100_000_001n).reason!, /per-transaction cap/);
  assert.match(sessionGuard(activeLimits, otherContract, 1n).reason!, /not scoped to this contract/);
});

test("scope check is case-insensitive, so a lowercased address still passes", () => {
  // Addresses arrive from invite links, logs and user input in every casing. A
  // guard that refused a lowercased address would look like a random failure.
  assert.equal(sessionGuard(activeLimits, contract.toLowerCase() as Address, 1n).allowed, true);
});

test("expiry is checked before the cap, so the message names the real problem", () => {
  const v = sessionGuard(
    { ...activeLimits, expiresAt: new Date(Date.now() - 1000), maxAmountPerTx: 1n },
    contract,
    999n,
  );
  assert.match(v.reason!, /expired/, "an expired session is the thing to tell the user");
});

// -- key derivation --------------------------------------------------------

test("a PRF output deterministically derives the same address and is zeroed", () => {
  const options = { rpId: "accounts.example", contract, maxAmountPerTx: 100_000_000n };
  const firstOutput = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
  const secondOutput = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
  const first = accountFromPrfOutput({ credentialId: "credential", prfOutput: firstOutput }, options);
  const second = accountFromPrfOutput({ credentialId: "credential", prfOutput: secondOutput }, options);

  assert.match(first.address, /^0x[0-9a-fA-F]{40}$/);
  assert.equal(first.address, second.address);
  assert.ok(firstOutput.every((byte) => byte === 0));
  assert.ok(secondOutput.every((byte) => byte === 0));

  endMeraSession(first);
  endMeraSession(second);
});

test("Mera derives the standard EVM address for the Anvil fixture key", async () => {
  const session = createSecp256k1SigningSession({
    privateKey: hexToBytes("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"),
  });
  const account = accountFromPrfOutput(
    { credentialId: "local-test", prfOutput: Uint8Array.from({ length: 32 }, (_, index) => index + 1) },
    { rpId: "accounts.example", contract, maxAmountPerTx: 100_000_000n },
  );
  endMeraSession(account);

  assert.equal(getEvmAddress(session.publicKey).toLowerCase(), "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266");
  session.end();
});

test("a different PRF output gives a different account", () => {
  const first = prfAccount();
  const second = accountFromPrfOutput(
    { credentialId: "credential", prfOutput: Uint8Array.from({ length: 32 }, (_, i) => i + 9) },
    { rpId: "accounts.example", contract, maxAmountPerTx: 100_000_000n },
  );
  assert.notEqual(first.address, second.address, "two passkeys must not collapse to one account");
  endMeraSession(first);
  endMeraSession(second);
});

// -- meraSigner: only a capped contribution may skip the prompt -------------
//
// This is the security model: every write re-prompts for the passkey EXCEPT a
// `contribute` whose amount passes sessionGuard. These tests pin both halves.
// Keeping the silent path narrow matters more than any other check here.

test("a contribution within the cap is signed without re-prompting", async () => {
  const account = prfAccount();
  const signer = meraSigner(account, DEAD_RPC);
  const message = await errorFrom(() =>
    signer.write({ address: contract, abi: [], functionName: "contribute", args: [0n], noPromptAmount: 1n }),
  );
  // It failed at the network, not at the authenticator, so nothing prompted.
  assert.doesNotMatch(message, RE_PROMPTED);
  endMeraSession(account);
});

test("a contribution OVER the cap re-prompts instead of signing silently", async () => {
  const account = prfAccount();
  const signer = meraSigner(account, DEAD_RPC);
  const message = await errorFrom(() =>
    signer.write({
      address: contract,
      abi: [],
      functionName: "contribute",
      args: [0n],
      noPromptAmount: 100_000_001n,
    }),
  );
  assert.match(message, RE_PROMPTED, "an over-cap contribution must not be signed silently");
  endMeraSession(account);
});

test("a contribution to an out-of-scope contract re-prompts", async () => {
  const account = prfAccount();
  const signer = meraSigner(account, DEAD_RPC);
  const message = await errorFrom(() =>
    signer.write({ address: otherContract, abi: [], functionName: "contribute", args: [0n], noPromptAmount: 1n }),
  );
  assert.match(message, RE_PROMPTED);
  endMeraSession(account);
});

test("a contribution on an expired session re-prompts", async () => {
  const account = prfAccount({ limits: { ...activeLimits, expiresAt: new Date(Date.now() - 1) } });
  const signer = meraSigner(account, DEAD_RPC);
  const message = await errorFrom(() =>
    signer.write({ address: contract, abi: [], functionName: "contribute", args: [0n], noPromptAmount: 1n }),
  );
  assert.match(message, RE_PROMPTED);
  endMeraSession(account);
});

test("a write with no declared amount re-prompts, even to the scoped contract", async () => {
  // join/settleRound/withdrawDeposit never set noPromptAmount, so all must prompt.
  const account = prfAccount();
  const signer = meraSigner(account, DEAD_RPC);
  for (const functionName of ["join", "settleRound", "withdrawDeposit"]) {
    const message = await errorFrom(() =>
      signer.write({ address: contract, abi: [], functionName, args: [0n] }),
    );
    assert.match(message, RE_PROMPTED, `${functionName} must ask for the passkey`);
  }
  endMeraSession(account);
});

test("a member-to-member send always re-prompts, however small", async () => {
  const account = prfAccount();
  const signer = meraSigner(account, DEAD_RPC);
  const message = await errorFrom(() => signer.transferToken({ token, to: friend, amount: 1n }));
  assert.match(message, RE_PROMPTED, "sending money out is never prompt-free");
  endMeraSession(account);
});

test("the signer reports the account address the hooks will display", () => {
  const account = prfAccount();
  assert.equal(meraSigner(account, DEAD_RPC).address, account.address);
  endMeraSession(account);
});

// -- which WebAuthn client each platform gets ------------------------------

test("without a document, the ceremony needs the React Native bridge", async () => {
  // Node is standing in for React Native here: neither has a `document`, and
  // the bridge module is what a native build supplies.
  assert.match(
    await errorFrom(() => signInWithPasskey({ rpId: "accounts.example", contract })),
    RE_PROMPTED,
  );
});

test("in a browser, the ceremony goes to Mera's own client instead of the bridge", async () => {
  // This is the whole web fallback: with a `document` present, no client is
  // passed and Mera uses navigator.credentials. Node has no authenticator, so
  // it still fails — but it must fail *inside Mera* rather than on the missing
  // React Native module, which is what proves the routing.
  const globals = globalThis as { document?: unknown };
  globals.document = {};
  let thrown: unknown;
  try {
    await signInWithPasskey({ rpId: "accounts.example", contract });
  } catch (error) {
    thrown = error;
  } finally {
    delete globals.document;
  }

  assert.ok(thrown, "node has no authenticator, so this must fail either way");
  assert.doesNotMatch(String((thrown as Error).message), RE_PROMPTED, "must not reach for the native bridge on web");
  assert.ok(isMeraError(thrown), "the failure came from Mera's browser client");
  assert.equal((thrown as { code: string }).code, "PASSKEY_OPERATION_FAILED");
  assert.doesNotMatch(describeMeraError(thrown), /navigator|WebAuthn/i, "and the user never sees that");
});

// -- bid secrets -----------------------------------------------------------

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
    const msg = describeMeraError(Object.assign(new Error("boom"), { name: "MeraError", code }));
    assert.doesNotMatch(msg, banned, `copy for ${code} leaks a forbidden word: ${msg}`);
    assert.ok(msg.length > 0);
  }
});

test("a non-Mera error still gets safe copy rather than leaking internals", () => {
  const msg = describeMeraError(new Error("ECONNREFUSED 127.0.0.1:8545"));
  assert.doesNotMatch(msg, /ECONNREFUSED|8545/);
});
