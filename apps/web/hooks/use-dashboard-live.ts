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
  const res = await fetch(url);
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
 */
export function useDashboardLive(
  initialData: TDashboardLivePayload,
  guildId?: string,
) {
  return useQuery<TDashboardLivePayload>({
    queryKey: ["dashboard-live", guildId ?? "all"],
    queryFn: () => fetchDashboardLive(guildId),
    initialData,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}
