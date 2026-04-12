import {
  getRecentVoiceIntervals,
  getRecentPartyEdges,
  getPartyMatchEdges,
  listTrackedAccounts,
} from "@apex-assistant/db";
import type { TPartyMatchEdge } from "@apex-assistant/db";
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

type TMatchPlayer = {
  ign: string;
  legend: string | null;
  rpDelta: number | null;
  rank: string | null;
  segmentId: string;
  segStart: Date;
  segEnd: Date;
  duration: number;
};

type TPartyMatch = {
  time: Date;
  map: string | null;
  players: TMatchPlayer[];
  avgScore: number;
  edges: Array<{ ignA: string; ignB: string; score: number; evidence: Record<string, unknown> }>;
};

function clusterMatchesFromEdges(edges: TPartyMatchEdge[]): TPartyMatch[] {
  // Union-find on segment IDs: edges that share a segment belong to the same match
  const parent = new Map<string, string>();
  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x);
    let root = parent.get(x)!;
    while (root !== parent.get(root)!) root = parent.get(root)!;
    let cur = x;
    while (cur !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  function union(a: string, b: string) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (const edge of edges) {
    union(edge.segmentIdA, edge.segmentIdB);
  }

  // Group edges by match cluster
  const clusterEdges = new Map<string, TPartyMatchEdge[]>();
  for (const edge of edges) {
    const root = find(edge.segmentIdA);
    const group = clusterEdges.get(root) ?? [];
    group.push(edge);
    clusterEdges.set(root, group);
  }

  // Build match objects
  const matches: TPartyMatch[] = [];
  for (const group of clusterEdges.values()) {
    const playerMap = new Map<string, TMatchPlayer>();
    let mapName: string | null = null;

    for (const edge of group) {
      if (!playerMap.has(edge.segmentIdA)) {
        playerMap.set(edge.segmentIdA, {
          ign: edge.ignA,
          legend: edge.legendA,
          rpDelta: edge.rpDeltaA,
          rank: edge.rankA,
          segmentId: edge.segmentIdA,
          segStart: edge.segStartA,
          segEnd: edge.segEndA,
          duration: edge.durationA,
        });
      }
      if (!playerMap.has(edge.segmentIdB)) {
        playerMap.set(edge.segmentIdB, {
          ign: edge.ignB,
          legend: edge.legendB,
          rpDelta: edge.rpDeltaB,
          rank: edge.rankB,
          segmentId: edge.segmentIdB,
          segStart: edge.segStartB,
          segEnd: edge.segEndB,
          duration: edge.durationB,
        });
      }
      if (!mapName) mapName = edge.mapA ?? edge.mapB;
    }

    const players = [...playerMap.values()].sort((a, b) => a.ign.localeCompare(b.ign));
    const totalScore = group.reduce((sum, e) => sum + e.score, 0);
    const avgScore = group.length > 0 ? totalScore / group.length : 0;
    const earliest = players.reduce(
      (min, p) => (new Date(p.segStart).getTime() < new Date(min).getTime() ? p.segStart : min),
      players[0].segStart,
    );

    matches.push({
      time: earliest,
      map: mapName,
      players,
      avgScore,
      edges: group.map((e) => ({
        ignA: e.ignA,
        ignB: e.ignB,
        score: e.score,
        evidence: e.evidence as Record<string, unknown>,
      })),
    });
  }

  return matches.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
}

