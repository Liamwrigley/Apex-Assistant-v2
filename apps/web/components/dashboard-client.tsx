"use client";

import { LeaderboardCard } from "@/components/leaderboard-card";
import { LivePresenceSection } from "@/components/live-presence-section";
import {
  RecentSessionsSection,
  type TRecentSessionRow,
} from "@/components/recent-sessions-section";
import { TrackedAccountsOwnerTable } from "@/components/tracked-accounts-owner-table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useDashboardLive } from "@/hooks/use-dashboard-live";
import type { TDashboardLivePayload } from "@/lib/dashboard-live";
import type { TPartyMatchSerialized } from "@/lib/party-matches";
import { useMemo } from "react";

type TTimelinePoint = { capturedAt: string; rankScore: number };

type TTrackedOwnerRow = {
  id: string;
  identityGroupId: string | null;
  ign: string;
  platform: string;
  ownerUserId: string;
  ownerDisplayName?: string | null;
  externalPlayerId: string | null;
  createdAt: string;
  lastCheckedAt: string | null;
  currentLevel: number | null;
  realtimeLobbyState: string | null;
  realtimeIsOnline: number | null;
  realtimeIsInGame: number | null;
  realtimeCanJoin: number | null;
  realtimePartyFull: number | null;
  realtimeSelectedLegend: string | null;
  realtimeCurrentState: string | null;
  realtimeCurrentStateAsText: string | null;
  realtimeCurrentStateSinceTimestamp: number | null;
  realtimeUpdatedAt: string | null;
  currentRankName: string | null;
  currentRankDivision: string | null;
};

export type TDashboardClientProps = {
  guildId?: string;
  initialLive: TDashboardLivePayload;
  timelines: Record<string, TTimelinePoint[]>;
  /** Party-only match clusters used by the leaderboard match-cell highlighter. */
  partyMatches: TPartyMatchSerialized[];
  /**
   * All matches (party clusters + solo segments) used by the match history
   * card. Sorted newest first.
   */
  matches: TPartyMatchSerialized[];
  /** Completed sessions from SSR. Live active sessions are merged in on top. */
  completedRecentSessions: TRecentSessionRow[];
  trackedByOwner: Record<string, TTrackedOwnerRow[]>;
};

