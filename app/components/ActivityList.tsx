import React from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";

interface TransactionItem {
  id: string;
  type: "sent" | "received" | "contribution" | "payout";
  amount: string;
  description: string;
  timestamp: string;
}

interface ActivityListProps {
  transactions: TransactionItem[];
}

export function ActivityList({ transactions }: ActivityListProps) {
  const renderItem = ({ item }: { item: TransactionItem }) => (
    <View style={styles.itemRow}>
      <View style={styles.iconContainer}>
        <Text style={styles.iconText}>
          {item.type === "received" || item.type === "payout" ? "↓" : "↑"}
        </Text>
      </View>
      <View style={styles.details}>
        <Text style={styles.description}>{item.description}</Text>
        <Text style={styles.timestamp}>{item.timestamp}</Text>
      </View>
      <Text style={[
        styles.amount, 
        (item.type === "received" || item.type === "payout") ? styles.positive : styles.neutral
      ]}>
        {(item.type === "received" || item.type === "payout") ? "+" : "-"}{item.amount} AUSD
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Recent Activity</Text>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={<Text style={styles.emptyText}>No recent activity</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 20, paddingHorizontal: 15, flex: 1 },
  header: { fontSize: 18, fontWeight: "bold", marginBottom: 15, color: "#111" },
  itemRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  iconContainer: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#f0fdf4", justifyContent: "center", alignItems: "center", marginRight: 12 },
  iconText: { fontSize: 16, fontWeight: "bold", color: "#10b981" },
  details: { flex: 1 },
  description: { fontSize: 15, fontWeight: "500", color: "#1f2937" },
  timestamp: { fontSize: 12, color: "#9ca3af", marginTop: 2 },
  amount: { fontSize: 15, fontWeight: "bold" },
  positive: { color: "#10b981" },
  neutral: { color: "#1f2937" },
  emptyText: { color: "#9ca3af", textAlign: "center", marginTop: 20 }
});