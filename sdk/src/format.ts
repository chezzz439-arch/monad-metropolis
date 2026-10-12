/** AUSD is 6-decimal. Kept in one place so no screen hardcodes it. */
export const AUSD_DECIMALS = 6;

/** `100000000n` -> `"100.00"` */
export function formatAmount(amount: bigint, decimals = AUSD_DECIMALS, maxFractionDigits = 2): string {
  const unit = 10n ** BigInt(decimals);
  const whole = amount / unit;
  const frac = amount % unit;
  if (maxFractionDigits === 0) return whole.toString();

  const fracStr = frac.toString().padStart(decimals, "0").slice(0, maxFractionDigits);
  return `${whole.toString()}.${fracStr}`;
}

/** `"100"` or `"100.5"` -> `100500000n`. Throws on more precision than exists. */
export function parseAmount(input: string, decimals = AUSD_DECIMALS): bigint {
  const trimmed = input.trim();
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === "" || trimmed === ".") {
    throw new Error(`Not an amount: "${input}"`);
  }
  const [whole = "0", frac = ""] = trimmed.split(".");
  if (frac.length > decimals) throw new Error(`At most ${decimals} decimal places`);
  return BigInt(whole + frac.padEnd(decimals, "0"));
}

/** `"$100.00"` for display. */
export function formatUsd(amount: bigint, decimals = AUSD_DECIMALS): string {
  return `$${formatAmount(amount, decimals, 2)}`;
}

/** `92` -> `"1:32"`, `3700` -> `"1:01:40"`. For the round timer. */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  return hours > 0
    ? `${hours}:${mm}:${String(seconds).padStart(2, "0")}`
    : `${mm}:${String(seconds).padStart(2, "0")}`;
}

/** `1.37` -> `"settled in 1.4s"` — the Agora bounty's visible proof. */
export function formatSettled(seconds: number): string {
  return `settled in ${seconds.toFixed(1)}s`;
}

/** `0x1234...abcd` for the explorer links. */
export function shortAddress(address: string, lead = 6, tail = 4): string {
  return address.length <= lead + tail ? address : `${address.slice(0, lead)}…${address.slice(-tail)}`;
}
