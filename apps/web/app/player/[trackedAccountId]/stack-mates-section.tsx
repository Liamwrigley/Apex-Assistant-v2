"use client";

import { useCallback, useState } from "react";
import { PendingLink } from "@/components/pending-link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RpDeltaBadge } from "@/components/rp-delta-badge";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { getLegendIconUrl } from "@/lib/legend-icon-url";
import { useProfileRange } from "./profile-range-context";
import type { TStackComposition, TStackCompositionMember, TBestStackByMap } from "@apex-assistant/db";
import { cn } from "@/lib/utils";

type TBreakdownRow = {
  myLegend: string | null;
  mapName: string | null;
  mateLegends: (string | null)[];
  games: number;
  avgRpDelta: number;
  totalRpDelta: number;
};

type TExpandedState = {
  loading: boolean;
  error: string | null;
  rows: TBreakdownRow[];
};

function partyLabel(members: TStackCompositionMember[]): string {
  if (members.length === 1) return "Duo";
  if (members.length === 2) return "Trio";
  return `${members.length + 1}-stack`;
}

function LegendCell(props: { legend: string | null }) {
  const name = props.legend ?? "Unknown";
  const iconUrl = getLegendIconUrl(props.legend);
  return (
    <span className="inline-flex items-center gap-1.5">
      {iconUrl ? (
        <img src={iconUrl} alt="" className="h-4 w-4 shrink-0 rounded-sm object-cover object-top" />
      ) : null}
      <span className="truncate">{name}</span>
    </span>
  );
}

function VsSoloBadge(props: { diff: number | null }) {
  if (props.diff === null || !Number.isFinite(props.diff)) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  const d = props.diff;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
        d > 0
          ? "bg-emerald-500/15 text-emerald-300"
          : d < 0
            ? "bg-rose-500/15 text-rose-300"
            : "text-muted-foreground"
      )}
    >
      {d > 0 ? "+" : ""}{d.toFixed(1)} vs solo
    </span>
  );
}

