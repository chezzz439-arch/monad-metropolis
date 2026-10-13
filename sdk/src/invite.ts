/**
 * Invite links. A circle is discovered by its id, so a link only has to carry
 * that id plus enough context to fail loudly on the wrong deployment.
 *
 * Two forms, both parsed by {@link parseInviteLink}:
 *
 *   https://chit-circle.vercel.app/c/7?chain=10143&at=0xCONTRACT  <- share in WhatsApp
 *   chitcircle://circle/7?chain=10143&at=0xCONTRACT               <- app deep link
 *
 * The https form matters: §3's distribution plan is one link dropped into an
 * existing WhatsApp group, and a custom scheme renders as dead text there.
 */

export interface InviteTarget {
  circleId: bigint;
  /** Chain id the circle lives on, when the link carries one. */
  chainId?: number;
  /** ChitCircle deployment, when the link carries one. */
  contract?: `0x${string}`;
}

export interface InviteLinkOptions {
  /** Defaults to {@link DEFAULT_INVITE_BASE}. */
  baseUrl?: string;
  chainId?: number;
  contract?: `0x${string}`;
}

/**
 * Where shared links point.
 *
 * This is the deployed site, not a vanity domain: `chitcircle.app` is not a
 * domain the team owns, so every invite built with it was unopenable. It also
 * has to match the passkey rpId — WebAuthn requires the relying-party id to
 * equal or be a suffix of the page origin, so an invite that lands on another
 * host cannot sign anyone in.
 */
export const DEFAULT_INVITE_BASE = "https://chit-circle.vercel.app";
export const INVITE_SCHEME = "chitcircle";

/** Shareable https link. */
export function buildInviteLink(circleId: bigint, opts: InviteLinkOptions = {}): string {
  const base = (opts.baseUrl ?? DEFAULT_INVITE_BASE).replace(/\/+$/, "");
  const params = new URLSearchParams();
  if (opts.chainId !== undefined) params.set("chain", String(opts.chainId));
  if (opts.contract) params.set("at", opts.contract);
  const query = params.toString();
  return `${base}/c/${circleId}${query ? `?${query}` : ""}`;
}

/** Deep link, for handing off from the browser into the app. */
export function buildDeepLink(circleId: bigint, opts: Omit<InviteLinkOptions, "baseUrl"> = {}): string {
  const params = new URLSearchParams();
  if (opts.chainId !== undefined) params.set("chain", String(opts.chainId));
  if (opts.contract) params.set("at", opts.contract);
  const query = params.toString();
  return `${INVITE_SCHEME}://circle/${circleId}${query ? `?${query}` : ""}`;
}

/**
 * Parse either form. Returns null rather than throwing — an unparseable link is
 * an expected input, not an error worth a crash.
 */
export function parseInviteLink(link: string): InviteTarget | null {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }

  // https://host/c/<id>  or  chitcircle://circle/<id>
  const segments = url.pathname.split("/").filter(Boolean);
  let raw: string | undefined;

  if (url.protocol === `${INVITE_SCHEME}:`) {
    // Hosts and paths split differently across URL implementations for custom
    // schemes, so accept the id from either side.
    const parts = [url.hostname, ...segments].filter(Boolean);
    raw = parts[parts.length - 1];
    if (parts.length > 1 && parts[0] !== "circle") return null;
  } else if (url.protocol === "https:" || url.protocol === "http:") {
    const cIndex = segments.indexOf("c");
    if (cIndex === -1) return null;
    raw = segments[cIndex + 1];
  } else {
    return null;
  }

  if (!raw || !/^\d+$/.test(raw)) return null;

  const target: InviteTarget = { circleId: BigInt(raw) };

  const chain = url.searchParams.get("chain");
  if (chain && /^\d+$/.test(chain)) target.chainId = Number(chain);

  const at = url.searchParams.get("at");
  if (at && /^0x[0-9a-fA-F]{40}$/.test(at)) target.contract = at as `0x${string}`;

  return target;
}

/**
 * Guard an invite before acting on it: a link from another chain or another
 * deployment points at a different circle with the same number, which would
 * otherwise silently join the wrong group.
 */
export function checkInviteTarget(
  target: InviteTarget,
  expected: { chainId: number; contract: `0x${string}` },
): { ok: true } | { ok: false; reason: string } {
  if (target.chainId !== undefined && target.chainId !== expected.chainId) {
    return { ok: false, reason: `This invite is for chain ${target.chainId}, not ${expected.chainId}.` };
  }
  if (target.contract && target.contract.toLowerCase() !== expected.contract.toLowerCase()) {
    return { ok: false, reason: "This invite is for a different Chit Circle deployment." };
  }
  return { ok: true };
}
