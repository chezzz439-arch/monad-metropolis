/**
 * One circle, in full.
 *
 * The screen is ordered the way the question gets asked out loud: how much is
 * in the pot, who gets it, when, and what do I have to do. The missed-payment
 * card sits third because it is the thing this product exists to prove — when
 * someone does not pay, the group does not lose anything.
 */
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Address } from "viem";
import {
  buildInviteLink,
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
import { Avatar, Button, Card, Chip, Divider, ErrorNote, ProgressDots, SectionTitle, Skeleton } from "../components/ui";
import { SuccessScreen, type Celebration } from "./SuccessScreen";
import { color, radius, space, tap, type } from "../design/tokens";
import { friendlyError, money, personName, timeLeft } from "../design/copy";
import { shareInviteLink, type ShareOutcome } from "../services/shareInvite";

/** How long to wait before trying a failed roster read again. */
const ROSTER_RETRY_MS = 4000;

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
  const [retry, setRetry] = useState(0);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [shared, setShared] = useState<ShareOutcome | null>(null);
  const seconds = useRoundCountdown(circle);
  const primaryAction = usePrimaryAction(circle);
  const pending = join.pending || contribute.pending || settle.pending || withdraw.pending;
  const actionError = join.error ?? contribute.error ?? settle.error ?? withdraw.error;

  /**
   * The roster, refetched when the round or the membership moves.
   *
   * `retry` is in the dependencies because without it a single failure was
   * permanent: nothing else here changes on its own, so one unlucky read — a
   * busy RPC during the burst around a join — pinned "Something went wrong"
   * under a circle that was working perfectly, and polling never cleared it.
   * Caught on the deployed site, where the join succeeded and the error stayed.
   */
  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    client.getRoster(circleId).then((members) => {
      if (!active) return;
      setRoster(members);
      setRosterError(null);
    }).catch((cause: unknown) => {
      if (!active) return;
      setRosterError(friendlyError(cause));
      retryTimer = setTimeout(() => active && setRetry((n) => n + 1), ROSTER_RETRY_MS);
    });

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [client, circleId, circle?.round, circle?.members.length, retry]);

  const nameOf = (who: Address) => {
    const slot = circle?.members.findIndex((m) => m.toLowerCase() === who.toLowerCase()) ?? -1;
    return personName(who, slot < 0 ? 0 : slot, account);
  };

  const runPrimaryAction = async () => {
    if (!circle || !canWrite) return;

    // Read what this call is about to change while it can still be read: once
    // settle lands, the round has moved on and the recipient and pot are gone.
    const before = {
      recipient: circle.recipient,
      pot: circle.pot,
      expectedPot: circle.expectedPot,
      unpaid: circle.outstanding,
      round: circle.round,
      deposit: circle.me?.deposit ?? 0n,
    };

    let result: TxResult | null = null;
    if (primaryAction.kind === "join") result = await join.run(circleId);
    if (primaryAction.kind === "pay") result = await contribute.run(circleId);
    if (primaryAction.kind === "settle") result = await settle.run(circleId);
    if (primaryAction.kind === "withdraw") result = await withdraw.run(circleId);
    if (!result) return;

    const seized = BigInt(before.unpaid.length) * circle.contribution;
    const paidOut = before.pot + seized > before.expectedPot ? before.expectedPot : before.pot + seized;
    const missedNames = before.unpaid.map(nameOf);
    const base = { settledInSeconds: result.settledInSeconds, reference: result.hash };

    if (primaryAction.kind === "join") {
      setCelebration({
        ...base,
        title: "You're in",
        body: `Your ${money(circle.contribution)} deposit is set aside. You get it back when the circle finishes.`,
      });
    } else if (primaryAction.kind === "pay") {
      setCelebration({
        ...base,
        title: `You paid ${money(circle.contribution)}`,
        body: `That is your share of round ${before.round + 1}.`,
      });
    } else if (primaryAction.kind === "settle") {
      const mine = before.recipient && account && before.recipient.toLowerCase() === account.toLowerCase();
      setCelebration({
        ...base,
        title: mine
          ? `You received ${money(paidOut)}`
          : `${before.recipient ? nameOf(before.recipient) : "The next person"} received ${money(paidOut)}`,
        body: mine ? "It is in your balance already." : undefined,
        missed: missedNames.length ? missedSentence(missedNames) : undefined,
      });
    } else if (primaryAction.kind === "withdraw") {
      setCelebration({ ...base, title: `You got ${money(before.deposit)} back`, body: "That was your deposit, returned in full." });
    }
  };

  const inviteLink = buildInviteLink(circleId, {
    chainId: deployment.chainId,
    contract: deployment.chitCircle,
  });

  const shareInvite = async () => {
    setShared(await shareInviteLink(inviteLink));
  };

  if (loading && !circle) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Skeleton width="100%" height={168} style={{ borderRadius: radius.lg }} />
        <Skeleton width="60%" height={24} style={{ marginTop: space.xxl }} />
        <Skeleton width="100%" height={64} style={{ marginTop: space.lg, borderRadius: radius.md }} />
        <Skeleton width="100%" height={64} style={{ marginTop: space.sm, borderRadius: radius.md }} />
      </ScrollView>
    );
  }

  if (error || !circle) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <ErrorNote message={error ? friendlyError(error) : "We could not open this circle."} onRetry={refresh} />
        <Button label="Back to your circles" variant="ghost" onPress={onBack} />
      </ScrollView>
    );
  }

  const defaulters = roster.filter((member) => member.defaulted);
  const recipientName = circle.recipient ? nameOf(circle.recipient) : null;
  const spotsLeft = circle.maxMembers - circle.members.length;
  /** Members of a circle that is not full yet are the only ones who can recruit. */
  const showInvite = !circle.started && !circle.finished && Boolean(circle.me?.isMember);

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Pot */}
        <View style={styles.pot}>
          <Text style={styles.potLabel}>Pot this round</Text>
          <Text style={styles.potValue}>{money(circle.pot)}</Text>
          <Text style={styles.potOf}>
            of {money(circle.expectedPot)} · {money(circle.contribution)} each
          </Text>
          {circle.started && !circle.finished ? (
            <View style={styles.potFooter}>
              <ProgressDots total={circle.maxMembers} current={circle.round + 1} on="dark" />
              <Text style={styles.potTimerTight}>
                {circle.settleable ? "Ready to pay out" : timeLeft(seconds)}
              </Text>
            </View>
          ) : (
            <Text style={styles.potTimer}>
              {circle.finished
                ? "All rounds complete"
                : `Starts when ${circle.maxMembers - circle.members.length} more join`}
            </Text>
          )}
        </View>

        {/* Who gets it */}
        {recipientName && !circle.finished ? (
          <Card style={styles.recipientCard}>
            <Avatar name={recipientName} size={48} tone={recipientName === "You" ? "brand" : "neutral"} />
            <View style={styles.recipientText}>
              <Text style={styles.recipientName}>
                {recipientName === "You" ? "You get the pot this round" : `${recipientName} gets the pot this round`}
              </Text>
              <Text style={styles.recipientMeta}>Round {circle.round + 1} of {circle.maxMembers}</Text>
            </View>
          </Card>
        ) : null}

        {/* The moment the product exists for */}
        {defaulters.length > 0 ? (
          <View style={styles.missed}>
            <Text style={styles.missedTitle}>{missedBanner(defaulters.map((m) => nameOf(m.address)))}</Text>
            <Text style={styles.missedBody}>The pot stayed full, and nobody else had to make up the difference.</Text>
          </View>
        ) : null}

        {/* What to do */}
        {primaryAction.kind !== "none" && !(showInvite && primaryAction.kind === "waiting") ? (
          <View style={styles.actionBlock}>
            <Text style={styles.actionDescription}>{describeAction(primaryAction.kind, circle)}</Text>
            {actionError ? (
              <ErrorNote message={friendlyError(actionError)} onRetry={() => void runPrimaryAction()} />
            ) : null}
            <Button
              label={actionLabel(primaryAction.kind, primaryAction.label, circle)}
              onPress={() => void runPrimaryAction()}
              loading={pending}
              disabled={!canWrite || primaryAction.kind === "waiting"}
            />
          </View>
        ) : null}

        {/*
          Still filling up, and this viewer is already in — which is exactly
          where the organizer lands after creating. Nothing else can happen
          until the others arrive, so inviting them is the screen's whole job
          and gets a real button. Someone who has not joined yet sees only
          "Join for $100": asking them to recruit a circle they are not in is
          backwards, and two navy buttons would compete for the same tap.
        */}
        {showInvite ? (
          <View style={styles.inviteBlock}>
            <Text style={styles.inviteTitle}>
              {spotsLeft === 1 ? "One more person to go" : `${spotsLeft} more people to go`}
            </Text>
            <Text style={styles.inviteBody}>
              Send everyone the link. They set up an account and join on the same screen, and the circle
              starts by itself once all {circle.maxMembers} are in.
            </Text>
            <Button label="Invite members" onPress={() => void shareInvite()} />
            {shared ? (
              <Text style={styles.inviteNote}>
                {shared === "copied"
                  ? "Link copied — paste it into your group chat."
                  : shared === "shared"
                    ? "Invite sent."
                    : "Could not copy automatically. The link is below."}
              </Text>
            ) : null}
            {shared === "failed" ? (
              <Text style={styles.inviteLink} selectable>
                {inviteLink}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Members */}
        <View style={styles.members}>
          <SectionTitle
            right={
              // Not alongside the big "Invite members" button — one way to do
              // a thing, not two. Kept for a full circle, where the block is
              // gone but someone may still want the link.
              showInvite || circle.finished ? undefined : (
                <Pressable onPress={() => void shareInvite()} style={styles.share} accessibilityRole="button">
                  <Text style={styles.shareText}>Share invite</Text>
                </Pressable>
              )
            }
          >
            {circle.members.length} of {circle.maxMembers} people
          </SectionTitle>

          {rosterError ? (
            <ErrorNote message={rosterError} />
          ) : (
            <Card style={styles.memberCard}>
              {roster.map((member, index) => {
                const name = personName(member.address, index, account);
                const receiving = circle.recipient?.toLowerCase() === member.address.toLowerCase();
                return (
                  <View key={member.address}>
                    {index > 0 ? <Divider /> : null}
                    <View style={styles.memberRow}>
                      <Avatar
                        name={name}
                        size={44}
                        tone={member.defaulted ? "missed" : name === "You" ? "brand" : "neutral"}
                      />
                      <View style={styles.memberText}>
                        <Text style={styles.memberName}>{name}</Text>
                        {receiving && !circle.finished ? (
                          <Text style={styles.memberNote}>
                            {name === "You" ? "Your turn this round" : "Gets the pot this round"}
                          </Text>
                        ) : (
                          <Text style={styles.memberNote}>Takes round {member.payoutRound + 1}</Text>
                        )}
                      </View>
                      {member.defaulted ? (
                        <Chip label="Missed" tone="missed" />
                      ) : member.paidThisRound ? (
                        <Chip label="Paid" tone="paid" />
                      ) : circle.finished ? (
                        <Chip label="Done" tone="paid" />
                      ) : circle.started ? (
                        <Chip label="Due" tone="due" />
                      ) : (
                        <Chip label="Joined" tone="neutral" />
                      )}
                    </View>
                  </View>
                );
              })}
            </Card>
          )}
        </View>
      </ScrollView>

      <SuccessScreen celebration={celebration} onDone={() => setCelebration(null)} />
    </>
  );
}

function listNames(names: string[]): string {
  return names.length === 1
    ? names[0]!
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]!}`;
}

/** Said at the moment it happens: "Priya missed this round — their deposit covered it." */
function missedSentence(names: string[]): string {
  if (names.length === 0) return "";
  const deposit = names.length === 1 ? "their deposit" : "their deposits";
  return `${listNames(names)} missed this round — ${deposit} covered it. The pot is still full.`;
}

/**
 * Said afterwards, on a screen that has moved on to the next round. The
 * default flag outlives the round it happened in, so "this round" would sit
 * directly above a pot that is legitimately back at $0 and read as a bug.
 */
function missedBanner(names: string[]): string {
  if (names.length === 0) return "";
  const deposit = names.length === 1 ? "their deposit" : "their deposits";
  return `${listNames(names)} missed a round — ${deposit} covered it.`;
}

type ActionKind = ReturnType<typeof usePrimaryAction>["kind"];

function actionLabel(kind: ActionKind, fallback: string, circle: { contribution: bigint }): string {
  switch (kind) {
    case "pay":
      return `Pay ${money(circle.contribution)}`;
    case "join":
      return `Join for ${money(circle.contribution)}`;
    case "settle":
      return "Settle round";
    case "withdraw":
      return "Get your deposit back";
    default:
      return fallback;
  }
}

function describeAction(
  kind: ActionKind,
  circle: { contribution: bigint; maxMembers: number; members: readonly unknown[]; outstanding: readonly unknown[]; started: boolean },
): string {
  switch (kind) {
    case "pay":
      return "Your share for this round.";
    case "join":
      return `Joining sets aside ${money(circle.contribution)} as your deposit. You get it back at the end.`;
    case "settle":
      return "The timer has run out. Anyone can pay out this round now.";
    case "withdraw":
      return "The circle is finished and your deposit is ready.";
    case "waiting":
      return circle.started
        ? `${circle.outstanding.length} still to pay this round.`
        : `Waiting for ${circle.maxMembers - circle.members.length} more to join.`;
    default:
      return "";
  }
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.xl, paddingBottom: space.huge },

  pot: {
    backgroundColor: color.brand,
    borderRadius: radius.xl,
    padding: space.xxl,
    marginBottom: space.lg,
  },
  potLabel: { ...type.label, color: "#A9BBD6" },
  potValue: { ...type.hero, color: color.onBrand, marginTop: space.xs },
  potOf: { ...type.body, color: "#C3D1E5", marginTop: space.xs },
  potFooter: { marginTop: space.xxl, gap: space.lg },
  potTimer: { ...type.bodyStrong, color: color.highlight, marginTop: space.lg },
  potTimerTight: { ...type.bodyStrong, color: color.highlight },

  recipientCard: { flexDirection: "row", alignItems: "center", gap: space.lg, marginBottom: space.lg },
  recipientText: { flex: 1 },
  recipientName: { ...type.subtitle, color: color.ink },
  recipientMeta: { ...type.label, color: color.inkMuted, marginTop: 2 },

  missed: {
    backgroundColor: color.highlightSoft,
    borderRadius: radius.lg,
    borderLeftWidth: 5,
    borderLeftColor: color.highlight,
    padding: space.xl,
    marginBottom: space.lg,
  },
  missedTitle: { ...type.subtitle, color: color.ink },
  missedBody: { ...type.body, color: color.due, marginTop: space.xs },

  actionBlock: { gap: space.md, marginTop: space.sm, marginBottom: space.xxl },

  inviteBlock: {
    backgroundColor: color.highlightSoft,
    borderRadius: radius.lg,
    padding: space.xl,
    gap: space.md,
    marginBottom: space.xxl,
  },
  inviteTitle: { ...type.heading, color: color.ink },
  inviteBody: { ...type.body, color: color.inkMuted },
  inviteNote: { ...type.label, color: color.due, textAlign: "center" },
  inviteLink: { ...type.caption, color: color.inkMuted },
  actionDescription: { ...type.body, color: color.inkMuted },

  members: { marginTop: space.sm },
  share: { minHeight: tap.min, justifyContent: "center" },
  shareText: { ...type.labelStrong, color: color.brand },
  memberCard: { paddingVertical: space.xs, paddingHorizontal: space.xl },
  memberRow: { flexDirection: "row", alignItems: "center", gap: space.lg, paddingVertical: space.md, minHeight: 72 },
  memberText: { flex: 1 },
  memberName: { ...type.bodyStrong, color: color.ink },
  memberNote: { ...type.label, color: color.inkFaint, marginTop: 1 },
});
