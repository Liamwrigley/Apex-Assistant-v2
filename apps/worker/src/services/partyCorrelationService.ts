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
const MAX_START_DELTA_MS = Number(process.env.PARTY_MAX_START_DELTA_MS ?? 180_000);
const VC_OVERLAP_WEIGHT = Number(process.env.PARTY_VC_WEIGHT ?? 0.5);
const TIME_ALIGN_WEIGHT = Number(process.env.PARTY_TIME_WEIGHT ?? 0.2);
const LEGEND_UNIQUE_BONUS = Number(process.env.PARTY_LEGEND_BONUS ?? 0.15);
const LEGEND_DUPLICATE_PENALTY = Number(process.env.PARTY_LEGEND_PENALTY ?? -0.2);
const RP_SIMILARITY_WEIGHT = Number(process.env.PARTY_RP_WEIGHT ?? 0.1);
const RP_SIGN_MISMATCH_PENALTY = Number(process.env.PARTY_RP_SIGN_PENALTY ?? -0.2);
const MIN_SCORE_TO_PERSIST = Number(process.env.PARTY_MIN_SCORE ?? 0.15);

// Timing-only discovery: used when VC data is unavailable.
// Finds candidate pairs purely by segment start-time proximity, then
// scores with redistributed weights (time + RP carry the VC weight).
const TIMING_MAX_START_DELTA_MS = Number(process.env.PARTY_TIMING_MAX_START_DELTA_MS ?? 90_000);
const TIMING_TIME_WEIGHT = Number(process.env.PARTY_TIMING_TIME_WEIGHT ?? 0.45);
const TIMING_RP_WEIGHT = Number(process.env.PARTY_TIMING_RP_WEIGHT ?? 0.25);
const TIMING_MIN_SCORE = Number(process.env.PARTY_TIMING_MIN_SCORE ?? 0.3);

type TSegmentCandidate = {
  segmentId: string;
  trackedAccountId: string;
  ownerUserId: string;
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
  if (!sameSign) {
    return { score: RP_SIGN_MISMATCH_PENALTY, deltaA: a.rpDelta, deltaB: b.rpDelta };
  }
  const diff = Math.abs(a.rpDelta - b.rpDelta);
  const mag = Math.max(Math.abs(a.rpDelta), Math.abs(b.rpDelta), 1);
  const similarity = Math.max(0, 1 - diff / mag);
  return { score: similarity * RP_SIMILARITY_WEIGHT, deltaA: a.rpDelta, deltaB: b.rpDelta };
}

type TScoredCandidate = {
  segA: TSegmentCandidate;
  segB: TSegmentCandidate;
  score: number;
  evidence: Record<string, unknown>;
};

/**
 * Process recently-closed segments and emit party_segment_edges.
 * Call on a schedule (e.g. every 5–10 minutes) or after each ingest cycle.
 *
 * Strategy:
 * 1. Find segments closed since `sinceMs` ago.
 * 2. For each segment, look up the owner's VC intervals in that window.
 * 3. For each VC channel, find other tracked users who were also in VC.
 * 4. For each peer, find their segments overlapping the same window.
 * 5. Score every (segA, segB) candidate pair.
 * 6. Greedy dedup: sort by score desc, claim segments so each segment
 *    maps to at most one edge per peer player. This prevents
 *    cross-game mismatches when players share a long VC session.
 * 7. Persist winning edges above threshold.
 */
