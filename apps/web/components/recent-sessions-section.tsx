"use client";

import { PendingLink } from "@/components/pending-link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RecentSessionDetailModalBody } from "@/components/recent-session-detail-modal";
import { formatDurationMs } from "@/lib/format-duration";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { computeRankScoreDelta, RpDeltaBadge } from "@/components/rp-delta-badge";
import { getLegendIconUrl } from "@/lib/legend-icon-url";
import { SessionRankSnap, type TSessionRankSnap } from "@/components/session-rank-snap";
import { SessionGamesSummary } from "@/components/session-segments-list";
import type { TEstimatedGame, TRecentSessionRow } from "@/components/recent-sessions-types";
import type { TSegmentRow } from "@/components/session-segment-types";
import { cn } from "@/lib/utils";

export type { TEstimatedGame, TRecentSessionRow } from "@/components/recent-sessions-types";

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

function estimatedToSegments(games: TEstimatedGame[] | undefined): TSegmentRow[] {
  return (games ?? []).map((g) => ({
    legendAssumed: g.legend,
    rpDelta: g.rpDelta,
    confidence: g.confidence,
    mergeRisk: g.mergeRisk,
    startedAt: g.startedAt ?? "",
    endedAt: g.endedAt ?? null,
    rankedMapNameOpen: g.rankedMapNameOpen ?? null,
    rankedMapNameClose: g.rankedMapNameClose ?? null,
    openingCareerKills: g.openingCareerKills ?? null,
    closingCareerKills: g.closingCareerKills ?? null,
    openingCareerDamage: g.openingCareerDamage ?? null,
    closingCareerDamage: g.closingCareerDamage ?? null,
  }));
}

const DAY_MS = 86_400_000;
const INITIAL_VISIBLE_DAYS = 2;
const LOAD_MORE_DAYS = 2;

const DEFAULT_TITLE = "Recent sessions";
const DEFAULT_DESCRIPTION =
  "In-progress sessions appear at the top with a live indicator. Completed sessions show rank at start vs end, RP change, and legends while active. Click a row for details.";

export type RecentSessionsSectionProps = {
  rows: TRecentSessionRow[];
  title?: string;
  description?: string;
  /** Hide the Player column when every row is the same account (e.g. profile). */
  hidePlayerColumn?: boolean;
  /** List all rows; disables the “last N days” filter and load-more control. */
  showAllSessions?: boolean;
  /** When set, show this inside the card if there are no rows instead of rendering nothing. */
  emptyCardContent?: ReactNode;
};