export default async function DebugPartyPage() {
  const [voiceIntervals, partyEdges, matchEdges, accounts] = await Promise.all([
    getRecentVoiceIntervals(undefined, 200),
    getRecentPartyEdges(200),
    getPartyMatchEdges(300),
    listTrackedAccounts(),
  ]);

  const partyMatches = clusterMatchesFromEdges(matchEdges);

  const ownerDisplay = new Map<string, string>();
  for (const acc of accounts) {
    if (acc.ownerDisplayName) {
      ownerDisplay.set(acc.ownerUserId, acc.ownerDisplayName);
    }
  }

  const globalPairs = (() => {
    const map = new Map<
      string,
      {
        playerA: string;
        playerB: string;
        games: number;
        totalRpA: number;
        totalRpB: number;
        scoreSum: number;
        scoreCount: number;
        lastPlayedAt: Date;
      }
    >();
    for (const edge of partyEdges) {
      const a = edge.ignA;
      const b = edge.ignB;
      const [left, right] = a <= b ? [a, b] : [b, a];
      const key = `${left}\0${right}`;
      const current = map.get(key) ?? {
        playerA: left,
        playerB: right,
        games: 0,
        totalRpA: 0,
        totalRpB: 0,
        scoreSum: 0,
        scoreCount: 0,
        lastPlayedAt: edge.createdAt,
      };
      current.games += 1;
      current.totalRpA += edge.rpDeltaA ?? 0;
      current.totalRpB += edge.rpDeltaB ?? 0;
      current.scoreSum += edge.score;
      current.scoreCount += 1;
      if (new Date(edge.createdAt).getTime() > new Date(current.lastPlayedAt).getTime()) {
        current.lastPlayedAt = edge.createdAt;
      }
      map.set(key, current);
    }
    return [...map.values()]
      .map((row) => ({
        ...row,
        avgScore: row.scoreCount > 0 ? row.scoreSum / row.scoreCount : 0,
      }))
      .sort((a, b) => {
        if (b.games !== a.games) return b.games - a.games;
        return b.avgScore - a.avgScore;
      });
  })();

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

      {/* Party Match History */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle>Party Match History</CardTitle>
          <CardDescription>
            Games reconstructed from correlated segment edges ({partyMatches.length} matches).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {partyMatches.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No matches yet. Edges are clustered into matches when multiple players&apos; segments correlate.
            </p>
          ) : (
            <div className="space-y-3">
              {partyMatches.map((match, idx) => {
                const teamRp = match.players.reduce((sum, p) => sum + (p.rpDelta ?? 0), 0);
                return (
                  <div
                    key={idx}
                    className="border-border/40 rounded-lg border p-3"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <span className="font-medium">{fmtDateTime(match.time)}</span>
                      {match.map && (
                        <span className="rounded bg-indigo-900/40 px-1.5 py-0.5 text-indigo-300">
                          {match.map}
                        </span>
                      )}
                      <span className="text-muted-foreground">
                        {match.players.length} player{match.players.length > 1 ? "s" : ""}
                      </span>
                      <span className={`font-mono tabular-nums ${rpColor(teamRp)}`}>
                        Team: {teamRp > 0 ? "+" : ""}{teamRp} RP
                      </span>
                      <span className={`font-mono tabular-nums ${scoreColor(match.avgScore)}`}>
                        Avg score: {match.avgScore.toFixed(3)}
                      </span>
                      <span className="text-muted-foreground">
                        {confidenceTier(match.avgScore)}
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="text-muted-foreground border-b">
                            <th className="px-2 py-1 font-medium">Player</th>
                            <th className="px-2 py-1 font-medium">Legend</th>
                            <th className="px-2 py-1 font-medium">Rank</th>
                            <th className="px-2 py-1 font-medium text-right">RP</th>
                            <th className="px-2 py-1 font-medium text-right">Duration</th>
                            <th className="px-2 py-1 font-medium">Start</th>
                          </tr>
                        </thead>
                        <tbody>
                          {match.players.map((p) => (
                            <tr key={p.segmentId} className="border-border/40 border-b last:border-0">
                              <td className="px-2 py-1 font-medium">{p.ign}</td>
                              <td className="px-2 py-1">{p.legend ?? "—"}</td>
                              <td className="px-2 py-1 text-muted-foreground">{p.rank ?? "—"}</td>
                              <td className={`px-2 py-1 text-right font-mono tabular-nums ${rpColor(p.rpDelta)}`}>
                                {p.rpDelta != null ? (p.rpDelta > 0 ? "+" : "") + p.rpDelta : "—"}
                              </td>
                              <td className="px-2 py-1 text-right tabular-nums">
                                {durationLabel(p.segStart, p.segEnd)}
                              </td>
                              <td className="px-2 py-1 whitespace-nowrap text-muted-foreground">
                                {fmtDateTime(p.segStart)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <details className="mt-2">
                      <summary className="text-muted-foreground cursor-pointer text-[10px] hover:text-foreground">
                        Edge details ({match.edges.length} edge{match.edges.length > 1 ? "s" : ""})
                      </summary>
                      <div className="mt-1 space-y-1">
                        {match.edges.map((edge, ei) => {
                          const ev = edge.evidence;
                          const vcSec = typeof ev.vcOverlapSec === "number" ? ev.vcOverlapSec : null;
                          const startDelta = typeof ev.startDeltaMs === "number" ? ev.startDeltaMs : null;
                          return (
                            <div key={ei} className="rounded bg-muted/20 px-2 py-1 text-[10px] font-mono leading-tight">
                              <span className="text-muted-foreground">{edge.ignA} ↔ {edge.ignB}</span>
                              {" "}
                              <span className={scoreColor(edge.score)}>score={edge.score.toFixed(3)}</span>
                              {vcSec != null && <span className="text-muted-foreground"> vc={vcSec}s</span>}
                              {startDelta != null && <span className="text-muted-foreground"> Δstart={( startDelta / 1000).toFixed(1)}s</span>}
                              {typeof ev.legendCheck === "string" && <span className="text-muted-foreground"> legend={ev.legendCheck as string}</span>}
                              <details className="mt-0.5 inline">
                                <summary className="text-muted-foreground cursor-pointer hover:text-foreground ml-2">JSON</summary>
                                <pre className="mt-0.5 max-h-32 max-w-md overflow-auto rounded bg-muted/30 p-1 text-[9px]">
                                  {JSON.stringify(ev, null, 2)}
                                </pre>
                              </details>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stack Mates Preview */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle>Global Stack Pairs</CardTitle>
          <CardDescription>
            Aggregated pairings from scored party edges across all tracked accounts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {globalPairs.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No stack-mate data yet. Edges build up after the correlation job matches segment pairs.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="px-2 py-1 font-medium">Player A</th>
                    <th className="px-2 py-1 font-medium">Player B</th>
                    <th className="px-2 py-1 font-medium text-right">Games</th>
                    <th className="px-2 py-1 font-medium text-right">Total RP A</th>
                    <th className="px-2 py-1 font-medium text-right">Total RP B</th>
                    <th className="px-2 py-1 font-medium text-right">Avg Score</th>
                    <th className="px-2 py-1 font-medium">Confidence</th>
                    <th className="px-2 py-1 font-medium">Last Played</th>
                  </tr>
                </thead>
                <tbody>
                  {globalPairs.map((pair) => {
                    return (
                      <tr key={`${pair.playerA}\0${pair.playerB}`} className="border-border/40 border-b last:border-0">
                        <td className="px-2 py-1 font-medium">{pair.playerA}</td>
                        <td className="px-2 py-1 font-medium">{pair.playerB}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{pair.games}</td>
                        <td className={`px-2 py-1 text-right tabular-nums ${rpColor(pair.totalRpA)}`}>
                          {pair.totalRpA > 0 ? "+" : ""}{pair.totalRpA}
                        </td>
                        <td className={`px-2 py-1 text-right tabular-nums ${rpColor(pair.totalRpB)}`}>
                          {pair.totalRpB > 0 ? "+" : ""}{pair.totalRpB}
                        </td>
                        <td className={`px-2 py-1 text-right tabular-nums ${scoreColor(pair.avgScore)}`}>
                          {pair.avgScore.toFixed(2)}
                        </td>
                        <td className="px-2 py-1">{confidenceTier(pair.avgScore)}</td>
                        <td className="px-2 py-1">{fmtDateTime(pair.lastPlayedAt)}</td>
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
