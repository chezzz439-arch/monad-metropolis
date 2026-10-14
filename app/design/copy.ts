/**
 * Everything the user reads that isn't a fixed string in a screen.
 *
 * Two jobs. First, money and names: the chain has neither, so this is where
 * `100000000n` becomes "$100" and a 42-character account becomes "Priya" or
 * "Member 3". Second, errors: the data layer throws reverts, RPC failures and
 * Mera codes, and the team guide allows exactly one friendly sentence on
 * screen. Nothing here reaches into the SDK — it only reads what it is given.
 */
import { describeMeraError, formatAmount, formatCountdown, nameFor } from "../../sdk/src/index.ts";

/** `100000000n` -> `"$100"`, `100500000n` -> `"$100.50"`, `1000000000n` -> `"$1,000"`. */
export function money(amount: bigint): string {
  const [whole = "0", frac = ""] = formatAmount(amount).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac && frac !== "00" ? `$${grouped}.${frac}` : `$${grouped}`;
}

/**
 * What to call a member.
 *
 * `nameFor` only knows the demo roster, so on the live contract everyone
 * resolves to their slot. That is the honest answer — inventing names would
 * be worse than "Member 3" — and it keeps a 42-character account off a screen
 * a non-technical user is reading.
 */
export function personName(who: string, slot: number, me?: string | null): string {
  if (me && who.toLowerCase() === me.toLowerCase()) return "You";
  return nameFor(who as `0x${string}`) ?? `Member ${slot + 1}`;
}

/** `"Priya"` -> `"P"`, `"Member 3"` -> `"M3"`. Fits an avatar at any size. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return (words[0] ?? "?").slice(0, 1).toUpperCase();
  return (words[0]!.slice(0, 1) + words[1]!.slice(0, 1)).toUpperCase();
}

/**
 * Time left in a round. Demo rounds are two minutes, so seconds matter; real
 * circles are monthly, where a ticking clock would be absurd.
 */
export function timeLeft(seconds: number): string {
  if (seconds <= 0) return "Ready now";
  if (seconds < 3600) return `${formatCountdown(seconds)} left`;
  const hours = Math.round(seconds / 3600);
  if (hours < 48) return `${hours} ${hours === 1 ? "hour" : "hours"} left`;
  return `${Math.round(hours / 24)} days left`;
}

/** `1.37` -> `"settled in 1.4s"`, the one number the demo is built around. */
export function settledIn(seconds: number): string {
  return `settled in ${seconds.toFixed(1)}s`;
}

/**
 * The contract's custom errors, in words. Each one is a thing the user did or
 * a state they are in, so each gets a sentence that says what to do next
 * rather than what failed.
 */
const REVERTS: Record<string, string> = {
  AlreadyPaid: "You have already paid this round.",
  AlreadyMember: "You are already in this circle.",
  AlreadyStarted: "This circle has already started, so it cannot take anyone new.",
  AlreadyFinished: "This circle has finished.",
  NotStarted: "This circle has not started yet. It begins when every place is filled.",
  NotFinished: "You can take your deposit back once the last round is done.",
  NotAMember: "You are not in this circle.",
  CircleFull: "Every place in this circle is taken.",
  HasDefaulted: "You missed a round in this circle, so this is no longer available to you.",
  RoundStillOpen: "This round is still open. Everyone has until the timer runs out.",
  NothingToWithdraw: "There is nothing left to take out here.",
  TransferFailed: "That payment did not go through. Check your balance and try again.",
  BadContribution: "That amount will not work. Pick a round number and try again.",
  BadMemberCount: "A circle needs between 2 and 20 people.",
  BadRoundLength: "Pick how long a round should last, then try again.",
  UnknownCircle: "We could not find that circle.",
};

/** Matched against the raw message when there is no custom error to read. */
const PATTERNS: [RegExp, string][] = [
  // Before the balance line, and the distinction matters. Running out of the
  // network's own fee token is not the same as running out of money, but viem
  // reports both as "insufficient funds" — so an organizer who had just spent
  // their fee allowance creating and joining a circle was told their balance
  // was short while their $400 sat untouched. The app tops accounts up itself,
  // so the honest instruction is to wait a moment, not to go and find funds.
  // Matching viem's wordings specifically, not just the word "insufficient".
  // Its class name is `InsufficientFundsError` — one word, no space — so a
  // pattern looking for "insufficient funds" misses it and the generic balance
  // line below catches it instead, which is how this was reported as a money
  // problem in the first place. "exceeds the balance of the account" is viem's
  // phrasing for the fee case and is deliberately distinct from ERC-20's
  // "transfer amount exceeds balance", which really is a money problem.
  // "signer had insufficient balance" is Monad's own refusal, and it is the one
  // that actually reached a user. It arrives as {"code":-32000} on
  // eth_sendRawTransaction when the signer cannot cover gas_limit *
  // maxFeePerGas — the whole gas limit, reserved up front, which is far more
  // than the fee that ends up charged. It says "balance", so it fell through to
  // the dollars sentence below and told someone holding $400 that their money
  // had run out. Matched by the "signer"/"balance" pairing, since the words
  // "insufficient balance" alone are also how ERC-20s report a real shortfall.
  [/signer had insufficient|insufficient balance for (gas|transfer)/i,
    "Your account is being topped up. Give it a few seconds and try again."],
  [/insufficient ?funds|funds for gas|gas \* (price|gas fee)|exceeds the balance of the account|out of gas/i,
    "Your account is being topped up. Give it a few seconds and try again."],
  [/insufficient|exceeds balance|exceeds allowance/i, "You do not have enough in your balance for this."],
  [/rejected|denied|cancell?ed|NotAllowedError|AbortError/i, "That confirmation was cancelled. Tap again to continue."],
  // Before the generic network line: a rate limit is a busy network, not a
  // missing one, and "check your connection" sends people to fix a router that
  // is fine. Seen for real on the deployed site twice — first as a burst of
  // HTTP 429s behind a join, then as Monad's own refusal, which arrives inside
  // an HTTP 200 as {"code":-32011,"message":"requests limited to 15/sec"}.
  // That second form matches none of the usual words, so it fell all the way
  // through to "Something went wrong" on a new account's very first screen,
  // with nothing in the console and no failed request in devtools to explain it.
  [/\b429\b|rate.?limit|too many requests|limited to \d+\s*\/\s*sec|-32011/i,
    "The network is busy. Give it a few seconds and try again."],
  [/fetch|network|timeout|timed out|ECONN|ETIMEDOUT|socket|HTTP request failed/i, "We could not reach the network just now. Check your connection and try again."],
  [/nonce|replacement|already known|underpriced/i, "That did not go through. Give it a moment and try again."],
];

/**
 * One sentence, safe to render.
 *
 * Reverts carry their error name in the message, so a plain substring search
 * finds it wherever viem decided to put it. Anything unrecognised falls
 * through to Mera's own copy, which already covers the passkey codes and ends
 * in a generic sentence — so nothing raw can reach the screen.
 */
export function friendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  for (const [name, sentence] of Object.entries(REVERTS)) {
    if (raw.includes(name)) return sentence;
  }
  for (const [pattern, sentence] of PATTERNS) {
    if (pattern.test(raw)) return sentence;
  }
  return describeMeraError(error);
}
