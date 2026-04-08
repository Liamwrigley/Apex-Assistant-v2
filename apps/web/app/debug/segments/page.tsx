import {
  listTrackedAccounts,
  getRecentPresenceSnapshots,
  getRankTimelineByTrackedAccountId,
  getRecentSegmentsByAccount
} from "@apex-assistant/db";
import { evaluateRealtimePresence } from "@/lib/realtime-presence";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SegmentTriggerCell } from "./segment-trigger-cell";

export const dynamic = "force-dynamic";

const confidenceColor: Record<string, string> = {
  high: "bg-green-900/40 text-green-300",
  medium: "bg-yellow-900/40 text-yellow-300",
  low: "bg-red-900/40 text-red-300"
};

function fmtTime(d: Date | string | null): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtDateTime(d: Date | string | null): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

function durationLabel(startedAt: Date, endedAt: Date | null): string {
  const end = endedAt ?? new Date();
  const sec = Math.max(0, Math.round((end.getTime() - new Date(startedAt).getTime()) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return `${min}m ${remSec}s`;
}

export default async function DebugSegmentsPage() {
  const guildId = process.env.DISCORD_GUILD_ID ?? "";
  const accounts = await listTrackedAccounts(guildId || undefined);

  const accountData = await Promise.all(
    accounts.map(async (account) => {
      const [presenceSnapshots, rankTimeline, segments] = await Promise.all([
        getRecentPresenceSnapshots(account.id, 200),
        getRankTimelineByTrackedAccountId(account.id, 48),
        getRecentSegmentsByAccount(account.id, 100)
      ]);

      const evalResult = evaluateRealtimePresence({
        realtimeUpdatedAt: account.realtimeUpdatedAt ? account.realtimeUpdatedAt.toISOString() : null,
        realtimeIsOnline: account.realtimeIsOnline,
        realtimeIsInGame: account.realtimeIsInGame,
        realtimeCurrentState: account.realtimeCurrentState,
        realtimeCurrentStateAsText: account.realtimeCurrentStateAsText
      });

      return {
        account,
        evalResult,
        presenceSnapshots: presenceSnapshots.reverse(),
        rankTimeline,
        segments: segments.reverse()
      };
    })
  );

  return (
    <main className="mx-auto w-full max-w-7xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold">Segment Debug</h1>
        <p className="text-muted-foreground text-sm">
          Per-account presence snapshots, rank changes, inferred game segments, and raw realtime. Refresh to update.
        </p>
      </div>

      {accountData.map(({ account, evalResult, presenceSnapshots, rankTimeline, segments }) => (
        <Card key={account.id} className="border-border/60">
          <CardHeader>
            <CardTitle className="flex items-baseline gap-3">
              <span>{account.ign}</span>
              <span className="text-muted-foreground text-sm font-normal">
                {account.platform.toUpperCase()} &middot; {evalResult.status}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Section 1: Raw Realtime */}
            <details open>
              <summary className="cursor-pointer text-sm font-semibold">Raw Realtime</summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <tbody>
                    <tr><td className="text-muted-foreground pr-4 py-1">Legend</td><td>{account.realtimeSelectedLegend ?? "-"}</td></tr>
                    <tr><td className="text-muted-foreground pr-4 py-1">isOnline</td><td>{account.realtimeIsOnline ?? "-"}</td></tr>
                    <tr><td className="text-muted-foreground pr-4 py-1">isInGame</td><td>{account.realtimeIsInGame ?? "-"}</td></tr>
                    <tr><td className="text-muted-foreground pr-4 py-1">Lobby</td><td>{account.realtimeLobbyState ?? "-"}</td></tr>
                    <tr><td className="text-muted-foreground pr-4 py-1">State</td><td>{account.realtimeCurrentState ?? "-"}</td></tr>
                    <tr><td className="text-muted-foreground pr-4 py-1">State Text</td><td>{account.realtimeCurrentStateAsText ?? "-"}</td></tr>
                    <tr><td className="text-muted-foreground pr-4 py-1">Derived</td><td className="uppercase">{evalResult.status}</td></tr>
                    <tr><td className="text-muted-foreground pr-4 py-1">Reason</td><td>{evalResult.reason}</td></tr>
                    <tr><td className="text-muted-foreground pr-4 py-1">Rank Score</td><td>{rankTimeline.length > 0 ? rankTimeline[rankTimeline.length - 1].rankScore : "-"}</td></tr>
                  </tbody>
                </table>
              </div>
            </details>

            {/* Section 2: Inferred Segments */}
            <details open>
              <summary className="cursor-pointer text-sm font-semibold">
                Inferred Segments ({segments.length})
              </summary>
              <div className="mt-2 overflow-x-auto">
                {segments.length === 0 ? (
                  <p className="text-muted-foreground text-xs">No segments yet.</p>
                ) : (
                  <table className="w-full min-w-[1400px] text-left text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b">
                        <th className="px-2 py-1 font-medium">Status</th>
                        <th className="px-2 py-1 font-medium">Started</th>
                        <th className="px-2 py-1 font-medium">Ended</th>
                        <th className="px-2 py-1 font-medium">Duration</th>
                        <th className="px-2 py-1 font-medium">Legend</th>
                        <th className="px-2 py-1 font-medium">Open RP</th>
                        <th className="px-2 py-1 font-medium">Close RP</th>
                        <th className="px-2 py-1 font-medium">Delta</th>
                        <th className="px-2 py-1 font-medium">Open Tier</th>
                        <th className="px-2 py-1 font-medium">Close Tier</th>
                        <th className="px-2 py-1 font-medium">Map (Open)</th>
                        <th className="px-2 py-1 font-medium">Map (Close)</th>
                        <th className="px-2 py-1 font-medium">Kills</th>
                        <th className="px-2 py-1 font-medium">Dmg</th>
                        <th className="px-2 py-1 font-medium">Wins</th>
                        <th className="px-2 py-1 font-medium">Confidence</th>
                        <th className="px-2 py-1 font-medium">Merge Risk</th>
                        <th className="px-2 py-1 font-medium">Trigger</th>
                      </tr>
                    </thead>
                    <tbody>
                      {segments.map((seg) => {
                        const isOpen = !seg.endedAt;
                        return (
                          <tr
                            key={seg.id}
                            className={`border-border/40 border-b last:border-0 ${isOpen ? "bg-blue-900/20" : ""}`}
                          >
                            <td className="px-2 py-1">
                              {isOpen ? (
                                <span className="rounded bg-blue-900/40 px-1.5 py-0.5 text-blue-300">in progress</span>
                              ) : (
                                <span className="text-muted-foreground">closed</span>
                              )}
                            </td>
                            <td className="px-2 py-1">{fmtDateTime(seg.startedAt)}</td>
                            <td className="px-2 py-1">{fmtDateTime(seg.endedAt)}</td>
                            <td className="px-2 py-1">{durationLabel(seg.startedAt, seg.endedAt)}</td>
                            <td className="px-2 py-1">{seg.legendAssumed ?? "-"}</td>
                            <td className="px-2 py-1">{seg.openingRankScore ?? "-"}</td>
                            <td className="px-2 py-1">{seg.closingRankScore ?? "-"}</td>
                            <td className="px-2 py-1">
                              {seg.rpDelta !== null ? (
                                <span className={seg.rpDelta > 0 ? "text-green-400" : seg.rpDelta < 0 ? "text-red-400" : ""}>
                                  {seg.rpDelta > 0 ? "+" : ""}{seg.rpDelta}
                                </span>
                              ) : "-"}
                            </td>
                            <td className="px-2 py-1 whitespace-nowrap">
                              {seg.openingRankName ? `${seg.openingRankName}${seg.openingRankDivision ? ` ${seg.openingRankDivision}` : ""}` : "-"}
                            </td>
                            <td className="px-2 py-1 whitespace-nowrap">
                              {seg.closingRankName ? `${seg.closingRankName}${seg.closingRankDivision ? ` ${seg.closingRankDivision}` : ""}` : "-"}
                            </td>
                            <td className="px-2 py-1 whitespace-nowrap">
                              {seg.rankedMapNameOpen ?? "-"}
                            </td>
                            <td className="px-2 py-1 whitespace-nowrap">
                              {seg.rankedMapNameClose ?? "-"}
                            </td>
                            <td className="px-2 py-1 tabular-nums">
                              {seg.openingCareerKills != null && seg.closingCareerKills != null
                                ? seg.closingCareerKills - seg.openingCareerKills
                                : "-"}
                            </td>
                            <td className="px-2 py-1 tabular-nums">
                              {seg.openingCareerDamage != null && seg.closingCareerDamage != null
                                ? (seg.closingCareerDamage - seg.openingCareerDamage).toLocaleString()
                                : "-"}
                            </td>
                            <td className="px-2 py-1 tabular-nums">
                              {seg.openingCareerWins != null && seg.closingCareerWins != null
                                ? seg.closingCareerWins - seg.openingCareerWins
                                : "-"}
                            </td>
                            <td className="px-2 py-1">
                              <span className={`rounded px-1.5 py-0.5 ${confidenceColor[seg.confidence] ?? ""}`}>
                                {seg.confidence}
                              </span>
                            </td>
                            <td className="px-2 py-1">
                              {seg.mergeRisk ? (
                                <span className="rounded bg-orange-900/40 px-1.5 py-0.5 text-orange-300">yes</span>
                              ) : "-"}
                            </td>
                            <td className="px-2 py-1 align-top">
                              <SegmentTriggerCell segmentId={seg.id} triggerSignals={seg.triggerSignals} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </details>

            {/* Section 3: Rank Timeline */}
            <details>
              <summary className="cursor-pointer text-sm font-semibold">
                Rank Changes (48h, {rankTimeline.length} points)
              </summary>
              <div className="mt-2 overflow-x-auto max-h-64 overflow-y-auto">
                {rankTimeline.length === 0 ? (
                  <p className="text-muted-foreground text-xs">No rank snapshots in the last 48h.</p>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-background">
                      <tr className="text-muted-foreground border-b">
                        <th className="px-2 py-1 font-medium">Time</th>
                        <th className="px-2 py-1 font-medium">Rank Score</th>
                        <th className="px-2 py-1 font-medium">Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankTimeline.map((pt, idx) => {
                        const prevScore = idx > 0 ? rankTimeline[idx - 1].rankScore : pt.rankScore;
                        const delta = pt.rankScore - prevScore;
                        return (
                          <tr key={idx} className="border-border/40 border-b last:border-0">
                            <td className="px-2 py-1">{fmtTime(pt.capturedAt)}</td>
                            <td className="px-2 py-1">{pt.rankScore}</td>
                            <td className="px-2 py-1">
                              {delta !== 0 ? (
                                <span className={delta > 0 ? "text-green-400" : "text-red-400"}>
                                  {delta > 0 ? "+" : ""}{delta}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </details>

            {/* Section 4: Presence Timeline */}
            <details>
              <summary className="cursor-pointer text-sm font-semibold">
                Presence Snapshots ({presenceSnapshots.length})
              </summary>
              <div className="mt-2 overflow-x-auto max-h-64 overflow-y-auto">
                {presenceSnapshots.length === 0 ? (
                  <p className="text-muted-foreground text-xs">No presence snapshots yet.</p>
                ) : (
                  <table className="w-full min-w-[700px] text-left text-xs">
                    <thead className="sticky top-0 bg-background">
                      <tr className="text-muted-foreground border-b">
                        <th className="px-2 py-1 font-medium">Time</th>
                        <th className="px-2 py-1 font-medium">Legend</th>
                        <th className="px-2 py-1 font-medium">In Game</th>
                        <th className="px-2 py-1 font-medium">Lobby</th>
                        <th className="px-2 py-1 font-medium">State</th>
                        <th className="px-2 py-1 font-medium">State Text</th>
                        <th className="px-2 py-1 font-medium">Derived</th>
                      </tr>
                    </thead>
                    <tbody>
                      {presenceSnapshots.map((snap) => (
                        <tr key={snap.id} className="border-border/40 border-b last:border-0">
                          <td className="px-2 py-1">{fmtDateTime(snap.capturedAt)}</td>
                          <td className="px-2 py-1">{snap.selectedLegend ?? "-"}</td>
                          <td className="px-2 py-1">
                            {snap.isInGame ? (
                              <span className="text-green-400">yes</span>
                            ) : (
                              <span className="text-muted-foreground">no</span>
                            )}
                          </td>
                          <td className="px-2 py-1">{snap.lobbyState ?? "-"}</td>
                          <td className="px-2 py-1">{snap.currentState ?? "-"}</td>
                          <td className="px-2 py-1">{snap.currentStateAsText ?? "-"}</td>
                          <td className="px-2 py-1 uppercase">{snap.derivedStatus}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </details>
          </CardContent>
        </Card>
      ))}
    </main>
  );
}
