import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from "react-native";
import type { Address } from "viem";
import {
  buildInviteLink,
  formatCountdown,
  formatSettled,
  formatUsd,
  shortAddress,
  useChitClient,
  useCircle,
  useContribute,
  useJoinCircle,
  usePrimaryAction,
  useRoundCountdown,
  useSettleRound,
  useWithdrawDeposit,
  type TxResult,
} from "../../sdk/src/index";
import type { Deployment } from "../../sdk/src/config";

export function LiveCircleDetailScreen({
  circleId,
  account,
  canWrite,
  deployment,
  onBack,
}: {
  circleId: bigint;
  account?: Address;
  canWrite: boolean;
  deployment: Deployment;
  onBack: () => void;
}) {
  const client = useChitClient();
  const { data: circle, loading, error, refresh } = useCircle(circleId, account);
  const join = useJoinCircle(refresh);
  const contribute = useContribute(refresh);
  const settle = useSettleRound(refresh);
  const withdraw = useWithdrawDeposit(refresh);
  const [roster, setRoster] = useState<Awaited<ReturnType<typeof client.getRoster>>>([]);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [lastTransaction, setLastTransaction] = useState<TxResult | null>(null);
  const seconds = useRoundCountdown(circle);
  const primaryAction = usePrimaryAction(circle);
  const pending = join.pending || contribute.pending || settle.pending || withdraw.pending;
  const actionError = join.error ?? contribute.error ?? settle.error ?? withdraw.error;

  const runPrimaryAction = async () => {
    if (!circle || !canWrite) return;
    let result: TxResult | null = null;
    if (primaryAction.kind === "join") result = await join.run(circleId);
    if (primaryAction.kind === "pay") result = await contribute.run(circleId);
    if (primaryAction.kind === "settle") result = await settle.run(circleId);
    if (primaryAction.kind === "withdraw") result = await withdraw.run(circleId);
    if (result) setLastTransaction(result);
  };

  useEffect(() => {
    let active = true;
    client.getRoster(circleId).then((members) => {
      if (active) {
        setRoster(members);
        setRosterError(null);
      }
    }).catch((cause: unknown) => {
      if (active) setRosterError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => { active = false; };
  }, [client, circleId, circle?.round, circle?.members.length]);

  const shareInvite = async () => {
    const message = buildInviteLink(circleId, { chainId: deployment.chainId, contract: deployment.chitCircle });
    await Share.share({ message });
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹  All circles</Text></Pressable>
      {loading && !circle ? <ActivityIndicator color="#32745b" /> : error ? (
        <View style={styles.message}><Text style={styles.title}>Could not load circle</Text><Text style={styles.body}>{error.message}</Text><Pressable onPress={refresh}><Text style={styles.retry}>Retry</Text></Pressable></View>
      ) : circle ? (
        <>
          <Text style={styles.kicker}>CIRCLE {circle.circleId.toString()}</Text>
          <Text style={styles.title}>{circle.finished ? "Completed" : circle.started ? `Round ${circle.round + 1}` : "Forming"}</Text>
          <Text style={styles.body}>{formatUsd(circle.contribution)} per member · {circle.members.length} of {circle.maxMembers} members</Text>
          <View style={styles.stats}>
            <View style={styles.stat}><Text style={styles.statLabel}>POT</Text><Text style={styles.statValue}>{formatUsd(circle.pot)}</Text></View>
            <View style={styles.separator} />
            <View style={styles.stat}><Text style={styles.statLabel}>{circle.settleable ? "READY TO SETTLE" : "ROUND TIMER"}</Text><Text style={styles.statValue}>{circle.started && !circle.finished ? formatCountdown(seconds) : "Not started"}</Text></View>
          </View>
          {circle.recipient && <Text style={styles.recipient}>Payout recipient · {shortAddress(circle.recipient)}</Text>}
          {primaryAction.kind !== "none" && (
            <View style={styles.actionPanel}>
              <Text style={styles.actionDescription}>
                {!canWrite ? "Connect a passkey to take this action." : primaryAction.kind === "pay" ? `Your contribution is ${formatUsd(circle.contribution)}.` : primaryAction.kind === "settle" ? "The round deadline has passed. Anyone can settle this round." : primaryAction.kind === "join" ? `Joining locks a ${formatUsd(circle.contribution)} deposit.` : "Your remaining deposit is ready to withdraw."}
              </Text>
              <Pressable
                style={[styles.actionButton, (!canWrite || pending || primaryAction.kind === "waiting") && styles.actionDisabled]}
                onPress={runPrimaryAction}
                disabled={!canWrite || pending || primaryAction.kind === "waiting"}
              >
                {pending ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionText}>{canWrite ? primaryAction.label : "Connect passkey"}</Text>}
              </Pressable>
              {actionError && <Text style={styles.actionError}>{actionError.message}</Text>}
              {lastTransaction && <Text style={styles.transactionText}>{formatSettled(lastTransaction.settledInSeconds)} · {lastTransaction.hash}</Text>}
            </View>
          )}
          <View style={styles.rosterHeader}><Text style={styles.rosterTitle}>Members</Text><Pressable onPress={shareInvite}><Text style={styles.share}>Share invite</Text></Pressable></View>
          {rosterError ? <Text style={styles.body}>Could not load member status: {rosterError}</Text> : roster.map((member, index) => (
            <View key={member.address} style={styles.member}>
              <Text style={styles.memberSlot}>{String(index + 1).padStart(2, "0")}</Text>
              <Text style={styles.memberAddress}>{shortAddress(member.address)}{account?.toLowerCase() === member.address.toLowerCase() ? " · You" : ""}</Text>
              <Text style={[styles.memberStatus, member.defaulted && styles.defaulted]}>{member.defaulted ? "Defaulted" : member.paidThisRound ? "Paid" : circle.started ? "Owes" : "Joined"}</Text>
            </View>
          ))}
          {!canWrite && <Text style={styles.notice}>Connect a passkey to join, contribute, settle, or withdraw. Test MON is needed for gas.</Text>}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 18, paddingBottom: 30 },
  back: { minHeight: 38, justifyContent: "center", marginBottom: 18 },
  backText: { color: "#32745b", fontSize: 13, fontWeight: "700" },
  kicker: { color: "#32745b", fontSize: 10, fontWeight: "700" },
  title: { color: "#182821", fontSize: 25, fontWeight: "700", marginTop: 7 },
  body: { color: "#6d7b72", fontSize: 12, lineHeight: 18, marginTop: 6 },
  stats: { backgroundColor: "#182821", borderRadius: 6, padding: 16, flexDirection: "row", marginTop: 22 },
  stat: { flex: 1 },
  statLabel: { color: "#b8c9bd", fontSize: 9, fontWeight: "700" },
  statValue: { color: "#fff", fontSize: 17, fontWeight: "700", marginTop: 6 },
  separator: { width: 1, backgroundColor: "#526159", marginHorizontal: 14 },
  recipient: { color: "#32745b", fontSize: 11, fontWeight: "600", marginTop: 15 },
  rosterHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 24, marginBottom: 7 },
  rosterTitle: { color: "#182821", fontSize: 16, fontWeight: "700" },
  share: { color: "#32745b", fontSize: 11, fontWeight: "700" },
  member: { minHeight: 48, borderBottomWidth: 1, borderBottomColor: "#dce4dd", flexDirection: "row", alignItems: "center" },
  memberSlot: { color: "#9aa59d", fontSize: 10, width: 30 },
  memberAddress: { color: "#182821", fontSize: 11, fontWeight: "600", flex: 1 },
  memberStatus: { color: "#32745b", fontSize: 9, fontWeight: "700" },
  defaulted: { color: "#b74a38" },
  notice: { color: "#6d7b72", fontSize: 10, lineHeight: 15, marginTop: 18 },
  actionPanel: { backgroundColor: "#e8eee7", borderRadius: 7, padding: 13, marginTop: 18 },
  actionDescription: { color: "#526159", fontSize: 11, lineHeight: 16 },
  actionButton: { minHeight: 48, backgroundColor: "#32745b", borderRadius: 5, alignItems: "center", justifyContent: "center", marginTop: 12 },
  actionDisabled: { opacity: 0.55 },
  actionText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  actionError: { color: "#b74a38", fontSize: 11, lineHeight: 16, marginTop: 10 },
  transactionText: { color: "#32745b", fontSize: 10, lineHeight: 15, marginTop: 10 },
  message: { paddingVertical: 24 },
  retry: { color: "#32745b", fontSize: 12, fontWeight: "700", marginTop: 12 },
});