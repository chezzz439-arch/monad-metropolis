import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEther, type Address, type Hash } from "viem";
import {
  DEFAULT_MIN_BALANCE,
  DEFAULT_TOP_UP_TO,
  FunderEmptyError,
  GasDripper,
  isFunderKey,
  type GasFunder,
} from "../src/gas.ts";

const NEW_ACCOUNT = "0x00000000000000000000000000000000000000a1" as Address;
const FUNDER = "0x00000000000000000000000000000000000000f0" as Address;

/** A chain whose balances we control, recording what the funder sent. */
function fakeChain(balances: Record<string, bigint>) {
  const sends: { to: Address; amount: bigint }[] = [];
  let nextHash = 0;
  let receiptWaits = 0;

  const funder: GasFunder = {
    address: FUNDER,
    async sendNative({ to, amount }) {
      sends.push({ to, amount });
      balances[FUNDER.toLowerCase()] = (balances[FUNDER.toLowerCase()] ?? 0n) - amount;
      balances[to.toLowerCase()] = (balances[to.toLowerCase()] ?? 0n) + amount;
      return `0x${(++nextHash).toString(16).padStart(64, "0")}` as Hash;
    },
  };

  const publicClient = {
    async getBalance({ address }: { address: Address }) {
      return balances[address.toLowerCase()] ?? 0n;
    },
    async waitForTransactionReceipt() {
      receiptWaits++;
      return {};
    },
  };

  return { funder, publicClient, sends, balances, stats: () => ({ receiptWaits }) };
}

test("a brand-new account is topped up to the target", async () => {
  const chain = fakeChain({ [FUNDER.toLowerCase()]: parseEther("5") });
  const dripper = new GasDripper({ funder: chain.funder, publicClient: chain.publicClient });

  const res = await dripper.ensure(NEW_ACCOUNT);

  assert.equal(res.topped, true);
  assert.equal(res.balanceBefore, 0n);
  assert.equal(res.sent, DEFAULT_TOP_UP_TO, "funds up to the target, not a fixed amount");
  assert.ok(res.hash);
  assert.deepEqual(chain.sends, [{ to: NEW_ACCOUNT, amount: DEFAULT_TOP_UP_TO }]);
  assert.equal(
    chain.balances[NEW_ACCOUNT.toLowerCase()],
    DEFAULT_TOP_UP_TO,
    "the account can now pay for a whole circle",
  );
});

test("an already-funded account is left alone", async () => {
  const chain = fakeChain({
    [FUNDER.toLowerCase()]: parseEther("5"),
    [NEW_ACCOUNT.toLowerCase()]: parseEther("1"),
  });
  const dripper = new GasDripper({ funder: chain.funder, publicClient: chain.publicClient });

  const res = await dripper.ensure(NEW_ACCOUNT);

  assert.equal(res.topped, false);
  assert.equal(res.sent, 0n);
  assert.equal(chain.sends.length, 0, "no transaction, so sign-in stays instant");
});

test("a partly-drained account is topped back up to the target", async () => {
  const low = DEFAULT_MIN_BALANCE - 1n;
  const chain = fakeChain({
    [FUNDER.toLowerCase()]: parseEther("5"),
    [NEW_ACCOUNT.toLowerCase()]: low,
  });
  const dripper = new GasDripper({ funder: chain.funder, publicClient: chain.publicClient });

  const res = await dripper.ensure(NEW_ACCOUNT);

  assert.equal(res.sent, DEFAULT_TOP_UP_TO - low);
  assert.equal(chain.balances[NEW_ACCOUNT.toLowerCase()], DEFAULT_TOP_UP_TO);
});

test("exactly at the minimum is enough, and does not trigger a send", async () => {
  const chain = fakeChain({
    [FUNDER.toLowerCase()]: parseEther("5"),
    [NEW_ACCOUNT.toLowerCase()]: DEFAULT_MIN_BALANCE,
  });
  const dripper = new GasDripper({ funder: chain.funder, publicClient: chain.publicClient });

  assert.equal((await dripper.ensure(NEW_ACCOUNT)).topped, false);
});

test("concurrent calls send one transaction, not two", async () => {
  // Sign-in and the first write race at startup. Two sends would reuse a
  // nonce and fail intermittently — the worst thing to meet on demo night.
  const chain = fakeChain({ [FUNDER.toLowerCase()]: parseEther("5") });
  const dripper = new GasDripper({ funder: chain.funder, publicClient: chain.publicClient });

  const [a, b, c] = await Promise.all([
    dripper.ensure(NEW_ACCOUNT),
    dripper.ensure(NEW_ACCOUNT),
    dripper.ensure(NEW_ACCOUNT),
  ]);

  assert.equal(chain.sends.length, 1, "one top-up for three concurrent callers");
  assert.equal(a.hash, b.hash);
  assert.equal(b.hash, c.hash);
});

