/**
 * A second currency under the dollar figures, for people who do not think in
 * dollars.
 *
 * A HINT, NOT A PRICE. Circles are denominated in AUSD and settle in AUSD;
 * nothing here touches an amount that goes on chain. The rates are a fixed
 * table checked in by hand, so they are stale the day they are written — which
 * is why every figure is prefixed "≈" and the picker says so in words. Showing
 * a live rate would mean a price feed, and a price feed that fails at a demo is
 * worse than a number that is honestly labelled approximate.
 */

export type CurrencyCode = "USD" | "INR" | "GBP" | "CAD";

export interface Currency {
  code: CurrencyCode;
  symbol: string;
  /** Units of this currency per US dollar. */
  perDollar: number;
  label: string;
}

/**
 * Hand-entered, mid-market, October 2026. Deliberately round: pretending to
 * four decimal places would imply a precision this does not have.
 */
export const CURRENCIES: readonly Currency[] = [
  { code: "USD", symbol: "$", perDollar: 1, label: "US dollar" },
  { code: "INR", symbol: "₹", perDollar: 83.4, label: "Indian rupee" },
  { code: "GBP", symbol: "£", perDollar: 0.79, label: "British pound" },
  { code: "CAD", symbol: "C$", perDollar: 1.37, label: "Canadian dollar" },
];

/** Default for the demo, where the audience is in India. */
export const DEFAULT_CURRENCY: CurrencyCode = "INR";

export function currencyFor(code: CurrencyCode): Currency {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0]!;
}

/** AUSD's six decimals, matching the SDK. */
const UNITS = 1_000_000;

/**
 * `100000000n` in INR -> `"≈ ₹8,340"`. Returns null when there is nothing
 * worth adding — showing "≈ $100" under "$100" is just noise.
 *
 * Whole units above 10, two decimals below, because "≈ £0.79" carries real
 * information where "≈ £1" would round a dollar away to nothing.
 */
export function approx(amount: bigint, code: CurrencyCode): string | null {
  const currency = currencyFor(code);
  if (currency.code === "USD") return null;
  // "≈ ₹0" under "$0" translates nothing. Seen on a round that had just
  // started, where it sat under the empty pot adding a line and no meaning.
  if (amount === 0n) return null;

  const dollars = Number(amount) / UNITS;
  const converted = dollars * currency.perDollar;
  const body =
    converted !== 0 && Math.abs(converted) < 10
      ? converted.toFixed(2)
      : Math.round(converted).toLocaleString("en-US");
  return `≈ ${currency.symbol}${body}`;
}

// -- the user's choice, remembered -----------------------------------------

const KEY = "chitcircle.currency.v1";

/**
 * Checked per call, not captured at import.
 *
 * A module-level `const isWeb = typeof localStorage !== "undefined"` reads
 * whatever the environment happened to be when the bundle first evaluated,
 * which is the wrong moment on React Native Web and in tests — a store that
 * appears afterwards is then never used, silently, and preferences look like
 * they are not persisting at all.
 */
function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch {
    return false;
  }
}

let chosen: CurrencyCode = DEFAULT_CURRENCY;

/** expo-secure-store cannot be imported in a plain Node test, so it is lazy. */
async function secureStore() {
  return import("expo-secure-store");
}

function parse(raw: string | null): CurrencyCode {
  if (!raw) return DEFAULT_CURRENCY;
  return CURRENCIES.some((c) => c.code === raw) ? (raw as CurrencyCode) : DEFAULT_CURRENCY;
}

export async function loadCurrency(): Promise<CurrencyCode> {
  try {
    const raw = hasLocalStorage() ? localStorage.getItem(KEY) : await (await secureStore()).getItemAsync(KEY);
    chosen = parse(raw);
  } catch {
    chosen = DEFAULT_CURRENCY;
  }
  return chosen;
}

export async function rememberCurrency(code: CurrencyCode): Promise<void> {
  chosen = parse(code);
  try {
    if (hasLocalStorage()) localStorage.setItem(KEY, chosen);
    else await (await secureStore()).setItemAsync(KEY, chosen);
  } catch {
    // A preference is not worth failing a screen over.
  }
}

/** Last loaded choice, for render paths that cannot await. */
export function currentCurrency(): CurrencyCode {
  return chosen;
}

/** Test seam. */
export function resetCurrencyForTests(): void {
  chosen = DEFAULT_CURRENCY;
}
