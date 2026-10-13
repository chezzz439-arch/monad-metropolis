
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';

import {
  useChitClient,
  useJoinCircle,
} from '@chitcircle/sdk/src/hooks';

import { formatUsd } from '@chitcircle/sdk/src/format';
import type { CircleView } from '@chitcircle/sdk/src/types';

function getCircleId(input: string): bigint | null {
  const value = input.trim();

  if (/^\d+$/.test(value)) {
    return BigInt(value);
  }

  try {
    const url = new URL(value);

    const queryId =
      url.searchParams.get('circleId') ??
      url.searchParams.get('circle') ??
      url.searchParams.get('id');

    if (queryId && /^\d+$/.test(queryId)) {
      return BigInt(queryId);
    }

    const match = url.pathname.match(
      /\/circle\/(\d+)(?:\/|$)/
    );

    if (match) {
      return BigInt(match[1]);
    }
  } catch {
    return null;
  }

  return null;
}

export default function JoinCircle() {
  const [invite, setInvite] = useState('');
  const [message, setMessage] = useState('');
  const [finding, setFinding] = useState(false);
  const [circleId, setCircleId] = useState<bigint | null>(null);
  const [circle, setCircle] = useState<CircleView | null>(null);

  const client = useChitClient();
  const join = useJoinCircle();

  const handleFind = async () => {
    setMessage('');
    setCircle(null);
    setCircleId(null);

    const id = getCircleId(invite);

    if (id === null) {
      setMessage(
        'Enter a numeric circle ID or a supported invitation URL.'
      );
      return;
    }

    setFinding(true);

    try {
      const exists = await client.circleExists(id);

      if (!exists) {
        setMessage('Circle not found.');
        return;
      }

      const details = await client.getCircleView(id);

      setCircle(details);
      setCircleId(id);
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : 'Unable to find circle.'
      );
    } finally {
      setFinding(false);
    }
  };

  const handleJoin = async () => {
    if (circleId === null || !circle) return;

    setMessage('');

    const result = await join.run(circleId);

    if (result) {
      router.replace({
        pathname: '/circle/[id]',
        params: { id: String(circleId) },
      });
    }
  };

  const isFull = Boolean(
    circle && circle.members.length >= circle.maxMembers
  );

  const cannotJoin = Boolean(
    join.pending ||
    !circle ||
    isFull ||
    circle.started ||
    circle.finished
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.logo}>◉ Chit Circle</Text>

      <Text style={styles.title}>Join a Circle</Text>

      <Text style={styles.subtitle}>
        Join a savings circle with people you trust.
      </Text>

      <View style={styles.card}>
        <Text style={styles.icon}>◎</Text>

        <Text style={styles.cardTitle}>
          Have an invitation?
        </Text>

        <Text style={styles.description}>
          Enter a circle ID or invitation URL
          shared by your organizer.
        </Text>

        <Text style={styles.label}>
          Invitation Link or Circle ID
        </Text>

        <TextInput
          style={styles.input}
          placeholder="e.g. 0"
          value={invite}
          onChangeText={(value) => {
            setInvite(value);
            setCircle(null);
            setCircleId(null);
            setMessage('');
          }}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!finding && !join.pending}
        />

        <Pressable
          style={styles.button}
          onPress={handleFind}
          disabled={finding || join.pending}
        >
          {finding ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.buttonText}>
              Find Circle →
            </Text>
          )}
        </Pressable>

        {message ? (
          <Text style={styles.error}>{message}</Text>
        ) : null}
      </View>

      {circle && circleId !== null && (
        <View style={styles.preview}>
          <Text style={styles.previewTitle}>
            Circle #{String(circleId)}
          </Text>

          <View style={styles.row}>
            <Text style={styles.statLabel}>
              Contribution per round
            </Text>
            <Text style={styles.statValue}>
              {formatUsd(circle.contribution)}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.statLabel}>
              Members
            </Text>
            <Text style={styles.statValue}>
              {circle.members.length}/{circle.maxMembers}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.statLabel}>
              Expected round payout
            </Text>
            <Text style={styles.statValue}>
              {formatUsd(circle.expectedPot)}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.statLabel}>
              Round length
            </Text>
            <Text style={styles.statValue}>
              {String(circle.roundSeconds / 60n)} min
            </Text>
          </View>

          <Text style={styles.status}>
            {circle.finished
              ? 'This circle has finished.'
              : circle.started
              ? 'This circle has already started.'
              : isFull
              ? 'This circle is full.'
              : 'This circle is accepting members.'}
          </Text>

          <Pressable
            style={[
              styles.button,
              cannotJoin && styles.disabled,
            ]}
            disabled={cannotJoin}
            onPress={handleJoin}
          >
            {join.pending ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.buttonText}>
                {isFull || circle.started
                  ? 'Joining Unavailable'
                  : 'Confirm & Join Circle'}
              </Text>
            )}
          </Pressable>

          {join.error && (
            <Text style={styles.error}>
              {join.error.message}
            </Text>
          )}

          <Text style={styles.note}>
            Joining may require a refundable deposit
            under the circle's rules.
          </Text>
        </View>
      )}

      <View style={styles.info}>
        <Text style={styles.infoTitle}>
          How does it work?
        </Text>

        <Text style={styles.infoText}>
          1. Receive an invitation from an organizer.
        </Text>

        <Text style={styles.infoText}>
          2. Review the circle contribution and members.
        </Text>

        <Text style={styles.infoText}>
          3. Join the circle and meet deposit requirements.
        </Text>

        <Text style={styles.infoText}>
          4. Contribute each round and receive your payout.
        </Text>
      </View>

      <Pressable
        style={styles.backButton}
        onPress={() => router.replace('/')}
      >
        <Text style={styles.backText}>
          Back to My Circles →
        </Text>
      </Pressable>

      <Text style={styles.note}>
        Mock demo — no real funds are transferred.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7F8FC',
  },
  content: {
    padding: 24,
    paddingTop: 35,
    paddingBottom: 70,
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
    fontSize: 30,
    fontWeight: '800',
    color: '#4834D4',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    color: '#64748B',
    marginBottom: 28,
    lineHeight: 23,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 25,
    marginBottom: 25,
    borderWidth: 1,
    borderColor: '#E8EAF0',
  },
  icon: {
    fontSize: 45,
    color: '#4834D4',
    textAlign: 'center',
    marginBottom: 15,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#172033',
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 10,
    marginBottom: 28,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#172033',
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    marginBottom: 20,
    color: '#172033',
  },
  button: {
    backgroundColor: '#4834D4',
    padding: 18,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  disabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  error: {
    color: '#DC2626',
    marginTop: 15,
    lineHeight: 21,
  },
  preview: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    marginBottom: 25,
    borderWidth: 1,
    borderColor: '#E8EAF0',
  },
  previewTitle: {
    color: '#4834D4',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  statLabel: {
    color: '#64748B',
    fontSize: 14,
    flexShrink: 1,
  },
  statValue: {
    color: '#172033',
    fontSize: 15,
    fontWeight: '700',
  },
  status: {
    color: '#4834D4',
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 15,
  },
  info: {
    backgroundColor: '#EDEAFF',
    borderRadius: 18,
    padding: 25,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4834D4',
    marginBottom: 15,
  },
  infoText: {
    fontSize: 14,
    color: '#334155',
    marginBottom: 12,
    lineHeight: 21,
  },
  backButton: {
    alignItems: 'center',
    padding: 20,
  },
  backText: {
    color: '#4834D4',
    fontWeight: '700',
  },
  note: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 16,
    lineHeight: 18,
  },
});
