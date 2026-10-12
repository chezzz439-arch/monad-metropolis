import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import type { Address } from "viem";
import { useChitClient, useCreateCircle } from "../../sdk/src/hooks";
import { parseAmount } from "../../sdk/src/format";

export function CreateCircleScreen({
  tokenAddress,
  onClose,
  onCreated,
}: {
  tokenAddress: Address;
  onClose: () => void;
  onCreated: (circleId: bigint) => void;
}) {
  const client = useChitClient();
  const create = useCreateCircle();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("100");
  const [members, setMembers] = useState("5");
  const [roundSeconds, setRoundSeconds] = useState("120");

  const submit = async () => {
    const memberCount = Number(members);
    const duration = Number(roundSeconds);
    if (!name.trim() || !Number.isInteger(memberCount) || memberCount < 2 || memberCount > 20 || !Number.isInteger(duration) || duration < 1) return;

    let contribution: bigint;
    try {
      contribution = parseAmount(amount);
    } catch {
      return;
    }

    const nextId = await client.nextCircleId();
    const result = await create.run({
      token: tokenAddress,
      contribution,
      maxMembers: memberCount,
      roundSeconds: BigInt(duration),
    });
    if (result) onCreated(nextId);
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View>
              <Text style={styles.kicker}>MONAD TESTNET</Text>
              <Text style={styles.title}>Create a circle</Text>
            </View>
            <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <Text style={styles.label}>CIRCLE NAME</Text>
          <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="e.g. Sunday Table" placeholderTextColor="#8a968e" />
          <View style={styles.row}>
            <View style={styles.column}>
              <Text style={styles.label}>CONTRIBUTION · AUSD</Text>
              <TextInput value={amount} onChangeText={setAmount} style={styles.input} keyboardType="decimal-pad" />
            </View>
            <View style={styles.column}>
              <Text style={styles.label}>MEMBERS</Text>
              <TextInput value={members} onChangeText={setMembers} style={styles.input} keyboardType="number-pad" />
            </View>
          </View>
          <Text style={styles.label}>ROUND LENGTH · SECONDS</Text>
          <TextInput value={roundSeconds} onChangeText={setRoundSeconds} style={styles.input} keyboardType="number-pad" />
          <Text style={styles.note}>Members lock one contribution as a deposit when they join. The circle starts when all slots are filled.</Text>

          {create.error && <Text style={styles.error}>{create.error.message}</Text>}
          <Pressable style={[styles.submit, (!name.trim() || create.pending) && styles.disabled]} onPress={submit} disabled={!name.trim() || create.pending}>
            {create.pending ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Create on Monad</Text>}
          </Pressable>
          <Text style={styles.disclaimer}>This submits a real testnet transaction and requires test MON for gas.</Text>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(17, 35, 27, 0.42)" },
  sheet: { backgroundColor: "#f4f7f2", borderTopLeftRadius: 8, borderTopRightRadius: 8, paddingHorizontal: 22, paddingTop: 10, paddingBottom: 18 },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: "#c5cec6", alignSelf: "center", marginBottom: 18 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  kicker: { color: "#32745b", fontSize: 10, fontWeight: "700" },
  title: { color: "#182821", fontSize: 23, fontWeight: "700", marginTop: 5 },
  close: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  closeText: { color: "#6d7b72", fontSize: 26 },
  label: { color: "#6d7b72", fontSize: 9, fontWeight: "700", marginBottom: 7, marginTop: 12 },
  input: { minHeight: 48, borderWidth: 1, borderColor: "#dce4dd", borderRadius: 5, backgroundColor: "#fff", paddingHorizontal: 12, color: "#182821", fontSize: 15 },
  row: { flexDirection: "row", gap: 12 },
  column: { flex: 1 },
  note: { color: "#526159", fontSize: 11, lineHeight: 16, marginTop: 12 },
  error: { color: "#b74a38", fontSize: 12, marginTop: 12 },
  submit: { minHeight: 50, alignItems: "center", justifyContent: "center", backgroundColor: "#32745b", borderRadius: 5, marginTop: 18 },
  disabled: { opacity: 0.55 },
  submitText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  disclaimer: { color: "#6d7b72", fontSize: 10, lineHeight: 15, textAlign: "center", marginTop: 10 },
});
