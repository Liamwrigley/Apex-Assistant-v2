"use client";

import { useState } from "react";
import {
  LeaderboardTable,
  type TLeaderboardViewMode,
  type TRpDeltaWindow,
} from "@/components/leaderboard-table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { TDashboardLiveRecentGameCell } from "@/lib/dashboard-live";
import type { TPartyMatchSerialized } from "@/lib/party-matches";
import { cn } from "@/lib/utils";

type TLeaderboardRow = {
  trackedAccountId: string;
  ign: string;
  platform: string;
  rankScore: number;
  rankName: string;
  rankDivision: string | null;
  deltaRp24h: number | null;
  deltaRp7d: number | null;
  deltaRp30d: number | null;
  ownerDisplayName: string | null;
};

type TTimelinePoint = { capturedAt: string; rankScore: number };

export function LeaderboardCard(props: {
  rows: TLeaderboardRow[];
  timelines: Record<string, TTimelinePoint[]>;
  trackedCount: number;
  recentGamesByTrackedAccountId: Record<string, TDashboardLiveRecentGameCell[]>;
  partyMatches: TPartyMatchSerialized[];
}) {
  const [viewMode, setViewMode] = useState<TLeaderboardViewMode>("sparkline");
  const [rpDeltaWindow, setRpDeltaWindow] = useState<TRpDeltaWindow>("24h");

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Leaderboard</CardTitle>
          <CardDescription>
            Latest rank snapshot by tracked account.
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {viewMode === "sparkline" ? (
            <ToggleGroup
              value={rpDeltaWindow}
              onChange={setRpDeltaWindow}
              options={[
                { value: "24h", label: "24h" },
                { value: "7d", label: "7d" },
                { value: "30d", label: "30d" },
              ]}
              ariaLabel="RP delta time window"
            />
          ) : null}
          <ToggleGroup
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: "sparkline", label: "Sparkline" },
              { value: "matches", label: "Matches" },
            ]}
            ariaLabel="Leaderboard right-column view"
          />
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {props.rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {props.trackedCount > 0
              ? "No rank snapshots yet for these tracked accounts. Run a sync from the worker so leaderboard rows appear (leaderboard only lists players with at least one snapshot)."
              : "No leaderboard data yet. Track accounts and run ingestion to populate snapshots."}
          </p>
        ) : (
          <LeaderboardTable
            rows={props.rows}
            timelines={props.timelines}
            viewMode={viewMode}
            rpDeltaWindow={rpDeltaWindow}
            recentGamesByTrackedAccountId={props.recentGamesByTrackedAccountId}
            partyMatches={props.partyMatches}
          />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Small segmented-control used in the leaderboard header. Generic over its
 * value type so the same visual treatment drives both the sparkline/matches
 * toggle and the RP delta window toggle.
 */
function ToggleGroup<T extends string>(props: {
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={props.ariaLabel}
      className="flex items-center gap-1 rounded-md border p-0.5"
    >
      {props.options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => props.onChange(opt.value)}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
            props.value === opt.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
