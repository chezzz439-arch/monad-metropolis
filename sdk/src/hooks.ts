import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Address } from "viem";
import type { ChitCircleClient } from "./client.ts";
import { checkInviteTarget, parseInviteLink, type InviteTarget } from "./invite.ts";
import type {
  CircleView,
  CreateCircleArgs,
  CreateCircleResult,
  DiscoveryOptions,
  TxResult,
} from "./types.ts";

/**
 * The surface the UI consumes. Every hook returns the same shapes:
 *
 *   reads   -> { data, loading, error, refresh }
 *   writes  -> { run, pending, error, result }
 *
 * so screens can be written once against a predictable contract.
 */

// -- context ---------------------------------------------------------------

const ClientContext = createContext<ChitCircleClient | null>(null);

export const ChitCircleProvider = ClientContext.Provider;

export function useChitClient(): ChitCircleClient {
  const client = useContext(ClientContext);
  if (!client) throw new Error("Wrap the app in <ChitCircleProvider value={client}>");
  return client;
}

// -- shared shapes ---------------------------------------------------------

export interface ReadState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

/**
 * @typeParam TResult the write's own result shape. Defaults to {@link TxResult};
 *            `useCreateCircle` narrows it so callers get the new circle's id
 *            without a second lookup.
 */
export interface WriteState<TArgs extends unknown[], TResult extends TxResult = TxResult> {
  run: (...args: TArgs) => Promise<TResult | null>;
  pending: boolean;
  error: Error | null;
  result: TResult | null;
}

/** Wraps a write so screens get pending/error/result without boilerplate. */
function useWrite<TArgs extends unknown[], TResult extends TxResult = TxResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  onSuccess?: () => void,
): WriteState<TArgs, TResult> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<TResult | null>(null);

  const run = useCallback(
    async (...args: TArgs) => {
      setPending(true);
      setError(null);
      try {
        const res = await fn(...args);
        setResult(res);
        onSuccess?.();
        return res;
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
        return null;
      } finally {
        setPending(false);
      }
    },
    [fn, onSuccess],
  );

  return { run, pending, error, result };
}

// -- reads -----------------------------------------------------------------

/**
 * Everything a circle screen needs, re-fetched on an interval so the UI picks
 * up other members' payments and settlements without a manual refresh.
 *
 * @param pollMs set to 0 to disable polling. Default 4s suits demo-speed
 *        rounds; raise it for real monthly circles.
 */
