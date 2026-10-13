/**
 * Starting a circle.
 *
 * Four decisions, phrased the way they get made at a kitchen table: what are
 * we calling it, how much each time, how many of us, how often. The summary
 * line underneath does the multiplication out loud, because "$500 pot" is the
 * number people actually agree on.
 */
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Address } from "viem";
import { parseAmount, useCreateCircle } from "../../sdk/src/index";
import { Button, ErrorNote, Field, TextField } from "../components/ui";
import { color, radius, space, tap, type } from "../design/tokens";
import { friendlyError, money } from "../design/copy";
import { rememberCircleName } from "../services/circleNames";

/**
 * Round lengths as choices, not a number of seconds.
 *
 * The 2-minute option exists so a circle can be created, filled, paid and
 * settled inside a demo; it is first because that is the one being reached for
 * on stage. Nobody running a real savings circle is typing "604800".
 */
const CADENCES = [
  { label: "2 min (demo)", hint: "A round every 2 minutes — good for trying it out", seconds: 120n },
  { label: "1 week", hint: "A round every week", seconds: 604_800n },
  { label: "1 month", hint: "A round every 30 days", seconds: 2_592_000n },
];

export function CreateCircleScreen({
  tokenAddress,
  onClose,
  onCreated,
}: {
  tokenAddress: Address;
  onClose: () => void;
  onCreated: (circleId: bigint) => void;
}) {
  const create = useCreateCircle();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("100");
  const [members, setMembers] = useState(5);
  const [cadence, setCadence] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);

  let contribution: bigint | null = null;
  try {
    contribution = amount.trim() ? parseAmount(amount.trim()) : null;
  } catch {
    contribution = null;
  }
  // A name is optional: unnamed circles show as "Circle #3", which is a fine
  // thing to say out loud. Blocking Create on a text field nobody has to fill
  // in is friction with nothing behind it.
  const ready = Boolean(contribution && contribution > 0n);

  const submit = async () => {
    if (!contribution) return;
    setProblem(null);
    const result = await create.run({
      token: tokenAddress,
      contribution,
      maxMembers: members,
      roundSeconds: CADENCES[cadence]!.seconds,
    });
    if (!result) return;

    // `result.circleId` comes from the CircleCreated log in this transaction's
    // own receipt. Reading nextCircleId() before sending — which is what this
    // used to do — hands back whatever id was next at that moment, so another
    // member creating a circle in the same couple of seconds would send the
    // organizer into a stranger's circle.
    await rememberCircleName(result.circleId, name);
    onCreated(result.circleId);
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>Start a circle</Text>
          <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={styles.closeGlyph}>×</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Field label="What are you calling it?" hint="Optional — it will show as Circle #3 if you skip it.">
            <TextField
              value={name}
              onChangeText={setName}
              placeholder="Sunday Table"
              accessibilityLabel="Circle name"
            />
          </Field>

          <Field label="How much each round?">
            <View style={styles.amountRow}>
              <Text style={styles.amountCurrency}>$</Text>
              <TextField
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                accessibilityLabel="Amount each round"
                style={styles.amountInput}
              />
            </View>
          </Field>

          <Field label="How many people?">
            <View style={styles.stepper}>
              <Pressable
                onPress={() => setMembers((n) => Math.max(2, n - 1))}
                style={styles.stepButton}
                accessibilityRole="button"
                accessibilityLabel="One fewer person"
              >
                <Text style={styles.stepGlyph}>−</Text>
              </Pressable>
              <Text style={styles.stepValue}>{members}</Text>
              <Pressable
                onPress={() => setMembers((n) => Math.min(20, n + 1))}
                style={styles.stepButton}
                accessibilityRole="button"
                accessibilityLabel="One more person"
              >
                <Text style={styles.stepGlyph}>+</Text>
              </Pressable>
            </View>
          </Field>

          <Field label="How often?" hint={CADENCES[cadence]!.hint}>
            <View style={styles.cadences}>
              {CADENCES.map((option, index) => {
                const active = index === cadence;
                return (
                  <Pressable
                    key={option.label}
                    onPress={() => setCadence(index)}
                    style={[styles.cadence, active && styles.cadenceActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.cadenceLabel, active && styles.cadenceLabelActive]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          <View style={styles.summary}>
            <Text style={styles.summaryLine}>
              {members} people × {contribution ? money(contribution) : "$0"} ={" "}
              <Text style={styles.summaryStrong}>
                {contribution ? money(contribution * BigInt(members)) : "$0"} pot
              </Text>
            </Text>
            <Text style={styles.summaryBody}>
              Each round one person takes the pot, until everyone has had a turn. Everyone sets aside{" "}
              {contribution ? money(contribution) : "$0"} as a deposit when they join, and gets it back at the end.
            </Text>
          </View>

          {problem || create.error ? (
            <View style={styles.error}>
              <ErrorNote message={problem ?? friendlyError(create.error)} />
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <Button label="Create circle" onPress={() => void submit()} loading={create.pending} disabled={!ready} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.canvas },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.xxl,
    paddingTop: space.huge,
    paddingBottom: space.lg,
  },
  title: { ...type.title, color: color.ink },
  close: { width: tap.min, height: tap.min, alignItems: "center", justifyContent: "center", marginRight: -space.md },
  closeGlyph: { fontSize: 30, lineHeight: 34, color: color.inkMuted },
  content: { paddingHorizontal: space.xxl, paddingBottom: space.xxl },

  amountRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  amountCurrency: { ...type.title, color: color.inkMuted },
  amountInput: { flex: 1, minWidth: 0, ...type.title, color: color.ink },

  stepper: { flexDirection: "row", alignItems: "center", gap: space.xl },
  stepButton: {
    width: tap.primary,
    height: tap.primary,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    alignItems: "center",
    justifyContent: "center",
  },
  stepGlyph: { fontSize: 26, lineHeight: 30, color: color.brand, fontWeight: "700" },
  stepValue: { ...type.title, color: color.ink, minWidth: 40, textAlign: "center" },

  cadences: { flexDirection: "row", gap: space.sm },
  cadence: {
    flex: 1,
    minHeight: tap.primary,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    paddingHorizontal: space.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  cadenceActive: { backgroundColor: color.brand, borderColor: color.brand },
  cadenceLabel: { ...type.label, fontWeight: "700", color: color.ink },
  cadenceLabelActive: { color: color.onBrand },

  summary: {
    backgroundColor: color.brandSoft,
    borderRadius: radius.lg,
    padding: space.xl,
    gap: space.sm,
  },
  summaryLine: { ...type.subtitle, color: color.ink },
  summaryStrong: { color: color.brand, fontWeight: "700" },
  summaryBody: { ...type.body, color: color.inkMuted },

  error: { marginTop: space.xl },
  footer: { paddingHorizontal: space.xxl, paddingTop: space.lg, paddingBottom: space.huge },
});
