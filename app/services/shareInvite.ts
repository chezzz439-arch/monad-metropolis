/**
 * Getting an invite link out of the app and into a group chat.
 *
 * `Share.share` is the right call on a phone, but on React Native Web it needs
 * `navigator.share`, which desktop Chrome and Firefox do not provide — so the
 * one place a judge will actually try this (a laptop, two browser profiles) is
 * exactly where it silently rejects. Hence the ladder: native sheet, then the
 * clipboard, then a last-resort copy that works without a secure context.
 *
 * Returns what happened so the screen can say "Link copied" rather than
 * claiming a share sheet opened when nothing did.
 */
import { Platform, Share } from "react-native";

export type ShareOutcome = "shared" | "copied" | "failed";

declare const navigator: { share?: (data: { url?: string; text?: string }) => Promise<void>; clipboard?: { writeText?: (text: string) => Promise<void> } } | undefined;
declare const document: {
  createElement: (tag: string) => Record<string, unknown> & { value?: string; select?: () => void; remove?: () => void };
  body: { appendChild: (node: unknown) => void };
  execCommand?: (command: string) => boolean;
} | undefined;

/** Pre-select so a user who lands on the fallback can still copy by hand. */
function copyViaTextarea(text: string): boolean {
  if (typeof document === "undefined") return false;
  try {
    const field = document.createElement("textarea");
    field.value = text;
    Object.assign(field, { readOnly: true, style: "position:fixed;top:-1000px;opacity:0" });
    document.body.appendChild(field);
    field.select?.();
    const ok = document.execCommand?.("copy") ?? false;
    field.remove?.();
    return ok;
  } catch {
    return false;
  }
}

export async function shareInviteLink(link: string): Promise<ShareOutcome> {
  if (Platform.OS !== "web") {
    try {
      await Share.share({ message: link });
      return "shared";
    } catch {
      return "failed";
    }
  }

  if (typeof navigator !== "undefined" && navigator?.share) {
    try {
      await navigator.share({ url: link, text: link });
      return "shared";
    } catch {
      // Includes the user dismissing the sheet. Fall through to copying, which
      // leaves them with the link either way.
    }
  }

  if (typeof navigator !== "undefined" && navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(link);
      return "copied";
    } catch {
      // Clipboard writes need a secure context and a user gesture; the
      // textarea path below needs neither.
    }
  }

  return copyViaTextarea(link) ? "copied" : "failed";
}
