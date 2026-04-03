"use client";

import { useState } from "react";
import { LeaderboardTable, type TPlatformFilter } from "@/components/leaderboard-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

type TLeaderboardRow = {
  trackedAccountId: string;
  ign: string;
  platform: string;
  rankScore: number;
  rankName: string;
  rankDivision: string | null;
  iconUrl: string | null;
  deltaRp24h: number | null;
};

type TTimelinePoint = { capturedAt: string; rankScore: number };

export function LeaderboardCard(props: {
  rows: TLeaderboardRow[];
  timelines: Record<string, TTimelinePoint[]>;
  trackedCount: number;
}) {
  const [platformFilter, setPlatformFilter] = useState<TPlatformFilter>("all");

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Leaderboard</CardTitle>
          <CardDescription>Latest rank snapshot by tracked account.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Platform</span>
          <Select value={platformFilter} onValueChange={(value) => setPlatformFilter(value as TPlatformFilter)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="origin">PC</SelectItem>
              <SelectItem value="psn">PS4</SelectItem>
              <SelectItem value="xbl">X1</SelectItem>
            </SelectContent>
          </Select>
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
          <LeaderboardTable rows={props.rows} timelines={props.timelines} platformFilter={platformFilter} />
        )}
      </CardContent>
    </Card>
  );
}

