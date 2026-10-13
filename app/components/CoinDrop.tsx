/**
 * A coin that drops into the pot when someone pays.
 *
 * It rises from below the pot card — the direction the roster sits — and
 * settles into it. Avatar-to-pot would be truer, but it needs the measured
 * screen position of a row inside a scroll view that is re-rendering at the
 * same moment, and on React Native Web that lands the coin in the wrong place
 * often enough to look broken. A coin arriving from where the people are says
 * the same thing and cannot miss.
 *
 * Purely decorative: the pot figure beside it already counts up, and the
 * member's chip already turns to "Paid". So it is the first thing dropped when
 * reduced motion is on.
 */
import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { useReducedMotion } from "../design/motion";
import { color, nativeDriver, radius, type } from "../design/tokens";

const TRAVEL = 86;
const DURATION_MS = 700;

export function CoinDrop({ at }: { at: number | null }) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (at === null || reduced) return;
    progress.setValue(0);
    const run = Animated.timing(progress, {
      toValue: 1,
      duration: DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: nativeDriver,
    });
    run.start();
    return () => run.stop();
  }, [at, reduced, progress]);

  if (at === null || reduced) return null;

  return (
    <View style={styles.layer} pointerEvents="none">
      <Animated.View
        style={[
          styles.coin,
          {
            opacity: progress.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [TRAVEL, -6] }) },
              { scale: progress.interpolate({ inputRange: [0, 0.8, 1], outputRange: [0.7, 1, 0.9] }) },
            ],
          },
        ]}
      >
        <Text style={styles.mark}>$</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  coin: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: color.highlight,
    alignItems: "center",
    justifyContent: "center",
  },
  mark: { ...type.labelStrong, color: color.ink },
});
