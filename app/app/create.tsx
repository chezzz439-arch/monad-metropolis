
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';

import { useCreateCircle } from '@chitcircle/sdk/src/hooks';
import { MOCK_TOKEN } from '@chitcircle/sdk/src/mock';
import {
  parseAmount,
  formatUsd,
} from '@chitcircle/sdk/src/format';

export default function CreateCircle() {
  const [amount, setAmount] = useState('100');
  const [members, setMembers] = useState('5');
  const [roundMinutes, setRoundMinutes] = useState('2');
  const [validationError, setValidationError] = useState('');
  const [success, setSuccess] = useState(false);

  const create = useCreateCircle();

  const total =
    Number(amount || 0) * Number(members || 0);

  const handleCreate = async () => {
    setValidationError('');
    setSuccess(false);

    const count = Number(members);
    const minutes = Number(roundMinutes);

    if (
      !Number.isSafeInteger(count) ||
      count < 2 ||
      count > 20
    ) {
      setValidationError(
        'Enter between 2 and 20 members.'
      );
      return;
    }

    if (
      !Number.isSafeInteger(minutes) ||
      minutes < 1 ||
      minutes > 525600
    ) {
      setValidationError(
        'Enter a valid round length in minutes.'
      );
      return;
    }

    let contribution: bigint;

    try {
      contribution = parseAmount(amount);
      if (contribution <= 0n) {
        throw new Error('Invalid amount');
      }
    } catch {
      setValidationError(
        'Enter a valid contribution amount, such as 100.00.'
      );
      return;
    }

    const result = await create.run({
      token: MOCK_TOKEN,
      contribution,
      maxMembers: count,
      roundSeconds: BigInt(minutes * 60),
    });

    if (result) {
      setSuccess(true);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.logo}>◉ Chit Circle</Text>
      <Text style={styles.title}>Create a Circle</Text>
      <Text style={styles.subtitle}>
        Set up a savings circle with people you trust.
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>
          Contribution per round ($)
        </Text>
        <TextInput
          style={styles.input}
          keyboardType="decimal-pad"
          placeholder="100"
          value={amount}
          onChangeText={setAmount}
          editable={!create.pending}
        />

        <Text style={styles.label}>
          Number of Members
        </Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={members}
          onChangeText={setMembers}
          editable={!create.pending}
        />

        <Text style={styles.label}>
          Round Length (minutes)
        </Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={roundMinutes}
          onChangeText={setRoundMinutes}
          editable={!create.pending}
        />
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>
          Your Savings Circle
        </Text>

        <Text style={styles.summaryText}>
          {members || '0'} members
        </Text>

        <Text style={styles.summaryText}>
          Contribution: ${amount || '0'} each
        </Text>

        <Text style={styles.summaryText}>
          Round length: {roundMinutes || '0'} minutes
        </Text>

        <Text style={styles.summaryLabel}>
          Expected payout per round
        </Text>

        <Text style={styles.total}>
          {Number.isFinite(total) && total >= 0
            ? `$${total.toFixed(2)}`
            : '—'}
        </Text>
      </View>

      {validationError ? (
        <Text style={styles.error}>
          {validationError}
        </Text>
      ) : null}

      {create.error ? (
        <Text style={styles.error}>
          {create.error.message}
        </Text>
      ) : null}

      {success ? (
        <View style={styles.success}>
          <Text style={styles.successTitle}>
            Circle Created!
          </Text>
          <Text style={styles.successText}>
            Your savings circle has been created
            in the demo. Return home and refresh
            your circle list.
          </Text>
        </View>
      ) : null}

      <Pressable
        style={[
          styles.button,
          create.pending && styles.disabled,
        ]}
        disabled={create.pending}
        onPress={handleCreate}
      >
        {create.pending ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>
            Create Circle
          </Text>
        )}
      </Pressable>

      <Pressable
        style={styles.backButton}
        onPress={() => router.replace('/')}
      >
        <Text style={styles.backText}>
          Back to My Circles →
        </Text>
      </Pressable>

      <Text style={styles.note}>
        Demo mode: no real funds are transferred.
        Live payments require a connected account.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F8FC',
  },
  content: {
    padding: 24,
    paddingTop: 35,
    paddingBottom: 65,
    maxWidth: 650,
    width: '100%',
    alignSelf: 'center',
  },
  logo: {
    fontSize: 20,
    fontWeight: '800',
    color: '#4834D4',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#172033',
  },
  subtitle: {
    fontSize: 15,
    color: '#64748B',
    marginTop: 10,
    marginBottom: 25,
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 22,
    borderRadius: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E8EAF0',
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#172033',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 22,
    color: '#172033',
  },
  summary: {
    backgroundColor: '#EDEAFF',
    padding: 22,
    borderRadius: 16,
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#4834D4',
    marginBottom: 12,
  },
  summaryText: {
    fontSize: 15,
    color: '#334155',
    marginBottom: 8,
  },
  summaryLabel: {
    color: '#64748B',
    fontSize: 13,
    marginTop: 12,
  },
  total: {
    fontSize: 32,
    fontWeight: '800',
    color: '#4834D4',
    marginTop: 5,
  },
  button: {
    backgroundColor: '#4834D4',
    padding: 18,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  disabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  error: {
    color: '#DC2626',
    fontSize: 14,
    marginBottom: 15,
  },
  success: {
    backgroundColor: '#DCFCE7',
    borderRadius: 14,
    padding: 20,
    marginBottom: 18,
  },
  successTitle: {
    color: '#166534',
    fontWeight: '800',
    fontSize: 18,
  },
  successText: {
    color: '#166534',
    marginTop: 8,
    lineHeight: 21,
  },
  backButton: {
    padding: 16,
    alignItems: 'center',
  },
  backText: {
    color: '#4834D4',
    fontWeight: '700',
  },
  note: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 18,
    lineHeight: 18,
  },
});
