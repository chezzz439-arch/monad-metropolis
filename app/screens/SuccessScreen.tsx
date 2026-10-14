/**
 * The moment something worked.
 *
 * Two things earn the space here: the amount, and how long it took. The
 * second one is the whole argument for building this on Monad rather than a
 * bank transfer, so it gets the marigold pill rather than a footnote.
 *
 * The receipt is the only place in the app allowed to show a confirmation
 * reference, and it stays folded away until someone asks for it.
 */
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "../components/ui";
import { color, nativeDriver, radius, space, tap, type } from "../design/tokens";
import { settledIn } from "../design/copy";

export interface Celebration {
  /** The headline. "You received $400". */
  title: string;
  /** One supporting sentence, when the headline needs context. */
  body?: string;
  /** The round's defaulter story, when there is one. The demo's centrepiece. */
  missed?: string;
  settledInSeconds: number;
  reference: string;
}

export function SuccessScreen({
  celebration,
  onDone,
}: {
  celebration: Celebration | null;
  onDone: () => void;
}) {
  const [receiptOpen, setReceiptOpen] = useState(false);
  const pop = useRef(new Animated.Value(0.88)).current;

  useEffect(() => {
    if (!celebration) return;
    setReceiptOpen(false);
    pop.setValue(0.88);
    Animated.timing(pop, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.back(1.6)),
      useNativeDriver: nativeDriver,
    }).start();
  }, [celebration, pop]);

  if (!celebration) return null;

  const explorer = `https://testnet.monadscan.com/tx/${celebration.reference}`;

  return (
    <Modal visible animationType="fade" onRequestClose={onDone}>
      <View style={styles.root}>
        <View style={styles.body}>
          <Animated.View style={[styles.tick, { transform: [{ scale: pop }] }]}>
            <Text style={styles.tickGlyph}>✓</Text>
          </Animated.View>

          <Animated.Text style={[styles.title, { transform: [{ scale: pop }] }]}>
            {celebration.title}
          </Animated.Text>

          <View style={styles.timerPill}>
            <Text style={styles.timerText}>{settledIn(celebration.settledInSeconds)}</Text>
          </View>

          {celebration.body ? <Text style={styles.supporting}>{celebration.body}</Text> : null}

          {celebration.missed ? (
            <View style={styles.missedCard}>
              <Text style={styles.missedText}>{celebration.missed}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.footer}>
          {receiptOpen ? (
            <View style={styles.receipt}>
              <Text style={styles.receiptLabel}>Confirmation reference</Text>
              <Text style={styles.receiptValue} selectable>
                {celebration.reference}
              </Text>
              <Pressable
                onPress={() => void Linking.openURL(explorer)}
                style={styles.receiptLink}
                accessibilityRole="link"
              >
                <Text style={styles.receiptLinkText}>Open full record</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => setReceiptOpen(true)}
              style={styles.receiptToggle}
              accessibilityRole="button"
            >
              <Text style={styles.receiptToggleText}>View receipt</Text>
            </Pressable>
          )}
          <Button label="Done" onPress={onDone} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.canvas, paddingHorizontal: space.xxl, paddingVertical: space.huge },
  body: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.xl },

  tick: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: color.paidSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  tickGlyph: { fontSize: 42, lineHeight: 48, color: color.paid, fontWeight: "700" },

  title: { ...type.hero, color: color.ink, textAlign: "center" },

  timerPill: {
    backgroundColor: color.highlightSoft,
    borderRadius: radius.pill,
    paddingHorizontal: space.xl,
    minHeight: 40,
    justifyContent: "center",
  },
  timerText: { ...type.bodyStrong, color: color.due },

  supporting: { ...type.body, color: color.inkMuted, textAlign: "center", maxWidth: 300 },

  missedCard: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.line,
    borderLeftWidth: 5,
    borderLeftColor: color.highlight,
    padding: space.xl,
    marginTop: space.sm,
  },
  missedText: { ...type.body, color: color.ink },

  footer: { gap: space.md },
  receiptToggle: { minHeight: tap.min, alignItems: "center", justifyContent: "center" },
  receiptToggleText: { ...type.label, color: color.inkFaint, textDecorationLine: "underline" },
  receipt: {
    backgroundColor: color.sunken,
    borderRadius: radius.md,
    padding: space.lg,
    gap: space.xs,
  },
  receiptLabel: { ...type.caption, color: color.inkFaint },
  receiptValue: { ...type.label, color: color.inkMuted },
  receiptLink: { minHeight: tap.min, justifyContent: "center" },
  receiptLinkText: { ...type.labelStrong, color: color.brand, textDecorationLine: "underline" },
});
