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
import type { TLegendAggregate, TMapAggregate, TMapLegendAggregate } from "@apex-assistant/db";
import type { TTrackerRowUi } from "@/lib/tracker-profile-rows";

export type TProfileRangePayload = {
  rangeKey: string;
  timelinePoints: Array<{ capturedAt: string; rankScore: number }>;
  legendAggregates: TLegendAggregate[];
  mapAggregates: TMapAggregate[];
  mapLegendAggregates: TMapLegendAggregate[];
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

  const applyUrlRange = useCallback(
    async (nextRangeKey: string) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setRangeLoading(true);
      setRangeError(null);
      try {
        const res = await fetch(
          `/api/tracked/${encodeURIComponent(props.trackedAccountId)}/profile-range?range=${encodeURIComponent(nextRangeKey)}`,
          { signal: ac.signal }
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Request failed (${res.status})`);
        }
        const data = (await res.json()) as TProfileRangePayload;
        setState(data);
        const qs = new URLSearchParams();
        qs.set("range", data.rangeKey);
        window.history.replaceState(null, "", `${pathname}?${qs.toString()}`);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        setRangeError(e instanceof Error ? e.message : "Failed to load range");
      } finally {
        setRangeLoading(false);
      }
    },
    [pathname, props.trackedAccountId]
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
