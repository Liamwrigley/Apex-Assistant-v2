"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import type { TLegendAggregate, TMapAggregate, TMapLegendAggregate, TStackComposition, TBestStackByMap } from "@apex-assistant/db";
import type { TTrackerRowUi } from "@/lib/tracker-profile-rows";
import type { TDashboardLiveRecentGameCell } from "@/lib/dashboard-live";

export type TProfileRangePayload = {
  rangeKey: string;
  timelinePoints: Array<{ capturedAt: string; rankScore: number }>;
  legendAggregates: TLegendAggregate[];
  mapAggregates: TMapAggregate[];
  mapLegendAggregates: TMapLegendAggregate[];
  /**
   * Last N ranked games for this account, newest first. Not filtered by range —
   * mirrors the leaderboard's "Last 60 games" contribution grid semantics so
   * the match-history card has a stable, count-based window regardless of the
   * range picker.
   */
  recentMatchGames: TDashboardLiveRecentGameCell[];
  /** Legacy: deltas from player_stat_snapshots + tracked_accounts — mixed API totals, not per-legend trackers. */
  careerDeltas: {
    deltaKills: number | null;
    deltaDamage: number | null;
    deltaWins: number | null;
  };
  /** Per–(legend, key) tracker rows for the selected legend (latest snapshot + range deltas). */
  trackerRows: TTrackerRowUi[];
  /** Legend matching the profile hero + equipped trackers (realtime vs most-played in range). */
  selectedLegend: string | null;
  /** Whether we have any tracker_observations rows for this account (sync has run with new ingestion). */
  hasTrackerObservations: boolean;
  /** Legacy `total.*`-style values on tracked_accounts — labeled separately in UI. */
  legacyApiSummary: {
    kills: number | null;
    damage: number | null;
    wins: number | null;
  } | null;
  stackCompositions: TStackComposition[];
  baselineAvgRp: { games: number; avgRpDelta: number } | null;
  bestStackByMap: TBestStackByMap[];
};

type TContextValue = TProfileRangePayload & {
  trackedAccountId: string;
  rangeLoading: boolean;
  rangeError: string | null;
  selectRange: (rangeKey: string) => void;
};

const ProfileRangeContext = createContext<TContextValue | null>(null);

const RANGES = ["24h", "3d", "7d", "14d", "30d"] as const;

function readRangeFromSearch(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const r = params.get("range") ?? "7d";
  return RANGES.includes(r as (typeof RANGES)[number]) ? r : "7d";
}

