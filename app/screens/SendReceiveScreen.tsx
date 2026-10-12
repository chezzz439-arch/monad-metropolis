import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Address, parseUnits } from "viem";
import { useSendToMember, useTokenBalance } from "../../sdk/hooks";

interface SendReceiveScreenProps {
  tokenAddress: Address;
  myAccount: Address;
  recipientDefault?: Address;
}

export function SendReceiveScreen({ tokenAddress, myAccount, recipientDefault }: SendReceiveScreenProps) {
  const [recipient, setRecipient] = useState<string>(recipientDefault || "");
  const [amount, setAmount] = useState<string>("");
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);

  const { data: balance, loading: balanceLoading } = useTokenBalance(tokenAddress, myAccount);
  const { run: sendAUSD, pending, error, result } = useSendToMember(() => {
    if (result) {
      setTimerSeconds(result.settledInSeconds);
    }
  });

  const handleSend = async () => {
    if (!recipient || !amount) return;
    setTimerSeconds(null);
    try {
      const parsedAmount = parseUnits(amount, 6);
      await sendAUSD(tokenAddress, recipient as Address, parsedAmount);
    } catch (e) {
      console.error("Transfer failed", e);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Send AUSD</Text>
      
      <View style={styles.balanceCard}>
        <Text style={styles.label}>My AUSD Balance</Text>
        <Text style={styles.balanceText}>
          {balanceLoading ? "Loading..." : balance !== null ? `$${Number(balance) / 1e6}` : "$0.00"}
        </Text>
      </View>

      <TextInput
        style={styles.input}
        placeholder="Recipient Address (0x...)"
        value={recipient}
        onChangeText={setRecipient}
        placeholderTextColor="#888"
      />

      <TextInput
        style={styles.input}
        placeholder="Amount ($USD)"
        keyboardType="numeric"
        value={amount}
        onChangeText={setAmount}
        placeholderTextColor="#888"
      />

      <TouchableOpacity 
        style={[styles.button, pending && styles.buttonDisabled]} 
        onPress={handleSend}
        disabled={pending}
      >
        {pending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send Instantly</Text>}
      </TouchableOpacity>

      {error && <Text style={styles.errorText}>Error: {error.message}</Text>}

      {result && (
        <View style={styles.successCard}>
          <Text style={styles.successTitle}>Transfer Successful!</Text>
          <Text style={styles.timerText}>
            Settled in {timerSeconds !== null ? timerSeconds.toFixed(2) : "0.0"}s 🚀
          </Text>
          <Text style={styles.hashText} numberOfLines={1}>
            Tx: {result.hash}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, flex: 1, backgroundColor: "#fff" },
  header: { fontSize: 24, fontWeight: "bold", marginBottom: 20, color: "#111" },
  balanceCard: { backgroundColor: "#f8f9fa", padding: 15, borderRadius: 10, marginBottom: 20 },
  label: { fontSize: 14, color: "#666" },
  balanceText: { fontSize: 22, fontWeight: "bold", color: "#10b981", marginTop: 5 },
  input: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, marginBottom: 15, fontSize: 16 },
  button: { backgroundColor: "#2563eb", padding: 15, borderRadius: 8, alignItems: "center" },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  errorText: { color: "#ef4444", marginTop: 10 },
  successCard: { marginTop: 20, backgroundColor: "#ecfdf5", padding: 15, borderRadius: 8, borderColor: "#10b981", borderWidth: 1 },
  successTitle: { fontWeight: "bold", color: "#065f46", fontSize: 16 },
  timerText: { fontSize: 18, fontWeight: "bold", color: "#047857", marginTop: 5 },
  hashText: { fontSize: 12, color: "#6b7280", marginTop: 8 }
});