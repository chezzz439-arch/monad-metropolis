import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { isAddress, type Address } from "viem";
import { CircleListScreen } from "./screens/CircleListScreen";
import { CreateCircleScreen } from "./screens/CreateCircleScreen";
import { LiveCircleDetailScreen } from "./screens/LiveCircleDetailScreen";
import { SendReceiveScreen } from "./screens/SendReceiveScreen";
import {
  ChitCircleProvider,
  MONAD_TESTNET_AUSD_FAUCET_ADDRESS,
  clientFor,
  createPasskeyAccount,
  describeMeraError,
  endMeraSession,
  meraSigner,
  signInWithPasskey,
  type MeraAccount,
  type Deployment,
} from "../sdk/src/index";
import { clearStoredPasskeyAccount, loadStoredPasskeyAccount, saveStoredPasskeyAccount, type StoredPasskeyAccount } from "./services/passkeyStorage";

type Tab = "Circles" | "Activity" | "Send";

export function ConfiguredApp({ deployment }: { deployment: Deployment }) {
  const [accountInput, setAccountInput] = useState("");
  const [tab, setTab] = useState<Tab>("Circles");
  const [circleId, setCircleId] = useState<bigint | null>(null);
  const [meraAccount, setMeraAccount] = useState<MeraAccount | null>(null);
  const [storedAccount, setStoredAccount] = useState<StoredPasskeyAccount | null>(null);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const rpId = typeof Constants.expoConfig?.extra?.meraRpId === "string" ? Constants.expoConfig.extra.meraRpId : "";
  const account = meraAccount?.address ?? (isAddress(accountInput) ? (accountInput as Address) : null);

  const client = useMemo(
    () => clientFor(deployment, meraAccount ? meraSigner(meraAccount, deployment.rpcUrl) : undefined),
    [deployment, meraAccount],
  );

  useEffect(() => {
    if (!rpId) {
      setStorageLoaded(true);
      return;
    }
    let active = true;
    void loadStoredPasskeyAccount(rpId).then((saved) => {
      if (!active) return;
      setStoredAccount(saved);
      if (saved) setAccountInput(saved.address);
      setStorageLoaded(true);
    }).catch((error: unknown) => {
      if (active) {
        setPasskeyError(describeMeraError(error));
        setStorageLoaded(true);
      }
    });
    return () => { active = false; };
  }, [rpId]);

  const rememberAccount = async (next: MeraAccount) => {
    const stored: StoredPasskeyAccount = { address: next.address, credentialId: next.credentialId, rpId: next.rpId };
    await saveStoredPasskeyAccount(stored);
    setStoredAccount(stored);
    setAccountInput(next.address);
    setMeraAccount(next);
    setPasskeyError(null);
  };

  const runPasskey = async (mode: "create" | "sign-in" | "discover") => {
    if (!rpId) {
      setPasskeyError("Set EXPO_PUBLIC_MERA_RP_ID to an HTTPS hostname your team controls, then configure its iOS/Android association files.");
      return;
    }
    setPasskeyBusy(true);
    setPasskeyError(null);
    try {
      const options = {
        rpId,
        contract: deployment.chitCircle,
        maxAmountPerTx: 100_000_000n,
        ...(mode === "sign-in" && storedAccount ? { credential: { credentialId: storedAccount.credentialId } } : {}),
      };
      const next = mode === "create" ? await createPasskeyAccount(options) : await signInWithPasskey(options);
      await rememberAccount(next);
    } catch (error) {
      setPasskeyError(describeMeraError(error));
    } finally {
      setPasskeyBusy(false);
    }
  };

  const lockAccount = () => {
    if (meraAccount) endMeraSession(meraAccount);
    setMeraAccount(null);
  };

  const forgetAccount = async () => {
    lockAccount();
    if (rpId) await clearStoredPasskeyAccount(rpId);
    setStoredAccount(null);
  };

  return (
    <ChitCircleProvider value={client}>
      <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
        <StatusBar barStyle="dark-content" backgroundColor="#f4f7f2" />
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>CHIT CIRCLES</Text>
            <Text style={styles.network}>MONAD TESTNET · {meraAccount ? "PASSKEY CONNECTED" : "READ ONLY"}</Text>
          </View>
          <Text style={styles.chain}>10143</Text>
        </View>

        <View style={styles.setup}>
          {!rpId ? (
            <View style={styles.notice}>
              <Text style={styles.noticeTitle}>Passkey domain required</Text>
              <Text style={styles.noticeBody}>Set EXPO_PUBLIC_MERA_RP_ID to a hostname your team controls and publish the iOS/Android association files.</Text>
            </View>
          ) : meraAccount ? (
            <View style={styles.accountPanel}>
              <Text style={styles.accountLabel}>PASSKEY ACCOUNT</Text>
              <Text selectable style={styles.accountAddress}>{meraAccount.address}</Text>
              <Text style={styles.noticeBody}>Prompt-free contribution guard expires {meraAccount.limits.expiresAt.toLocaleTimeString()} · enforced by this app.</Text>
              <View style={styles.accountActions}>
                <Pressable style={styles.smallButton} onPress={lockAccount}><Text style={styles.smallButtonText}>Lock</Text></Pressable>
                <Pressable style={styles.smallButtonSecondary} onPress={forgetAccount}><Text style={styles.smallButtonSecondaryText}>Forget device</Text></Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.authPanel}>
              <Text style={styles.noticeTitle}>Passkey account</Text>
              <Text style={styles.noticeBody}>{storedAccount ? `Saved account ${storedAccount.address.slice(0, 8)}…` : "Create a passkey or sign in with one from another device."} No seed phrase or private key is stored.</Text>
              <View style={styles.accountActions}>
                {passkeyBusy ? <ActivityIndicator color="#32745b" /> : storedAccount ? (
                  <Pressable style={styles.smallButton} onPress={() => void runPasskey("sign-in")}><Text style={styles.smallButtonText}>Unlock</Text></Pressable>
                ) : (
                  <Pressable style={styles.smallButton} onPress={() => void runPasskey("create")}><Text style={styles.smallButtonText}>Create passkey</Text></Pressable>
                )}
                {storedAccount && <Pressable style={styles.smallButtonSecondary} onPress={() => void runPasskey("discover")}><Text style={styles.smallButtonSecondaryText}>Use another</Text></Pressable>}
                {!storedAccount && <Pressable style={styles.smallButtonSecondary} onPress={() => void runPasskey("discover")}><Text style={styles.smallButtonSecondaryText}>Sign in</Text></Pressable>}
              </View>
            </View>
          )}
          {passkeyError && <Text style={styles.passkeyError}>{passkeyError}</Text>}

          <Text style={styles.label}>{meraAccount ? "CONNECTED ADDRESS" : "PUBLIC ACCOUNT ADDRESS"}</Text>
          <TextInput
            value={accountInput}
            onChangeText={setAccountInput}
            placeholder="0x..."
            placeholderTextColor="#8a968e"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!meraAccount}
            style={styles.input}
          />

        </View>

        {circleId !== null ? (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <LiveCircleDetailScreen circleId={circleId} account={account ?? undefined} canWrite={Boolean(meraAccount)} deployment={deployment} onBack={() => setCircleId(null)} />
          </ScrollView>
        ) : !account ? (
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Enter an address to view circles</Text>
              <Text style={styles.emptyBody}>This is a public address only. It does not connect a wallet or authorize transactions.</Text>
            </View>
          </ScrollView>
        ) : tab === "Circles" ? (
          <View style={styles.liveList}>
            <CircleListScreen
              myAccount={account}
              onSelectCircle={setCircleId}
              expectedDeployment={{ chainId: deployment.chainId, contract: deployment.chitCircle }}
              onCreateNew={() => meraAccount ? setCreateOpen(true) : Alert.alert("Connect a passkey", "Create or unlock a passkey account before creating a circle.")}
            />
          </View>
        ) : tab === "Send" ? (
          <ScrollView contentContainerStyle={styles.content}>
            <SendReceiveScreen
              tokenAddress={deployment.token}
              myAccount={account}
              faucetAddress={MONAD_TESTNET_AUSD_FAUCET_ADDRESS}
              readOnly={!meraAccount}
            />
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Activity history is not indexed yet</Text>
              <Text style={styles.emptyBody}>The current SDK does not expose a transaction-history query. Circle balances and status are read live from Monad.</Text>
            </View>
          </ScrollView>
        )}

        {circleId === null && account !== null && (
          <View style={styles.tabs}>
            {(["Circles", "Activity", "Send"] as const).map((item) => (
              <Pressable key={item} onPress={() => setTab(item)} style={styles.tab} accessibilityRole="button" accessibilityState={{ selected: tab === item }}>
                <View style={[styles.tabMark, tab === item && styles.tabMarkActive]} />
                <Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {createOpen && meraAccount && (
          <CreateCircleScreen
            tokenAddress={deployment.token}
            onClose={() => setCreateOpen(false)}
            onCreated={(createdCircleId) => {
              setCreateOpen(false);
              setCircleId(createdCircleId);
            }}
          />
        )}
      </SafeAreaView>
    </ChitCircleProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f7f2" },
  header: { minHeight: 66, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#dce4dd" },
  brand: { color: "#182821", fontSize: 14, fontWeight: "800" },
  network: { color: "#32745b", fontSize: 9, fontWeight: "700", marginTop: 4 },
  chain: { color: "#526159", fontSize: 11, fontWeight: "700" },
  setup: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 10 },
  content: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 26 },
  liveList: { flex: 1 },
  notice: { backgroundColor: "#e8eee7", borderLeftWidth: 3, borderLeftColor: "#d28b45", padding: 12, marginBottom: 12 },
  noticeTitle: { color: "#182821", fontSize: 12, fontWeight: "700" },
  noticeBody: { color: "#526159", fontSize: 11, lineHeight: 16, marginTop: 4 },
  authPanel: { backgroundColor: "#e8eee7", padding: 12, borderRadius: 6, marginBottom: 10 },
  accountPanel: { backgroundColor: "#182821", padding: 12, borderRadius: 6, marginBottom: 10 },
  accountLabel: { color: "#b8c9bd", fontSize: 9, fontWeight: "700" },
  accountAddress: { color: "#fff", fontSize: 12, fontWeight: "600", marginTop: 5 },
  accountActions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  smallButton: { minHeight: 40, paddingHorizontal: 13, borderRadius: 4, backgroundColor: "#32745b", alignItems: "center", justifyContent: "center" },
  smallButtonText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  smallButtonSecondary: { minHeight: 40, paddingHorizontal: 12, borderRadius: 4, borderWidth: 1, borderColor: "#b8c9bd", alignItems: "center", justifyContent: "center" },
  smallButtonSecondaryText: { color: "#526159", fontSize: 11, fontWeight: "700" },
  passkeyError: { color: "#b74a38", fontSize: 11, lineHeight: 15, marginBottom: 8 },
  label: { color: "#6d7b72", fontSize: 9, fontWeight: "700", marginBottom: 6, marginTop: 6 },
  input: { minHeight: 44, backgroundColor: "#fff", borderColor: "#dce4dd", borderWidth: 1, borderRadius: 5, paddingHorizontal: 12, color: "#182821", fontSize: 13 },
  empty: { paddingVertical: 32, alignItems: "center" },
  emptyTitle: { color: "#182821", fontSize: 16, fontWeight: "700", textAlign: "center" },
  emptyBody: { color: "#6d7b72", fontSize: 12, lineHeight: 18, marginTop: 8, textAlign: "center", maxWidth: 300 },
  tabs: { minHeight: 60, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#dce4dd", flexDirection: "row" },
  tab: { flex: 1, alignItems: "center", justifyContent: "center" },
  tabMark: { width: 20, height: 3, backgroundColor: "transparent", borderRadius: 2, marginBottom: 5 },
  tabMarkActive: { backgroundColor: "#d28b45" },
  tabText: { color: "#6d7b72", fontSize: 10, fontWeight: "600" },
  tabTextActive: { color: "#182821" },
});