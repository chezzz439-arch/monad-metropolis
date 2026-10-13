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
/**
 * Loaded on demand, and only off the web.
 *
 * A static import pulls expo-secure-store into the web bundle, which does not
 * need it — and makes this module impossible to load in a plain Node test,
 * where the native module has no implementation to resolve.
 */
async function secureStore() {
  return import("expo-secure-store");
}

const KEY = "chitcircle.names.v1";
/**
 * Who created what, kept apart from the names.
 *
 * Names are shared on purpose — if two accounts on one device are both in a
 * circle, they should both see what the group calls it. Ownership is not: it
 * decides what appears under "Your circles" before you have joined, so it has
 * to be per account.
 */
const OWNER_KEY = "chitcircle.created.v1";
const isWeb = typeof document !== "undefined";

let cache: Record<string, string> | null = null;
let owners: Record<string, bigint[]> = {};

async function read(): Promise<Record<string, string>> {
  if (cache) return cache;
  try {
    const raw = isWeb ? localStorage.getItem(KEY) : await (await secureStore()).getItemAsync(KEY);
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
    else await (await secureStore()).setItemAsync(KEY, raw);
  } catch {
    // A name that does not survive a restart is still better than no name now.
  }
}

async function readOwners(): Promise<Record<string, bigint[]>> {
  try {
    const raw = isWeb ? localStorage.getItem(OWNER_KEY) : await (await secureStore()).getItemAsync(OWNER_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    const next: Record<string, bigint[]> = {};
    if (parsed && typeof parsed === "object") {
      for (const [who, ids] of Object.entries(parsed as Record<string, unknown>)) {
        if (!Array.isArray(ids)) continue;
        next[who.toLowerCase()] = ids
          .filter((id): id is string => typeof id === "string" && /^\d+$/.test(id))
          .map(BigInt);
      }
    }
    owners = next;
  } catch {
    owners = {};
  }
  return owners;
}

/** Loads every remembered name, and who created what. */
export async function loadCircleNames(): Promise<Record<string, string>> {
  await readOwners();
  return { ...(await read()) };
}

/**
 * Remember that `account` created this circle, and what it called it.
 *
 * The name is optional — an unnamed circle still needs the ownership record,
 * because that is what keeps it on the creator's home screen during the window
 * between creating it and joining it.
 */
export async function rememberCircleName(
  circleId: bigint,
  name: string,
  account?: string | null,
): Promise<void> {
  await write({ ...(await read()), [circleId.toString()]: name.trim() });

  if (!account) return;
  // Start from what is stored rather than from memory. Another tab may have
  // created a circle since this one loaded, and an in-memory-only merge would
  // drop it — the kind of loss that only shows up when two profiles are open
  // side by side, which is exactly how this gets demoed.
  await readOwners();
  const who = account.toLowerCase();
  const mine = owners[who] ?? [];
  if (!mine.some((id) => id === circleId)) {
    owners = { ...owners, [who]: [...mine, circleId] };
  }

  const raw = JSON.stringify(
    Object.fromEntries(Object.entries(owners).map(([k, ids]) => [k, ids.map(String)])),
  );
  try {
    if (isWeb) localStorage.setItem(OWNER_KEY, raw);
    else await (await secureStore()).setItemAsync(OWNER_KEY, raw);
  } catch {
    // Same trade as the names: losing this on restart costs the creator one
    // trip through "Join with link", not the circle.
  }
}

/**
 * Circle ids a given account created on this device, for
 * `DiscoveryOptions.knownIds`.
 *
 * Needed because the contract stores no organizer: between creating a circle
 * and joining it, nothing on chain ties it to its creator, so without this the
 * organizer's own circle would vanish from their home screen until they joined.
 *
 * KEYED BY ACCOUNT, and that is the whole point. `knownIds` is the one input to
 * discovery that is *not* checked against membership — it exists precisely to
 * surface a circle you are not yet in — so anything in it shows up under "Your
 * circles" unconditionally. When the record was per-device rather than per
 * account, a second account created on the same device inherited the first
 * one's circles: a fresh account on the live site listed "Sunday Table" and a
 * stranger's "Demo Circle", both of which `isMember` says plainly it is not in.
 * On a shared demo device that is somebody else's circle on your home screen.
 */
export function rememberedCircleIds(account: string | null | undefined): bigint[] {
  if (!account) return [];
  const mine = owners[account.toLowerCase()] ?? [];
  return [...mine].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
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
