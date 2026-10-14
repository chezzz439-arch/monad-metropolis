/**
 * Sending money to someone in your circles.
 *
 * Picking a face is the whole design: nobody in the target audience wants to
 * check a long string of characters before sending money to their cousin.
 * Typing one in is still possible, folded away for the case the app cannot
 * cover — someone you have not shared a circle with yet.
 */
import { useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { isAddress, type Address } from "viem";
import { parseAmount, useMyCircles, useSendToMember, useTokenBalance } from "../../sdk/src/index";
import { Avatar, Button, Card, ErrorNote, Field, SectionTitle, Skeleton, TextField } from "../components/ui";
import { SuccessScreen, type Celebration } from "./SuccessScreen";
import { color, radius, space, tap, type } from "../design/tokens";
import { friendlyError, money, personName } from "../design/copy";

const QUICK_AMOUNTS = ["25", "50", "100"];

interface SendReceiveScreenProps {
  tokenAddress: Address;
  myAccount: Address;
  faucetAddress?: Address;
  recipientDefault?: Address;
  readOnly?: boolean;
}

export function SendReceiveScreen({
  tokenAddress,
  myAccount,
  faucetAddress,
  recipientDefault,
  readOnly = false,
}: SendReceiveScreenProps) {
  const [picked, setPicked] = useState<Address | null>(recipientDefault ?? null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState("");
  const [amount, setAmount] = useState("");
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const { data: balance, loading: balanceLoading } = useTokenBalance(tokenAddress, myAccount);
  const { data: circles } = useMyCircles(myAccount);
  const { run: send, pending, error } = useSendToMember();

  /** Everyone you share a circle with, each listed once. */
  const people = useMemo(() => {
    const seen = new Map<string, { address: Address; name: string }>();
    for (const circle of circles ?? []) {
      circle.members.forEach((member, index) => {
        if (member.toLowerCase() === myAccount.toLowerCase()) return;
        if (seen.has(member.toLowerCase())) return;
        seen.set(member.toLowerCase(), { address: member, name: personName(member, index, myAccount) });
      });
    }
    return [...seen.values()];
  }, [circles, myAccount]);

  const recipient: Address | null = manualOpen
    ? isAddress(manual.trim())
      ? (manual.trim() as Address)
      : null
    : picked;
  const recipientName = recipient
    ? (people.find((p) => p.address.toLowerCase() === recipient.toLowerCase())?.name ?? "them")
    : null;

  let parsed: bigint | null = null;
  try {
    parsed = amount.trim() ? parseAmount(amount.trim()) : null;
  } catch {
    parsed = null;
  }
  const ready = Boolean(recipient && parsed && parsed > 0n && !readOnly);

  const handleSend = async () => {
    if (!recipient || !parsed) return;
    setProblem(null);
    if (balance !== null && parsed > balance) {
      setProblem("That is more than you have. Try a smaller amount.");
      return;
    }
    const result = await send(tokenAddress, recipient, parsed);
    if (!result) return;
    setCelebration({
      title: `Sent ${money(parsed)}`,
      body: `${recipientName === "them" ? "It is on its way" : `${recipientName} has it`} already.`,
      settledInSeconds: result.settledInSeconds,
      reference: result.hash,
    });
    setAmount("");
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.balance}>
          <Text style={styles.balanceLabel}>Your balance</Text>
          {balanceLoading && balance === null ? (
            <Skeleton width={160} height={44} style={{ marginTop: space.sm }} />
          ) : (
            <Text style={styles.balanceValue}>{balance === null ? "—" : money(balance)}</Text>
          )}
          <Text style={styles.balanceUnit}>USD</Text>
        </View>

        {!manualOpen ? (
          <View style={styles.block}>
            <SectionTitle>Send to</SectionTitle>
            {people.length === 0 ? (
              <Card>
                <Text style={styles.emptyPeople}>
                  People you share a circle with will show up here. Join or start a circle first.
                </Text>
              </Card>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.people}>
                {people.map((person) => {
                  const active = picked?.toLowerCase() === person.address.toLowerCase();
                  return (
                    <Pressable
                      key={person.address}
                      onPress={() => setPicked(active ? null : person.address)}
                      style={[styles.person, active && styles.personActive]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`Send to ${person.name}`}
                    >
                      <Avatar name={person.name} size={56} tone={active ? "brand" : "neutral"} />
                      <Text style={[styles.personName, active && styles.personNameActive]} numberOfLines={1}>
                        {person.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        ) : (
          <View style={styles.block}>
            <Field label="Their account ID" hint="Ask them to copy it from their account screen.">
              <TextField
                value={manual}
                onChangeText={setManual}
                placeholder="Paste it here"
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Recipient account ID"
              />
            </Field>
          </View>
        )}

        <Pressable
          onPress={() => setManualOpen((open) => !open)}
          style={styles.switcher}
          accessibilityRole="button"
        >
          <Text style={styles.switcherText}>
            {manualOpen ? "Pick from your circles instead" : "Send to someone not in your circles"}
          </Text>
        </Pressable>

        <View style={styles.block}>
          <SectionTitle>Amount</SectionTitle>
          <View style={styles.amountRow}>
            <Text style={styles.amountCurrency}>$</Text>
            <TextField
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              keyboardType="decimal-pad"
              editable={!readOnly}
              accessibilityLabel="Amount to send"
              style={styles.amountInput}
            />
          </View>
          <View style={styles.quick}>
            {QUICK_AMOUNTS.map((value) => (
              <Pressable
                key={value}
                onPress={() => setAmount(value)}
                style={[styles.quickChip, amount === value && styles.quickChipActive]}
                accessibilityRole="button"
              >
                <Text style={[styles.quickText, amount === value && styles.quickTextActive]}>${value}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {problem || error ? (
          <View style={styles.block}>
            <ErrorNote
              message={problem ?? friendlyError(error)}
              onRetry={problem ? undefined : () => void handleSend()}
            />
          </View>
        ) : null}

        <Button
          label={
            parsed && recipientName && recipientName !== "them"
              ? `Send ${money(parsed)} to ${recipientName}`
              : parsed
                ? `Send ${money(parsed)}`
                : "Send"
          }
          onPress={() => void handleSend()}
          loading={pending}
          disabled={!ready}
        />
        <Text style={styles.confirmNote}>You will confirm with your face or fingerprint.</Text>

        {faucetAddress ? (
          <Pressable
            onPress={() => void Linking.openURL(`https://testnet.monadscan.com/address/${faucetAddress}#code`)}
            style={styles.topUp}
            accessibilityRole="link"
          >
            <Text style={styles.topUpText}>Add funds</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <SuccessScreen celebration={celebration} onDone={() => setCelebration(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.xl, paddingBottom: space.huge },

  balance: {
    backgroundColor: color.brand,
    borderRadius: radius.xl,
    padding: space.xxl,
    marginBottom: space.xxl,
  },
  balanceLabel: { ...type.label, color: "#A9BBD6" },
  balanceValue: { ...type.hero, color: color.onBrand, marginTop: space.xs },
  balanceUnit: { ...type.caption, color: "#A9BBD6", marginTop: space.xs },

  block: { marginBottom: space.xl },
  emptyPeople: { ...type.body, color: color.inkMuted },

  people: { gap: space.lg, paddingRight: space.xl },
  person: { alignItems: "center", width: 76, gap: space.sm, paddingVertical: space.sm, borderRadius: radius.md },
  personActive: { backgroundColor: color.brandSoft },
  personName: { ...type.label, color: color.inkMuted, maxWidth: 72, textAlign: "center" },
  personNameActive: { color: color.brand, fontWeight: "700" },

  switcher: { minHeight: tap.min, justifyContent: "center", marginBottom: space.sm },
  switcherText: { ...type.label, color: color.brand, textDecorationLine: "underline" },

  amountRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  amountCurrency: { ...type.display, color: color.inkMuted },
  amountInput: { flex: 1, minWidth: 0, minHeight: 64, ...type.display, color: color.ink },
  quick: { flexDirection: "row", gap: space.md, marginTop: space.lg },
  quickChip: {
    minHeight: tap.min,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    alignItems: "center",
    justifyContent: "center",
  },
  quickChipActive: { backgroundColor: color.brand, borderColor: color.brand },
  quickText: { ...type.bodyStrong, color: color.inkMuted },
  quickTextActive: { color: color.onBrand },

  confirmNote: { ...type.label, color: color.inkFaint, textAlign: "center", marginTop: space.md },
  topUp: { minHeight: tap.min, alignItems: "center", justifyContent: "center", marginTop: space.xl },
  topUpText: { ...type.label, color: color.inkFaint, textDecorationLine: "underline" },
});
