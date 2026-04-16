"use client";

import { useQuery } from "@tanstack/react-query";
import type { TLivePresenceCardRow } from "@/components/live-presence-card";
import type { TLivePresenceSessionProps } from "@/components/live-presence-card";

export type TPresenceTrackedRow = TLivePresenceCardRow & {
  identityGroupId: string | null;
  ownerUserId: string;
};

export type TPresencePayload = {
  tracked: TPresenceTrackedRow[];
  openSessionByTrackedId: Record<string, NonNullable<TLivePresenceSessionProps>>;
  partyGroups: string[][];
};

async function fetchPresence(guildId?: string): Promise<TPresencePayload> {
  const params = new URLSearchParams();
  if (guildId) {
    params.set("guildId", guildId);
  }
  const url = `/api/presence${params.size > 0 ? `?${params}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Presence fetch failed: ${res.status}`);
  }
  return res.json();
}

export function usePresence(
  initialData: TPresencePayload,
  guildId?: string,
) {
  return useQuery<TPresencePayload>({
    queryKey: ["presence", guildId ?? "all"],
    queryFn: () => fetchPresence(guildId),
    initialData,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}
