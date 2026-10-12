
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';

export default function JoinCircle() {
  const [invite, setInvite] = useState('');
  const [message, setMessage] = useState('');

  const handleJoin = () => {
    if (!invite.trim()) {
      setMessage('Please enter an invitation link or circle ID.');
      return;
    }

    setMessage(
      'Invitation entered. Circle lookup and joining will be connected to the Chit Circle API.'
    );
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>Join a Circle</Text>

      <Text style={styles.subtitle}>
        Join a savings circle with friends, family,
        or people you trust.
      </Text>

      <View style={styles.card}>
        <Text style={styles.icon}>◎</Text>
        <Text style={styles.cardTitle}>
          Have an invitation?
        </Text>
        <Text style={styles.description}>
          Enter the invitation link or circle ID
          shared by your organizer.
        </Text>

        <Text style={styles.label}>
          Invitation Link or Circle ID
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Paste invitation here"
          value={invite}
          onChangeText={(value) => {
            setInvite(value);
            setMessage('');
          }}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Pressable
          style={styles.button}
          onPress={handleJoin}
        >
          <Text style={styles.buttonText}>
            Find Circle →
          </Text>
        </Pressable>

        {message ? (
          <Text style={styles.message}>{message}</Text>
        ) : null}
      </View>

      <View style={styles.info}>
        <Text style={styles.infoTitle}>
          How does it work?
        </Text>

        <Text style={styles.infoText}>
          1. Receive an invitation from a circle member.
        </Text>
        <Text style={styles.infoText}>
          2. Review the contribution amount and members.
        </Text>
        <Text style={styles.infoText}>
          3. Confirm your deposit and join the circle.
        </Text>
        <Text style={styles.infoText}>
          4. Contribute each round and receive your payout.
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
    paddingTop: 45,
    maxWidth: 650,
    width: '100%',
    alignSelf: 'center',
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
    lineHeight: 23,
    marginBottom: 30,
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
  },
  button: {
    backgroundColor: '#4834D4',
    padding: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  message: {
    color: '#4834D4',
    marginTop: 15,
    lineHeight: 21,
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
});