function BreakdownTable(props: {
  rows: TBreakdownRow[];
  members: TStackCompositionMember[];
  playerIgn: string;
}) {
  if (props.rows.length === 0) {
    return (
      <p className="text-muted-foreground py-2 text-xs">No legend/map breakdown available.</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground border-b text-left">
            <th className="py-1.5 pr-3 font-medium">{props.playerIgn}</th>
            {props.members.map((m) => (
              <th key={m.id} className="py-1.5 pr-3 font-medium">{m.ign}</th>
            ))}
            <th className="py-1.5 pr-3 font-medium">Map</th>
            <th className="py-1.5 pr-3 text-right font-medium">Games</th>
            <th className="py-1.5 pr-3 text-right font-medium">Avg RP</th>
            <th className="py-1.5 text-right font-medium">Total RP</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((r, i) => (
            <tr key={i} className="border-b border-border/40 last:border-0">
              <td className="py-1.5 pr-3">
                <LegendCell legend={r.myLegend} />
              </td>
              {props.members.map((m, mi) => (
                <td key={m.id} className="py-1.5 pr-3">
                  <LegendCell legend={r.mateLegends?.[mi] ?? null} />
                </td>
              ))}
              <td className="py-1.5 pr-3 text-muted-foreground">{r.mapName ?? "—"}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{r.games}</td>
              <td className="py-1.5 pr-3 text-right">
                <RpDeltaBadge delta={r.avgRpDelta} decimals={1} />
              </td>
              <td className="py-1.5 text-right">
                <RpDeltaBadge delta={r.totalRpDelta} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompositionRow(props: {
  comp: TStackComposition;
  trackedAccountId: string;
  playerIgn: string;
  rangeKey: string;
  baselineAvgRp: number | null;
}) {
  const { comp, trackedAccountId, playerIgn, rangeKey, baselineAvgRp } = props;
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<TExpandedState | null>(null);

  const vsDiff = baselineAvgRp !== null
    ? Math.round((comp.avgRpDelta - baselineAvgRp) * 10) / 10
    : null;

  const lastPlayedStr = comp.lastPlayedAt
    ? formatRelativeTime(
        comp.lastPlayedAt instanceof Date
          ? comp.lastPlayedAt.toISOString()
          : String(comp.lastPlayedAt)
      )
    : "—";

  const toggle = useCallback(async () => {
    const willExpand = !expanded;
    setExpanded(willExpand);

    if (willExpand && !detail) {
      setDetail({ loading: true, error: null, rows: [] });
      try {
        const ids = comp.memberIds.join(",");
        const res = await fetch(
          `/api/tracked/${encodeURIComponent(trackedAccountId)}/stack-breakdown?teammates=${encodeURIComponent(ids)}&range=${encodeURIComponent(rangeKey)}`
        );
        if (!res.ok) throw new Error(`Failed (${res.status})`);
        const data = (await res.json()) as { breakdown: TBreakdownRow[] };
        setDetail({ loading: false, error: null, rows: data.breakdown });
      } catch (e) {
        setDetail({ loading: false, error: e instanceof Error ? e.message : "Error", rows: [] });
      }
    }
  }, [expanded, detail, trackedAccountId, comp.memberIds, rangeKey]);

  return (
    <>
      <tr
        className="border-b border-border/40 cursor-pointer transition-colors hover:bg-muted/40"
        onClick={toggle}
      >
        <td className="py-2 pr-3">
          <div className="flex items-center gap-2">
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className={cn(
                "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
                expanded && "rotate-90"
              )}
              aria-hidden
            >
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              {comp.members.map((m, i) => (
                <span key={m.id} className="inline-flex items-center gap-1">
                  {i > 0 && <span className="text-muted-foreground text-xs">+</span>}
                  <PendingLink
                    href={`/player/${m.id}`}
                    className="font-medium text-foreground hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {m.ign}
                  </PendingLink>
                </span>
              ))}
            </div>
            <span className="text-muted-foreground shrink-0 rounded bg-muted/60 px-1.5 py-0.5 text-[10px]">
              {partyLabel(comp.members)}
            </span>
          </div>
        </td>
        <td className="py-2 pr-3 text-right tabular-nums">{comp.games}</td>
        <td className="py-2 pr-3 text-right">
          <RpDeltaBadge delta={comp.avgRpDelta} decimals={1} />
        </td>
        <td className="py-2 pr-3 text-right">
          <VsSoloBadge diff={vsDiff} />
        </td>
        <td className="py-2 pr-3 text-right">
          <RpDeltaBadge delta={comp.totalRpDelta} />
        </td>
        <td className="py-2 text-right text-muted-foreground text-xs">{lastPlayedStr}</td>
      </tr>

      {expanded ? (
        <tr>
          <td colSpan={6} className="bg-muted/20 px-4 py-3">
            {detail?.loading ? (
              <p className="text-muted-foreground text-xs animate-pulse">Loading breakdown…</p>
            ) : detail?.error ? (
              <p className="text-destructive text-xs">{detail.error}</p>
            ) : detail ? (
              <BreakdownTable rows={detail.rows} members={comp.members} playerIgn={playerIgn} />
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function BestStackByMapTable(props: { rows: TBestStackByMap[]; playerIgn: string }) {
  if (props.rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground border-b text-left">
            <th className="py-1.5 pr-3 font-medium">Map</th>
            <th className="py-1.5 pr-3 font-medium">Recommended Comp</th>
            <th className="py-1.5 pr-3 text-right font-medium">Games</th>
            <th className="py-1.5 text-right font-medium">Avg RP</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((r) => {
            const legendEntries: Array<{ ign: string; legend: string | null }> = [
              { ign: props.playerIgn, legend: r.myLegend },
              ...r.members.map((m, i) => ({ ign: m.ign, legend: r.mateLegends?.[i] ?? null })),
            ];
            return (
              <tr key={r.mapName} className="border-b border-border/40 last:border-0">
                <td className="py-2 pr-3 font-medium text-foreground whitespace-nowrap">{r.mapName}</td>
                <td className="py-2 pr-3">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    {legendEntries.map((entry, i) => {
                      const iconUrl = getLegendIconUrl(entry.legend);
                      return (
                        <span key={i} className="inline-flex items-center gap-1 whitespace-nowrap">
                          {iconUrl ? (
                            <img src={iconUrl} alt="" className="h-3.5 w-3.5 shrink-0 rounded-sm object-cover object-top" />
                          ) : null}
                          <span className="text-foreground">{entry.ign}</span>
                          <span className="text-muted-foreground">{entry.legend ?? "?"}</span>
                        </span>
                      );
                    })}
                  </div>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{r.games}</td>
                <td className="py-2 text-right">
                  <RpDeltaBadge delta={r.avgRpDelta} decimals={1} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function StackMatesSection(props: { playerIgn: string }) {
  const { stackCompositions, baselineAvgRp, bestStackByMap, trackedAccountId, rangeKey } = useProfileRange();

  if (!stackCompositions || stackCompositions.length === 0) {
    return null;
  }

  const baselineVal = baselineAvgRp?.avgRpDelta ?? null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span>Stack Mates</span>
          <span className="text-muted-foreground text-xs font-normal">{rangeKey} window</span>
        </CardTitle>
        <CardDescription className="text-xs">
          Party compositions this player has queued with, grouped by exact squad.
          {" "}<strong>Avg RP</strong> is the average RP gained or lost per game in that stack — higher is better.
          {" "}<strong>vs Solo</strong> compares that to the player&#39;s overall average: a green positive value (e.g.&nbsp;+4.2) means they gain more RP in this stack than usual, red negative means they perform worse.
          {" "}The best stacks have the highest vs&nbsp;Solo numbers. Click a row for legend &amp; map details.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <h4 className="text-xs font-semibold text-foreground">Performance by Stack</h4>
            {baselineAvgRp ? (
              <span className="text-muted-foreground text-[11px] tabular-nums">
                Solo avg: <span className="text-foreground font-medium">{baselineAvgRp.avgRpDelta.toFixed(1)} RP</span> ({baselineAvgRp.games} games)
              </span>
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="py-2 pr-3 font-medium">Stack</th>
                  <th className="py-2 pr-3 text-right font-medium">Games</th>
                  <th className="py-2 pr-3 text-right font-medium">Avg RP</th>
                  <th className="py-2 pr-3 text-right font-medium">vs Solo</th>
                  <th className="py-2 pr-3 text-right font-medium">Total RP</th>
                  <th className="py-2 text-right font-medium">Last Played</th>
                </tr>
              </thead>
              <tbody>
                {stackCompositions.map((comp) => (
                  <CompositionRow
                    key={comp.memberIds.join(",")}
                    comp={comp}
                    trackedAccountId={trackedAccountId}
                    playerIgn={props.playerIgn}
                    rangeKey={rangeKey}
                    baselineAvgRp={baselineVal}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {bestStackByMap.length > 0 ? (
          <div>
            <h4 className="mb-0.5 text-xs font-semibold text-foreground">Recommended by Map</h4>
            <p className="text-muted-foreground mb-2.5 text-[11px]">
              Best performing composition &amp; legends per map (min.&nbsp;2 games)
            </p>
            <BestStackByMapTable rows={bestStackByMap} playerIgn={props.playerIgn} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
