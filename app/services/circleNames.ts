/**
 * What the group calls a circle.
 *
 * The contract stores no name — it has no reason to — so "Sunday Table" lives
 * on the device that typed it and everyone else sees "Circle 3". That is the
 * honest trade: a name is a label for humans, not a fact the group needs to
 * agree on, and putting it on chain would cost every member a payment to
 * change it. The create screen has always asked for a name; this is where it
 * finally goes.
 *
 * Nothing here is secret, so it uses plain storage rather than the keychain,
 * and a read failure is not worth an error state — the fallback name is fine.
 */
import * as SecureStore from "expo-secure-store";

const KEY = "chitcircle.names.v1";
const isWeb = typeof document !== "undefined";

let cache: Record<string, string> | null = null;

async function read(): Promise<Record<string, string>> {
  if (cache) return cache;
  try {
    const raw = isWeb ? localStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    cache = parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    cache = {};
  }
  return cache;
}

async function write(next: Record<string, string>): Promise<void> {
  cache = next;
  const raw = JSON.stringify(next);
  try {
    if (isWeb) localStorage.setItem(KEY, raw);
    else await SecureStore.setItemAsync(KEY, raw);
  } catch {
    // A name that does not survive a restart is still better than no name now.
  }
}

/** Loads every remembered name. Call once per screen, then look names up. */
export async function loadCircleNames(): Promise<Record<string, string>> {
  return { ...(await read()) };
}

/**
 * Remember what this device calls a circle.
 *
 * Also doubles as the record that this device knows the circle exists, which
 * {@link rememberedCircleIds} feeds to discovery — so an unnamed circle is
 * still worth an entry.
 */
export async function rememberCircleName(circleId: bigint, name: string): Promise<void> {
  await write({ ...(await read()), [circleId.toString()]: name.trim() });
}

/**
 * Circle ids this device has seen, for `DiscoveryOptions.knownIds`.
 *
 * Needed because the contract stores no organizer: between creating a circle
 * and joining it, nothing on chain ties it to its creator, so without this the
 * organizer's own circle would vanish from their home screen until they joined.
 * Discovery still checks every id against the contract, so a stale entry here
 * cannot invent a circle.
 */
export function rememberedCircleIds(names: Record<string, string>): bigint[] {
  return Object.keys(names)
    .filter((id) => /^\d+$/.test(id))
    .map(BigInt)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * The name the group gave it, or a plain one anybody can repeat out loud.
 *
 * The number shown is the id plus one. Circle ids start at zero because that
 * is where an array starts, which is a fact about our storage and not one the
 * first person to ever create a circle should be told — "Circle #0" reads like
 * a bug or an empty state. Display only: {@link circleNames} keys, invite
 * links and every contract call still use the real id.
 */
export function circleName(circleId: bigint, names: Record<string, string>): string {
  return names[circleId.toString()]?.trim() || `Circle #${(circleId + 1n).toString()}`;
}
