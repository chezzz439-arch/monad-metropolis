import { useState } from "react";
import { ConfiguredApp } from "./app/ConfiguredApp";
import { configuredDeployment } from "./app/config/deployment";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

type Tab = "Circles" | "Activity" | "Send";

interface CirclePreview {
  id: string;
  name: string;
  contribution: number;
  members: number;
  maxMembers: number;
  round: number;
  rounds: number;
  payout: string;
  tint: string;
}

const initialCircles: CirclePreview[] = [
  { id: "01", name: "Sunday Table", contribution: 100, members: 4, maxMembers: 6, round: 2, rounds: 6, payout: "Next payout · You", tint: "#dcebe2" },
  { id: "02", name: "The Cousins", contribution: 75, members: 5, maxMembers: 5, round: 3, rounds: 5, payout: "Next payout · Oct 18", tint: "#f1e6d7" },
];

const activity = [
  { title: "Monthly contribution", circle: "Sunday Table", amount: "−$100.00", time: "Today · 9:41 AM", positive: false },
  { title: "Payout received", circle: "The Cousins", amount: "+$375.00", time: "Oct 4 · 2:16 PM", positive: true },
  { title: "Circle deposit", circle: "Sunday Table", amount: "−$100.00", time: "Sep 21 · 11:08 AM", positive: false },
];

export default function App() {
  return (
    <SafeAreaProvider>
      {configuredDeployment ? <ConfiguredApp deployment={configuredDeployment} /> : <PreviewApp />}
    </SafeAreaProvider>
  );
}

