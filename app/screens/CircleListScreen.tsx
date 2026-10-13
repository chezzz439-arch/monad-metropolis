/**
 * Home. Everything the user is part of, and the two ways to get into another.
 *
 * The card leads with the money and the turn, because those are the only two
 * questions anyone opens this app to answer: how much do I owe, and when do I
 * get paid.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Address } from "viem";
import { useInvite, useMyCircles } from "../../sdk/src/hooks";
import type { CircleView } from "../../sdk/src/types";
import { Button, Card, Chip, EmptyState, ErrorNote, ProgressDots, SectionTitle, Skeleton, TextField } from "../components/ui";
import { color, radius, space, tap, type } from "../design/tokens";
import { friendlyError, money, timeLeft } from "../design/copy";
import { circleName } from "../services/circleNames";

/** Long enough to read, short enough that it is gone before it is clutter. */
const WELCOME_MS = 5200;

interface CircleListScreenProps {
  myAccount: Address;
  names: Record<string, string>;
  /**
   * Circle ids this device remembers. Covers the gap between creating a circle
   * and joining it, which nothing on chain records — see `rememberedCircleIds`.
   */
  knownIds?: bigint[];
  onSelectCircle: (circleId: bigint) => void;
  onCreateNew: () => void;
  expectedDeployment?: { chainId: number; contract: Address };
  notice?: ReactNode;
  /**
   * True when this screen was reached by signing in rather than signing up.
   * The banner it triggers is the payoff for the claim on the welcome screen —
   * that nothing is stored anywhere and a passkey brings it all back.
   */
  welcomeBack?: boolean;
}

export function CircleListScreen({
  myAccount,
  names,
  knownIds,
  onSelectCircle,
  onCreateNew,
  expectedDeployment,
  notice,
  welcomeBack,
}: CircleListScreenProps) {
  const [joinOpen, setJoinOpen] = useState(false);
  const { data: circles, loading, error, refresh } = useMyCircles(myAccount, { knownIds });
  const list = circles ?? [];

  // Shown once the circles are actually on screen, not while they load: the
  // claim is "they came back", and saying so above two skeletons asks the user
  // to take it on trust at the exact moment we could instead show them.
  const [showWelcome, setShowWelcome] = useState(false);
  useEffect(() => {
    if (!welcomeBack || list.length === 0) return;
    setShowWelcome(true);
    const timer = setTimeout(() => setShowWelcome(false), WELCOME_MS);
    return () => clearTimeout(timer);
  }, [welcomeBack, list.length]);

  return (
    <>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {notice}

        {showWelcome ? (
          <View style={styles.welcome}>
            <Text style={styles.welcomeTitle}>Welcome back</Text>
            <Text style={styles.welcomeBody}>
              {list.length === 1
                ? `${circleName(list[0]!.circleId, names)} is here, exactly as you left it.`
                : `All ${list.length} of your circles are here, exactly as you left them.`}
            </Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.block}>
            <ErrorNote message={friendlyError(error)} onRetry={refresh} />
          </View>
        ) : loading && !circles ? (
          <View style={styles.block}>
            <SectionTitle>Your circles</SectionTitle>
            <CardSkeleton />
            <CardSkeleton />
          </View>
        ) : list.length === 0 ? (
          <EmptyState
            title="No circles yet"
            body="Start one and share the link with your family. Everyone puts in the same amount each round, and each round one person takes the pot."
            action={<Button label="Create a circle" onPress={onCreateNew} />}
          />
        ) : (
          <View style={styles.block}>
            <SectionTitle>Your circles</SectionTitle>
            {list.map((circle) => (
              <CircleCard
                key={circle.circleId.toString()}
                circle={circle}
                name={circleName(circle.circleId, names)}
                onPress={() => onSelectCircle(circle.circleId)}
              />
            ))}
          </View>
        )}

        {list.length > 0 || error ? (
          <View style={styles.actions}>
            <Button label="Create a circle" onPress={onCreateNew} />
            <Button label="Join with link" variant="secondary" onPress={() => setJoinOpen(true)} />
          </View>
        ) : (
          <View style={styles.actions}>
            <Button label="Join with link" variant="secondary" onPress={() => setJoinOpen(true)} />
          </View>
        )}
      </ScrollView>

      <JoinSheet
        visible={joinOpen}
        expectedDeployment={expectedDeployment}
        onClose={() => setJoinOpen(false)}
        onOpenCircle={(id) => {
          setJoinOpen(false);
          onSelectCircle(id);
        }}
      />
    </>
  );
}

