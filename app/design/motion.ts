/**
 * Whether to animate at all.
 *
 * Motion in this app is never the only carrier of meaning — a coin flying into
 * the pot restates a number that is already on screen, and the chip that turns
 * green says "Paid" in words. So honouring the system setting costs nothing
 * except the flourish, and animation that ignores it can make people
 * genuinely unwell. Vestibular disorders are not a preference.
 */
import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";

/** The web media query, which React Native Web does not wire into AccessibilityInfo. */
function webPrefersReduced(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => (Platform.OS === "web" ? webPrefersReduced() : false));

  useEffect(() => {
    let active = true;

    if (Platform.OS === "web") {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      const onChange = () => active && setReduced(query.matches);
      onChange();
      // Safari below 14 only has the deprecated listener API, and the demo may
      // be opened on whatever phone is in someone's pocket.
      if (typeof query.addEventListener === "function") {
        query.addEventListener("change", onChange);
        return () => {
          active = false;
          query.removeEventListener("change", onChange);
        };
      }
      query.addListener(onChange);
      return () => {
        active = false;
        query.removeListener(onChange);
      };
    }

    void AccessibilityInfo.isReduceMotionEnabled().then((on) => active && setReduced(on));
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (on) => active && setReduced(on));
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
