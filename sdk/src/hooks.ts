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
import type { ChitCircleClient } from "./client";
import type { CircleView, CreateCircleArgs, TxResult } from "./types";

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

export interface WriteState<TArgs extends unknown[]> {
  run: (...args: TArgs) => Promise<TxResult | null>;
  pending: boolean;
  error: Error | null;
  result: TxResult | null;
}

/** Wraps a write so screens get pending/error/result without boilerplate. */
function useWrite<TArgs extends unknown[]>(
  fn: (...args: TArgs) => Promise<TxResult>,
  onSuccess?: () => void,
): WriteState<TArgs> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<TxResult | null>(null);

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
 * Live countdown to the settle deadline, for the round timer. Ticks locally
 * rather than re-reading the chain.
 */
export function useRoundCountdown(roundDeadline: bigint | undefined): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!roundDeadline) {
      setSeconds(0);
      return;
    }
    const compute = () => Math.max(0, Number(roundDeadline) - Math.floor(Date.now() / 1000));
    setSeconds(compute());
    const id = setInterval(() => setSeconds(compute()), 1000);
    return () => clearInterval(id);
  }, [roundDeadline]);

  return seconds;
}

// -- writes ----------------------------------------------------------------

export function useCreateCircle(): WriteState<[CreateCircleArgs]> {
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
 */
export function usePrimaryAction(circle: CircleView | null): CircleAction {
  return useMemo(() => {
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

    if (circle.settleable) return { kind: "settle", label: "Settle round" };
    if (me?.isMember && !me.defaulted && !me.paidThisRound) return { kind: "pay", label: "Pay" };
    return { kind: "waiting", label: `${circle.outstanding.length} still to pay` };
  }, [circle]);
}

/** Avoid a stale-closure footgun when polling inside callbacks. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
