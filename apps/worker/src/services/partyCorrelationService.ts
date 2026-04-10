import { pool, upsertPartyEdge } from "@apex-assistant/db";

const debugLogs = (process.env.DEBUG_LOGS ?? "false").toLowerCase() === "true";

function log(message: string, meta?: Record<string, unknown>) {
  if (!debugLogs) return;
  const payload = meta ? ` ${JSON.stringify(meta)}` : "";
  console.log(`[party-correlation] ${message}${payload}`);
}

/**
 * Tunable constants for the scoring model.
 * Tweak via env vars or adjust defaults as we learn.
 */
const SLACK_MS = Number(process.env.PARTY_SLACK_MS ?? 120_000);
const VC_OVERLAP_WEIGHT = Number(process.env.PARTY_VC_WEIGHT ?? 0.5);
const TIME_ALIGN_WEIGHT = Number(process.env.PARTY_TIME_WEIGHT ?? 0.2);
const LEGEND_UNIQUE_BONUS = Number(process.env.PARTY_LEGEND_BONUS ?? 0.15);
const LEGEND_DUPLICATE_PENALTY = Number(process.env.PARTY_LEGEND_PENALTY ?? -1.0);
const RP_SIMILARITY_WEIGHT = Number(process.env.PARTY_RP_WEIGHT ?? 0.1);
const MIN_SCORE_TO_PERSIST = Number(process.env.PARTY_MIN_SCORE ?? 0.15);

type TSegmentCandidate = {
  segmentId: string;
  trackedAccountId: string;
  ownerUserId: string;
  guildId: string;
  identityGroupId: string | null;
  startedAt: Date;
  endedAt: Date;
  legendAssumed: string | null;
  rpDelta: number | null;
};

type TVoiceRow = {
  discordUserId: string;
  channelId: string;
  joinedAt: Date;
  leftAt: Date | null;
};

function overlapMs(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());
  return Math.max(0, end - start);
}

function scoreTimeAlignment(a: TSegmentCandidate, b: TSegmentCandidate): { score: number; startDeltaMs: number; durationRatio: number } {
  const startDeltaMs = Math.abs(a.startedAt.getTime() - b.startedAt.getTime());
  const endDeltaMs = Math.abs(a.endedAt.getTime() - b.endedAt.getTime());
  const durationA = a.endedAt.getTime() - a.startedAt.getTime();
  const durationB = b.endedAt.getTime() - b.startedAt.getTime();
  const durationRatio = durationA > 0 && durationB > 0
    ? Math.min(durationA, durationB) / Math.max(durationA, durationB)
    : 0;

  const avgDelta = (startDeltaMs + endDeltaMs) / 2;
  const alignmentScore = avgDelta < SLACK_MS
    ? 1 - avgDelta / SLACK_MS
    : 0;

  return {
    score: alignmentScore * durationRatio,
    startDeltaMs,
    durationRatio,
  };
}

function scoreLegendUniqueness(a: TSegmentCandidate, b: TSegmentCandidate): { score: number; check: string } {
  if (!a.legendAssumed || !b.legendAssumed) {
    return { score: 0, check: "unknown" };
  }
  if (a.legendAssumed.toLowerCase() === b.legendAssumed.toLowerCase()) {
    return { score: LEGEND_DUPLICATE_PENALTY, check: "duplicate" };
  }
  return { score: LEGEND_UNIQUE_BONUS, check: "unique" };
}

function scoreRpSimilarity(a: TSegmentCandidate, b: TSegmentCandidate): { score: number; deltaA: number | null; deltaB: number | null } {
  if (a.rpDelta == null || b.rpDelta == null) {
    return { score: 0, deltaA: a.rpDelta, deltaB: b.rpDelta };
  }
  const sameSign = (a.rpDelta >= 0) === (b.rpDelta >= 0);
  const diff = Math.abs(a.rpDelta - b.rpDelta);
  const mag = Math.max(Math.abs(a.rpDelta), Math.abs(b.rpDelta), 1);
  const similarity = sameSign ? Math.max(0, 1 - diff / mag) : 0;
  return { score: similarity * RP_SIMILARITY_WEIGHT, deltaA: a.rpDelta, deltaB: b.rpDelta };
}

/**
 * Process recently-closed segments and emit party_segment_edges.
 * Call on a schedule (e.g. every 5–10 minutes) or after each ingest cycle.
 *
 * Strategy:
 * 1. Find segments closed since `sinceMs` ago.
 * 2. For each segment, look up the owner's VC intervals in that window.
 * 3. For each VC channel, find other tracked users who were also in VC.
 * 4. For each peer, find their segments overlapping the same window.
 * 5. Score each (segA, segB) pair; persist edges above threshold.
 */
