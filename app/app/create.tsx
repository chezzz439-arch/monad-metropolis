
import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable,
  StyleSheet, Alert, ScrollView,
} from 'react-native';

export default function CreateCircle() {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [members, setMembers] = useState('5');

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Create a Circle</Text>
      <Text style={styles.subtitle}>
        Start saving together with people you trust.
      </Text>

      <Text style={styles.label}>Circle Name</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Family Savings"
        value={name}
        onChangeText={setName}
      />

      <Text style={styles.label}>Contribution per round ($)</Text>
      <TextInput
        style={styles.input}
        placeholder="100"
        keyboardType="numeric"
        value={amount}
        onChangeText={setAmount}
      />

      <Text style={styles.label}>Number of Members</Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        value={members}
        onChangeText={setMembers}
      />

      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>Your Savings Circle</Text>
        <Text style={styles.summaryText}>
          {members || '0'} members contributing ${amount || '0'} each
        </Text>
        <Text style={styles.summaryText}>
          Potential round payout: ${(
            Number(members || 0) * Number(amount || 0)
          ).toFixed(2)}
        </Text>
      </View>

      <Pressable
        style={styles.button}
        onPress={() =>
          Alert.alert(
            'Next: Connect API',
            'The createCircle hook will handle creation once integrated.'
          )
        }
      >
        <Text style={styles.buttonText}>Create Circle</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FC', padding: 24 },
  title: { fontSize: 28, fontWeight: '800', color: '#4834D4', marginTop: 35 },
  subtitle: { fontSize: 15, color: '#64748B', marginTop: 10, marginBottom: 30 },
  label: { fontSize: 15, fontWeight: '600', marginBottom: 8, color: '#172033' },
  input: {
    backgroundColor: '#FFF', borderRadius: 12, padding: 16,
    fontSize: 16, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 24,
  },
  summary: { backgroundColor: '#EDEAFF', padding: 22, borderRadius: 16, marginBottom: 25 },
  summaryTitle: { fontWeight: '700', fontSize: 18, color: '#4834D4', marginBottom: 10 },
  summaryText: { fontSize: 15, color: '#334155', marginTop: 5 },
  button: { backgroundColor: '#4834D4', padding: 19, borderRadius: 14, alignItems: 'center' },
  buttonText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
});