test("the in-flight guard is released, so a later drain tops up again", async () => {
  const chain = fakeChain({ [FUNDER.toLowerCase()]: parseEther("5") });
  const dripper = new GasDripper({ funder: chain.funder, publicClient: chain.publicClient });

  await dripper.ensure(NEW_ACCOUNT);
  chain.balances[NEW_ACCOUNT.toLowerCase()] = 0n; // spent on a long circle
  await dripper.ensure(NEW_ACCOUNT);

  assert.equal(chain.sends.length, 2, "not permanently cached");
});

test("an empty funder fails by name, before sending", async () => {
  const chain = fakeChain({ [FUNDER.toLowerCase()]: parseEther("0.01") });
  const dripper = new GasDripper({ funder: chain.funder, publicClient: chain.publicClient });

  await assert.rejects(dripper.ensure(NEW_ACCOUNT), (e: FunderEmptyError) => {
    assert.equal(e.name, "FunderEmptyError");
    assert.match(e.message, /0\.01 MON/, "says what it has");
    assert.match(e.message, /faucet/i, "says how to fix it");
    return true;
  });
  assert.equal(chain.sends.length, 0, "nothing sent when it would fail");
});

test("it waits for the top-up to land before returning", async () => {
  // The caller's very next action is a write, which reverts if the balance
  // has not arrived yet.
  const chain = fakeChain({ [FUNDER.toLowerCase()]: parseEther("5") });
  const dripper = new GasDripper({ funder: chain.funder, publicClient: chain.publicClient });

  await dripper.ensure(NEW_ACCOUNT);
  assert.equal(chain.stats().receiptWaits, 1);
});

test("a nonsensical threshold is rejected at construction", async () => {
  const chain = fakeChain({});
  assert.throws(
    () =>
      new GasDripper({
        funder: chain.funder,
        publicClient: chain.publicClient,
        minBalance: parseEther("1"),
        topUpTo: parseEther("0.5"),
      }),
    /must exceed/,
  );
});

test("a malformed funder key reads as not-configured rather than throwing", async () => {
  // The app treats `false` as "funding is off" and runs read-only. Letting a
  // typo through instead means viem throws an error quoting the bad value,
  // which then has to be kept out of a log and off the screen.
  const valid = `0x${"ab".repeat(32)}`;
  assert.equal(isFunderKey(valid), true);
  assert.equal(isFunderKey(valid.toUpperCase().replace("0X", "0x")), true, "hex case is irrelevant");

  for (const bad of [
    undefined,
    null,
    "",
    "   ",
    `${"ab".repeat(32)}`, // no 0x
    `0x${"ab".repeat(31)}`, // a byte short
    `0x${"ab".repeat(33)}`, // a byte long
    `0x${"ab".repeat(32)}\n`, // trailing newline from a copy-paste
    `0x${"zz".repeat(32)}`, // not hex
    `0x${"0".repeat(64)}`, // the zero key: valid shape, no account
  ]) {
    assert.equal(isFunderKey(bad), false, `rejected: ${JSON.stringify(bad)}`);
  }
});

test("defaults cover the demo circle, and are honest that they stop there", async () => {
  // forge --gas-report at the 102 gwei seen on testnet: join 0.0147,
  // contribute 0.0094, settle 0.0084, withdraw 0.0054 MON.
  const join = parseEther("0.0147");
  const contribute = parseEther("0.0094");
  const settle = parseEther("0.0084");

  // What the two-minute demo actually spends: join, pay a couple of rounds,
  // settle one. This has to fit or sign-up is pointless.
  const demoCircleCost = join + contribute * 2n + settle;
  assert.ok(
    DEFAULT_TOP_UP_TO > demoCircleCost,
    `the drip must cover the demo circle (${demoCircleCost} wei)`,
  );

  // And what it deliberately does NOT cover, so nobody raises the constant
  // without reading why it is low: a full five-round circle is ~0.0755 MON.
  // The funder holds a fixed amount and every sign-up takes a slice, so this
  // trades per-account headroom for how many accounts a demo can mint.
  assert.ok(
    DEFAULT_TOP_UP_TO < parseEther("0.0755"),
    "if this now covers a whole circle, update the comment on DEFAULT_TOP_UP_TO",
  );

  // The constructor rejects topUpTo <= minBalance, so every top-up sends
  // something. Guarded here too, since both constants moved together.
  assert.ok(DEFAULT_MIN_BALANCE > 0n);
  assert.ok(DEFAULT_MIN_BALANCE < DEFAULT_TOP_UP_TO);
});
