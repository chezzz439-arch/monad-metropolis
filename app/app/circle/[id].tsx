
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function CircleDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();

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
        <Text style={styles.amount}>—</Text>
        <Text style={styles.heroText}>
          Your circle's balance will appear here.
        </Text>
      </View>

      <View style={styles.grid}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Current Round</Text>
          <Text style={styles.statValue}>—</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Contribution</Text>
          <Text style={styles.statValue}>—</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Round Status</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Next Payout</Text>
        <Text style={styles.description}>
          The recipient and payment deadline will appear
          once circle data is connected.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Members</Text>

      <View style={styles.card}>
        <Text style={styles.description}>
          Member names, payment status, and Defaulted
          badges will appear here.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Make a Payment</Text>

      <Pressable style={styles.disabledButton} disabled>
        <Text style={styles.buttonText}>
          Pay Contribution
        </Text>
      </Pressable>

      <Pressable style={styles.disabledSecondary} disabled>
        <Text style={styles.disabledText}>
          Settle Round
        </Text>
      </Pressable>

      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>
          Payment Protection
        </Text>
        <Text style={styles.noticeText}>
          If a member misses a payment, their deposit
          can be used to cover their contribution
          according to the circle rules.
        </Text>
      </View>

      <Text style={styles.footer}>
        Circle ID: {id || 'Not provided'}
      </Text>

      <Text style={styles.integration}>
        Circle data and payment actions will become
        available after API integration.
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
    fontSize: 24,
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
  disabledButton: {
    backgroundColor: '#A99EEF',
    padding: 18,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  disabledSecondary: {
    backgroundColor: '#E8E5F8',
    padding: 18,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 25,
  },
  disabledText: {
    color: '#7566B5',
    fontSize: 16,
    fontWeight: '700',
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
  },
  integration: {
    textAlign: 'center',
    color: '#64748B',
    fontSize: 12,
    marginTop: 15,
  },
});
