"use client";

import { PendingLink } from "@/components/pending-link";
import { RecentSessionDetailModalBody } from "@/components/recent-session-detail-modal";
import type {
  TEstimatedGame,
  TRecentSessionRow,
} from "@/components/recent-sessions-types";
import {
  computeRankScoreDelta,
  RpDeltaBadge,
} from "@/components/rp-delta-badge";
import {
  SessionRankSnap,
  type TSessionRankSnap,
} from "@/components/session-rank-snap";
import type { TSegmentRow } from "@/components/session-segment-types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDurationMs } from "@/lib/format-duration";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { getLegendIconUrl } from "@/lib/legend-icon-url";
import type { TPartyMatchSerialized } from "@/lib/party-matches";
import { cn } from "@/lib/utils";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type {
  TEstimatedGame,
  TRecentSessionRow,
} from "@/components/recent-sessions-types";

function toSnap(
  score: number | null,
  name: string | null,
  division: string | null,
): TSessionRankSnap {
  return {
    rankScore: score,
    rankName: name,
    rankDivision: division,
  };
}

function estimatedToSegments(
  games: TEstimatedGame[] | undefined,
): TSegmentRow[] {
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
    trackerDeltas: g.trackerDeltas,
  }));
}

function fmtDateTime(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const INITIAL_VISIBLE_COUNT = 10;
const LOAD_MORE_COUNT = 10;

type TView = "sessions" | "matches";
type TMatchFilter = "all" | "party" | "solo";

const DEFAULT_TITLE = "Session history";
const MATCHES_TITLE = "Match history";
const DEFAULT_DESCRIPTION =
  "In-progress sessions appear at the top with a live indicator. Completed sessions show rank at start vs end, RP change, and legends while active. Click a row for details.";
const MATCHES_DESCRIPTION =
  "Individual games reconstructed from tracked segments. Party matches show correlated teammates and individual RP changes; solo entries are standalone games.";

export type RecentSessionsSectionProps = {
  rows: TRecentSessionRow[];
  /**
   * Full match history. Each entry is either a party cluster (2+ players
   * correlated via segment edges) or a solo game (single player). The
   * component exposes an All / Party / Solo filter in the match view so the
   * same prop can power every match-history surface in the app.
   */
  matches?: TPartyMatchSerialized[];
  title?: string;
  description?: string;
  /**
   * Muted suffix rendered alongside the title to disclose the timeframe or
   * scope of the data in the card (e.g. "· last 30 sessions"). Recent sessions
   * is not tied to the profile range picker, so this is the primary way users
   * can tell it isn't reacting to range changes.
   */
  titleSuffix?: ReactNode;
  /** Hide the Player column when every row is the same account (e.g. profile). */
  hidePlayerColumn?: boolean;
  /** List all rows; disables the pagination and load-more control. */
  showAllSessions?: boolean;
  /** When set, show this inside the card if there are no rows instead of rendering nothing. */
  emptyCardContent?: ReactNode;
};

export function RecentSessionsSection(props: RecentSessionsSectionProps) {
  const hidePlayerColumn = props.hidePlayerColumn ?? false;
  const showAllSessions = props.showAllSessions ?? false;
  const colCount = hidePlayerColumn ? 7 : 8;

  const allMatches = props.matches ?? [];
  const hasMatchData = allMatches.length > 0;
  const [view, setView] = useState<TView>("sessions");
  const [matchFilter, setMatchFilter] = useState<TMatchFilter>("party");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [view, matchFilter]);

  const title =
    view === "sessions" ? (props.title ?? DEFAULT_TITLE) : MATCHES_TITLE;
  const description =
    view === "sessions"
      ? (props.description ?? DEFAULT_DESCRIPTION)
      : MATCHES_DESCRIPTION;

  const filteredMatches = useMemo(() => {
    if (matchFilter === "all") return allMatches;
    if (matchFilter === "party")
      return allMatches.filter((m) => m.players.length > 1);
    return allMatches.filter((m) => m.players.length === 1);
  }, [allMatches, matchFilter]);

  const { visibleRows, hasMore } = useMemo(() => {
    const rows = props.rows;
    if (rows.length === 0) {
      return { visibleRows: [] as TRecentSessionRow[], hasMore: false };
    }
    if (showAllSessions) {
      return { visibleRows: rows, hasMore: false };
    }
    const visible = rows.slice(0, visibleCount);
    return {
      visibleRows: visible,
      hasMore: visible.length < rows.length,
    };
  }, [props.rows, visibleCount, showAllSessions]);

  const { visibleMatches, hasMoreMatches } = useMemo(() => {
    if (filteredMatches.length === 0)
      return {
        visibleMatches: [] as TPartyMatchSerialized[],
        hasMoreMatches: false,
      };
    if (showAllSessions)
      return { visibleMatches: filteredMatches, hasMoreMatches: false };
    const visible = filteredMatches.slice(0, visibleCount);
    return {
      visibleMatches: visible,
      hasMoreMatches: visible.length < filteredMatches.length,
    };
  }, [filteredMatches, visibleCount, showAllSessions]);

  const selectedRow = useMemo(
    () => props.rows.find((r) => r.sessionId === selectedSessionId) ?? null,
    [props.rows, selectedSessionId],
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

  const totalCount =
    view === "sessions" ? props.rows.length : filteredMatches.length;
  const currentVisibleCount =
    view === "sessions" ? visibleRows.length : visibleMatches.length;
  const currentHasMore = view === "sessions" ? hasMore : hasMoreMatches;
  const remaining = totalCount - currentVisibleCount;

  const renderTitle = () =>
    props.titleSuffix ? (
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span>{title}</span>
        {props.titleSuffix}
      </span>
    ) : (
      title
    );

  if (props.rows.length === 0 && allMatches.length === 0) {
    if (props.emptyCardContent == null) {
      return null;
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle>{renderTitle()}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{props.emptyCardContent}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <CardTitle>{renderTitle()}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
          {hasMatchData ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {view === "matches" ? (
                <div
                  className="flex items-center gap-1 rounded-md border p-0.5"
                  role="group"
                  aria-label="Match filter"
                >
                  {(
                    [
                      { id: "all", label: "All" },
                      { id: "party", label: "Party" },
                      { id: "solo", label: "Solo" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setMatchFilter(opt.id)}
                      className={cn(
                        "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                        matchFilter === opt.id
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <div
                className="flex items-center gap-1 rounded-md border p-0.5"
                role="group"
                aria-label="History view"
              >
                <button
                  type="button"
                  onClick={() => setView("sessions")}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                    view === "sessions"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  Session history
                </button>
                <button
                  type="button"
                  onClick={() => setView("matches")}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                    view === "matches"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  Match history
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {view === "sessions" ? (
          <>
            <div className="scrollbar-app w-full overflow-x-auto">
              <table
                className={cn(
                  "w-full text-left text-sm",
                  hidePlayerColumn ? "min-w-[780px]" : "min-w-[900px]",
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
                    <th className="px-2 py-2 font-medium">Games</th>
                    <th className="px-2 py-2 font-medium">Legends</th>
                    <th className="px-2 py-2 font-medium">Duration</th>
                    <th className="px-2 py-2 text-right font-medium">
                      Finished
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={colCount}
                        className="text-muted-foreground px-2 py-6 text-center text-sm"
                      >
                        No recent sessions found.
                      </td>
                    </tr>
                  ) : null}
                  {visibleRows.map((row) => {
                    const durationMs =
                      row.endedAt != null
                        ? new Date(row.endedAt).getTime() -
                          new Date(row.startedAt).getTime()
                        : Date.now() - new Date(row.startedAt).getTime();
                    const rpDelta = computeRankScoreDelta(
                      row.openingRankScore,
                      row.latestRankScore,
                    );
                    const startSnap = toSnap(
                      row.openingRankScore,
                      row.openingRankName,
                      row.openingRankDivision,
                    );
                    const endSnap = toSnap(
                      row.latestRankScore,
                      row.latestRankName,
                      row.latestRankDivision,
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
                            prev === row.sessionId ? null : row.sessionId,
                          )
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedSessionId((prev) =>
                              prev === row.sessionId ? null : row.sessionId,
                            );
                          }
                        }}
                        className={cn(
                          "border-border/60 cursor-pointer border-b transition-colors last:border-0",
                          "hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                          isSelected && "bg-muted/50",
                          row.isActiveSession &&
                            "relative bg-emerald-500/[0.06] ring-1 ring-emerald-500/30 ring-inset",
                        )}
                      >
                        {hidePlayerColumn ? null : (
                          <td className="px-2 py-2 align-middle">
                            <div className="flex items-center gap-2">
                              {row.isActiveSession ? (
                                <span
                                  className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.55)]"
                                  title="Session in progress"
                                  aria-hidden
                                />
                              ) : null}
                              <div className="min-w-0 flex-1">
                                <div onClick={(e) => e.stopPropagation()}>
                                  {row.trackedAccountId ? (
                                    <PendingLink
                                      href={`/player/${row.trackedAccountId}`}
                                      className="text-xs font-medium hover:underline"
                                    >
                                      {row.ign}
                                    </PendingLink>
                                  ) : (
                                    <div className="text-xs font-medium">
                                      {row.ign}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        )}
                        <td className="px-2 py-2 align-middle">
                          <div className="flex items-center gap-2">
                            {row.isActiveSession && hidePlayerColumn ? (
                              <span
                                className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.55)]"
                                title="Session in progress"
                                aria-hidden
                              />
                            ) : null}
                            <SessionRankSnap snap={startSnap} compact />
                          </div>
                        </td>
                        <td className="px-2 py-2 align-middle">
                          <SessionRankSnap snap={endSnap} compact />
                        </td>
                        <td className="px-2 py-2 align-middle">
                          <RpDeltaBadge delta={rpDelta} />
                        </td>
                        <td className="px-2 py-2 align-middle">
                          {segments.length > 0 ? (
                            <div className="text-muted-foreground flex flex-col text-xs leading-tight tabular-nums">
                              <span>
                                {segments.length} game{segments.length === 1 ? "" : "s"}
                              </span>
                              {(() => {
                                let wins = 0;
                                let losses = 0;
                                for (const s of segments) {
                                  if (s.rpDelta != null) {
                                    if (s.rpDelta > 0) wins++;
                                    else if (s.rpDelta < 0) losses++;
                                  }
                                }
                                if (wins === 0 && losses === 0) return null;
                                return (
                                  <span>
                                    <span className="text-emerald-300">
                                      {wins}W
                                    </span>
                                    <span className="mx-1">·</span>
                                    <span className="text-rose-300">
                                      {losses}L
                                    </span>
                                  </span>
                                );
                              })()}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2 align-middle">
                          {row.legends.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            /* Fixed 3-column grid so chips always break to a
                               new row after the third one. `max-content`
                               tracks keep each cell only as wide as its
                               chip, so short legend names don't stretch out
                               into awkward whitespace. */
                            <div className="grid w-fit grid-cols-[repeat(3,max-content)] items-center gap-1">
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
                                        className="h-3.5 w-3.5 rounded-sm object-cover object-top"
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
                        <td className="text-muted-foreground px-2 py-2 align-middle text-xs tabular-nums">
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
                            <>{formatRelativeTime(row.endedAt)}</>
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
          </>
        ) : (
          <PartyMatchesView matches={visibleMatches} />
        )}

        {!showAllSessions && currentHasMore ? (
          <div className="mt-4 flex flex-col items-center gap-2 border-t border-border/60 pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setVisibleCount((c) => c + LOAD_MORE_COUNT)}
            >
              Show {Math.min(LOAD_MORE_COUNT, remaining)} more
            </Button>
            <p className="text-muted-foreground text-center text-xs">
              {remaining} older {view === "sessions" ? "session" : "match"}
              {remaining !== 1 ? "es" : ""} not shown yet
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function confidenceBg(score: number): string {
  if (score >= 0.6) return "bg-emerald-500/15 text-emerald-400";
  if (score >= 0.3) return "bg-yellow-500/15 text-yellow-400";
  return "bg-rose-500/15 text-rose-400";
}

function confidenceLabel(score: number): string {
  if (score >= 0.6) return "Strong match";
  if (score >= 0.3) return "Likely match";
  return "Weak match";
}

function PartyMatchesView(props: { matches: TPartyMatchSerialized[] }) {
  const { matches } = props;
  if (matches.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        No matches found for the selected filter.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {matches.map((match, idx) => {
        const maxDuration = Math.max(...match.players.map((p) => p.duration));
        const isSolo = match.players.length === 1;
        const partyLabel = isSolo
          ? "Solo"
          : match.players.length >= 3
            ? "Trios"
            : "Duos";
        const labelClass = isSolo
          ? "bg-slate-500/15 text-slate-300"
          : "bg-sky-500/15 text-sky-300";

        return (
          <div key={idx} className="border-border/40 rounded-lg border p-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="font-medium">{fmtDateTime(match.time)}</span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-medium",
                    labelClass,
                  )}
                >
                  {partyLabel}
                </span>
                {match.map && (
                  <span className="rounded bg-indigo-900/40 px-1.5 py-0.5 text-indigo-300">
                    {match.map}
                  </span>
                )}
                <span className="text-muted-foreground tabular-nums">
                  {formatDurationMs(maxDuration * 1000)}
                </span>
              </div>
              {isSolo ? null : (
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                    confidenceBg(match.avgScore),
                  )}
                  title={`Matching score: ${match.avgScore.toFixed(3)}`}
                >
                  {confidenceLabel(match.avgScore)}
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="px-2 py-1 font-medium">Player</th>
                    <th className="px-2 py-1 font-medium">Start</th>
                    <th className="px-2 py-1 font-medium">End</th>
                    <th className="px-2 py-1 font-medium">RP Δ</th>
                    <th className="px-2 py-1 font-medium">Legend</th>
                  </tr>
                </thead>
                <tbody>
                  {match.players.map((p) => {
                    const legendIcon = p.legend
                      ? getLegendIconUrl(p.legend)
                      : null;
                    const startSnap: TSessionRankSnap = {
                      rankScore: p.openingRankScore,
                      rankName: p.openingRankName,
                      rankDivision: p.openingRankDivision,
                    };
                    const endSnap: TSessionRankSnap = {
                      rankScore: p.closingRankScore,
                      rankName: p.closingRankName,
                      rankDivision: p.closingRankDivision,
                    };
                    return (
                      <tr
                        key={p.segmentId}
                        className="border-border/40 border-b last:border-0"
                      >
                        <td className="px-2 py-1 font-medium">{p.ign}</td>
                        <td className="px-2 py-1">
                          <SessionRankSnap snap={startSnap} compact />
                        </td>
                        <td className="px-2 py-1">
                          <SessionRankSnap snap={endSnap} compact />
                        </td>
                        <td className="px-2 py-1">
                          <RpDeltaBadge delta={p.rpDelta} />
                        </td>
                        <td className="px-2 py-1">
                          <span className="inline-flex items-center gap-1">
                            {legendIcon ? (
                              <img
                                src={legendIcon}
                                alt=""
                                className="h-3.5 w-3.5 rounded-sm object-cover object-top"
                              />
                            ) : null}
                            {p.legend ?? "—"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
