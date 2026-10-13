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

  if (circle.settleable) return { kind: "settle", label: "Settle round" };
  if (!me.defaulted && !me.paidThisRound) return { kind: "pay", label: "Pay" };
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