export function DashboardClient(props: TDashboardClientProps) {
  const { data: live } = useDashboardLive(props.initialLive, props.guildId);

  const topStats = useMemo(() => {
    const top = live.leaderboard[0] ?? null;
    const averageRp =
      live.leaderboard.length === 0
        ? 0
        : Math.round(
            live.leaderboard.reduce((sum, row) => sum + row.rankScore, 0) /
              live.leaderboard.length,
          );
    return { top, averageRp };
  }, [live.leaderboard]);

  const recentSessions = useMemo(
    () => [...live.activeRecentSessions, ...props.completedRecentSessions],
    [live.activeRecentSessions, props.completedRecentSessions],
  );

  const presenceData = useMemo(
    () => ({
      tracked: live.tracked,
      openSessionByTrackedId: live.openSessionByTrackedId,
      partyGroups: live.partyGroups,
    }),
    [live.tracked, live.openSessionByTrackedId, live.partyGroups],
  );

  const { top, averageRp } = topStats;
  const { stats24h } = live;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <section className="grid gap-3 md:grid-cols-5">
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardHeader className="space-y-1 p-2.5">
            <div className="bg-emerald-500/15 text-emerald-300 inline-flex h-5 w-5 items-center justify-center rounded-sm">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden
                className="h-3 w-3"
              >
                <path d="M10 2a4 4 0 100 8 4 4 0 000-8zM3 16a7 7 0 1114 0v1H3v-1z" />
              </svg>
            </div>
            <CardDescription className="text-[11px] leading-none">
              Tracked Players
            </CardDescription>
            <div className="min-w-0 space-y-0.5">
              <CardTitle className="text-lg font-semibold tabular-nums leading-tight">
                {live.tracked.length}
              </CardTitle>
              <p className="text-muted-foreground min-h-[1rem] text-xs leading-tight">
                {"\u00a0"}
              </p>
            </div>
          </CardHeader>
        </Card>
        <Card className="border-cyan-500/20 bg-cyan-500/5">
          <CardHeader className="space-y-1 p-2.5">
            <div className="bg-cyan-500/15 text-cyan-300 inline-flex h-5 w-5 items-center justify-center rounded-sm">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden
                className="h-3 w-3"
              >
                <path d="M4 15h2V8H4v7zm5 0h2V3H9v12zm5 0h2v-5h-2v5z" />
              </svg>
            </div>
            <CardDescription className="text-[11px] leading-none">
              Average RP
            </CardDescription>
            <div className="min-w-0 space-y-0.5">
              <CardTitle className="text-lg font-semibold tabular-nums leading-tight">
                {averageRp.toLocaleString()}
              </CardTitle>
              <p className="text-muted-foreground min-h-[1rem] text-xs leading-tight">
                {"\u00a0"}
              </p>
            </div>
          </CardHeader>
        </Card>
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader className="space-y-1 p-2.5">
            <div className="bg-amber-500/15 text-amber-300 inline-flex h-5 w-5 items-center justify-center rounded-sm">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden
                className="h-3 w-3"
              >
                <path d="M5 3h10v2h1a1 1 0 011 1v2a4 4 0 01-4 4h-1.1A4 4 0 0111 13v2h2v2H7v-2h2v-2a4 4 0 01-.9-2H7a4 4 0 01-4-4V6a1 1 0 011-1h1V3zM5 7H4v1a2 2 0 002 2h1V7zm10 0h1v1a2 2 0 01-2 2h-1V7z" />
              </svg>
            </div>
            <CardDescription className="text-[11px] leading-none">
              Top Player
            </CardDescription>
            <div className="min-w-0 space-y-0.5">
              <CardTitle className="truncate text-lg font-semibold leading-tight">
                {top ? top.ign : "—"}
              </CardTitle>
              <p className="text-muted-foreground min-h-[1rem] truncate text-xs leading-tight">
                {top ? `${top.rankScore.toLocaleString()} RP` : "\u00a0"}
              </p>
            </div>
          </CardHeader>
        </Card>
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardHeader className="space-y-1 p-2.5">
            <div className="bg-emerald-500/15 text-emerald-300 inline-flex h-5 w-5 items-center justify-center rounded-sm">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden
                className="h-3 w-3"
              >
                <path d="M10 3l5 6h-3v8H8V9H5l5-6z" />
              </svg>
            </div>
            <CardDescription className="text-[11px] leading-none">
              Highest Gainer (24h)
            </CardDescription>
            <div className="min-w-0 space-y-0.5">
              <CardTitle className="truncate text-lg font-semibold leading-tight">
                {stats24h.highestGainer ? stats24h.highestGainer.ign : "—"}
              </CardTitle>
              <p className="text-muted-foreground min-h-[1rem] truncate text-xs leading-tight">
                {stats24h.highestGainer
                  ? `+${stats24h.highestGainer.deltaRp.toLocaleString()} RP`
                  : "\u00a0"}
              </p>
            </div>
          </CardHeader>
        </Card>
        <Card className="border-rose-500/20 bg-rose-500/5">
          <CardHeader className="space-y-1 p-2.5">
            <div className="bg-rose-500/15 text-rose-300 inline-flex h-5 w-5 items-center justify-center rounded-sm">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden
                className="h-3 w-3"
              >
                <path d="M10 17l-5-6h3V3h4v8h3l-5 6z" />
              </svg>
            </div>
            <CardDescription className="text-[11px] leading-none">
              Biggest Loser (24h)
            </CardDescription>
            <div className="min-w-0 space-y-0.5">
              <CardTitle className="truncate text-lg font-semibold leading-tight">
                {stats24h.biggestLoser ? stats24h.biggestLoser.ign : "—"}
              </CardTitle>
              <p className="text-muted-foreground min-h-[1rem] truncate text-xs leading-tight">
                {stats24h.biggestLoser
                  ? `${stats24h.biggestLoser.deltaRp.toLocaleString()} RP`
                  : "\u00a0"}
              </p>
            </div>
          </CardHeader>
        </Card>
      </section>

      <LeaderboardCard
        rows={live.leaderboard}
        timelines={props.timelines}
        trackedCount={live.tracked.length}
        recentGamesByTrackedAccountId={live.recentGamesByTrackedAccountId}
        partyMatches={props.partyMatches}
      />

      <LivePresenceSection data={presenceData} />

      <RecentSessionsSection
        rows={recentSessions}
        matches={props.matches}
      />

      <Card>
        <CardHeader>
          <CardTitle>Tracked Accounts</CardTitle>
          <CardDescription>
            Grouped by owner with tracking and sync timestamps.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(props.trackedByOwner).length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No tracked accounts yet.
            </p>
          ) : (
            <div className="space-y-4">
              {Object.entries(props.trackedByOwner).map(
                ([ownerName, accounts]) => (
                  <TrackedAccountsOwnerTable
                    key={ownerName}
                    ownerName={ownerName}
                    accounts={accounts}
                  />
                ),
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
