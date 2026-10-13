
import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';

import { useMyCircles } from '@chitcircle/sdk/src/hooks';
import { MOCK_PEOPLE } from '@chitcircle/sdk/src/mock';
import { formatUsd } from '@chitcircle/sdk/src/format';

export default function HomeScreen() {
  const {
    data: circles,
    loading,
    error,
    refresh,
  } = useMyCircles(MOCK_PEOPLE[0].address);


  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>◉ Chit Circle</Text>
        <Text style={styles.subtitle}>
          Save together. Grow together.
        </Text>
      </View>

      {/* Hero */}
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>
          Better saving starts together.
        </Text>
        <Text style={styles.heroText}>
          Save with people you trust. Every contribution
          follows clear rules, and everyone gets their turn.
        </Text>
      </View>

      {/* Actions */}
      <Text style={styles.sectionTitle}>Get started</Text>

      <Pressable
        style={styles.primaryButton}
        onPress={() => router.push('/create')}
      >
        <Text style={styles.primaryText}>
          + Create a Circle
        </Text>
      </Pressable>

      <Pressable
        style={styles.secondaryButton}
        onPress={() => router.push('/join')}
      >
        <Text style={styles.secondaryText}>
          Join a Circle →
        </Text>
      </Pressable>

      {/* My Circles */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>My Circles</Text>
        <Pressable onPress={refresh}>
          <Text style={styles.refreshText}>
            Refresh ↻
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.emptyCard}>
          <ActivityIndicator
            size="large"
            color="#4834D4"
          />
          <Text style={styles.emptyText}>
            Loading your circles...
          </Text>
        </View>
      ) : error ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>
            Unable to load circles
          </Text>
          <Text style={styles.errorText}>
            {error.message}
          </Text>
          <Pressable onPress={refresh}>
            <Text style={styles.refreshText}>
              Try Again
            </Text>
          </Pressable>
        </View>
      ) : (circles ?? []).length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>◎</Text>
          <Text style={styles.emptyTitle}>
            No circles yet
          </Text>
          <Text style={styles.emptyText}>
            Create your first savings circle or join
            one using an invitation.
          </Text>
        </View>
      ) : (
        (circles ?? []).map((circle) => (
          <Pressable
            key={String(circle.circleId)}
            style={styles.circleCard}
            onPress={() =>
              router.push({
                pathname: '/circle/[id]',
                params: {
                  id: String(circle.circleId),
                },
              })
            }
          >
            <View style={styles.circleHeader}>
              <Text style={styles.circleTitle}>
                Circle #{String(circle.circleId)}
              </Text>

              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>
                  {circle.finished
                    ? 'Finished'
                    : circle.started
                    ? 'Active'
                    : 'Filling'}
                </Text>
              </View>
            </View>

            <Text style={styles.circleLabel}>
              Contribution per round
            </Text>

            <Text style={styles.circleAmount}>
              {formatUsd(circle.contribution)}
            </Text>

            <View style={styles.circleStats}>
              <View>
                <Text style={styles.statLabel}>
                  Members
                </Text>
                <Text style={styles.statValue}>
                  {circle.members.length}/{circle.maxMembers}
                </Text>
              </View>

              <View>
                <Text style={styles.statLabel}>
                  Round
                </Text>
                <Text style={styles.statValue}>
                  {circle.finished
                    ? 'Completed'
                    : circle.started
                    ? `${circle.round + 1}/${circle.maxMembers}`
                    : 'Waiting'}
                </Text>
              </View>

              <View>
                <Text style={styles.statLabel}>
                  Current Pot
                </Text>
                <Text style={styles.statValue}>
                  {formatUsd(circle.pot)}
                </Text>
              </View>
            </View>

            <Text style={styles.viewDetails}>
              View Circle Details →
            </Text>
          </Pressable>
        ))
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Simple saving. Transparent rules.
        </Text>
      </View>
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
    paddingTop: 48,
    paddingBottom: 60,
    maxWidth: 650,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    marginBottom: 28,
  },
  logo: {
    fontSize: 27,
    fontWeight: '800',
    color: '#4834D4',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 6,
  },
  hero: {
    backgroundColor: '#4834D4',
    borderRadius: 22,
    padding: 28,
    marginBottom: 30,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  heroText: {
    fontSize: 15,
    color: '#E7E3FF',
    lineHeight: 23,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#172033',
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  refreshText: {
    color: '#4834D4',
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#4834D4',
    padding: 18,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DCD8FF',
    marginBottom: 32,
  },
  secondaryText: {
    color: '#4834D4',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    padding: 30,
    borderRadius: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8EAF0',
  },
  emptyIcon: {
    fontSize: 45,
    color: '#8C80EA',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#172033',
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 9,
    lineHeight: 21,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    textAlign: 'center',
    marginVertical: 15,
  },
  circleCard: {
    backgroundColor: '#FFFFFF',
    padding: 22,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E8EAF0',
    marginBottom: 15,
  },
  circleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  circleTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#172033',
  },
  statusBadge: {
    backgroundColor: '#EDEAFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    color: '#4834D4',
    fontWeight: '700',
    fontSize: 12,
  },
  circleLabel: {
    color: '#64748B',
    fontSize: 13,
  },
  circleAmount: {
    fontSize: 30,
    fontWeight: '800',
    color: '#4834D4',
    marginTop: 5,
    marginBottom: 20,
  },
  circleStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statLabel: {
    color: '#64748B',
    fontSize: 12,
    marginBottom: 6,
  },
  statValue: {
    color: '#172033',
    fontSize: 15,
    fontWeight: '700',
  },
  viewDetails: {
    color: '#4834D4',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
  footer: {
    marginTop: 36,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#94A3B8',
  },
});
