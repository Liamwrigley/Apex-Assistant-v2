import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDurationMs } from "@/lib/format-duration";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { computeRankScoreDelta, RpDeltaBadge } from "@/components/rp-delta-badge";
import { getLegendIconUrl } from "@/lib/legend-icon-url";
import { SessionRankSnap, type TSessionRankSnap } from "@/components/session-rank-snap";

export type TRecentSessionRow = {
  sessionId: string;
  ign: string;
  platform: string;
  startedAt: string;
  endedAt: string;
  openingRankScore: number | null;
  latestRankScore: number | null;
  openingRankName: string | null;
  openingRankDivision: string | null;
  openingRankIconUrl: string | null;
  latestRankName: string | null;
  latestRankDivision: string | null;
  latestRankIconUrl: string | null;
  legends: string[];
};

function platformChipLabel(platform: string): string {
  const value = platform.toLowerCase();
  if (value === "origin" || value === "pc") {
    return "PC";
  }
  if (value === "psn" || value === "ps4") {
    return "PS";
  }
  if (value === "xbl" || value === "x1") {
    return "XBOX";
  }
  return platform.toUpperCase();
}

function toSnap(
  score: number | null,
  name: string | null,
  division: string | null,
  icon: string | null
): TSessionRankSnap {
  return { rankScore: score, rankName: name, rankDivision: division, iconUrl: icon };
}

export function RecentSessionsSection(props: { rows: TRecentSessionRow[] }) {
  if (props.rows.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent sessions</CardTitle>
        <CardDescription>
          Completed play sessions per tracked player (rank at start vs end, RP change, and
          legends while active).
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-xs">
              <th className="px-2 py-2 font-medium">Player</th>
              <th className="px-2 py-2 font-medium">Start</th>
              <th className="px-2 py-2 font-medium">End</th>
              <th className="px-2 py-2 font-medium">RP Δ</th>
              <th className="px-2 py-2 font-medium">Legends</th>
              <th className="px-2 py-2 font-medium">Duration</th>
              <th className="px-2 py-2 text-right font-medium">Finished</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row) => {
              const durationMs =
                new Date(row.endedAt).getTime() -
                new Date(row.startedAt).getTime();
              const rpDelta = computeRankScoreDelta(
                row.openingRankScore,
                row.latestRankScore
              );
              const startSnap = toSnap(
                row.openingRankScore,
                row.openingRankName,
                row.openingRankDivision,
                row.openingRankIconUrl
              );
              const endSnap = toSnap(
                row.latestRankScore,
                row.latestRankName,
                row.latestRankDivision,
                row.latestRankIconUrl
              );
              return (
                <tr key={row.sessionId} className="border-border/60 border-b last:border-0">
                  <td className="px-2 py-2 align-top">
                    <div className="font-medium">{row.ign}</div>
                    <span className="text-muted-foreground mt-0.5 inline-block rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-300">
                      {platformChipLabel(row.platform)}
                    </span>
                  </td>
                  <td className="px-2 py-2 align-top">
                    <SessionRankSnap snap={startSnap} compact />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <SessionRankSnap snap={endSnap} compact />
                  </td>
                  <td className="px-2 py-2 align-middle">
                    <RpDeltaBadge delta={rpDelta} />
                  </td>
                  <td className="px-2 py-2 align-middle">
                    {row.legends.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1">
                        {row.legends.map((name) => {
                          const iconUrl = getLegendIconUrl(name);
                          return (
                            <span
                              key={name}
                              className="bg-muted/60 inline-flex items-center gap-1 rounded px-1 py-0.5"
                              title={name}
                            >
                              {iconUrl ? (
                                <img
                                  src={iconUrl}
                                  alt=""
                                  className="h-3.5 w-3.5 rounded-sm object-cover"
                                />
                              ) : null}
                              <span className="max-w-[5rem] truncate text-[10px]">
                                {name}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </td>
                  <td className="text-muted-foreground px-2 py-2 align-middle tabular-nums">
                    {formatDurationMs(durationMs)}
                  </td>
                  <td className="text-muted-foreground px-2 py-2 text-right align-middle text-xs">
                    Finished {formatRelativeTime(row.endedAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
