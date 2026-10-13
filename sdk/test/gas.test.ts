import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEther, type Address, type Hash } from "viem";
import {
  DEFAULT_DOLLAR_GRANT,
  DEFAULT_DOLLAR_MIN,
  DEFAULT_MIN_BALANCE,
  DEFAULT_TOP_UP_TO,
  FunderEmptyError,
  GasDripper,
  isFunderKey,
  type GasFunder,
} from "../src/gas.ts";

const NEW_ACCOUNT = "0x00000000000000000000000000000000000000a1" as Address;
const FUNDER = "0x00000000000000000000000000000000000000f0" as Address;
const AUSD = "0x00000000000000000000000000000000000000d0" as Address;

/** A chain whose balances we control, recording what the funder sent. */
function fakeChain(balances: Record<string, bigint>, dollars?: Record<string, bigint>) {
  const sends: { to: Address; amount: bigint }[] = [];
  const tokenSends: { to: Address; amount: bigint }[] = [];
  let nextHash = 0;
  let receiptWaits = 0;
  const dollarBook = dollars ?? {};

  const funder: GasFunder = {
    address: FUNDER,
    async sendNative({ to, amount }) {
      sends.push({ to, amount });
      balances[FUNDER.toLowerCase()] = (balances[FUNDER.toLowerCase()] ?? 0n) - amount;
      balances[to.toLowerCase()] = (balances[to.toLowerCase()] ?? 0n) + amount;
      return `0x${(++nextHash).toString(16).padStart(64, "0")}` as Hash;
    },
    async sendToken({ to, amount }) {
      tokenSends.push({ to, amount });
      dollarBook[FUNDER.toLowerCase()] = (dollarBook[FUNDER.toLowerCase()] ?? 0n) - amount;
      dollarBook[to.toLowerCase()] = (dollarBook[to.toLowerCase()] ?? 0n) + amount;
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
    async getTokenBalance({ address }: { token: Address; address: Address }) {
      return dollarBook[address.toLowerCase()] ?? 0n;
    },
  };

  return { funder, publicClient, sends, tokenSends, balances, dollarBook, stats: () => ({ receiptWaits }) };
}

/** A dripper stocked with both MON and test dollars. */
function fundedDripper(dollarStock = DEFAULT_DOLLAR_GRANT * 10n) {
  const chain = fakeChain(
    { [FUNDER.toLowerCase()]: parseEther("5") },
    { [FUNDER.toLowerCase()]: dollarStock },
  );
  return {
    chain,
    dripper: new GasDripper({
      funder: chain.funder,
      publicClient: chain.publicClient,
      dollars: { token: AUSD },
    }),
  };
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

// -- test dollars ----------------------------------------------------------
//
// Funding gas was only half of it. A new account could pay the network fee and
// still not join, because joining costs a $100 deposit it did not have. Every
// judge who signed up hit that.

test("a new account is given test dollars along with its gas", async () => {
  const { chain, dripper } = fundedDripper();

  const res = await dripper.ensure(NEW_ACCOUNT);

  assert.equal(res.dollars.kind, "granted");
  assert.deepEqual(chain.tokenSends, [{ to: NEW_ACCOUNT, amount: DEFAULT_DOLLAR_GRANT }]);
  assert.equal(chain.dollarBook[NEW_ACCOUNT.toLowerCase()], DEFAULT_DOLLAR_GRANT);
  if (res.dollars.kind === "granted") {
    assert.equal(res.dollars.balance, DEFAULT_DOLLAR_GRANT, "reports the balance, so the UI can show it");
  }
});

test("the grant covers a $100 deposit several times over", () => {
  // The demo circle asks $100 to join and $100 a round. A grant that only just
  // covered the deposit would strand someone one round in.
  assert.ok(DEFAULT_DOLLAR_GRANT >= 100_000_000n * 5n, "at least five deposits");
  assert.ok(DEFAULT_DOLLAR_MIN > 0n && DEFAULT_DOLLAR_MIN < DEFAULT_DOLLAR_GRANT);
});

test("someone mid-circle is not handed more every time they sign in", async () => {
  const { chain, dripper } = fundedDripper();
  chain.dollarBook[NEW_ACCOUNT.toLowerCase()] = DEFAULT_DOLLAR_MIN;

  const res = await dripper.ensure(NEW_ACCOUNT);

  assert.equal(res.dollars.kind, "already-funded");
  assert.equal(chain.tokenSends.length, 0);
});

test("an account that spent almost everything is topped back up", async () => {
  const { chain, dripper } = fundedDripper();
  chain.dollarBook[NEW_ACCOUNT.toLowerCase()] = DEFAULT_DOLLAR_MIN - 1n;

  const res = await dripper.ensure(NEW_ACCOUNT);

  assert.equal(res.dollars.kind, "granted");
  assert.equal(chain.dollarBook[NEW_ACCOUNT.toLowerCase()], DEFAULT_DOLLAR_GRANT, "brought up to the target");
});

// The rest of this block is one claim: a dollar problem must never stop
// sign-up. Gas is load-bearing and still throws; dollars are not.

test("a dripper out of test dollars still finishes sign-up", async () => {
  const { chain, dripper } = fundedDripper(0n);

  const res = await dripper.ensure(NEW_ACCOUNT);

  assert.equal(res.topped, true, "gas still landed");
  assert.equal(res.dollars.kind, "funder-empty", "said so, rather than throwing");
  assert.equal(chain.tokenSends.length, 0, "nothing sent when it would fail");
});

test("a token transfer that reverts still finishes sign-up", async () => {
  const chain = fakeChain(
    { [FUNDER.toLowerCase()]: parseEther("5") },
    { [FUNDER.toLowerCase()]: DEFAULT_DOLLAR_GRANT * 10n },
  );
  chain.funder.sendToken = async () => {
    throw new Error("execution reverted");
  };
  const dripper = new GasDripper({
    funder: chain.funder,
    publicClient: chain.publicClient,
    dollars: { token: AUSD },
  });

  const res = await dripper.ensure(NEW_ACCOUNT);

  assert.equal(res.topped, true);
  assert.equal(res.dollars.kind, "failed");
});

test("a dripper with no token support reports it, and gas is unaffected", async () => {
  // The gas-only setup every existing caller uses.
  const chain = fakeChain({ [FUNDER.toLowerCase()]: parseEther("5") });
  const dripper = new GasDripper({ funder: chain.funder, publicClient: chain.publicClient });

  const res = await dripper.ensure(NEW_ACCOUNT);

  assert.equal(res.topped, true);
  assert.equal(res.dollars.kind, "not-configured");
});

test("gas still throws when the funder is empty, even with dollars configured", async () => {
  // The asymmetry is the point: no gas means nothing works at all.
  const chain = fakeChain(
    { [FUNDER.toLowerCase()]: parseEther("0.01") },
    { [FUNDER.toLowerCase()]: DEFAULT_DOLLAR_GRANT * 10n },
  );
  const dripper = new GasDripper({
    funder: chain.funder,
    publicClient: chain.publicClient,
    dollars: { token: AUSD },
  });

  await assert.rejects(dripper.ensure(NEW_ACCOUNT), /FunderEmptyError|has 0\.01 MON/);
});

test("an already-funded account still gets its dollars checked", async () => {
  // Signing in on a second device: gas is fine, dollars may not be.
  const chain = fakeChain(
    { [FUNDER.toLowerCase()]: parseEther("5"), [NEW_ACCOUNT.toLowerCase()]: parseEther("1") },
    { [FUNDER.toLowerCase()]: DEFAULT_DOLLAR_GRANT * 10n },
  );
  const dripper = new GasDripper({
    funder: chain.funder,
    publicClient: chain.publicClient,
    dollars: { token: AUSD },
  });

  const res = await dripper.ensure(NEW_ACCOUNT);

  assert.equal(res.topped, false, "no gas needed");
  assert.equal(res.dollars.kind, "granted", "but the dollars were still missing");
});

test("a nonsensical dollar threshold is rejected at construction", () => {
  const chain = fakeChain({});
  assert.throws(
    () =>
      new GasDripper({
        funder: chain.funder,
        publicClient: chain.publicClient,
        dollars: { token: AUSD, minBalance: 500_000_000n, topUpTo: 100_000_000n },
      }),
    /must exceed/,
  );
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
