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
import { Button, ErrorNote, Logo, Screen } from "../components/ui";
import { color, nativeDriver, radius, space, type } from "../design/tokens";

const TRACK_WIDTH = 220;

export function SettingUpScreen({
  failed,
  onRetry,
  onContinue,
}: {
  failed: boolean;
  onRetry: () => void;
  onContinue: () => void;
}) {
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (failed) return;
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
  }, [slide, failed]);

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
