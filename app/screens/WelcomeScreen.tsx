/**
 * The first thing anyone sees.
 *
 * One promise, one button. Everything that could be explained here is
 * explained better by the first circle, so the only job is to make the next
 * tap obvious. A returning member gets the emphasis flipped — signing in is
 * what they came for.
 */
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, ErrorNote, Logo, Screen } from "../components/ui";
import { color, space, type } from "../design/tokens";

const PROMISES = [
  "Nobody holds the money — not even us.",
  "Everyone pays in, everyone takes a turn.",
  "Miss a round and your deposit covers the group.",
];

export function WelcomeScreen({
  returning,
  busy,
  error,
  invited = false,
  onGetStarted,
  onSignIn,
}: {
  returning: boolean;
  busy: boolean;
  error: string | null;
  /**
   * Arrived on an invite link. The circle is already waiting on the other side
   * of sign-up, so the page says what they came for instead of pitching the
   * product to someone a relative has already sold it to.
   */
  invited?: boolean;
  onGetStarted: () => void;
  onSignIn: () => void;
}) {
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Logo size={invited ? 120 : 168} />
          {invited ? (
            <>
              <Text style={styles.invited}>You have been invited to a savings circle</Text>
              <Text style={styles.invitedBody}>
                Set up your account and we will take you straight to it.
              </Text>
            </>
          ) : (
            <Text style={styles.promise}>Savings circles where no one can run off with the pot</Text>
          )}
        </View>

        <View style={styles.points}>
          {PROMISES.map((line) => (
            <View key={line} style={styles.point}>
              <View style={styles.bullet} />
              <Text style={styles.pointText}>{line}</Text>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          {error ? <ErrorNote message={error} /> : null}
          {returning ? (
            <>
              <Button label="Sign in" onPress={onSignIn} loading={busy} />
              <Button label="Start a new account" variant="ghost" onPress={onGetStarted} disabled={busy} />
            </>
          ) : (
            <>
              <Button label={invited ? "Set up my account" : "Get started"} onPress={onGetStarted} loading={busy} />
              <Button label="I already have an account" variant="ghost" onPress={onSignIn} disabled={busy} />
            </>
          )}
          <Text style={styles.footnote}>
            Your face or fingerprint is all you need. Nothing to remember, nothing to write down.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: space.xxl,
    paddingTop: space.xxl,
    paddingBottom: space.xxl,
    justifyContent: "space-between",
  },
  hero: { alignItems: "center" },
  promise: {
    ...type.display,
    color: color.ink,
    textAlign: "center",
    marginTop: space.lg,
    maxWidth: 330,
  },
  invited: {
    ...type.title,
    color: color.ink,
    textAlign: "center",
    marginTop: space.lg,
    maxWidth: 320,
  },
  invitedBody: {
    ...type.body,
    color: color.inkMuted,
    textAlign: "center",
    marginTop: space.sm,
    maxWidth: 300,
  },
  points: { gap: space.lg, marginVertical: space.xxl, paddingHorizontal: space.xs },
  point: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  bullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: color.highlight,
    marginTop: 8,
  },
  pointText: { ...type.body, color: color.inkMuted, flex: 1 },
  actions: { gap: space.md },
  footnote: {
    ...type.label,
    color: color.inkFaint,
    textAlign: "center",
    marginTop: space.xs,
  },
});
