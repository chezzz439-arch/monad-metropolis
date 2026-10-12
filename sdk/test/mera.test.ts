import assert from "node:assert/strict";
import { test } from "node:test";
import { createSecp256k1SigningSession, getEvmAddress } from "@category-labs/mera";
import { hexToBytes } from "viem";
import { accountFromPrfOutput, endMeraSession, sessionGuard, type MeraSessionLimits } from "../src/mera.ts";

const contract = "0x1111111111111111111111111111111111111111" as const;
const otherContract = "0x2222222222222222222222222222222222222222" as const;
const activeLimits: MeraSessionLimits = {
  contract,
  maxAmountPerTx: 100_000_000n,
  expiresAt: new Date(Date.now() + 60_000),
};

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