export function useCircle(circleId: bigint | null, me?: Address, pollMs = 4000): ReadState<CircleView> {
  const client = useChitClient();
  const [data, setData] = useState<CircleView | null>(null);
  const [loading, setLoading] = useState(circleId !== null);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (circleId === null) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;

    const load = async () => {
      try {
        const view = await client.getCircleView(circleId, me);
        if (!cancelled) {
          setData(view);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    if (pollMs <= 0) return () => {
      cancelled = true;
    };

    const id = setInterval(load, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [client, circleId, me, pollMs, tick]);

  return { data, loading, error, refresh };
}

/**
 * Whether the probe's own reading is safe to put on screen before the full
 * read lands.
 *
 * Only within the same round. A settle moves the round on, and pairing its
 * fresh pot with the previous round's recipient and debtors — which only the
 * full read can update — would show a confident wrong answer for a second or
 * so. Payments, which is what the fast path exists for, leave the round alone.
 *
 * Exported so the rule can be tested without a renderer, like
 * {@link primaryActionFor}: a wrong answer here is a wrong number in front of
 * someone, not a failed assertion.
 */
export type ProbePatch = Pick<CircleView, "pot" | "round" | "started" | "finished">;

export function probePatchFor(circle: ProbePatch, previousRound: number | null): ProbePatch | null {
  if (previousRound === null || previousRound !== circle.round) return null;
  return {
    pot: circle.pot,
    round: circle.round,
    started: circle.started,
    finished: circle.finished,
  };
}

/** `pot:round:started:finished` — everything a payment or a settle moves. */
function fingerprintOf(circle: Pick<CircleView, "pot" | "round" | "started" | "finished">): string {
  return `${circle.pot}:${circle.round}:${circle.started}:${circle.finished}`;
}

/**
 * A circle that keeps up with the other members.
 *
 * MEASURED, both directions, two Chrome profiles against the deployed site:
 * **1.9s** from a payment landing on chain to the other profile's pot moving,
 * no reload. Anchored to the payment's own block timestamp, with the sampling
 * done over CDP so it adds no RPC load of its own. Earlier figures of 6.0s and
 * 4.5s were measurement artefacts — a 1.5s screen-poll, and a clock that only
 * started once the payer's own screen had confirmed. A third attempt said 40.6s
 * and was worse than useless: it polled the contract during the window, which
 * pushed past the RPC's ceiling and throttled the very probe being timed.
 *
 * TWO CADENCES, BECAUSE ONE DOES NOT FIT. Polling the whole view every second
 * is the obvious implementation and it does not work here: a full read is
 * about fourteen contract calls, Monad's public RPC meters calls rather than
 * HTTP requests, and we measured 429s well below that rate. Batching does not
 * help — it was tried, and three batches of twenty were refused where twelve
 * single requests went through.
 *
 * So the fast loop reads `getCircle`, which is exactly ONE call and carries
 * everything a payment or a settlement moves: the pot, the round, and the two
 * lifecycle flags. Only when that fingerprint changes does the expensive read
 * run. Steady state is cheaper than the 8-second full poll it replaces — about
 * 1.5 calls a second against 1.75 — while reacting roughly eight times faster.
 *
 * What the probe deliberately misses is somebody joining a circle that is not
 * yet full, which moves neither pot nor round. That is what `fullMs` is for.
 * Nobody is watching a half-empty circle for a sub-second update; they are
 * watching a live round.
 *
 * @returns the usual read state plus `changedAt`, a timestamp set only when
 *          the probe caught someone *else's* move — your own writes refresh
 *          through `refresh()` and update the fingerprint first, so they do
 *          not announce themselves back to you.
 */
export function useLiveCircle(
  circleId: bigint | null,
  me?: Address,
  opts: { probeMs?: number; fullMs?: number } = {},
): ReadState<CircleView> & { changedAt: number | null } {
  const probeMs = opts.probeMs ?? 1200;
  const fullMs = opts.fullMs ?? 20000;
  const client = useChitClient();
  const base = useCircle(circleId, me, fullMs);
  const { data, refresh } = base;
  const [changedAt, setChangedAt] = useState<number | null>(null);
  const fingerprint = useRef<string | null>(null);
  /** Tracked on its own rather than parsed back out of the fingerprint. */
  const lastRound = useRef<number | null>(null);
  /**
   * The probe's own reading of the headline numbers, shown before the full
   * read catches up.
   *
   * The probe already holds the pot — it is one `getCircle` — and throwing it
   * away meant the pot waited for the twelve-call refresh behind it. Measured
   * across two profiles on the live site, someone else's payment took 6.0s to
   * appear; the brief asked for one to two. This is the same number arriving at
   * probe speed, with the refresh still running for the roster behind it.
   */
  const [patch, setPatch] = useState<ProbePatch | null>(null);

  // Keep the probe's idea of "current" in step with the full read, so an
  // action you took yourself does not come back as someone else's news.
  useEffect(() => {
    if (data) {
      fingerprint.current = fingerprintOf(data);
      lastRound.current = data.round;
    }
    // The full read is authoritative, so its arrival retires the patch.
    setPatch(null);
  }, [data]);

  useEffect(() => {
    if (circleId === null || probeMs <= 0) return;
    let cancelled = false;

    const probe = async () => {
      try {
        const circle = await client.getCircle(circleId);
        if (cancelled) return;
        const next = fingerprintOf(circle);
        // First probe only learns the current value; it is not news.
        if (fingerprint.current === null) {
          fingerprint.current = next;
          lastRound.current = circle.round;
          return;
        }
        if (next === fingerprint.current) return;
        const wasRound = lastRound.current;
        fingerprint.current = next;
        lastRound.current = circle.round;
        setChangedAt(Date.now());
        setPatch(probePatchFor(circle, wasRound));
        refresh();
      } catch {
        // A probe is a convenience and its failures are not worth reporting:
        // the full read owns the error state, and surfacing a single refused
        // call here would put "something went wrong" under a working circle.
      }
    };

    const id = setInterval(probe, probeMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [client, circleId, probeMs, refresh]);

  const merged = data && patch ? { ...data, ...patch } : data;
  return { ...base, data: merged, changedAt };
}

/** AUSD balance for the header. */
export function useTokenBalance(token: Address | null, account: Address | null, pollMs = 6000): ReadState<bigint> {
  const client = useChitClient();
  const [data, setData] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(Boolean(token && account));
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!token || !account) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;

    const load = async () => {
      try {
        const bal = await client.balanceOf(token, account);
        if (!cancelled) {
          setData(bal);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    if (pollMs <= 0) return () => {
      cancelled = true;
    };

    const id = setInterval(load, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [client, token, account, pollMs, tick]);

  return { data, loading, error, refresh };
}

/**
 * Circles this account belongs to. One contract read per circle id, so it is
 * slower than {@link useCircle} — do not poll it aggressively.
 *
 * @param pollMs defaults to 0 (no polling). Call `refresh` after a create or
 *        join instead.
 */
export function useMyCircles(
  me: Address | null,
  opts: DiscoveryOptions = {},
  pollMs = 0,
): ReadState<CircleView[]> {
  const client = useChitClient();
  const [data, setData] = useState<CircleView[] | null>(null);
  const [loading, setLoading] = useState(Boolean(me));
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const { maxCircles } = opts;
  // Depend on the contents, not the array identity: callers build `knownIds`
  // inline from local storage, so a fresh array every render would otherwise
  // re-fire this effect forever.
  const knownKey = (opts.knownIds ?? []).join(",");

  useEffect(() => {
    if (!me) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;

    const load = async () => {
      try {
        const knownIds = knownKey ? knownKey.split(",").map(BigInt) : [];
        const circles = await client.myCircles(me, { knownIds, maxCircles });
        if (!cancelled) {
          setData(circles);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    if (pollMs <= 0) return () => {
      cancelled = true;
    };

    const id = setInterval(load, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [client, me, knownKey, maxCircles, pollMs, tick]);

  return { data, loading, error, refresh };
}

/**
 * Subscribe to "the app came back to the foreground". Returns an unsubscribe.
 */
export type FocusSubscribe = (onFocus: () => void) => () => void;

/**
 * Re-run a read when the app regains focus. Pair it with {@link useMyCircles},
 * which does not poll: a user who joins a circle from a link, backgrounds the
 * app, and comes back should not see a stale list.
 *
 * On web the default works with no second argument. React Native has no
 * `document`, so pass an `AppState` subscriber:
 *
 * ```tsx
 * useRefreshOnFocus(refresh, (onFocus) => {
 *   const sub = AppState.addEventListener("change", (s) => s === "active" && onFocus());
 *   return () => sub.remove();
 * });
 * ```
 *
 * Without that argument on React Native this is a no-op — deliberately silent
 * rather than importing `react-native` into a layer that also runs in tests.
 */
export function useRefreshOnFocus(refresh: () => void, subscribe?: FocusSubscribe): void {
  const latest = useLatest(refresh);

  useEffect(() => {
    if (subscribe) return subscribe(() => latest.current());

    const doc = (globalThis as { document?: Document }).document;
    if (!doc) return;

    const handler = () => {
      if (doc.visibilityState === "visible") latest.current();
    };
    doc.addEventListener("visibilitychange", handler);
    return () => doc.removeEventListener("visibilitychange", handler);
  }, [subscribe, latest]);
}

export type InviteStatus =
  | "idle"
  | "invalid"
  | "wrong-deployment"
  | "not-found"
  | "ready"
  | "error";

/**
 * Resolve an invite link into a circle, checking it belongs to this deployment.
 *
 * `status` separates the failures a screen must render differently: an
 * unparseable link, a link for another chain or contract, and a well-formed
 * link whose circle does not exist.
 */
export function useInvite(
  link: string | null,
  expected?: { chainId: number; contract: `0x${string}` },
): ReadState<CircleView> & { status: InviteStatus; target: InviteTarget | null } {
  const client = useChitClient();
  const [status, setStatus] = useState<InviteStatus>("idle");
  const [data, setData] = useState<CircleView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const target = useMemo(() => (link ? parseInviteLink(link) : null), [link]);
  const expectedChainId = expected?.chainId;
  const expectedContract = expected?.contract;

  useEffect(() => {
    if (!link) {
      setStatus("idle");
      setData(null);
      setLoading(false);
      return;
    }
    if (!target) {
      setStatus("invalid");
      setData(null);
      setLoading(false);
      return;
    }
    if (expectedChainId !== undefined && expectedContract) {
      const check = checkInviteTarget(target, { chainId: expectedChainId, contract: expectedContract });
      if (!check.ok) {
        setStatus("wrong-deployment");
        setError(new Error(check.reason));
        setData(null);
        setLoading(false);
        return;
      }
    }

    let cancelled = false;
    setLoading(true);

    const load = async () => {
      try {
        if (!(await client.circleExists(target.circleId))) {
          if (!cancelled) {
            setStatus("not-found");
            setData(null);
          }
          return;
        }
        const view = await client.getCircleView(target.circleId);
        if (!cancelled) {
          setData(view);
          setStatus("ready");
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setError(e instanceof Error ? e : new Error(String(e)));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [client, link, target, expectedChainId, expectedContract, tick]);

  return { data, loading, error, refresh, status, target };
}

/**
 * Live countdown to the settle deadline, for the round timer. Ticks locally
 * rather than re-reading the chain.
 *
 * Takes the circle rather than a deadline so it can anchor on
 * `secondsUntilSettle`, which the client derived from chain time, and count
 * down from there. `Date.now()` is used only as an elapsed-time delta, so a
 * device with a wrong clock still shows the right number. Re-anchors whenever
 * `useCircle` polls.
 */
export function useRoundCountdown(
  circle: Pick<CircleView, "secondsUntilSettle"> | null | undefined,
): number {
  const anchor = circle?.secondsUntilSettle;
  const [seconds, setSeconds] = useState(anchor ?? 0);

  useEffect(() => {
    if (anchor === undefined) {
      setSeconds(0);
      return;
    }
    setSeconds(anchor);
    const startedAt = Date.now();
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(Math.max(0, anchor - elapsed));
    }, 1000);
    return () => clearInterval(id);
  }, [anchor]);

  return seconds;
}

// -- writes ----------------------------------------------------------------

export function useCreateCircle(): WriteState<[CreateCircleArgs], CreateCircleResult> {
  const client = useChitClient();
  const fn = useCallback((args: CreateCircleArgs) => client.createCircle(args), [client]);
  return useWrite(fn);
}

export function useJoinCircle(onSuccess?: () => void): WriteState<[bigint]> {
  const client = useChitClient();
  const fn = useCallback((circleId: bigint) => client.join(circleId), [client]);
  return useWrite(fn, onSuccess);
}

export function useContribute(onSuccess?: () => void): WriteState<[bigint]> {
  const client = useChitClient();
  const fn = useCallback((circleId: bigint) => client.contribute(circleId), [client]);
  return useWrite(fn, onSuccess);
}

export function useSettleRound(onSuccess?: () => void): WriteState<[bigint]> {
  const client = useChitClient();
  const fn = useCallback((circleId: bigint) => client.settleRound(circleId), [client]);
  return useWrite(fn, onSuccess);
}

export function useWithdrawDeposit(onSuccess?: () => void): WriteState<[bigint]> {
  const client = useChitClient();
  const fn = useCallback((circleId: bigint) => client.withdrawDeposit(circleId), [client]);
  return useWrite(fn, onSuccess);
}

/** Member-to-member AUSD send. */
export function useSendToMember(onSuccess?: () => void): WriteState<[Address, Address, bigint]> {
  const client = useChitClient();
  const fn = useCallback(
    (token: Address, to: Address, amount: bigint) => client.sendToMember(token, to, amount),
    [client],
  );
  return useWrite(fn, onSuccess);
}

// -- derived UI state ------------------------------------------------------

export type CircleAction =
  | { kind: "join"; label: string }
  | { kind: "pay"; label: string }
  | { kind: "settle"; label: string }
  | { kind: "withdraw"; label: string }
  | { kind: "waiting"; label: string }
  | { kind: "none"; label: string };

/**
 * The single primary button a circle screen should show. Centralising this
 * keeps the same decision out of three different screens.
 *
 * Exported as a plain function so the decision can be tested without a
 * renderer — it is the kind of branching where a wrong answer is a wrong
 * button in someone's hands, not a failed assertion.
 */
export function primaryActionFor(circle: CircleView | null): CircleAction {
  if (!circle) return { kind: "none", label: "" };
  const me = circle.me;

  if (!circle.started) {
    if (me?.isMember) {
      return { kind: "waiting", label: `Waiting for members (${circle.members.length}/${circle.maxMembers})` };
    }
    return { kind: "join", label: "Join circle" };
  }

  if (circle.finished) {
    if (me?.isMember && !me.defaulted && !me.depositWithdrawn && me.deposit > 0n) {
      return { kind: "withdraw", label: "Get deposit back" };
    }
    return { kind: "none", label: "Circle complete" };
  }

  // Someone who opened an invite link to a circle that already started. The
  // actions below are not theirs to take: "Settle round" is permissionless
  // on-chain but nonsense to offer a stranger, and "N still to pay" reads as
  // if they were one of the debtors. The screen explains the closed door.
  if (!me?.isMember) return { kind: "none", label: "" };

  // Paying comes before settling, even after the deadline has passed. The
  // contract puts no deadline on `contribute`, so a member who still owes this
  // round can always pay — and settling is the one action that would cost them
  // their deposit and mark them defaulted. Offering "Settle round" to someone
  // who has not paid hands them the button that seizes their own money. A live
  // run did exactly that: a round timer ran out while a payment was in flight,
  // and the screen swapped "Pay $100" for "Settle round" underneath them.
  if (!me.defaulted && !me.paidThisRound) return { kind: "pay", label: "Pay" };
  if (circle.settleable) return { kind: "settle", label: "Settle round" };
  return { kind: "waiting", label: `${circle.outstanding.length} still to pay` };
}

export function usePrimaryAction(circle: CircleView | null): CircleAction {
  return useMemo(() => primaryActionFor(circle), [circle]);
}

/** Avoid a stale-closure footgun when polling inside callbacks. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
