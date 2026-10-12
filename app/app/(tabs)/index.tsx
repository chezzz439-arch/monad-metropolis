
import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { router } from 'expo-router';

export default function HomeScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.logo}>◉ Chit Circle</Text>
        <Text style={styles.subtitle}>
          Save together. Grow together.
        </Text>
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroTitle}>
          Better saving starts together.
        </Text>
        <Text style={styles.heroText}>
          Save with people you trust. Every contribution
          is protected by clear rules, and everyone
          gets their turn.
        </Text>
      </View>

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

      <Text style={styles.sectionTitle}>My Circles</Text>

      <View style={styles.emptyCard}>
        <Text style={styles.emptyIcon}>◎</Text>
        <Text style={styles.emptyTitle}>
          No circles yet
        </Text>
        <Text style={styles.emptyText}>
          Create your first savings circle or join one
          using an invitation.
        </Text>
      </View>

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
  footer: {
    marginTop: 36,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#94A3B8',
  },
});