function PreviewApp() {
  const [tab, setTab] = useState<Tab>("Circles");
  const [circles, setCircles] = useState(initialCircles);
  const [selectedCircle, setSelectedCircle] = useState<CirclePreview | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [circleName, setCircleName] = useState("");
  const [contribution, setContribution] = useState("100");
  const [memberCount, setMemberCount] = useState("5");
  const [recipient, setRecipient] = useState("");
  const [sendAmount, setSendAmount] = useState("");

  const createPreviewCircle = () => {
    const amount = Number(contribution);
    const maxMembers = Number(memberCount);
    if (!circleName.trim() || !Number.isFinite(amount) || amount <= 0 || !Number.isInteger(maxMembers) || maxMembers < 2 || maxMembers > 20) return;

    const circle: CirclePreview = {
      id: String(circles.length + 1).padStart(2, "0"),
      name: circleName.trim(),
      contribution: amount,
      members: 1,
      maxMembers,
      round: 1,
      rounds: maxMembers,
      payout: "Waiting for members",
      tint: "#e3e9f0",
    };
    setCircles((current) => [circle, ...current]);
    setSelectedCircle(circle);
    setCircleName("");
    setCreateOpen(false);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.paper} />
      <View style={styles.topBar}>
        <View>
          <Text style={styles.brand}>CHIT CIRCLES</Text>
          <Text style={styles.network}>MONAD TESTNET</Text>
        </View>
        <Pressable
          style={styles.avatar}
          onPress={() => Alert.alert("Wallet not connected", "Passkey wallet setup is not available in this preview.")}
          accessibilityRole="button"
          accessibilityLabel="Wallet setup"
        >
          <Text style={styles.avatarText}>S</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.previewBanner}>
          <View style={styles.previewDot} />
          <Text style={styles.previewText}>PREVIEW DATA · NO TRANSACTIONS</Text>
        </View>

        {selectedCircle ? (
          <CircleDetail circle={selectedCircle} onBack={() => setSelectedCircle(null)} />
        ) : tab === "Circles" ? (
          <>
            <View style={styles.headingRow}>
              <View>
                <Text style={styles.kicker}>YOUR COMMUNITY</Text>
                <Text style={styles.heading}>Circles</Text>
              </View>
              <Pressable style={styles.createButton} onPress={() => setCreateOpen(true)}>
                <Text style={styles.createButtonText}>＋ New</Text>
              </Pressable>
            </View>

            <View style={styles.balanceRow}>
              <View>
                <Text style={styles.mutedLabel}>AVAILABLE BALANCE</Text>
                <Text style={styles.balanceValue}>Connect wallet</Text>
              </View>
              <View style={styles.balanceMark}><Text style={styles.balanceMarkText}>$</Text></View>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Your circles</Text>
              <Text style={styles.count}>{circles.length.toString().padStart(2, "0")}</Text>
            </View>
            {circles.map((circle) => (
              <Pressable key={circle.id} style={styles.circleCard} onPress={() => setSelectedCircle(circle)}>
                <View style={[styles.circleMark, { backgroundColor: circle.tint }]}>
                  <Text style={styles.circleMarkText}>{circle.name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={styles.circleMain}>
                  <View style={styles.circleTitleRow}>
                    <Text style={styles.circleName}>{circle.name}</Text>
                    <Text style={styles.chevron}>›</Text>
                  </View>
                  <Text style={styles.circleMeta}>${circle.contribution} / round · {circle.members} of {circle.maxMembers} members</Text>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${Math.min(100, (circle.members / circle.maxMembers) * 100)}%` }]} />
                  </View>
                  <Text style={styles.payout}>{circle.payout}</Text>
                </View>
              </Pressable>
            ))}
            <View style={styles.noteRow}>
              <Text style={styles.noteIcon}>i</Text>
              <Text style={styles.noteText}>Live circles appear after wallet and contract setup.</Text>
            </View>
          </>
        ) : tab === "Activity" ? (
          <>
            <Text style={styles.kicker}>THE LEDGER</Text>
            <Text style={styles.heading}>Activity</Text>
            <View style={styles.activityList}>
              {activity.map((item, index) => (
                <View key={`${item.title}-${index}`} style={styles.activityRow}>
                  <View style={[styles.activityIcon, item.positive && styles.activityIconPositive]}>
                    <Text style={[styles.activityArrow, item.positive && styles.positiveText]}>{item.positive ? "↓" : "↑"}</Text>
                  </View>
                  <View style={styles.activityDetails}>
                    <Text style={styles.activityTitle}>{item.title}</Text>
                    <Text style={styles.activitySub}>{item.circle} · {item.time}</Text>
                  </View>
                  <Text style={[styles.activityAmount, item.positive && styles.positiveText]}>{item.amount}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.footnote}>Sample entries shown for layout preview.</Text>
          </>
        ) : (
          <>
            <Text style={styles.kicker}>MEMBER TO MEMBER</Text>
            <Text style={styles.heading}>Send AUSD</Text>
            <View style={styles.sendBalance}>
              <Text style={styles.mutedLabel}>AVAILABLE BALANCE</Text>
              <Text style={styles.balanceValue}>Not connected</Text>
            </View>
            <Text style={styles.fieldLabel}>RECIPIENT ADDRESS</Text>
            <TextInput
              style={styles.input}
              value={recipient}
              onChangeText={setRecipient}
              placeholder="0x..."
              placeholderTextColor={colors.subtle}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.fieldLabel}>AMOUNT</Text>
            <View style={styles.amountInputWrap}>
              <Text style={styles.currency}>$</Text>
              <TextInput
                style={styles.amountInput}
                value={sendAmount}
                onChangeText={setSendAmount}
                placeholder="0.00"
                placeholderTextColor={colors.subtle}
                keyboardType="decimal-pad"
              />
              <Text style={styles.currencyUnit}>AUSD</Text>
            </View>
            <Pressable style={[styles.sendButton, styles.disabledButton]} disabled>
              <Text style={styles.sendButtonText}>Connect wallet to send</Text>
            </Pressable>
            <Text style={styles.footnote}>Sending is unavailable until a wallet signer is integrated.</Text>
          </>
        )}
      </ScrollView>

      {!selectedCircle && (
        <View style={styles.tabBar}>
          {(["Circles", "Activity", "Send"] as const).map((item) => (
            <Pressable key={item} onPress={() => setTab(item)} style={styles.tabButton} accessibilityRole="button" accessibilityState={{ selected: tab === item }}>
              <View style={[styles.tabIndicator, tab === item && styles.tabIndicatorActive]} />
              <Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Modal visible={createOpen} animationType="slide" transparent onRequestClose={() => setCreateOpen(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalScrollContent}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.kicker}>LOCAL PREVIEW</Text>
                <Text style={styles.modalTitle}>Start a circle</Text>
              </View>
              <Pressable onPress={() => setCreateOpen(false)} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close">
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>
            <Text style={styles.fieldLabel}>CIRCLE NAME</Text>
            <TextInput style={styles.input} value={circleName} onChangeText={setCircleName} placeholder="e.g. Sunday Table" placeholderTextColor={colors.subtle} />
            <View style={styles.formRow}>
              <View style={styles.formColumn}>
                <Text style={styles.fieldLabel}>CONTRIBUTION · AUSD</Text>
                <TextInput style={styles.input} value={contribution} onChangeText={setContribution} keyboardType="decimal-pad" />
              </View>
              <View style={styles.formColumn}>
                <Text style={styles.fieldLabel}>MEMBERS</Text>
                <TextInput style={styles.input} value={memberCount} onChangeText={setMemberCount} keyboardType="number-pad" />
              </View>
            </View>
            <Pressable style={[styles.sendButton, !circleName.trim() && styles.disabledButton]} onPress={createPreviewCircle} disabled={!circleName.trim()}>
              <Text style={styles.sendButtonText}>Create preview circle</Text>
            </Pressable>
            <Text style={styles.modalFootnote}>Saved on this screen only. No on-chain circle is created.</Text>
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function CircleDetail({ circle, onBack }: { circle: CirclePreview; onBack: () => void }) {
  return (
    <>
      <Pressable onPress={onBack} style={styles.backButton}><Text style={styles.backText}>‹  All circles</Text></Pressable>
      <View style={[styles.detailMark, { backgroundColor: circle.tint }]}><Text style={styles.detailMarkText}>{circle.name.slice(0, 1).toUpperCase()}</Text></View>
      <Text style={styles.kicker}>CIRCLE PREVIEW</Text>
      <Text style={styles.detailTitle}>{circle.name}</Text>
      <Text style={styles.detailSubtitle}>${circle.contribution} per person · {circle.maxMembers} members</Text>
      <View style={styles.detailPanel}>
        <View style={styles.detailStat}><Text style={styles.mutedLabel}>ROUND</Text><Text style={styles.statValue}>{circle.round} of {circle.rounds}</Text></View>
        <View style={styles.detailDivider} />
        <View style={styles.detailStat}><Text style={styles.mutedLabel}>MEMBERS</Text><Text style={styles.statValue}>{circle.members} of {circle.maxMembers}</Text></View>
      </View>
      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Member order</Text><Text style={styles.count}>PREVIEW</Text></View>
      {Array.from({ length: circle.members }, (_, index) => (
        <View key={index} style={styles.memberRow}>
          <View style={styles.memberAvatar}><Text style={styles.memberAvatarText}>{index === 0 ? "S" : String.fromCharCode(65 + index)}</Text></View>
          <Text style={styles.memberName}>{index === 0 ? "You" : `Member ${index + 1}`}</Text>
          <Text style={styles.memberSlot}>PAYOUT {index + 1}</Text>
        </View>
      ))}
      <View style={styles.noteRow}><Text style={styles.noteIcon}>i</Text><Text style={styles.noteText}>Joining and payments need a deployed contract and wallet signer.</Text></View>
    </>
  );
}

const colors = {
  paper: "#f4f7f2",
  ink: "#182821",
  green: "#32745b",
  muted: "#6d7b72",
  subtle: "#9aa59d",
  line: "#dce4dd",
  orange: "#d28b45",
  white: "#ffffff",
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  topBar: { minHeight: 70, paddingHorizontal: 22, paddingTop: 10, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: colors.line },
  brand: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  network: { color: colors.green, fontSize: 9, fontWeight: "700", marginTop: 4 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#e0e9e1", alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.green, fontSize: 15, fontWeight: "700" },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 32 },
  previewBanner: { minHeight: 32, borderRadius: 4, backgroundColor: "#e8eee7", paddingHorizontal: 10, flexDirection: "row", alignItems: "center", alignSelf: "flex-start", marginBottom: 24 },
  previewDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.orange, marginRight: 8 },
  previewText: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  headingRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 },
  kicker: { color: colors.green, fontSize: 10, fontWeight: "700", marginBottom: 5 },
  heading: { color: colors.ink, fontSize: 32, fontWeight: "700" },
  createButton: { backgroundColor: colors.ink, borderRadius: 5, minHeight: 44, paddingHorizontal: 14, justifyContent: "center" },
  createButtonText: { color: colors.white, fontSize: 13, fontWeight: "700" },
  balanceRow: { backgroundColor: colors.ink, borderRadius: 7, padding: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 28 },
  mutedLabel: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  balanceValue: { color: colors.white, fontSize: 20, fontWeight: "600", marginTop: 7 },
  balanceMark: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#29463a", alignItems: "center", justifyContent: "center" },
  balanceMarkText: { color: "#c9d9ce", fontSize: 18, fontWeight: "600" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 11 },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: "700" },
  count: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  circleCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 7, padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "flex-start" },
  circleMark: { width: 42, height: 42, borderRadius: 6, alignItems: "center", justifyContent: "center", marginRight: 12 },
  circleMarkText: { color: colors.ink, fontSize: 18, fontWeight: "700" },
  circleMain: { flex: 1 },
  circleTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  circleName: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  chevron: { color: colors.muted, fontSize: 22, lineHeight: 22 },
  circleMeta: { color: colors.muted, fontSize: 11, marginTop: 4 },
  progressTrack: { height: 4, backgroundColor: "#e8eee7", borderRadius: 2, marginTop: 12, overflow: "hidden" },
  progressFill: { height: 4, backgroundColor: colors.green, borderRadius: 2 },
  payout: { color: colors.green, fontSize: 10, fontWeight: "600", marginTop: 8 },
  noteRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 14 },
  noteIcon: { color: colors.green, fontSize: 12, fontWeight: "700", marginRight: 8 },
  noteText: { color: colors.muted, fontSize: 11, lineHeight: 16, flex: 1 },
  tabBar: { minHeight: 64, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: "row", justifyContent: "space-around", paddingBottom: 4 },
  tabButton: { width: "33.33%", alignItems: "center", justifyContent: "center" },
  tabIndicator: { width: 20, height: 3, backgroundColor: "transparent", borderRadius: 2, marginBottom: 7 },
  tabIndicatorActive: { backgroundColor: colors.orange },
  tabText: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  tabTextActive: { color: colors.ink },
  activityList: { marginTop: 24, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 7, paddingHorizontal: 14 },
  activityRow: { minHeight: 70, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.line },
  activityIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#f3ece4", alignItems: "center", justifyContent: "center", marginRight: 11 },
  activityIconPositive: { backgroundColor: "#e4eee7" },
  activityArrow: { color: colors.orange, fontSize: 16, fontWeight: "700" },
  activityDetails: { flex: 1 },
  activityTitle: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  activitySub: { color: colors.muted, fontSize: 10, marginTop: 4 },
  activityAmount: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  positiveText: { color: colors.green },
  footnote: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 15 },
  sendBalance: { backgroundColor: colors.ink, borderRadius: 7, padding: 18, marginTop: 22, marginBottom: 24 },
  fieldLabel: { color: colors.muted, fontSize: 9, fontWeight: "700", marginBottom: 8, marginTop: 14 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: 5, backgroundColor: colors.white, paddingHorizontal: 13, color: colors.ink, fontSize: 14 },
  amountInputWrap: { minHeight: 54, borderWidth: 1, borderColor: colors.line, borderRadius: 5, backgroundColor: colors.white, paddingHorizontal: 13, flexDirection: "row", alignItems: "center" },
  currency: { color: colors.muted, fontSize: 20, marginRight: 8 },
  amountInput: { flex: 1, color: colors.ink, fontSize: 18, paddingVertical: 10 },
  currencyUnit: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  sendButton: { minHeight: 50, backgroundColor: colors.green, borderRadius: 5, alignItems: "center", justifyContent: "center", marginTop: 22 },
  disabledButton: { backgroundColor: "#9eaca2" },
  sendButtonText: { color: colors.white, fontSize: 13, fontWeight: "700" },
  backButton: { paddingVertical: 8, marginBottom: 24 },
  backText: { color: colors.green, fontSize: 13, fontWeight: "700" },
  detailMark: { width: 58, height: 58, borderRadius: 8, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  detailMarkText: { color: colors.ink, fontSize: 24, fontWeight: "700" },
  detailTitle: { color: colors.ink, fontSize: 29, fontWeight: "700" },
  detailSubtitle: { color: colors.muted, fontSize: 13, marginTop: 6 },
  detailPanel: { backgroundColor: colors.white, borderRadius: 7, borderWidth: 1, borderColor: colors.line, padding: 16, marginTop: 22, marginBottom: 26, flexDirection: "row" },
  detailStat: { flex: 1 },
  detailDivider: { width: 1, backgroundColor: colors.line, marginHorizontal: 16 },
  statValue: { color: colors.ink, fontSize: 15, fontWeight: "700", marginTop: 7 },
  memberRow: { minHeight: 54, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: "row", alignItems: "center" },
  memberAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#e0e9e1", alignItems: "center", justifyContent: "center", marginRight: 10 },
  memberAvatarText: { color: colors.green, fontSize: 12, fontWeight: "700" },
  memberName: { flex: 1, color: colors.ink, fontSize: 12, fontWeight: "600" },
  memberSlot: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(17, 35, 27, 0.38)" },
  modalScrollContent: { flexGrow: 1, justifyContent: "flex-end" },
  modalSheet: { maxHeight: "90%", backgroundColor: colors.paper, borderTopLeftRadius: 8, borderTopRightRadius: 8, paddingHorizontal: 22, paddingTop: 10, paddingBottom: 30 },
  modalHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: "#c5cec6", alignSelf: "center", marginBottom: 22 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  modalTitle: { color: colors.ink, fontSize: 24, fontWeight: "700" },
  closeButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  closeText: { color: colors.muted, fontSize: 26 },
  formRow: { flexDirection: "row", gap: 12 },
  formColumn: { flex: 1 },
  modalFootnote: { color: colors.muted, fontSize: 10, lineHeight: 15, textAlign: "center", marginTop: 11 },
});