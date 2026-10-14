import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  approx,
  currencyFor,
  currentCurrency,
  loadCurrency,
  rememberCurrency,
  resetCurrencyForTests,
} from "./currency.ts";

/** The app never shows chain vocabulary, and this is on-screen text too. */
const BANNED = /\b(wallet|gas|MON|testnet|chain|transaction|hash|address|seed|private key|blockchain|AUSD|token)\b/i;

test("the figure in the brief is the figure it produces", () => {
  // $500 is the sign-up grant, and ₹41,700 is what the request asked to see
  // under it. If the rate is ever edited, this is the number that should argue.
  assert.equal(approx(500_000_000n, "INR"), "≈ ₹41,700");
});

test("dollars get no second line of their own", () => {
  // "≈ $100" under "$100" is noise, not a translation.
  assert.equal(approx(100_000_000n, "USD"), null);
});

test("every figure is marked approximate", () => {
  for (const { code } of CURRENCIES) {
    const shown = approx(123_000_000n, code);
    if (shown === null) continue;
    assert.ok(shown.startsWith("≈ "), `${code} must not look exact: ${shown}`);
    assert.doesNotMatch(shown, BANNED);
  }
});

test("large amounts are grouped and not given false precision", () => {
  assert.equal(approx(100_000_000n, "INR"), "≈ ₹8,340");
  assert.equal(approx(1_000_000_000n, "INR"), "≈ ₹83,400");
});

test("small amounts keep their pennies, where rounding would erase them", () => {
  // A dollar in pounds is 0.79. Rounded to whole units that is "£1", which
  // reads as parity and hides the conversion entirely.
  assert.equal(approx(1_000_000n, "GBP"), "≈ £0.79");
  assert.equal(approx(0n, "GBP"), "≈ £0");
});

test("a currency the table does not know falls back rather than throwing", () => {
  assert.equal(currencyFor("JPY" as never).code, "USD");
});

test("the demo defaults to rupees", () => {
  assert.equal(DEFAULT_CURRENCY, "INR");
});

test("a choice survives being stored and read back", async () => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  try {
    await rememberCurrency("GBP");
    assert.equal(currentCurrency(), "GBP");
    resetCurrencyForTests();
    assert.equal(currentCurrency(), "INR", "reset really cleared it");
    assert.equal(await loadCurrency(), "GBP", "and it came back from storage");
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    resetCurrencyForTests();
  }
});

test("junk in storage does not become junk on screen", async () => {
  const store = new Map<string, string>([["chitcircle.currency.v1", "DOGE"]]);
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  try {
    assert.equal(await loadCurrency(), DEFAULT_CURRENCY);
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    resetCurrencyForTests();
  }
});

test("rates are sane and the table is well formed", () => {
  const codes = new Set(CURRENCIES.map((c) => c.code));
  assert.equal(codes.size, CURRENCIES.length, "no duplicates");
  assert.ok(codes.has("USD") && codes.has("INR") && codes.has("GBP") && codes.has("CAD"));
  for (const c of CURRENCIES) {
    assert.ok(c.perDollar > 0, `${c.code} needs a positive rate`);
    assert.ok(c.symbol.length > 0 && c.label.length > 0);
  }
  assert.equal(currencyFor("USD").perDollar, 1, "the base currency must be 1");
});
