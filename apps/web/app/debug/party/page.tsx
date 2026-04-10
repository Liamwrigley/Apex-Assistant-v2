import {
  getRecentVoiceIntervals,
  getRecentPartyEdges,
  listTrackedAccounts,
  getStackMatesForAccount,
  getBaselineAvgRp,
} from "@apex-assistant/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

function fmtDateTime(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function durationLabel(start: Date | string, end: Date | string | null): string {
  const s = typeof start === "string" ? new Date(start) : start;
  const e = end ? (typeof end === "string" ? new Date(end) : end) : new Date();
  const sec = Math.max(0, Math.round((e.getTime() - s.getTime()) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 60) return `${min}m ${remSec}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

function rpColor(v: number | null): string {
  if (v == null) return "";
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-rose-400";
  return "text-muted-foreground";
}

function scoreColor(v: number): string {
  if (v >= 0.6) return "text-emerald-400";
  if (v >= 0.3) return "text-yellow-400";
  return "text-muted-foreground";
}

function confidenceTier(score: number): string {
  if (score >= 0.6) return "Very likely";
  if (score >= 0.3) return "Likely";
  return "Possible";
}

export default async function DebugPartyPage() {
  const [voiceIntervals, partyEdges, accounts] = await Promise.all([
    getRecentVoiceIntervals(undefined, 200),
    getRecentPartyEdges(undefined, 200),
    listTrackedAccounts(),
  ]);

  const ownerDisplay = new Map<string, string>();
  for (const acc of accounts) {
    if (acc.ownerDisplayName) {
      ownerDisplay.set(acc.ownerUserId, acc.ownerDisplayName);
    }
  }

  const firstAccount = accounts[0] ?? null;
  const [stackMates, baseline] = firstAccount
    ? await Promise.all([
        getStackMatesForAccount(firstAccount.id, 720),
        getBaselineAvgRp(firstAccount.id, 720),
      ])
    : [[], null];

  return (
    <main className="mx-auto w-full max-w-7xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold">Party Detection Debug</h1>
        <p className="text-muted-foreground text-sm">
          Voice intervals, scored segment edges, and stack-mate aggregates. Refresh to update.
        </p>
      </div>

      {/* Voice Intervals */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle>Voice Intervals</CardTitle>
          <CardDescription>
            Recent Discord VC join/leave intervals ({voiceIntervals.length} rows).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {voiceIntervals.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No voice intervals yet. They appear after users join/leave voice channels while the bot is running with
              GuildVoiceStates intent.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="px-2 py-1 font-medium">Discord User</th>
                    <th className="px-2 py-1 font-medium">Channel</th>
                    <th className="px-2 py-1 font-medium">Joined</th>
                    <th className="px-2 py-1 font-medium">Left</th>
                    <th className="px-2 py-1 font-medium">Duration</th>
                    <th className="px-2 py-1 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {voiceIntervals.map((vi) => {
                    const isOpen = !vi.leftAt;
                    return (
                      <tr
                        key={vi.id}
                        className={`border-border/40 border-b last:border-0 ${isOpen ? "bg-blue-900/20" : ""}`}
                      >
                        <td className="px-2 py-1 font-mono">
                          {ownerDisplay.get(vi.discordUserId) ?? vi.discordUserId}
                        </td>
                        <td className="px-2 py-1 font-mono text-muted-foreground">{vi.channelId}</td>
                        <td className="px-2 py-1">{fmtDateTime(vi.joinedAt)}</td>
                        <td className="px-2 py-1">{fmtDateTime(vi.leftAt)}</td>
                        <td className="px-2 py-1">{durationLabel(vi.joinedAt, vi.leftAt)}</td>
                        <td className="px-2 py-1">
                          {isOpen ? (
                            <span className="rounded bg-blue-900/40 px-1.5 py-0.5 text-blue-300">in VC</span>
                          ) : (
                            <span className="text-muted-foreground">left</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Party Segment Edges */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle>Party Segment Edges</CardTitle>
          <CardDescription>
            Scored hypotheses linking segment pairs as same-squad ({partyEdges.length} edges).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {partyEdges.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No edges yet. The correlation job runs in the worker every few minutes after segments close.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="px-2 py-1 font-medium">Time</th>
                    <th className="px-2 py-1 font-medium">Player A</th>
                    <th className="px-2 py-1 font-medium">Player B</th>
                    <th className="px-2 py-1 font-medium">Score</th>
                    <th className="px-2 py-1 font-medium">Confidence</th>
                    <th className="px-2 py-1 font-medium">Legend A</th>
                    <th className="px-2 py-1 font-medium">Legend B</th>
                    <th className="px-2 py-1 font-medium">RP A</th>
                    <th className="px-2 py-1 font-medium">RP B</th>
                    <th className="px-2 py-1 font-medium">VC Overlap</th>
                    <th className="px-2 py-1 font-medium">Start Delta</th>
                    <th className="px-2 py-1 font-medium">Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {partyEdges.map((edge) => {
                    const ev = edge.evidence as Record<string, unknown>;
                    const vcOverlap = typeof ev.vcOverlapSec === "number" ? ev.vcOverlapSec : null;
                    const startDelta = typeof ev.startDeltaMs === "number" ? ev.startDeltaMs : null;
                    return (
                      <tr key={edge.id} className="border-border/40 border-b last:border-0">
                        <td className="px-2 py-1 whitespace-nowrap">{fmtDateTime(edge.segStartA)}</td>
                        <td className="px-2 py-1 font-medium">{edge.ignA}</td>
                        <td className="px-2 py-1 font-medium">{edge.ignB}</td>
                        <td className={`px-2 py-1 font-mono ${scoreColor(edge.score)}`}>
                          {edge.score.toFixed(3)}
                        </td>
                        <td className="px-2 py-1">{confidenceTier(edge.score)}</td>
                        <td className="px-2 py-1">{edge.legendA ?? "—"}</td>
                        <td className="px-2 py-1">{edge.legendB ?? "—"}</td>
                        <td className={`px-2 py-1 tabular-nums ${rpColor(edge.rpDeltaA)}`}>
                          {edge.rpDeltaA != null ? (edge.rpDeltaA > 0 ? "+" : "") + edge.rpDeltaA : "—"}
                        </td>
                        <td className={`px-2 py-1 tabular-nums ${rpColor(edge.rpDeltaB)}`}>
                          {edge.rpDeltaB != null ? (edge.rpDeltaB > 0 ? "+" : "") + edge.rpDeltaB : "—"}
                        </td>
                        <td className="px-2 py-1 tabular-nums">
                          {vcOverlap != null ? `${vcOverlap}s` : "—"}
                        </td>
                        <td className="px-2 py-1 tabular-nums">
                          {startDelta != null ? `${(startDelta / 1000).toFixed(1)}s` : "—"}
                        </td>
                        <td className="px-2 py-1">
                          <details>
                            <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
                              JSON
                            </summary>
                            <pre className="mt-1 max-h-40 max-w-xs overflow-auto rounded bg-muted/30 p-1.5 text-[10px] leading-tight">
                              {JSON.stringify(ev, null, 2)}
                            </pre>
                          </details>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stack Mates Preview */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle>Stack Mates Preview</CardTitle>
          <CardDescription>
            {firstAccount
              ? `Aggregated teammates for ${firstAccount.ign} (30d window). Baseline avg RP: ${baseline ? baseline.avgRpDelta.toFixed(1) : "—"} over ${baseline?.games ?? 0} games.`
              : "No tracked accounts found."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stackMates.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No stack-mate data yet. Edges build up after the correlation job matches segment pairs.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="px-2 py-1 font-medium">Teammate</th>
                    <th className="px-2 py-1 font-medium">Platform</th>
                    <th className="px-2 py-1 font-medium text-right">Games</th>
                    <th className="px-2 py-1 font-medium text-right">Avg RP</th>
                    <th className="px-2 py-1 font-medium text-right">vs Baseline</th>
                    <th className="px-2 py-1 font-medium text-right">Total RP</th>
                    <th className="px-2 py-1 font-medium text-right">Avg Score</th>
                    <th className="px-2 py-1 font-medium">Confidence</th>
                    <th className="px-2 py-1 font-medium">Last Played</th>
                  </tr>
                </thead>
                <tbody>
                  {stackMates.map((m) => {
                    const vsBaseline = baseline
                      ? Math.round((m.avgRpDelta - baseline.avgRpDelta) * 10) / 10
                      : null;
                    return (
                      <tr key={m.teammateAccountId} className="border-border/40 border-b last:border-0">
                        <td className="px-2 py-1 font-medium">{m.teammateIgn}</td>
                        <td className="px-2 py-1 uppercase">{m.teammatePlatform}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{m.games}</td>
                        <td className={`px-2 py-1 text-right tabular-nums ${rpColor(m.avgRpDelta)}`}>
                          {m.avgRpDelta > 0 ? "+" : ""}{m.avgRpDelta.toFixed(1)}
                        </td>
                        <td className={`px-2 py-1 text-right tabular-nums ${rpColor(vsBaseline)}`}>
                          {vsBaseline != null ? `${vsBaseline > 0 ? "+" : ""}${vsBaseline.toFixed(1)}` : "—"}
                        </td>
                        <td className={`px-2 py-1 text-right tabular-nums ${rpColor(m.totalRpDelta)}`}>
                          {m.totalRpDelta > 0 ? "+" : ""}{m.totalRpDelta}
                        </td>
                        <td className={`px-2 py-1 text-right tabular-nums ${scoreColor(m.avgScore)}`}>
                          {m.avgScore.toFixed(2)}
                        </td>
                        <td className="px-2 py-1">{confidenceTier(m.avgScore)}</td>
                        <td className="px-2 py-1">{fmtDateTime(m.lastPlayedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
