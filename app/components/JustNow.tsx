/**
 * "Just now" — proof that the screen is live, shown only when it is true.
 *
 * It appears when another member's payment or settlement arrives, and fades
 * out a few seconds later. The point is not decoration: without it a circle
 * that updates by itself is indistinguishable from one that happened to be
 * right, and the thing worth noticing — someone else just paid — passes
 * silently. It never announces your own actions back to you.
 */
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text } from "react-native";
import { useReducedMotion } from "../design/motion";
import { color, nativeDriver, radius, space, type } from "../design/tokens";

const VISIBLE_MS = 3200;
const FADE_MS = 260;

export function JustNow({ at, label = "Just now" }: { at: number | null; label?: string }) {
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (at === null) return;
    setMounted(true);

    // Reduced motion still gets the message — it just arrives and leaves
    // instead of fading. Removing the words entirely would take information
    // away from the people who asked for less movement, not less content.
    if (reduced) {
      opacity.setValue(1);
      const hide = setTimeout(() => setMounted(false), VISIBLE_MS);
      return () => clearTimeout(hide);
    }

    const show = Animated.sequence([
      Animated.timing(opacity, {
        toValue: 1,
        duration: FADE_MS,
        easing: Easing.out(Easing.ease),
        useNativeDriver: nativeDriver,
      }),
      Animated.delay(VISIBLE_MS),
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_MS,
        easing: Easing.in(Easing.ease),
        useNativeDriver: nativeDriver,
      }),
    ]);
    show.start(({ finished }) => finished && setMounted(false));
    return () => show.stop();
  }, [at, reduced, opacity]);

  if (!mounted) return null;

  return (
    <Animated.View style={[styles.pill, { opacity }]} pointerEvents="none">
      <Text style={styles.text}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "center",
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: color.highlightSoft,
    marginTop: space.sm,
  },
  text: { ...type.label, color: color.due },
});