export function RecentSessionsSection(props: RecentSessionsSectionProps) {
  const title = props.title ?? DEFAULT_TITLE;
  const description = props.description ?? DEFAULT_DESCRIPTION;
  const hidePlayerColumn = props.hidePlayerColumn ?? false;
  const showAllSessions = props.showAllSessions ?? false;
  const colCount = hidePlayerColumn ? 7 : 8;

  const [visibleDays, setVisibleDays] = useState(INITIAL_VISIBLE_DAYS);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const { visibleRows, hasOlderOnFile } = useMemo(() => {
    const rows = props.rows;
    if (rows.length === 0) {
      return { visibleRows: [] as TRecentSessionRow[], hasOlderOnFile: false };
    }
    if (showAllSessions) {
      return { visibleRows: rows, hasOlderOnFile: false };
    }
    const cutoff = Date.now() - visibleDays * DAY_MS;
    const visible = rows.filter((r) => {
      if (r.isActiveSession) return true;
      return r.endedAt != null && new Date(r.endedAt).getTime() >= cutoff;
    });
    return {
      visibleRows: visible,
      hasOlderOnFile: visible.length < rows.length,
    };
  }, [props.rows, visibleDays, showAllSessions]);

  const selectedRow = useMemo(
    () => props.rows.find((r) => r.sessionId === selectedSessionId) ?? null,
    [props.rows, selectedSessionId]
  );

  const clearSelection = useCallback(() => setSelectedSessionId(null), []);

  const modalOpen = selectedSessionId !== null && selectedRow !== null;

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, clearSelection]);

  if (props.rows.length === 0) {
    if (props.emptyCardContent == null) {
      return null;
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{props.emptyCardContent}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="scrollbar-app w-full overflow-x-auto">
          <table
            className={cn(
              "w-full text-left text-sm",
              hidePlayerColumn ? "min-w-[780px]" : "min-w-[900px]"
            )}
          >
            <thead>
              <tr className="text-muted-foreground border-b text-xs">
                {hidePlayerColumn ? null : (
                  <th className="px-2 py-2 font-medium">Player</th>
                )}
                <th className="px-2 py-2 font-medium">Start</th>
                <th className="px-2 py-2 font-medium">End</th>
                <th className="px-2 py-2 font-medium">RP Δ</th>
                <th className="px-2 py-2 font-medium">Legends</th>
                <th className="px-2 py-2 font-medium">Est. games</th>
                <th className="px-2 py-2 font-medium">Duration</th>
                <th className="px-2 py-2 text-right font-medium">Finished</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={colCount}
                    className="text-muted-foreground px-2 py-6 text-center text-sm"
                  >
                    No sessions ended in the last {visibleDays} days.
                    {hasOlderOnFile ? " Load more days to see older sessions." : null}
                  </td>
                </tr>
              ) : null}
              {visibleRows.map((row) => {
                const durationMs =
                  row.endedAt != null
                    ? new Date(row.endedAt).getTime() - new Date(row.startedAt).getTime()
                    : Date.now() - new Date(row.startedAt).getTime();
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
                const isSelected = selectedSessionId === row.sessionId;
                const segments = estimatedToSegments(row.estimatedGames);

                return (
                  <tr
                    key={row.sessionId}
                    role="button"
                    tabIndex={0}
                    aria-selected={isSelected}
                    onClick={() =>
                      setSelectedSessionId((prev) =>
                        prev === row.sessionId ? null : row.sessionId
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedSessionId((prev) =>
                          prev === row.sessionId ? null : row.sessionId
                        );
                      }
                    }}
                    className={cn(
                      "border-border/60 cursor-pointer border-b transition-colors last:border-0",
                      "hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                      isSelected && "bg-muted/50",
                      row.isActiveSession &&
                        "relative bg-emerald-500/[0.06] ring-1 ring-emerald-500/30 ring-inset"
                    )}
                  >
                    {hidePlayerColumn ? null : (
                      <td className="px-2 py-2 align-top">
                        <div className="flex items-start gap-2">
                          {row.isActiveSession ? (
                            <span
                              className="mt-1.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.55)]"
                              title="Session in progress"
                              aria-hidden
                            />
                          ) : null}
                          <div className="min-w-0 flex-1">
                            <div onClick={(e) => e.stopPropagation()}>
                              {row.trackedAccountId ? (
                                <PendingLink
                                  href={`/player/${row.trackedAccountId}`}
                                  className="font-medium hover:underline"
                                >
                                  {row.ign}
                                </PendingLink>
                              ) : (
                                <div className="font-medium">{row.ign}</div>
                              )}
                            </div>
                            <span className="text-muted-foreground mt-0.5 inline-block rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-300">
                              {platformChipLabel(row.platform)}
                            </span>
                          </div>
                        </div>
                      </td>
                    )}
                    <td className="px-2 py-2 align-top">
                      <div className="flex items-start gap-2">
                        {row.isActiveSession && hidePlayerColumn ? (
                          <span
                            className="mt-1.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.55)]"
                            title="Session in progress"
                            aria-hidden
                          />
                        ) : null}
                        <SessionRankSnap snap={startSnap} compact />
                      </div>
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
                    <td className="px-2 py-2 align-middle">
                      <div className="inline-flex items-center gap-1 rounded border border-border/40 bg-muted/20 px-2 py-1">
                        <SessionGamesSummary segments={segments} showDetailHint />
                      </div>
                    </td>
                    <td className="text-muted-foreground px-2 py-2 align-middle tabular-nums">
                      {formatDurationMs(durationMs)}
                    </td>
                    <td className="text-muted-foreground px-2 py-2 text-right align-middle text-xs">
                      {row.isActiveSession ? (
                        <span className="inline-flex items-center justify-end gap-1.5 text-emerald-400">
                          <span
                            className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500"
                            aria-hidden
                          />
                          In progress
                        </span>
                      ) : row.endedAt ? (
                        <>Finished {formatRelativeTime(row.endedAt)}</>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Dialog
          open={modalOpen}
          onOpenChange={(open) => {
            if (!open) clearSelection();
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-hidden gap-0 p-0 sm:max-w-2xl">
            {selectedRow ? (
              <>
                <DialogHeader className="border-border/60 shrink-0 space-y-1 border-b px-6 py-4 pr-14 text-left">
                  <DialogTitle>{selectedRow.ign}</DialogTitle>
                  <DialogDescription>
                    {selectedRow.isActiveSession
                      ? "Session in progress — rank snapshots so far, RP by legend, maps, and estimated games (updates when you refresh)."
                      : "Rank snapshots during this session, RP by legend, maps, and estimated games."}
                  </DialogDescription>
                </DialogHeader>
                <RecentSessionDetailModalBody row={selectedRow} />
              </>
            ) : null}
          </DialogContent>
        </Dialog>

        {!showAllSessions && hasOlderOnFile ? (
          <div className="mt-4 flex flex-col items-center gap-2 border-t border-border/60 pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setVisibleDays((d) => d + LOAD_MORE_DAYS)}
            >
              Show {LOAD_MORE_DAYS} more days
            </Button>
            <p className="text-muted-foreground text-center text-xs">
              {props.rows.length - visibleRows.length} older session
              {props.rows.length - visibleRows.length !== 1 ? "s" : ""} not shown yet
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
