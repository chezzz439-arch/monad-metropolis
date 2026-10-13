/**
 * The design system. Every colour, space, radius and text style in the app
 * comes from here.
 *
 * The palette is taken from the Chit Circle logo — navy, marigold and cream —
 * so the product and the mark read as one thing. Navy is the single accent:
 * it carries every primary action. Marigold is the celebration colour and is
 * rationed to the moments that deserve it (your turn, a payout landing).
 * The three status colours exist only inside member chips, where "paid" and
 * "missed" have to be told apart at a glance.
 */
import { Platform, type TextStyle } from "react-native";

export const color = {
  /** Page background — warm paper, the logo's own backdrop. */
  canvas: "#FBF8F3",
  surface: "#FFFFFF",
  /** For wells and tracks that sit on `surface`. */
  sunken: "#F4F0E9",

  /** The accent. Primary buttons, selected states, links. */
  brand: "#15325E",
  brandPressed: "#0E2446",
  brandSoft: "#E8EDF5",
  onBrand: "#FFFFFF",

  /** Celebration only. Never a button the user has to find. */
  highlight: "#E5A93A",
  highlightSoft: "#FCF1DC",

  ink: "#16202C",
  inkMuted: "#5B6673",
  /** Lowest text colour that still clears 4.5:1 on canvas. */
  inkFaint: "#767F8B",
  line: "#E8E1D6",

  paid: "#216B4D",
  paidSoft: "#E2F0E9",
  due: "#8A5D0F",
  dueSoft: "#FBF0D8",
  missed: "#AF4430",
  missedSoft: "#FBE6E1",
} as const;

/** 4-point scale. Use these, not literals. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

/** Big enough for a thumb on a 390px screen, everywhere, no exceptions. */
export const tap = { min: 48, primary: 56 } as const;

/**
 * React Native Web has no native animated module, and asking for one logs a
 * paragraph to the console on every animated mount. The web build is what a
 * judge opens, so it animates on the JS thread quietly instead.
 */
export const nativeDriver = Platform.OS !== "web";

/**
 * React Native Web falls back to a serif-ish default on some browsers, which
 * makes a finance app look like a document. Naming the system stack keeps the
 * web build looking like the native one.
 */
const family = Platform.select({
  web: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  default: undefined,
});

const font = (
  size: number,
  lineHeight: number,
  weight: TextStyle["fontWeight"],
  letterSpacing = 0,
): TextStyle => ({ fontFamily: family, fontSize: size, lineHeight, fontWeight: weight, letterSpacing });

/** Body is 17px: the spec floor is 16, and one point of headroom reads calmer. */
export const type = {
  hero: font(44, 48, "700", -1.2),
  display: font(34, 40, "700", -0.8),
  title: font(26, 32, "700", -0.4),
  heading: font(20, 26, "700", -0.2),
  subtitle: font(18, 24, "600"),
  body: font(17, 25, "400"),
  bodyStrong: font(17, 25, "600"),
  label: font(15, 21, "500"),
  labelStrong: font(15, 21, "700"),
  caption: font(13, 18, "600", 0.2),
} as const;

/**
 * One soft shadow, used on cards and sheets. Heavier elevation reads as a
 * dev-tool modal; this is just enough to lift a card off the paper.
 */
export const shadow = Platform.select({
  web: { boxShadow: "0 1px 2px rgba(22, 32, 44, 0.04), 0 8px 24px rgba(22, 32, 44, 0.06)" } as object,
  ios: {
    shadowColor: "#16202C",
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  default: { elevation: 2 },
}) as object;
