
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import {
  useCircle,
  useChitClient,
  useContribute,
  useSettleRound,
  useRoundCountdown,
} from '@chitcircle/sdk/src/hooks';

import { MOCK_PEOPLE } from '@chitcircle/sdk/src/mock';
import {
  formatUsd,
  shortAddress,
} from '@chitcircle/sdk/src/format';

import type { MemberStatus } from '@chitcircle/sdk/src/types';

export default function CircleDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const circleId =
    typeof id === 'string' && /^\d+$/.test(id)
      ? BigInt(id)
      : null;

  const client = useChitClient();

  const {
    data: circle,
    loading,
    error,
    refresh,
  } = useCircle(circleId, MOCK_PEOPLE[0].address, 4000);

  const pay = useContribute();
  const settle = useSettleRound();
  const countdown = useRoundCountdown(circle);

  const [roster, setRoster] = useState<MemberStatus[]>([]);
  const [rosterError, setRosterError] = useState<string | null>(null);

  useEffect(() => {
    if (circleId === null || !circle) {
      setRoster([]);
      return;
    }

    let active = true;

    client
      .getRoster(circleId)
      .then((members) => {
        if (active) {
          setRoster(members);
          setRosterError(null);
        }
      })
      .catch((err) => {
        if (active) {
          setRosterError(String(err));
        }
      });

    return () => {
      active = false;
    };
  }, [client, circleId, circle]);

  const nameFor = (address: string) => {
    const person = MOCK_PEOPLE.find(
      (p) => p.address.toLowerCase() === address.toLowerCase()
    );

    return person?.name ?? shortAddress(address as `0x${string}`);
  };

  const timeLeft = Math.max(0, Math.floor(countdown));

  const countdownText =
    `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`;

  const canPay = Boolean(
    circle &&
    circle.started &&
    !circle.finished &&
    circle.me?.isMember &&
    !circle.me.paidThisRound &&
    !circle.me.defaulted &&
    !pay.pending &&
    !settle.pending
  );

  const canSettle = Boolean(
    circle?.settleable &&
    !settle.pending &&
    !pay.pending
  );

  const handlePay = async () => {
    if (circleId === null || !canPay) return;

    const result = await pay.run(circleId);

    if (result) refresh();
  };

  const handleSettle = async () => {
    if (circleId === null || !canSettle) return;

    const result = await settle.run(circleId);

    if (result) refresh();
  };

  if (circleId === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Invalid Circle ID</Text>
      </View>
    );
  }

  if (loading && !circle) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4834D4" />
        <Text style={styles.description}>Loading circle...</Text>
      </View>
    );
  }

  if (error && !circle) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Unable to load circle</Text>
        <Text style={styles.error}>{error.message}</Text>
        <Pressable style={styles.button} onPress={refresh}>
          <Text style={styles.buttonText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  if (!circle) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Circle not found</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.logo}>◉ Chit Circle</Text>

      <Text style={styles.title}>Circle Details</Text>
      <Text style={styles.subtitle}>
        Track your circle's savings and payments.
      </Text>

      <View style={styles.hero}>
        <Text style={styles.heroLabel}>CURRENT POT</Text>

        <Text style={styles.amount}>
          {formatUsd(circle.pot)}
        </Text>

        <Text style={styles.heroText}>
          Expected round payout: {formatUsd(circle.expectedPot)}
        </Text>
      </View>

      <View style={styles.grid}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Current Round</Text>
          <Text style={styles.statValue}>
            {circle.finished
              ? 'Finished'
              : circle.started
              ? `${circle.round + 1}/${circle.maxMembers}`
              : 'Waiting'}
          </Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Contribution</Text>
          <Text style={styles.statValue}>
            {formatUsd(circle.contribution)}
          </Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Round Status</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {circle.finished
            ? 'Circle Completed'
            : circle.started
            ? 'Current Payout'
            : 'Waiting for Members'}
        </Text>

        {circle.finished ? (
          <Text style={styles.description}>
            All rounds have been completed.
          </Text>
        ) : circle.started ? (
          <>
            <Text style={styles.description}>
              Recipient: {circle.recipient
                ? nameFor(circle.recipient)
                : 'Not assigned'}
            </Text>

            <Text style={styles.description}>
              {circle.settleable
                ? 'Round ready to settle'
                : `Time remaining: ${countdownText}`}
            </Text>

            <Text style={styles.description}>
              {circle.outstanding.length} unpaid contribution(s)
            </Text>
          </>
        ) : (
          <Text style={styles.description}>
            {circle.members.length}/{circle.maxMembers} members joined.
            The circle starts when everyone joins.
          </Text>
        )}
      </View>

      <Text style={styles.sectionTitle}>Members</Text>

      <View style={styles.card}>
        {circle.members.map((address) => {
          const member = roster.find(
            (m) =>
              m.address.toLowerCase() === address.toLowerCase()
          );

          const status = member?.defaulted
            ? 'Defaulted'
            : !circle.started
            ? 'Joined'
            : member?.paidThisRound
            ? 'Paid'
            : member
            ? 'Payment due'
            : 'Loading status';

          return (
            <View key={address} style={styles.memberRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>
                  {nameFor(address)}
                </Text>

                <Text style={styles.memberAddress}>
                  {shortAddress(address)}
                </Text>
              </View>

              <Text
                style={[
                  styles.memberStatus,
                  member?.defaulted && styles.defaulted,
                  member?.paidThisRound && styles.paid,
                ]}
              >
                {status}
              </Text>
            </View>
          );
        })}

        {rosterError && (
          <Text style={styles.error}>
            Member status unavailable: {rosterError}
          </Text>
        )}
      </View>

      <Text style={styles.sectionTitle}>Make a Payment</Text>

      <Pressable
        style={[
          styles.button,
          !canPay && styles.buttonDisabled,
        ]}
        disabled={!canPay}
        onPress={handlePay}
      >
        <Text style={styles.buttonText}>
          {pay.pending
            ? 'Processing Payment...'
            : circle.me?.paidThisRound
            ? 'Already Paid'
            : `Pay ${formatUsd(circle.contribution)}`}
        </Text>
      </Pressable>

      <Pressable
        style={[
          styles.secondaryButton,
          !canSettle && styles.buttonDisabled,
        ]}
        disabled={!canSettle}
        onPress={handleSettle}
      >
        <Text style={styles.buttonText}>
          {settle.pending
            ? 'Settling Round...'
            : 'Settle Round'}
        </Text>
      </Pressable>

      {pay.error && (
        <Text style={styles.error}>
          Payment error: {pay.error.message}
        </Text>
      )}

      {settle.error && (
        <Text style={styles.error}>
          Settlement error: {settle.error.message}
        </Text>
      )}

      {pay.result && (
        <Text style={styles.success}>
          Payment confirmed in{' '}
          {pay.result.settledInSeconds.toFixed(2)}s
        </Text>
      )}

      {settle.result && (
        <Text style={styles.success}>
          Round settled in{' '}
          {settle.result.settledInSeconds.toFixed(2)}s
        </Text>
      )}

      <Pressable style={styles.refreshButton} onPress={refresh}>
        <Text style={styles.refreshText}>
          Refresh Circle ↻
        </Text>
      </Pressable>

      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>
          Payment Protection
        </Text>

        <Text style={styles.noticeText}>
          If a member misses a payment, their deposit
          can cover their contribution according to
          the circle rules.
        </Text>
      </View>

      <Text style={styles.footer}>
        Circle ID: {String(circle.circleId)}
      </Text>

      <Text style={styles.footer}>
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F7F8FC',
  },
  logo: {
    fontSize: 20,
    fontWeight: '800',
    color: '#4834D4',
    marginBottom: 28,
  },
  title: {
    fontSize: 29,
    fontWeight: '800',
    color: '#172033',
  },
  subtitle: {
    color: '#64748B',
    fontSize: 14,
    marginTop: 8,
    marginBottom: 25,
  },
  hero: {
    backgroundColor: '#4834D4',
    padding: 28,
    borderRadius: 20,
    marginBottom: 18,
  },
  heroLabel: {
    color: '#DDD6FE',
    fontSize: 13,
    fontWeight: '700',
  },
  amount: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: '800',
    marginTop: 8,
  },
  heroText: {
    color: '#EDE9FE',
    fontSize: 13,
    marginTop: 10,
  },
  grid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 30,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 15,
  },
  statLabel: {
    color: '#64748B',
    fontSize: 13,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#172033',
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#172033',
    marginBottom: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 22,
    borderRadius: 16,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: '#E8EAF0',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#172033',
  },
  description: {
    color: '#64748B',
    fontSize: 14,
    lineHeight: 22,
    marginTop: 8,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  memberName: {
    color: '#172033',
    fontSize: 15,
    fontWeight: '700',
  },
  memberAddress: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 4,
  },
  memberStatus: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  paid: {
    color: '#15803D',
  },
  defaulted: {
    color: '#DC2626',
  },
  button: {
    backgroundColor: '#4834D4',
    padding: 18,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  secondaryButton: {
    backgroundColor: '#6654DB',
    padding: 18,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 15,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  refreshButton: {
    alignItems: 'center',
    padding: 12,
    marginBottom: 15,
  },
  refreshText: {
    color: '#4834D4',
    fontWeight: '700',
  },
  success: {
    color: '#15803D',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 15,
  },
  error: {
    color: '#DC2626',
    fontSize: 14,
    marginBottom: 15,
  },
  notice: {
    backgroundColor: '#EDEAFF',
    padding: 22,
    borderRadius: 16,
    marginBottom: 20,
  },
  noticeTitle: {
    color: '#4834D4',
    fontWeight: '700',
    fontSize: 16,
  },
  noticeText: {
    color: '#334155',
    lineHeight: 22,
    marginTop: 8,
    fontSize: 14,
  },
  footer: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 8,
  },
});
