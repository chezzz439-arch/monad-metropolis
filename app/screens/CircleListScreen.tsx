import React, { useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput } from "react-native";
import { Address } from "viem";
import { useMyCircles, useInvite } from "../../sdk/src/hooks";
import { CircleView } from "../../sdk/src/types";

interface CircleListScreenProps {
  myAccount: Address;
  onSelectCircle: (circleId: bigint) => void;
  onCreateNew: () => void;
  expectedDeployment?: { chainId: number; contract: Address };
}

export function CircleListScreen({ myAccount, onSelectCircle, onCreateNew, expectedDeployment }: CircleListScreenProps) {
  const [inviteInput, setInviteInput] = useState("");
  const { data: circles, loading, error, refresh } = useMyCircles(myAccount);
  const { status: inviteStatus, data: inviteCircle, target, loading: inviteLoading, error: inviteError } = useInvite(inviteInput, expectedDeployment);

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

      {inviteInput.length > 0 && inviteStatus !== "ready" && (
        <Text style={styles.inviteStatus}>
          {inviteLoading ? "Checking invite..." : inviteStatus === "invalid" ? "This invite link is not valid." : inviteStatus === "wrong-deployment" ? "This invite belongs to a different deployment." : inviteStatus === "not-found" ? "That circle could not be found." : inviteStatus === "error" ? inviteError?.message || "Could not check this invite." : ""}
        </Text>
      )}

      {error ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Could not load circles: {error.message}</Text>
          <TouchableOpacity onPress={refresh}><Text style={styles.retryText}>Try again</Text></TouchableOpacity>
        </View>
      ) : loading ? (
        <Text style={styles.loadingText}>Loading your circles...</Text>
      ) : (
        <FlatList
          data={circles || []}
          refreshing={loading}
          onRefresh={refresh}
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
  container: { flex: 1, padding: 20, backgroundColor: "#f4f7f2" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15 },
  header: { fontSize: 24, fontWeight: "bold", color: "#182821" },
  createButton: { backgroundColor: "#182821", minHeight: 44, justifyContent: "center", paddingHorizontal: 15, paddingVertical: 10, borderRadius: 5 },
  createButtonText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  inviteContainer: { flexDirection: "row", marginBottom: 20 },
  inviteInput: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: "#dce4dd", borderRadius: 5, padding: 10, backgroundColor: "#fff" },
  joinInviteButton: { backgroundColor: "#32745b", minHeight: 44, justifyContent: "center", paddingHorizontal: 15, borderRadius: 5, marginLeft: 8 },
  joinInviteText: { color: "#fff", fontWeight: "bold" },
  inviteStatus: { color: "#6b7280", fontSize: 12, marginTop: -12, marginBottom: 12 },
  retryText: { color: "#32745b", fontSize: 13, fontWeight: "bold", marginTop: 12 },
  loadingText: { textAlign: "center", color: "#6d7b72", marginTop: 40 },
  card: { backgroundColor: "#fff", padding: 16, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: "#dce4dd" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: "bold", color: "#182821" },
  statusBadge: { fontSize: 12, fontWeight: "bold", color: "#32745b", backgroundColor: "#e8eee7", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  cardDetail: { fontSize: 14, color: "#526159", marginTop: 4 },
  emptyContainer: { alignItems: "center", marginTop: 50 },
  emptyText: { color: "#6d7b72", fontSize: 16 }
});