function CircleCard({ circle, name, onPress }: { circle: CircleView; name: string; onPress: () => void }) {
  const me = circle.me;
  const yourTurn = me && me.payoutRound >= 0 && me.payoutRound === circle.round && circle.started && !circle.finished;
  const turnAhead = me && me.payoutRound > circle.round && !circle.finished;

  return (
    <Card style={styles.card} onPress={onPress} accessibilityLabel={`Open ${name}`}>
      <View style={styles.cardTop}>
        <Text style={styles.cardName} numberOfLines={1}>{name}</Text>
        {circle.finished ? (
          <Chip label="Done" tone="paid" />
        ) : yourTurn ? (
          <Chip label="Your turn" tone="highlight" />
        ) : !circle.started ? (
          <Chip label="Filling up" tone="neutral" />
        ) : me?.paidThisRound ? (
          <Chip label="Paid" tone="paid" />
        ) : (
          <Chip label="Due" tone="due" />
        )}
      </View>

      <Text style={styles.cardMoney}>
        {money(circle.contribution)} <Text style={styles.cardMoneyUnit}>a round</Text>
      </Text>
      <Text style={styles.cardMeta}>
        {circle.members.length} of {circle.maxMembers} people
      </Text>

      <View style={styles.cardFooter}>
        {circle.started ? (
          <ProgressDots total={circle.maxMembers} current={circle.round + 1} />
        ) : (
          <View style={styles.fillTrack}>
            <View
              style={[styles.fillBar, { width: `${Math.round((circle.members.length / circle.maxMembers) * 100)}%` }]}
            />
          </View>
        )}
        <Text style={styles.cardStatus}>
          {circle.finished
            ? "All rounds complete"
            : !circle.started
              ? `Starts when ${circle.maxMembers - circle.members.length} more join`
              : circle.settleable
                ? "Ready to pay out"
                : `Round ${circle.round + 1} · ${timeLeft(circle.secondsUntilSettle)}`}
        </Text>
      </View>

      {turnAhead ? (
        <Text style={styles.cardTurn}>Your turn in round {(me?.payoutRound ?? 0) + 1}</Text>
      ) : null}
    </Card>
  );
}

function CardSkeleton() {
  return (
    <Card style={styles.card}>
      <Skeleton width="55%" height={22} />
      <Skeleton width="40%" height={30} style={{ marginTop: space.lg }} />
      <Skeleton width="30%" height={18} style={{ marginTop: space.sm }} />
      <Skeleton width="100%" height={10} style={{ marginTop: space.xl }} />
    </Card>
  );
}

/**
 * Joining is a link someone sent in a family group chat, so the one thing this
 * has to do well is accept whatever got pasted and say plainly whether it
 * worked.
 */
function JoinSheet({
  visible,
  expectedDeployment,
  onClose,
  onOpenCircle,
}: {
  visible: boolean;
  expectedDeployment?: { chainId: number; contract: Address };
  onClose: () => void;
  onOpenCircle: (circleId: bigint) => void;
}) {
  const [link, setLink] = useState("");
  const { status, target, loading, error } = useInvite(link.trim() || null, expectedDeployment);

  const message =
    link.trim().length === 0 || status === "idle"
      ? null
      : loading
        ? "Checking that link…"
        : status === "invalid"
          ? "That link does not look right. Check you copied all of it."
          : status === "wrong-deployment"
            ? "That link is for a different version of Chit Circle."
            : status === "not-found"
              ? "We could not find that circle."
              : status === "error"
                ? friendlyError(error)
                : null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Join with link</Text>
            <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
              <Text style={styles.closeGlyph}>×</Text>
            </Pressable>
          </View>
          <Text style={styles.sheetBody}>Paste the link your family sent you.</Text>
          <TextField
            value={link}
            onChangeText={setLink}
            placeholder="Paste link here"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Invite link"
            style={styles.sheetInput}
          />
          {message ? <Text style={styles.sheetMessage}>{message}</Text> : null}
          <Button
            label="Open circle"
            disabled={status !== "ready" || !target}
            onPress={() => target && onOpenCircle(target.circleId)}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, flexGrow: 1 },
  block: { marginBottom: space.xxl },
  welcome: {
    backgroundColor: color.brandSoft,
    borderRadius: radius.lg,
    padding: space.lg,
    marginBottom: space.xl,
  },
  welcomeTitle: { ...type.labelStrong, color: color.brand },
  welcomeBody: { ...type.body, color: color.inkMuted, marginTop: space.xs },
  actions: { gap: space.md, marginTop: space.sm },

  card: { marginBottom: space.md },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  cardName: { ...type.heading, color: color.ink, flex: 1 },
  cardMoney: { ...type.title, color: color.ink, marginTop: space.lg },
  cardMoneyUnit: { ...type.subtitle, color: color.inkMuted },
  cardMeta: { ...type.body, color: color.inkMuted, marginTop: space.xs },
  cardFooter: { marginTop: space.xl, gap: space.md },
  cardStatus: { ...type.label, color: color.inkMuted },
  cardTurn: { ...type.labelStrong, color: color.due, marginTop: space.md },
  fillTrack: { height: 10, borderRadius: radius.pill, backgroundColor: color.sunken, overflow: "hidden" },
  fillBar: { height: 10, borderRadius: radius.pill, backgroundColor: color.brand },

  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(22, 32, 44, 0.45)" },
  sheet: {
    backgroundColor: color.canvas,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.xxl,
    paddingTop: space.md,
    paddingBottom: space.huge,
  },
  handle: { width: 44, height: 5, borderRadius: radius.pill, backgroundColor: color.line, alignSelf: "center" },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: space.xl,
  },
  sheetTitle: { ...type.title, color: color.ink },
  close: { width: tap.min, height: tap.min, alignItems: "center", justifyContent: "center", marginRight: -space.md },
  closeGlyph: { fontSize: 30, lineHeight: 34, color: color.inkMuted },
  sheetBody: { ...type.body, color: color.inkMuted, marginTop: space.sm, marginBottom: space.xl },
  sheetInput: { marginBottom: space.lg },
  sheetMessage: { ...type.label, color: color.inkMuted, marginBottom: space.lg },
});
