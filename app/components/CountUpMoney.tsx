/**
 * A money figure that counts up to its new value instead of jumping.
 *
 * The pot is the number everyone in the room is watching, and a silent jump
 * from $100 to $200 is easy to miss — especially on a projector, where the
 * person talking is not the person looking. Counting draws the eye to the
 * thing that changed, and lands on the exact figure.
 *
 * It only animates upward. A pot going back to $0 is a payout, which has its
 * own, louder treatment; sliding down to zero would read as money draining
 * away rather than money being handed to someone.
 */
import { useEffect, useRef, useState } from "react";
import { Text, type TextStyle, type StyleProp } from "react-native";
import { useReducedMotion } from "../design/motion";
import { money } from "../design/copy";

const DURATION_MS = 900;
const FRAME_MS = 50;

export function CountUpMoney({
  value,
  style,
}: {
  value: bigint;
  style?: StyleProp<TextStyle>;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    if (value === shown) return;

    // Down, or motion turned off: take the new number as it is.
    if (reduced || value < shown) {
      from.current = value;
      setShown(value);
      return;
    }

    const start = Date.now();
    const begin = from.current = shown;
    const span = value - begin;

    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / DURATION_MS);
      // Ease out: fast enough to feel responsive, slow at the end so the
      // final figure is readable rather than snapping past.
      const eased = 1 - (1 - t) * (1 - t);
      const next = begin + (span * BigInt(Math.round(eased * 1000))) / 1000n;
      setShown(t >= 1 ? value : next);
      if (t >= 1) clearInterval(id);
    }, FRAME_MS);

    return () => clearInterval(id);
  }, [value, shown, reduced]);

  return <Text style={style}>{money(shown)}</Text>;
}
