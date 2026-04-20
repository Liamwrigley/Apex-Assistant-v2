"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LivePresenceCard } from "@/components/live-presence-card";
import { evaluateRealtimePresence } from "@/lib/realtime-presence";
import { getTeamIdentity } from "@/lib/team-name";
import { cn } from "@/lib/utils";
import type {
  TDashboardLiveOpenSession,
  TDashboardLivePresenceRow,
} from "@/lib/dashboard-live";

export type TLivePresenceSectionData = {
  tracked: TDashboardLivePresenceRow[];
  openSessionByTrackedId: Record<string, TDashboardLiveOpenSession>;
  partyGroups: string[][];
};

type TLivePresenceSectionProps = {
  data: TLivePresenceSectionData;
};

function presenceDedupeKey(row: TDashboardLivePresenceRow): string {
  if (row.identityGroupId) {
    return `gid:${row.identityGroupId}`;
  }
  return `owner:${row.ownerUserId}\0ign:${row.ign.trim().toLowerCase()}`;
}

export function LivePresenceSection(props: TLivePresenceSectionProps) {
  const { tracked, openSessionByTrackedId, partyGroups } = props.data;

  const seenPresenceGroups = new Set<string>();
  const informativeRealtimeRows = tracked
    .filter((row) => {
      const evaluation = evaluateRealtimePresence({
        realtimeUpdatedAt: row.realtimeUpdatedAt,
        realtimeIsOnline: row.realtimeIsOnline,
        realtimeIsInGame: row.realtimeIsInGame,
        realtimeCurrentState: row.realtimeCurrentState,
        realtimeCurrentStateAsText: row.realtimeCurrentStateAsText,
      });
      return evaluation.shouldShow;
    })
    .sort((a, b) => {
      const aGame = a.realtimeIsInGame === 1 ? 1 : 0;
      const bGame = b.realtimeIsInGame === 1 ? 1 : 0;
      if (aGame !== bGame) return bGame - aGame;
      const aOnline = a.realtimeIsOnline === 1 ? 1 : 0;
      const bOnline = b.realtimeIsOnline === 1 ? 1 : 0;
      if (aOnline !== bOnline) return bOnline - aOnline;
      const aTs = a.realtimeUpdatedAt ? new Date(a.realtimeUpdatedAt).getTime() : 0;
      const bTs = b.realtimeUpdatedAt ? new Date(b.realtimeUpdatedAt).getTime() : 0;
      if (aTs !== bTs) return bTs - aTs;
      return a.ign.localeCompare(b.ign);
    })
    .filter((row) => {
      const key = presenceDedupeKey(row);
      if (seenPresenceGroups.has(key)) return false;
      seenPresenceGroups.add(key);
      return true;
    });

  /** Render an explicit empty state instead of returning null. Returning
   *  null causes the card to vanish whenever no one happens to be online,
   *  which is jarring during transient stale-data windows (e.g. SSR snapshot
   *  shows nobody online but the live poll is about to surface 3 active
   *  players). A stable placeholder also avoids the page reflowing as the
   *  card pops in and out. */
  if (informativeRealtimeRows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Live Presence</CardTitle>
          <CardDescription>
            Realtime activity and the current online session.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            No tracked players are online right now.
          </p>
        </CardContent>
      </Card>
    );
  }

  const liveIdSet = new Set(informativeRealtimeRows.map((r) => r.id));
  const livePartyGroups = partyGroups
    .map((group) => group.filter((id) => liveIdSet.has(id)))
    .filter((group) => group.length >= 2);
  const groupedIds = new Set(livePartyGroups.flat());
  const soloRows = informativeRealtimeRows.filter((r) => !groupedIds.has(r.id));
  const rowById = new Map(informativeRealtimeRows.map((r) => [r.id, r]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Presence</CardTitle>
        <CardDescription>
          Realtime activity and the current online session.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {livePartyGroups.map((groupIds) => {
          const team = getTeamIdentity(groupIds);
          const members = groupIds
            .map((id) => rowById.get(id))
            .filter(Boolean) as TDashboardLivePresenceRow[];
          return (
            <div key={groupIds.join(",")} className="space-y-2">
              <div
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5",
                  team.color.bg,
                  team.color.border,
                  "border",
                )}
              >
                <span
                  className={cn("h-2 w-2 rounded-full", team.color.dot)}
                  aria-hidden
                />
                <span
                  className={cn(
                    "text-xs font-semibold tracking-wide uppercase",
                    team.color.text,
                  )}
                >
                  {team.name}
                </span>
                <span className="text-muted-foreground text-[10px]">
                  {members.length} players
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {members.map((row) => (
                  <LivePresenceCard
                    key={row.id}
                    row={row}
                    session={openSessionByTrackedId[row.id] ?? null}
                  />
                ))}
              </div>
            </div>
          );
        })}
        {soloRows.length > 0 ? (
          <div className="space-y-2">
            {livePartyGroups.length > 0 ? (
              <div className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/20 px-3 py-1.5">
                <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  Solo
                </span>
              </div>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {soloRows.map((row) => (
                <LivePresenceCard
                  key={row.id}
                  row={row}
                  session={openSessionByTrackedId[row.id] ?? null}
                />
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
