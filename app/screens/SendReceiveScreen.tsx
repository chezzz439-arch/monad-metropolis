import React, { useEffect, useState } from "react";
import { Linking, View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Address, parseUnits } from "viem";
import { useSendToMember, useTokenBalance } from "../../sdk/src/hooks";
import { formatUsd } from "../../sdk/src/format";

interface SendReceiveScreenProps {
  tokenAddress: Address;
  myAccount: Address;
  faucetAddress?: Address;
  recipientDefault?: Address;
  readOnly?: boolean;
}

export function SendReceiveScreen({ tokenAddress, myAccount, faucetAddress, recipientDefault, readOnly = false }: SendReceiveScreenProps) {
  const [recipient, setRecipient] = useState<string>(recipientDefault || "");
  const [amount, setAmount] = useState<string>("");
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);

  const { data: balance, loading: balanceLoading, error: balanceError } = useTokenBalance(tokenAddress, myAccount);
  const { run: sendAUSD, pending, error, result } = useSendToMember();

  useEffect(() => {
    if (result) setTimerSeconds(result.settledInSeconds);
  }, [result]);

  const handleSend = async () => {
    if (readOnly || !recipient || !amount) return;
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
          {balanceLoading ? "Loading..." : balanceError ? "Unavailable" : balance !== null ? formatUsd(balance) : "—"}
        </Text>
        {balanceError && <Text style={styles.infoText}>Balance unavailable: {balanceError.message}</Text>}
        {faucetAddress && (
          <TouchableOpacity
            style={styles.faucetButton}
            onPress={() => Linking.openURL(`https://testnet.monadscan.com/address/${faucetAddress}#code`)}
            accessibilityRole="link"
          >
            <Text style={styles.faucetText}>Get test AUSD</Text>
          </TouchableOpacity>
        )}
      </View>

      <TextInput
        style={styles.input}
        placeholder="Recipient Address (0x...)"
        value={recipient}
        onChangeText={setRecipient}
        placeholderTextColor="#888"
        editable={!readOnly}
        accessibilityLabel="Recipient address"
      />

      <TextInput
        style={styles.input}
        placeholder="Amount ($USD)"
        keyboardType="numeric"
        value={amount}
        onChangeText={setAmount}
        placeholderTextColor="#888"
        editable={!readOnly}
        accessibilityLabel="AUSD amount"
      />

      <TouchableOpacity 
        style={[styles.button, (pending || readOnly) && styles.buttonDisabled]}
        onPress={handleSend}
        disabled={pending || readOnly}
      >
        {pending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{readOnly ? "Wallet signing unavailable" : "Send Instantly"}</Text>}
      </TouchableOpacity>

      {readOnly && <Text style={styles.infoText}>Read-only mode: configure the Mera signer before sending AUSD.</Text>}

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
  header: { fontSize: 24, fontWeight: "bold", marginBottom: 20, color: "#182821" },
  balanceCard: { backgroundColor: "#182821", padding: 15, borderRadius: 7, marginBottom: 20 },
  label: { fontSize: 14, color: "#b8c9bd" },
  balanceText: { fontSize: 22, fontWeight: "bold", color: "#fff", marginTop: 5 },
  input: { minHeight: 48, borderWidth: 1, borderColor: "#dce4dd", borderRadius: 5, padding: 12, marginBottom: 15, fontSize: 16, color: "#182821" },
  button: { minHeight: 48, backgroundColor: "#32745b", padding: 15, borderRadius: 5, alignItems: "center", justifyContent: "center" },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  errorText: { color: "#b74a38", marginTop: 10 },
  infoText: { color: "#6d7b72", fontSize: 12, lineHeight: 17, marginTop: 8 },
  faucetButton: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", marginTop: 8, paddingHorizontal: 4 },
  faucetText: { color: "#32745b", fontSize: 12, fontWeight: "700" },
  successCard: { marginTop: 20, backgroundColor: "#e8eee7", padding: 15, borderRadius: 7, borderColor: "#32745b", borderWidth: 1 },
  successTitle: { fontWeight: "bold", color: "#182821", fontSize: 16 },
  timerText: { fontSize: 18, fontWeight: "bold", color: "#32745b", marginTop: 5 },
  hashText: { fontSize: 12, color: "#6d7b72", marginTop: 8 }
});