export async function correlateRecentSegments(sinceMs = 30 * 60 * 1000): Promise<{ edgesCreated: number }> {
  const since = new Date(Date.now() - sinceMs);
  log("starting correlation", { sinceMs, since: since.toISOString() });

  const segResult = await pool.query<TSegmentCandidate>(
    `select
       seg.id as "segmentId",
       seg.tracked_account_id as "trackedAccountId",
       ta.owner_user_id as "ownerUserId",
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

  // Phase 1: collect all scored candidates
  const candidates: TScoredCandidate[] = [];
  const seen = new Set<string>();

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
       where discord_user_id = $1
         and joined_at < $3
         and (left_at is null or left_at > $2)`,
      [segA.ownerUserId, windowStart, windowEnd],
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
         where channel_id = $1
           and discord_user_id <> $2
           and joined_at < $4
           and (left_at is null or left_at > $3)`,
        [vcA.channelId, segA.ownerUserId, windowStart, windowEnd],
      );

      for (const peerVc of peerVcResult.rows) {
        const peerSegResult = await pool.query<TSegmentCandidate>(
          `select
             seg.id as "segmentId",
             seg.tracked_account_id as "trackedAccountId",
             ta.owner_user_id as "ownerUserId",
             ta.identity_group_id as "identityGroupId",
             seg.started_at as "startedAt",
             seg.ended_at as "endedAt",
             seg.legend_assumed as "legendAssumed",
             seg.rp_delta as "rpDelta"
           from inferred_game_segments seg
           join tracked_accounts ta on ta.id = seg.tracked_account_id
           where ta.owner_user_id = $1
             and seg.ended_at is not null
             and seg.started_at < $3
             and seg.ended_at > $2
             and seg.rp_delta is not null
             and seg.rp_delta <> 0
             and (seg.trigger_signals->>'reason') is distinct from 'legend_change'`,
          [peerVc.discordUserId, windowStart, windowEnd],
        );

        for (const segB of peerSegResult.rows) {
          const pairKey = [segA.segmentId, segB.segmentId].sort().join(":");
          if (seen.has(pairKey)) continue;
          seen.add(pairKey);

          if (segA.trackedAccountId === segB.trackedAccountId) continue;
          if (
            segA.identityGroupId &&
            segB.identityGroupId &&
            segA.identityGroupId === segB.identityGroupId
          ) continue;

          const startDeltaMs = Math.abs(segA.startedAt.getTime() - segB.startedAt.getTime());
          if (startDeltaMs > MAX_START_DELTA_MS) continue;

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

          candidates.push({
            segA,
            segB,
            score: totalScore,
            evidence: {
              discoveryMethod: "vc" as const,
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
            },
          });
        }
      }
    }
  }

  log("vc-based candidates", { count: candidates.length });

  // ── Phase 2: Timing-based candidate discovery ──────────────────────
  // For segments that had no VC data (e.g. players in an untracked
  // voice channel), discover candidate pairs purely by start-time
  // proximity and score with redistributed weights.
  for (const segA of segments) {
    const timingPeers = await pool.query<TSegmentCandidate>(
      `select
         seg.id as "segmentId",
         seg.tracked_account_id as "trackedAccountId",
         ta.owner_user_id as "ownerUserId",
         ta.identity_group_id as "identityGroupId",
         seg.started_at as "startedAt",
         seg.ended_at as "endedAt",
         seg.legend_assumed as "legendAssumed",
         seg.rp_delta as "rpDelta"
       from inferred_game_segments seg
       join tracked_accounts ta on ta.id = seg.tracked_account_id
       where seg.tracked_account_id <> $1
         and seg.started_at between $2 and $3
         and seg.ended_at is not null
         and seg.rp_delta is not null
         and seg.rp_delta <> 0
         and (seg.trigger_signals->>'reason') is distinct from 'legend_change'`,
      [
        segA.trackedAccountId,
        new Date(segA.startedAt.getTime() - TIMING_MAX_START_DELTA_MS),
        new Date(segA.startedAt.getTime() + TIMING_MAX_START_DELTA_MS),
      ],
    );

    for (const segB of timingPeers.rows) {
      const pairKey = [segA.segmentId, segB.segmentId].sort().join(":");
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      if (segA.trackedAccountId === segB.trackedAccountId) continue;
      if (
        segA.identityGroupId &&
        segB.identityGroupId &&
        segA.identityGroupId === segB.identityGroupId
      ) continue;

      const startDeltaMs = Math.abs(segA.startedAt.getTime() - segB.startedAt.getTime());
      if (startDeltaMs > TIMING_MAX_START_DELTA_MS) continue;

      const timeAlign = scoreTimeAlignment(segA, segB);
      const legend = scoreLegendUniqueness(segA, segB);
      const rpRaw = scoreRpSimilarity(segA, segB);

      const timeScore = timeAlign.score * TIMING_TIME_WEIGHT;
      // Re-scale RP: un-weight the raw score, then apply timing weight
      const rpScore = rpRaw.score >= 0
        ? (rpRaw.score / RP_SIMILARITY_WEIGHT) * TIMING_RP_WEIGHT
        : rpRaw.score;

      const totalScore = Math.max(0, timeScore + legend.score + rpScore);

      if (totalScore < TIMING_MIN_SCORE) continue;

      candidates.push({
        segA,
        segB,
        score: totalScore,
        evidence: {
          discoveryMethod: "timing" as const,
          vcOverlapSec: 0,
          vcCoverage: 0,
          channelId: null,
          startDeltaMs: timeAlign.startDeltaMs,
          durationRatio: Math.round(timeAlign.durationRatio * 100) / 100,
          legendCheck: legend.check,
          legendA: segA.legendAssumed,
          legendB: segB.legendAssumed,
          rpDeltaA: rpRaw.deltaA,
          rpDeltaB: rpRaw.deltaB,
          components: {
            vc: 0,
            time: Math.round(timeScore * 1000) / 1000,
            legend: legend.score,
            rp: Math.round(rpScore * 1000) / 1000,
          },
        },
      });
    }
  }

  log("scored candidates (vc + timing)", { count: candidates.length });

  // Phase 3: greedy dedup — highest score wins, each segment can only
  // pair with one peer segment per player pair.
  // Key: "segId:peerAccountId" → prevents a segment from matching
  // multiple of the same peer's segments.
  candidates.sort((a, b) => b.score - a.score);

  const claimed = new Set<string>();
  let edgesCreated = 0;

  for (const c of candidates) {
    const claimKeyA = `${c.segA.segmentId}:${c.segB.trackedAccountId}`;
    const claimKeyB = `${c.segB.segmentId}:${c.segA.trackedAccountId}`;

    if (claimed.has(claimKeyA) || claimed.has(claimKeyB)) {
      log("skipped (segment already claimed)", {
        a: c.segA.segmentId.slice(0, 8),
        b: c.segB.segmentId.slice(0, 8),
        score: c.score,
      });
      continue;
    }

    claimed.add(claimKeyA);
    claimed.add(claimKeyB);

    await upsertPartyEdge({
      segmentIdA: c.segA.segmentId,
      segmentIdB: c.segB.segmentId,
      trackedAccountIdA: c.segA.trackedAccountId,
      trackedAccountIdB: c.segB.trackedAccountId,
      score: c.score,
      evidence: c.evidence,
    });

    edgesCreated += 1;
    log("edge created", {
      a: c.segA.segmentId.slice(0, 8),
      b: c.segB.segmentId.slice(0, 8),
      score: c.score,
    });
  }

  log("correlation complete", { edgesCreated, candidatesScored: candidates.length });
  return { edgesCreated };
}
