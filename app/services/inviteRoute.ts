/**
 * Picking up an invite from the address bar.
 *
 * The share flow is one link pasted into a family group chat, so the link has
 * to work for someone who has never opened this app: land on the circle, sign
 * up, and come back to the same circle. That means reading the invite before
 * there is any account, which is why this is a plain function over
 * `window.location` rather than a hook.
 *
 * Native deep links are not wired here. `chitcircle://` would need iOS
 * universal-link / Android app-link association files published on the domain,
 * which the team is not doing for this submission — see docs/concept.md §3. On
 * native this returns `none` and the paste-a-link sheet remains the way in.
 */
import { Platform } from "react-native";
import { checkInviteTarget, parseInviteLink, type InviteTarget } from "../../sdk/src/invite";

export type InviteRoute =
  | { kind: "none" }
  /** A link we understood, pointing at this deployment. */
  | { kind: "ready"; target: InviteTarget }
  /** Something was clearly meant as an invite but cannot be used. */
  | { kind: "unusable"; message: string };

/** Looks like an attempt at an invite path, even if it does not parse. */
const INVITE_PATH = /^\/c(\/|$)/;

/**
 * Read the invite the page was opened with, if any.
 *
 * @param expected the deployment the app is pointed at, so a link from an old
 *        build is refused rather than opening the wrong circle.
 */
export function readInviteFromUrl(expected: {
  chainId: number;
  contract: `0x${string}`;
}): InviteRoute {
  if (Platform.OS !== "web" || typeof window === "undefined" || !window.location) {
    return { kind: "none" };
  }

  const { href, pathname } = window.location;
  const target = parseInviteLink(href);

  if (!target) {
    // Distinguish "no invite" from "a broken invite": a visitor who tapped a
    // truncated link needs to be told, and someone opening the site normally
    // must not see an error about a link they never used.
    return INVITE_PATH.test(pathname)
      ? {
          kind: "unusable",
          message: "That invite link looks incomplete. Ask whoever sent it to share it again.",
        }
      : { kind: "none" };
  }

  // checkInviteTarget's own reasons name the chain id and the contract, which
  // the copy rules keep out of the UI, so only its verdict is used here.
  if (!checkInviteTarget(target, expected).ok) {
    return {
      kind: "unusable",
      message: "That invite was made with a different version of Chit Circle and cannot be opened here.",
    };
  }

  return { kind: "ready", target };
}

/**
 * Drop the invite from the address bar once it has been handled.
 *
 * Without this, "back to your circles" followed by a refresh silently drops
 * the visitor back into the circle they just left. Deliberately called only
 * after the circle is on screen: the passkey ceremony does not navigate, so
 * the invite has to survive sign-up, and a visitor whose first attempt fails
 * can still reload and try again.
 */
export function clearInviteFromUrl(): void {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  if (!window.history?.replaceState || !INVITE_PATH.test(window.location.pathname)) return;
  window.history.replaceState(null, "", "/");
}