export async function correlateRecentSegments(sinceMs = 30 * 60 * 1000): Promise<{ edgesCreated: number }> {
  const since = new Date(Date.now() - sinceMs);
  log("starting correlation", { sinceMs, since: since.toISOString() });

  const segResult = await pool.query<TSegmentCandidate>(
    `select
       seg.id as "segmentId",
       seg.tracked_account_id as "trackedAccountId",
       ta.owner_user_id as "ownerUserId",
       ta.guild_id as "guildId",
       ta.identity_group_id as "identityGroupId",
       seg.started_at as "startedAt",
       seg.ended_at as "endedAt",
       seg.legend_assumed as "legendAssumed",
       seg.rp_delta as "rpDelta"
     from inferred_game_segments seg
     join tracked_accounts ta on ta.id = seg.tracked_account_id
     where seg.ended_at is not null
       and seg.ended_at >= $1
       and seg.rp_delta is not null
       and seg.rp_delta <> 0
       and (seg.trigger_signals->>'reason') is distinct from 'legend_change'
     order by seg.started_at asc`,
    [since],
  );

  const segments = segResult.rows;
  log("found candidate segments", { count: segments.length });

  if (segments.length === 0) return { edgesCreated: 0 };

  let edgesCreated = 0;
  const processed = new Set<string>();

  for (const segA of segments) {
    const windowStart = new Date(segA.startedAt.getTime() - SLACK_MS);
    const windowEnd = new Date(segA.endedAt.getTime() + SLACK_MS);

    const vcResult = await pool.query<TVoiceRow>(
      `select
         discord_user_id as "discordUserId",
         channel_id as "channelId",
         joined_at as "joinedAt",
         left_at as "leftAt"
       from discord_voice_intervals
       where guild_id = $1
         and discord_user_id = $2
         and joined_at < $4
         and (left_at is null or left_at > $3)`,
      [segA.guildId, segA.ownerUserId, windowStart, windowEnd],
    );

    if (vcResult.rows.length === 0) continue;

    for (const vcA of vcResult.rows) {
      const peerVcResult = await pool.query<TVoiceRow & { discordUserId: string }>(
        `select
           discord_user_id as "discordUserId",
           channel_id as "channelId",
           joined_at as "joinedAt",
           left_at as "leftAt"
         from discord_voice_intervals
         where guild_id = $1
           and channel_id = $2
           and discord_user_id <> $3
           and joined_at < $5
           and (left_at is null or left_at > $4)`,
        [segA.guildId, vcA.channelId, segA.ownerUserId, windowStart, windowEnd],
      );

      for (const peerVc of peerVcResult.rows) {
        const peerSegResult = await pool.query<TSegmentCandidate>(
          `select
             seg.id as "segmentId",
             seg.tracked_account_id as "trackedAccountId",
             ta.owner_user_id as "ownerUserId",
             ta.guild_id as "guildId",
             ta.identity_group_id as "identityGroupId",
             seg.started_at as "startedAt",
             seg.ended_at as "endedAt",
             seg.legend_assumed as "legendAssumed",
             seg.rp_delta as "rpDelta"
           from inferred_game_segments seg
           join tracked_accounts ta on ta.id = seg.tracked_account_id
           where ta.owner_user_id = $1
             and ta.guild_id = $2
             and seg.ended_at is not null
             and seg.started_at < $4
             and seg.ended_at > $3
             and seg.rp_delta is not null
             and seg.rp_delta <> 0
             and (seg.trigger_signals->>'reason') is distinct from 'legend_change'`,
          [peerVc.discordUserId, segA.guildId, windowStart, windowEnd],
        );

        for (const segB of peerSegResult.rows) {
          const pairKey = [segA.segmentId, segB.segmentId].sort().join(":");
          if (processed.has(pairKey)) continue;
          processed.add(pairKey);

          if (segA.trackedAccountId === segB.trackedAccountId) continue;
          if (
            segA.identityGroupId &&
            segB.identityGroupId &&
            segA.identityGroupId === segB.identityGroupId
          ) continue;

          const vcOverlapSec = overlapMs(
            segA.startedAt,
            segA.endedAt,
            vcA.joinedAt,
            vcA.leftAt ?? new Date(),
          ) / 1000;
          const peerVcOverlapSec = overlapMs(
            segB.startedAt,
            segB.endedAt,
            peerVc.joinedAt,
            peerVc.leftAt ?? new Date(),
          ) / 1000;
          const minVcOverlapSec = Math.min(vcOverlapSec, peerVcOverlapSec);
          const segDurationSec = (segA.endedAt.getTime() - segA.startedAt.getTime()) / 1000;
          const vcCoverage = segDurationSec > 0 ? Math.min(1, minVcOverlapSec / segDurationSec) : 0;

          const vcScore = vcCoverage * VC_OVERLAP_WEIGHT;
          const timeAlign = scoreTimeAlignment(segA, segB);
          const timeScore = timeAlign.score * TIME_ALIGN_WEIGHT;
          const legend = scoreLegendUniqueness(segA, segB);
          const rp = scoreRpSimilarity(segA, segB);

          const totalScore = Math.max(0, vcScore + timeScore + legend.score + rp.score);

          if (totalScore < MIN_SCORE_TO_PERSIST) continue;

          const evidence = {
            vcOverlapSec: Math.round(minVcOverlapSec),
            vcCoverage: Math.round(vcCoverage * 100) / 100,
            channelId: vcA.channelId,
            startDeltaMs: timeAlign.startDeltaMs,
            durationRatio: Math.round(timeAlign.durationRatio * 100) / 100,
            legendCheck: legend.check,
            legendA: segA.legendAssumed,
            legendB: segB.legendAssumed,
            rpDeltaA: rp.deltaA,
            rpDeltaB: rp.deltaB,
            components: {
              vc: Math.round(vcScore * 1000) / 1000,
              time: Math.round(timeScore * 1000) / 1000,
              legend: legend.score,
              rp: Math.round(rp.score * 1000) / 1000,
            },
          };

          await upsertPartyEdge({
            guildId: segA.guildId,
            segmentIdA: segA.segmentId,
            segmentIdB: segB.segmentId,
            trackedAccountIdA: segA.trackedAccountId,
            trackedAccountIdB: segB.trackedAccountId,
            score: totalScore,
            evidence,
          });

          edgesCreated += 1;
          log("edge created", {
            a: segA.segmentId.slice(0, 8),
            b: segB.segmentId.slice(0, 8),
            score: totalScore,
          });
        }
      }
    }
  }

  log("correlation complete", { edgesCreated });
  return { edgesCreated };
}