export function PlayerProfileRangeProvider(props: {
  trackedAccountId: string;
  initial: TProfileRangePayload;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [state, setState] = useState<TProfileRangePayload>(props.initial);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /**
   * In-memory payload cache keyed by rangeKey. Switching to a range we've
   * already loaded is synchronous and network-free — the toggle feels instant
   * and we avoid re-running 10+ heavy DB aggregations. Initial SSR data is
   * seeded eagerly so the default range never re-fetches on mount.
   */
  const payloadCacheRef = useRef<Map<string, TProfileRangePayload>>(
    new Map([[props.initial.rangeKey, props.initial]]),
  );
  /** In-flight requests deduped by rangeKey (ignores abort). */
  const inflightRef = useRef<Map<string, Promise<TProfileRangePayload>>>(
    new Map(),
  );

  const updateUrlRange = useCallback(
    (rangeKey: string) => {
      const qs = new URLSearchParams();
      qs.set("range", rangeKey);
      window.history.replaceState(null, "", `${pathname}?${qs.toString()}`);
    },
    [pathname],
  );

  const fetchRange = useCallback(
    async (
      nextRangeKey: string,
      opts: { signal?: AbortSignal } = {},
    ): Promise<TProfileRangePayload> => {
      const existing = inflightRef.current.get(nextRangeKey);
      if (existing) return existing;
      const promise = (async () => {
        const res = await fetch(
          `/api/tracked/${encodeURIComponent(props.trackedAccountId)}/profile-range?range=${encodeURIComponent(nextRangeKey)}`,
          { signal: opts.signal },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(body?.error ?? `Request failed (${res.status})`);
        }
        const data = (await res.json()) as TProfileRangePayload;
        payloadCacheRef.current.set(data.rangeKey, data);
        return data;
      })();
      inflightRef.current.set(nextRangeKey, promise);
      try {
        return await promise;
      } finally {
        inflightRef.current.delete(nextRangeKey);
      }
    },
    [props.trackedAccountId],
  );

  const applyUrlRange = useCallback(
    async (nextRangeKey: string) => {
      const cached = payloadCacheRef.current.get(nextRangeKey);
      if (cached) {
        abortRef.current?.abort();
        abortRef.current = null;
        setRangeError(null);
        setRangeLoading(false);
        setState(cached);
        updateUrlRange(cached.rangeKey);
        return;
      }
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setRangeLoading(true);
      setRangeError(null);
      try {
        const data = await fetchRange(nextRangeKey, { signal: ac.signal });
        if (ac.signal.aborted) return;
        setState(data);
        updateUrlRange(data.rangeKey);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        setRangeError(e instanceof Error ? e.message : "Failed to load range");
      } finally {
        if (abortRef.current === ac) setRangeLoading(false);
      }
    },
    [fetchRange, updateUrlRange],
  );

  const selectRange = useCallback(
    (rangeKey: string) => {
      if (!RANGES.includes(rangeKey as (typeof RANGES)[number]) || rangeKey === state.rangeKey) {
        return;
      }
      void applyUrlRange(rangeKey);
    },
    [applyUrlRange, state.rangeKey]
  );

  useEffect(() => {
    const onPop = () => {
      const nextKey = readRangeFromSearch(window.location.search);
      if (nextKey !== state.rangeKey) {
        void applyUrlRange(nextKey);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [applyUrlRange, state.rangeKey]);

  /**
   * Warm the cache for other ranges in the background after the page is
   * idle. Keeps the initial paint lean while making later toggles instant.
   * Runs once per mount; subsequent navigations within the same profile
   * re-use the cache already built up.
   */
  useEffect(() => {
    let cancelled = false;
    const abortController = new AbortController();
    const prefetch = async () => {
      const queue = RANGES.filter(
        (r) => !payloadCacheRef.current.has(r),
      );
      for (const r of queue) {
        if (cancelled) return;
        try {
          await fetchRange(r, { signal: abortController.signal });
        } catch {
          // Best-effort prefetch; errors are silently ignored.
        }
      }
    };

    type TIdleDeadline = { didTimeout: boolean; timeRemaining(): number };
    type TRequestIdle = (
      cb: (deadline: TIdleDeadline) => void,
      opts?: { timeout?: number },
    ) => number;
    const w = window as typeof window & { requestIdleCallback?: TRequestIdle };
    const schedule = w.requestIdleCallback ?? ((cb) => window.setTimeout(cb, 1200));
    const handle = schedule(() => void prefetch(), { timeout: 3000 });

    return () => {
      cancelled = true;
      abortController.abort();
      type TCancelIdle = (handle: number) => void;
      const cancelIdle = (window as typeof window & { cancelIdleCallback?: TCancelIdle })
        .cancelIdleCallback;
      if (cancelIdle) {
        cancelIdle(handle);
      } else {
        window.clearTimeout(handle);
      }
    };
  }, [fetchRange]);

  const value = useMemo<TContextValue>(
    () => ({
      ...state,
      trackedAccountId: props.trackedAccountId,
      rangeLoading,
      rangeError,
      selectRange,
    }),
    [props.trackedAccountId, rangeError, rangeLoading, selectRange, state]
  );

  return <ProfileRangeContext.Provider value={value}>{props.children}</ProfileRangeContext.Provider>;
}

export function useProfileRange(): TContextValue {
  const ctx = useContext(ProfileRangeContext);
  if (!ctx) {
    throw new Error("useProfileRange must be used within PlayerProfileRangeProvider");
  }
  return ctx;
}

export function PlayerProfileRangePicker() {
  const { rangeKey, selectRange, rangeLoading, rangeError } = useProfileRange();
  return (
    <div className="flex flex-col items-end gap-1">
      <div
        className={`flex items-center gap-1 rounded-md border p-0.5 ${rangeLoading ? "opacity-70" : ""}`}
        aria-busy={rangeLoading}
      >
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            disabled={rangeLoading}
            onClick={() => selectRange(r)}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              rangeKey === r
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {r}
          </button>
        ))}
      </div>
      {rangeError ? <p className="text-destructive max-w-[14rem] text-right text-[10px]">{rangeError}</p> : null}
    </div>
  );
}
