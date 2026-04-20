"use client";

import { useQuery } from "@tanstack/react-query";
import type { TDashboardLivePayload } from "@/lib/dashboard-live";

async function fetchDashboardLive(
  guildId?: string,
): Promise<TDashboardLivePayload> {
  const params = new URLSearchParams();
  if (guildId) {
    params.set("guildId", guildId);
  }
  const url = `/api/dashboard-live${params.size > 0 ? `?${params}` : ""}`;
  /** `cache: "no-store"` so the browser never serves a stale dashboard
   *  snapshot from its HTTP cache. The edge cache on the API route still
   *  benefits from `s-maxage`, so this only bypasses the per-browser cache
   *  layer that was making "soft refresh" feel slow. */
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Dashboard live fetch failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Single source of truth for every frequently-changing dashboard card
 * (leaderboard, presence, in-progress sessions, top-stat movers). All cards
 * render from the same snapshot so they never drift out of sync with each
 * other.
 *
 * Caching/freshness contract:
 * - SSR provides `initialData` so the first paint is instant — but ISR can
 *   make that snapshot up to ~60s stale by the time the user loads the page.
 * - We mark `initialData` as "1970-old" via `initialDataUpdatedAt: 0` so
 *   TanStack treats it as already stale and triggers an immediate background
 *   refetch on mount. Combined with `refetchOnMount: "always"` this means
 *   users always see fresh data within ~1s of landing on the page, even
 *   when the SSR HTML was served from ISR cache.
 * - Polling continues every 30s while the tab is visible, and TanStack
 *   refetches on window focus and reconnect.
 */
export function useDashboardLive(
  initialData: TDashboardLivePayload,
  guildId?: string,
) {
  return useQuery<TDashboardLivePayload>({
    queryKey: ["dashboard-live", guildId ?? "all"],
    queryFn: () => fetchDashboardLive(guildId),
    initialData,
    initialDataUpdatedAt: 0,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}
