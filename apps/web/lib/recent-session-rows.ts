import {
  getRankSnapshotsBetween,
  getTrackerObservationsInRange,
  segmentCountsAsInferredRankedGame,
  type TInferredGameSegment,
  type TOpenSessionSummary,
  type TRecentCompletedSessionRow,
  type TTrackerObservationRow,
} from "@apex-assistant/db";
import { rankPointsForSessionWindow } from "@/lib/session-rank-sparkline";
import type { TRecentSessionRow, TEstimatedGameTrackerDelta } from "@/components/recent-sessions-types";

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

function findClosestBatchTime(sortedTimes: number[], targetMs: number): number | null {
  if (sortedTimes.length === 0) return null;
  let best = sortedTimes[0];
  let bestDist = Math.abs(best - targetMs);
  for (const t of sortedTimes) {
    const dist = Math.abs(t - targetMs);
    if (dist < bestDist) {
      best = t;
      bestDist = dist;
    }
  }
  return best;
}

function computeSegmentTrackerDeltas(
  seg: TInferredGameSegment,
  observations: TTrackerObservationRow[]
): TEstimatedGameTrackerDelta[] {
  if (!seg.legendAssumed || observations.length === 0 || !seg.endedAt) return [];

  const normLegend = seg.legendAssumed.trim().toLowerCase();
  const legendObs = observations.filter(
    (o) => o.legendName.trim().toLowerCase() === normLegend
  );
  if (legendObs.length === 0) return [];

  const batches = new Map<number, TTrackerObservationRow[]>();
  for (const obs of legendObs) {
    const t = new Date(obs.capturedAt).getTime();
    const list = batches.get(t);
    if (list) list.push(obs);
    else batches.set(t, [obs]);
  }
  const batchTimes = [...batches.keys()].sort((a, b) => a - b);

  const startMs = new Date(seg.startedAt).getTime();
  const endMs = new Date(seg.endedAt).getTime();
  const openBatchTime = findClosestBatchTime(batchTimes, startMs);
  const closeBatchTime = findClosestBatchTime(batchTimes, endMs);
  if (openBatchTime === null || closeBatchTime === null) return [];
  if (openBatchTime === closeBatchTime) return [];

  const openBatch = batches.get(openBatchTime)!;
  const closeBatch = batches.get(closeBatchTime)!;

  const openMap = new Map<string, TTrackerObservationRow>();
  for (const obs of openBatch) {
    openMap.set(`${obs.trackerKey}\0${obs.dataIndex}`, obs);
  }

  const deltas: TEstimatedGameTrackerDelta[] = [];
  for (const closeObs of closeBatch) {
    const openObs = openMap.get(`${closeObs.trackerKey}\0${closeObs.dataIndex}`);
    deltas.push({
      displayName: closeObs.displayName,
      trackerKey: closeObs.trackerKey,
      dataIndex: closeObs.dataIndex,
      delta: openObs != null ? closeObs.value - openObs.value : null,
      endValue: closeObs.value,
    });
  }
  return deltas.sort((a, b) => a.dataIndex - b.dataIndex);
}

/** Bulk-fetch tracker observations for all accounts that appear in the given segments. */
export async function buildTrackerObsByAccount(
  segmentsBySession: Record<string, TInferredGameSegment[]>
): Promise<Record<string, TTrackerObservationRow[]>> {
  const allSegments = Object.values(segmentsBySession).flat();
  if (allSegments.length === 0) return {};

  const rangeByAccount = new Map<string, { min: number; max: number }>();
  for (const seg of allSegments) {
    const tid = seg.trackedAccountId;
    const startMs = new Date(seg.startedAt).getTime();
    const endMs = seg.endedAt ? new Date(seg.endedAt).getTime() : Date.now();
    const cur = rangeByAccount.get(tid);
    if (cur) {
      cur.min = Math.min(cur.min, startMs);
      cur.max = Math.max(cur.max, endMs);
    } else {
      rangeByAccount.set(tid, { min: startMs, max: endMs });
    }
  }

  const out: Record<string, TTrackerObservationRow[]> = {};
  await Promise.all(
    [...rangeByAccount.entries()].map(async ([tid, range]) => {
      out[tid] = await getTrackerObservationsInRange(
        tid,
        new Date(range.min),
        new Date(range.max)
      );
    })
  );
  return out;
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
  granularSnapshotsByAccount: Record<string, Array<{ capturedAt: string; rankScore: number }>>,
  trackerObsByAccount?: Record<string, TTrackerObservationRow[]>
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
    latestRankName: r.latestRankName,
    latestRankDivision: r.latestRankDivision,
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
        trackerDeltas: computeSegmentTrackerDeltas(
          seg,
          trackerObsByAccount?.[seg.trackedAccountId] ?? []
        ),
      })),
  }));
}

export async function mapOpenSessionsToRecentSessionRows(
  openSessions: TOpenSessionSummary[],
  accountByTrackedId: Map<string, { ign: string; platform: string }>,
  segmentsBySession: Record<string, TInferredGameSegment[]>,
  trackerObsByAccount?: Record<string, TTrackerObservationRow[]>
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
        latestRankName: o.latestRankName,
        latestRankDivision: o.latestRankDivision,
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
            trackerDeltas: computeSegmentTrackerDeltas(
              seg,
              trackerObsByAccount?.[seg.trackedAccountId] ?? []
            ),
          })),
      };
    })
  );
}
