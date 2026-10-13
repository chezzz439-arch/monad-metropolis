import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import type { Address } from "viem";
import { CircleListScreen } from "./screens/CircleListScreen";
import { CreateCircleScreen } from "./screens/CreateCircleScreen";
import { LiveCircleDetailScreen } from "./screens/LiveCircleDetailScreen";
import { SendReceiveScreen } from "./screens/SendReceiveScreen";
import { SettingUpScreen } from "./screens/SettingUpScreen";
import { WelcomeScreen } from "./screens/WelcomeScreen";
import { AppBar, Avatar, Button, Logo, Screen, Skeleton, TabBar } from "./components/ui";
import { color, radius, space, type } from "./design/tokens";
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
import { circleName, loadCircleNames, rememberedCircleIds } from "./services/circleNames";
import { clearInviteFromUrl, readInviteFromUrl, type InviteRoute } from "./services/inviteRoute";
import { dripperFor } from "./config/funding";

const TABS = ["Circles", "Send"] as const;
type Tab = (typeof TABS)[number];

/** Whether the new account has been made ready to spend. */
type SetupState = "idle" | "working" | "failed";

export function ConfiguredApp({ deployment }: { deployment: Deployment }) {
  const [tab, setTab] = useState<Tab>("Circles");
  const [circleId, setCircleId] = useState<bigint | null>(null);
  const [meraAccount, setMeraAccount] = useState<MeraAccount | null>(null);
  const [storedAccount, setStoredAccount] = useState<StoredPasskeyAccount | null>(null);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [setupState, setSetupState] = useState<SetupState>("idle");
  const [names, setNames] = useState<Record<string, string>>({});
  const rpId = typeof Constants.expoConfig?.extra?.meraRpId === "string" ? Constants.expoConfig.extra.meraRpId : "";
  const account: Address | null = meraAccount?.address ?? null;

  /**
   * The invite this page was opened with. Read once, before anything else, and
   * held across sign-up: the passkey ceremony does not navigate away, so a
   * visitor who arrives on /c/7 signs up and lands back on circle 7.
   */
  const [invite] = useState<InviteRoute>(() =>
    readInviteFromUrl({ chainId: deployment.chainId, contract: deployment.chitCircle }),
  );
  const [inviteHandled, setInviteHandled] = useState(false);
  const invitedCircleId = invite.kind === "ready" ? invite.target.circleId : null;
  const inviteProblem = invite.kind === "unusable" ? invite.message : null;

  const client = useMemo(
    () => clientFor(deployment, meraAccount ? meraSigner(meraAccount, deployment.rpcUrl) : undefined),
    [deployment, meraAccount],
  );
  const dripper = useMemo(() => dripperFor(deployment), [deployment]);
  /** Nothing that spends should be reachable until the account can pay for it. */
  const canWrite = Boolean(meraAccount) && setupState !== "working";

  useEffect(() => {
    void loadCircleNames().then(setNames);
  }, []);

  useEffect(() => {
    if (!rpId) {
      setStorageLoaded(true);
      return;
    }
    let active = true;
    void loadStoredPasskeyAccount(rpId).then((saved) => {
      if (!active) return;
      setStoredAccount(saved);
      setStorageLoaded(true);
    }).catch((error: unknown) => {
      if (active) {
        setPasskeyError(describeMeraError(error));
        setStorageLoaded(true);
      }
    });
    return () => { active = false; };
  }, [rpId]);

  /**
   * Honour the invite once there is an account that can pay.
   *
   * An effect rather than a step inside the sign-up handler, so it also fires
   * for someone who already had an account and just tapped the link — and so
   * it waits out "Setting up your account…" instead of dropping them onto a
   * Join button they cannot press yet.
   */
  useEffect(() => {
    if (inviteHandled || invitedCircleId === null) return;
    if (!account || setupState !== "idle") return;
    setCircleId(invitedCircleId);
    setInviteHandled(true);
    clearInviteFromUrl();
  }, [account, setupState, invitedCircleId, inviteHandled]);

  const rememberAccount = async (next: MeraAccount) => {
    const stored: StoredPasskeyAccount = { address: next.address, credentialId: next.credentialId, rpId: next.rpId };
    await saveStoredPasskeyAccount(stored);
    setStoredAccount(stored);
    setMeraAccount(next);
    setPasskeyError(null);
  };

  /**
   * Makes a freshly derived account ready to spend.
   *
   * Nothing from the failure is shown: the funder's own errors name its
   * address, its balance and the network's fee unit — all of which the team
   * guide keeps out of the UI. The user gets one sentence and a retry, and the
   * account stays usable in case the top-up actually landed and only the
   * receipt lookup failed.
   */
  const prepareAccount = async (address: Address) => {
    if (!dripper) return;
    setSetupState("working");
    try {
      await dripper.ensure(address);
      setSetupState("idle");
    } catch {
      setSetupState("failed");
    }
  };

  const runPasskey = async (mode: "create" | "sign-in" | "discover") => {
    if (!rpId) {
      // A build problem, not a user problem: the team needs the hostname, the
      // user needs a sentence they can act on.
      console.warn("Set EXPO_PUBLIC_MERA_RP_ID to a hostname your team controls, then publish its association files.");
      setPasskeyError("This build cannot set up accounts yet. Try again from the published app.");
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
      await prepareAccount(next.address);
    } catch (error) {
      setPasskeyError(describeMeraError(error));
    } finally {
      setPasskeyBusy(false);
    }
  };

  const lockAccount = () => {
    if (meraAccount) endMeraSession(meraAccount);
    setMeraAccount(null);
    setSetupState("idle");
    setCircleId(null);
    setAccountOpen(false);
  };

  const forgetAccount = async () => {
    lockAccount();
    if (rpId) await clearStoredPasskeyAccount(rpId);
    setStoredAccount(null);
  };

  if (!storageLoaded) return <BootScreen />;

  if (!meraAccount || !account) {
    return (
      <WelcomeScreen
        returning={Boolean(storedAccount)}
        busy={passkeyBusy}
        error={passkeyError ?? inviteProblem}
        invited={invitedCircleId !== null}
        onGetStarted={() => void runPasskey("create")}
        onSignIn={() => void runPasskey(storedAccount ? "sign-in" : "discover")}
      />
    );
  }

  if (setupState !== "idle") {
    return (
      <SettingUpScreen
        failed={setupState === "failed"}
        onRetry={() => void prepareAccount(account)}
        onContinue={() => setSetupState("idle")}
      />
    );
  }

  return (
    <ChitCircleProvider value={client}>
      <Screen>
        <StatusBar barStyle="dark-content" backgroundColor={color.canvas} />
        <AppBar
          title={circleId !== null ? circleName(circleId, names) : undefined}
          onBack={circleId !== null ? () => setCircleId(null) : undefined}
          right={
            <Pressable
              onPress={() => setAccountOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Your account"
              hitSlop={8}
            >
              <Avatar name="You" size={40} tone="brand" />
            </Pressable>
          }
        />

        {circleId !== null ? (
          <LiveCircleDetailScreen
            circleId={circleId}
            account={account}
            canWrite={canWrite}
            deployment={deployment}
            onBack={() => setCircleId(null)}
          />
        ) : tab === "Send" ? (
          <SendReceiveScreen
            tokenAddress={deployment.token}
            myAccount={account}
            faucetAddress={MONAD_TESTNET_AUSD_FAUCET_ADDRESS}
            readOnly={!canWrite}
          />
        ) : (
          <CircleListScreen
            myAccount={account}
            names={names}
            knownIds={rememberedCircleIds(names)}
            onSelectCircle={setCircleId}
            onCreateNew={() => setCreateOpen(true)}
            expectedDeployment={{ chainId: deployment.chainId, contract: deployment.chitCircle }}
          />
        )}

        {circleId === null ? <TabBar tabs={TABS} active={tab} onSelect={setTab} /> : null}

        {createOpen ? (
          <CreateCircleScreen
            tokenAddress={deployment.token}
            onClose={() => setCreateOpen(false)}
            onCreated={(createdCircleId) => {
              setCreateOpen(false);
              void loadCircleNames().then(setNames);
              setCircleId(createdCircleId);
            }}
          />
        ) : null}

        <AccountSheet
          visible={accountOpen}
          accountId={account}
          onClose={() => setAccountOpen(false)}
          onLock={lockAccount}
          onSignOut={() => void forgetAccount()}
        />
      </Screen>
    </ChitCircleProvider>
  );
}

/** The half-second before we know whether this device has an account. */
function BootScreen() {
  return (
    <Screen>
      <View style={styles.boot}>
        <Logo size={120} />
        <Skeleton width={180} height={20} />
      </View>
    </Screen>
  );
}

/**
 * The account menu. The identifier lives here and nowhere else: it is the one
 * thing a member needs to receive money from someone outside their circles,
 * and the one thing nobody should have to look at the rest of the time.
 */
function AccountSheet({
  visible,
  accountId,
  onClose,
  onLock,
  onSignOut,
}: {
  visible: boolean;
  accountId: string;
  onClose: () => void;
  onLock: () => void;
  onSignOut: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.sheetHead}>
            <Avatar name="You" size={56} tone="brand" />
            <View style={styles.sheetHeadText}>
              <Text style={styles.sheetTitle}>Your account</Text>
              <Text style={styles.sheetBody}>Protected by your face or fingerprint.</Text>
            </View>
          </View>

          <View style={styles.idBlock}>
            <Text style={styles.idLabel}>Your account ID</Text>
            <Text style={styles.idValue} selectable>{accountId}</Text>
            <Text style={styles.idHint}>Share this if someone outside your circles wants to send you money.</Text>
          </View>

          <Button label="Lock" variant="secondary" onPress={onLock} />
          <Button label="Sign out on this device" variant="ghost" onPress={onSignOut} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.xxl },

  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(22, 32, 44, 0.45)" },
  sheet: {
    backgroundColor: color.canvas,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.xxl,
    paddingTop: space.md,
    paddingBottom: space.huge,
    gap: space.md,
  },
  handle: { width: 44, height: 5, borderRadius: radius.pill, backgroundColor: color.line, alignSelf: "center" },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: space.lg, marginTop: space.xl, marginBottom: space.sm },
  sheetHeadText: { flex: 1 },
  sheetTitle: { ...type.title, color: color.ink },
  sheetBody: { ...type.label, color: color.inkMuted, marginTop: 2 },

  idBlock: {
    backgroundColor: color.sunken,
    borderRadius: radius.md,
    padding: space.lg,
    gap: space.xs,
    marginBottom: space.sm,
  },
  idLabel: { ...type.caption, color: color.inkFaint },
  idValue: { ...type.label, color: color.inkMuted },
  idHint: { ...type.label, color: color.inkFaint, marginTop: space.xs },
});
