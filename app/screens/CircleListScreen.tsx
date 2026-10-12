import React, { useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput } from "react-native";
import { Address } from "viem";
import { useMyCircles, useInvite } from "../../sdk/hooks";
import { CircleView } from "../../sdk/types";

interface CircleListScreenProps {
  myAccount: Address;
  onSelectCircle: (circleId: bigint) => void;
  onCreateNew: () => void;
}

export function CircleListScreen({ myAccount, onSelectCircle, onCreateNew }: CircleListScreenProps) {
  const [inviteInput, setInviteInput] = useState("");
  const { data: circles, loading, refresh } = useMyCircles(myAccount);
  const { status: inviteStatus, data: inviteCircle, target } = useInvite(inviteInput);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Chit Circles</Text>
        <TouchableOpacity style={styles.createButton} onPress={onCreateNew}>
          <Text style={styles.createButtonText}>+ Create Circle</Text>
        </TouchableOpacity>
      </View>

      {/* Invite Link Quick Join Bar */}
      <View style={styles.inviteContainer}>
        <TextInput
          style={styles.inviteInput}
          placeholder="Paste invite link (chitcircle.app/c/...)"
          value={inviteInput}
          onChangeText={setInviteInput}
          placeholderTextColor="#888"
        />
        {inviteStatus === "ready" && inviteCircle && target && (
          <TouchableOpacity 
            style={styles.joinInviteButton} 
            onPress={() => onSelectCircle(target.circleId)}
          >
            <Text style={styles.joinInviteText}>View Invite</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <Text style={styles.loadingText}>Loading your circles...</Text>
      ) : (
        <FlatList
          data={circles || []}
          keyExtractor={(item) => item.circleId.toString()}
          renderItem={({ item }: { item: CircleView }) => (
            <TouchableOpacity style={styles.card} onPress={() => onSelectCircle(item.circleId)}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Circle #{item.circleId.toString()}</Text>
                <Text style={styles.statusBadge}>{item.finished ? "Completed" : item.started ? `Round ${item.round + 1}` : "Forming"}</Text>
              </View>
              <Text style={styles.cardDetail}>Contribution: {Number(item.contribution) / 1e6} AUSD</Text>
              <Text style={styles.cardDetail}>Members: {item.members.length} / {item.maxMembers}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>You haven't joined any circles yet.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#f9fafb" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15 },
  header: { fontSize: 24, fontWeight: "bold", color: "#111" },
  createButton: { backgroundColor: "#2563eb", paddingHorizontal: 15, paddingVertical: 10, borderRadius: 8 },
  createButtonText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  inviteContainer: { flexDirection: "row", marginBottom: 20 },
  inviteInput: { flex: 1, borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8, padding: 10, backgroundColor: "#fff" },
  joinInviteButton: { backgroundColor: "#10b981", justifyContent: "center", paddingHorizontal: 15, borderRadius: 8, marginLeft: 8 },
  joinInviteText: { color: "#fff", fontWeight: "bold" },
  loadingText: { textAlign: "center", color: "#6b7280", marginTop: 40 },
  card: { backgroundColor: "#fff", padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: "#e5e7eb" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: "bold", color: "#1f2937" },
  statusBadge: { fontSize: 12, fontWeight: "bold", color: "#2563eb", backgroundColor: "#eff6ff", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  cardDetail: { fontSize: 14, color: "#4b5563", marginTop: 4 },
  emptyContainer: { alignItems: "center", marginTop: 50 },
  emptyText: { color: "#9ca3af", fontSize: 16 }
});

