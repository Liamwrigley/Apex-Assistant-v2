import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDurationMs } from "@/lib/format-duration";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { getLegendIconUrl } from "@/lib/legend-icon-url";

export type TRecentSessionRow = {
  sessionId: string;
  ign: string;
  platform: string;
  startedAt: string;
  endedAt: string;
  openingRankScore: number | null;
  latestRankScore: number | null;
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

function formatRpDelta(
  opening: number | null,
  latest: number | null
): string | null {
  if (opening === null || latest === null) {
    return null;
  }
  const d = latest - opening;
  if (d === 0) {
    return "0 RP";
  }
  const abs = Math.abs(d).toLocaleString();
  return d > 0 ? `+${abs} RP` : `−${abs} RP`;
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
          Completed play sessions per tracked player (RP change and legends recorded while
          they were active).
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-xs">
              <th className="px-2 py-2 font-medium">Player</th>
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
              return (
                <tr key={row.sessionId} className="border-border/60 border-b last:border-0">
                  <td className="px-2 py-2">
                    <div className="font-medium">{row.ign}</div>
                    <span className="text-muted-foreground mt-0.5 inline-block rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-300">
                      {platformChipLabel(row.platform)}
                    </span>
                  </td>
                  <td className="px-2 py-2 font-medium tabular-nums">
                    {formatRpDelta(row.openingRankScore, row.latestRankScore) ?? "—"}
                  </td>
                  <td className="px-2 py-2">
                    {row.legends.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
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
                  <td className="text-muted-foreground px-2 py-2 tabular-nums">
                    {formatDurationMs(durationMs)}
                  </td>
                  <td className="text-muted-foreground px-2 py-2 text-right text-xs">
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
