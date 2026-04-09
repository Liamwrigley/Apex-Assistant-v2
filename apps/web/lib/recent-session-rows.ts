import {
  getRankSnapshotsBetween,
  segmentCountsAsInferredRankedGame,
  type TInferredGameSegment,
  type TOpenSessionSummary,
  type TRecentCompletedSessionRow,
} from "@apex-assistant/db";
import { rankPointsForSessionWindow } from "@/lib/session-rank-sparkline";
import type { TRecentSessionRow } from "@/components/recent-sessions-types";

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

/** One DB query per distinct account covering the min–max session window for those rows. */
export async function buildGranularSnapshotsByAccount(
  sessions: TRecentCompletedSessionRow[]
): Promise<Record<string, Array<{ capturedAt: string; rankScore: number }>>> {
  const out: Record<string, Array<{ capturedAt: string; rankScore: number }>> = {};
  const byAccount = new Map<string, TRecentCompletedSessionRow[]>();
  for (const row of sessions) {
    const list = byAccount.get(row.trackedAccountId) ?? [];
    list.push(row);
    byAccount.set(row.trackedAccountId, list);
  }
  await Promise.all(
    [...byAccount.entries()].map(async ([tid, list]) => {
      const minStart = new Date(
        Math.min(...list.map((s) => new Date(s.startedAt).getTime()))
      );
      const maxEnd = new Date(
        Math.max(...list.map((s) => new Date(s.endedAt).getTime()))
      );
      const rows = await getRankSnapshotsBetween(tid, minStart, maxEnd);
      out[tid] = rows.map((p) => ({
        capturedAt: toIso(p.capturedAt),
        rankScore: p.rankScore,
      }));
    })
  );
  return out;
}

export function mapSessionsToRecentSessionRows(
  sessions: TRecentCompletedSessionRow[],
  segmentsBySession: Record<string, TInferredGameSegment[]>,
  granularSnapshotsByAccount: Record<string, Array<{ capturedAt: string; rankScore: number }>>
): TRecentSessionRow[] {
  return sessions.map((r) => ({
    sessionId: r.sessionId,
    trackedAccountId: r.trackedAccountId,
    ign: r.ign,
    platform: r.platform,
    startedAt: toIso(r.startedAt),
    endedAt: toIso(r.endedAt),
    isActiveSession: false,
    openingRankScore: r.openingRankScore,
    latestRankScore: r.latestRankScore,
    openingRankName: r.openingRankName,
    openingRankDivision: r.openingRankDivision,
    openingRankIconUrl: r.openingRankIconUrl,
    latestRankName: r.latestRankName,
    latestRankDivision: r.latestRankDivision,
    latestRankIconUrl: r.latestRankIconUrl,
    legends: r.legends,
    rankSparklinePoints: rankPointsForSessionWindow(
      granularSnapshotsByAccount[r.trackedAccountId],
      toIso(r.startedAt),
      toIso(r.endedAt),
      r.openingRankScore,
      r.latestRankScore
    ),
    estimatedGames: (segmentsBySession[r.sessionId] ?? [])
      .filter(segmentCountsAsInferredRankedGame)
      .map((seg) => ({
        legend: seg.legendAssumed,
        rpDelta: seg.rpDelta,
        confidence: seg.confidence,
        mergeRisk: seg.mergeRisk,
        startedAt:
          seg.startedAt instanceof Date ? seg.startedAt.toISOString() : String(seg.startedAt),
        endedAt: seg.endedAt
          ? seg.endedAt instanceof Date
            ? seg.endedAt.toISOString()
            : String(seg.endedAt)
          : null,
        rankedMapNameOpen: seg.rankedMapNameOpen,
        rankedMapNameClose: seg.rankedMapNameClose,
        openingCareerKills: seg.openingCareerKills,
        closingCareerKills: seg.closingCareerKills,
        openingCareerDamage: seg.openingCareerDamage,
        closingCareerDamage: seg.closingCareerDamage,
      })),
  }));
}

export async function mapOpenSessionsToRecentSessionRows(
  openSessions: TOpenSessionSummary[],
  accountByTrackedId: Map<string, { ign: string; platform: string }>,
  segmentsBySession: Record<string, TInferredGameSegment[]>
): Promise<TRecentSessionRow[]> {
  return Promise.all(
    openSessions.map(async (o) => {
      const acc = accountByTrackedId.get(o.trackedAccountId);
      const ign = acc?.ign ?? "Unknown";
      const platform = acc?.platform ?? "";
      const now = new Date();
      const raw = await getRankSnapshotsBetween(o.trackedAccountId, o.startedAt, now);
      const granular = raw.map((p) => ({
        capturedAt: toIso(p.capturedAt),
        rankScore: p.rankScore,
      }));
      return {
        sessionId: o.sessionId,
        trackedAccountId: o.trackedAccountId,
        ign,
        platform,
        startedAt: toIso(o.startedAt),
        endedAt: null,
        isActiveSession: true,
        openingRankScore: o.openingRankScore,
        latestRankScore: o.latestRankScore,
        openingRankName: o.openingRankName,
        openingRankDivision: o.openingRankDivision,
        openingRankIconUrl: o.openingRankIconUrl,
        latestRankName: o.latestRankName,
        latestRankDivision: o.latestRankDivision,
        latestRankIconUrl: o.latestRankIconUrl,
        legends: o.legends,
        rankSparklinePoints: rankPointsForSessionWindow(
          granular,
          toIso(o.startedAt),
          null,
          o.openingRankScore,
          o.latestRankScore
        ),
        estimatedGames: (segmentsBySession[o.sessionId] ?? [])
          .filter(segmentCountsAsInferredRankedGame)
          .map((seg) => ({
            legend: seg.legendAssumed,
            rpDelta: seg.rpDelta,
            confidence: seg.confidence,
            mergeRisk: seg.mergeRisk,
            startedAt:
              seg.startedAt instanceof Date ? seg.startedAt.toISOString() : String(seg.startedAt),
            endedAt: seg.endedAt
              ? seg.endedAt instanceof Date
                ? seg.endedAt.toISOString()
                : String(seg.endedAt)
              : null,
            rankedMapNameOpen: seg.rankedMapNameOpen,
            rankedMapNameClose: seg.rankedMapNameClose,
            openingCareerKills: seg.openingCareerKills,
            closingCareerKills: seg.closingCareerKills,
            openingCareerDamage: seg.openingCareerDamage,
            closingCareerDamage: seg.closingCareerDamage,
          })),
      };
    })
  );
}
