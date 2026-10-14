/**
 * The pause between "confirm with your face" and the first circle.
 *
 * Behind it, the new account is being made ready to spend. That is plumbing
 * the user did not ask about and should never have to think about, so the
 * screen says only that something is being set up, and keeps moving so the
 * wait does not feel stalled.
 */
import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import type { DollarOutcome } from "../../sdk/src/index";
import { Button, ErrorNote, Logo, Screen } from "../components/ui";
import { money } from "../design/copy";
import { color, nativeDriver, radius, space, type } from "../design/tokens";

const TRACK_WIDTH = 220;
/** Long enough to read one short sentence, short enough not to feel stuck. */
const READY_PAUSE_MS = 2600;

/**
 * What to say about the test dollars once setup is done.
 *
 * Only the dry case is worth a hedge. "We could not add test dollars" is a
 * sentence someone can act on — ask a teammate to send some — whereas the
 * underlying failures (an empty dripper, a refused RPC) name things the team
 * guide keeps off the screen entirely.
 */
function dollarLine(dollars: DollarOutcome): { title: string; body: string } {
  switch (dollars.kind) {
    case "granted":
      return {
        title: `You have ${money(dollars.balance)} to try this with`,
        body: "It is practice money on a test network — not real dollars.",
      };
    case "already-funded":
      return {
        title: `You have ${money(dollars.balance)}`,
        body: "It is practice money on a test network — not real dollars.",
      };
    default:
      return {
        title: "Your account is ready",
        body: "We could not add practice money right now. You can still look around, and anyone in your circle can send you some.",
      };
  }
}

export function SettingUpScreen({
  failed,
  ready,
  onRetry,
  onContinue,
}: {
  failed: boolean;
  /** Present once funding finished; the screen then shows what landed. */
  ready?: DollarOutcome;
  onRetry: () => void;
  onContinue: () => void;
}) {
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (failed || ready) return;
    const loop = Animated.loop(
      Animated.timing(slide, {
        toValue: 1,
        duration: 1400,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: nativeDriver,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [slide, failed, ready]);

  // Shown, not waited on: the balance is worth seeing, but making someone tap
  // past it adds a step to a flow whose whole point is that there are none.
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(onContinue, READY_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [ready, onContinue]);

  const translateX = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [-TRACK_WIDTH * 0.55, TRACK_WIDTH],
  });

  return (
    <Screen>
      <View style={styles.content}>
        <Logo size={116} />
        {failed ? (
          <>
            <Text style={styles.title}>Almost there</Text>
            <View style={styles.errorWrap}>
              <ErrorNote
                message="We could not finish setting up your account just yet."
                onRetry={onRetry}
              />
            </View>
            <Button label="Continue anyway" variant="ghost" onPress={onContinue} />
          </>
        ) : ready ? (
          <>
            <Text style={styles.title}>{dollarLine(ready).title}</Text>
            <Text style={styles.body}>{dollarLine(ready).body}</Text>
            <Button label="Continue" onPress={onContinue} />
          </>
        ) : (
          <>
            <Text style={styles.title}>Setting up your account…</Text>
            <View style={styles.track}>
              <Animated.View style={[styles.bar, { transform: [{ translateX }] }]} />
            </View>
            <Text style={styles.body}>This takes a few seconds. You only do it once.</Text>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xxl,
    gap: space.xl,
  },
  title: { ...type.title, color: color.ink, textAlign: "center" },
  track: {
    width: TRACK_WIDTH,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: color.sunken,
    overflow: "hidden",
  },
  bar: {
    width: TRACK_WIDTH * 0.55,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: color.brand,
  },
  body: { ...type.body, color: color.inkMuted, textAlign: "center", maxWidth: 280 },
  errorWrap: { alignSelf: "stretch" },
});
