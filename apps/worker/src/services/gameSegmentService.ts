import type { TDerivedPresenceStatus } from "@apex-assistant/core";
import {
  getOpenSegment,
  openSegment,
  closeSegment,
  closeAllOpenSegmentsForAccount,
  getOpenSessionId
} from "@apex-assistant/db";
import { getRankedMap } from "./mapRotationService.js";

const MERGE_RISK_THRESHOLD_SEC = Math.max(
  300,
  Number(process.env.SEGMENT_MERGE_RISK_THRESHOLD_SEC ?? 1800)
);

const DURATION_PLAUSIBLE_MIN_SEC = 90;
const DURATION_PLAUSIBLE_MAX_SEC = 25 * 60;

/** Compare legends case-insensitively and ignore outer whitespace to avoid spurious segment splits. */
function normalizeLegendForCompare(legend: string | null): string | null {
  if (legend == null) return null;
  const t = legend.trim();
  return t.length === 0 ? null : t.toLowerCase();
}

type TSyncInput = {
  trackedAccountId: string;
  nextPresenceStatus: TDerivedPresenceStatus;
  nextActive: boolean;
  rankScore: number;
  selectedLegend: string | null;
  rankName: string | null;
  rankDivision: string | null;
  careerKills: number | null;
  careerDamage: number | null;
  careerWins: number | null;
};

function computeConfidence(params: {
  rpConfirmed: boolean;
  rpDelta: number | null;
  legendChanged: boolean;
  durationSec: number;
  mergeRisk: boolean;
}): string {
  if (params.mergeRisk) return "medium";

  if (params.rpConfirmed && params.rpDelta !== null && params.rpDelta !== 0) {
    const durationPlausible =
      params.durationSec >= DURATION_PLAUSIBLE_MIN_SEC &&
      params.durationSec <= DURATION_PLAUSIBLE_MAX_SEC;
    return durationPlausible ? "high" : "high";
  }

  if (params.legendChanged) return "medium";

  return "low";
}

/**
 * Per-poll segment lifecycle. Must run AFTER syncPlaySessionIngest
 * so that an open play_session exists when needed.
 *
 * State machine:
 *  - No open segment + player in_game → open segment
 *  - Open segment + legend changed → close old, open new
 *  - Open segment + RP changed (confirmed next poll) → close segment
 *  - Player went offline/out-of-game → close any open segment
 */
export async function syncGameSegment(input: TSyncInput): Promise<void> {
  const { trackedAccountId, nextPresenceStatus, nextActive, rankScore, selectedLegend, rankName, rankDivision, careerKills, careerDamage, careerWins } = input;
  const isInGame = nextPresenceStatus === "in_game";

  const openSeg = await getOpenSegment(trackedAccountId);
  const mapInfo = await getRankedMap();

  if (!nextActive || !isInGame) {
    if (openSeg) {
      const durationSec = (Date.now() - new Date(openSeg.startedAt).getTime()) / 1000;
      const rpDelta =
        openSeg.openingRankScore !== null ? rankScore - openSeg.openingRankScore : null;
      const mergeRisk = durationSec > MERGE_RISK_THRESHOLD_SEC;

      await closeSegment({
        segmentId: openSeg.id,
        closingRankScore: rankScore,
        rpDelta,
        confidence: computeConfidence({
          rpConfirmed: rpDelta !== null && rpDelta !== 0,
          rpDelta,
          legendChanged: false,
          durationSec,
          mergeRisk
        }),
        mergeRisk,
        triggerSignals: {
          reason: "session_end",
          rp_delta: rpDelta,
          duration_sec: Math.round(durationSec),
          player_went_offline: !nextActive,
          player_left_game: nextActive && !isInGame
        },
        closingRankName: rankName,
        closingRankDivision: rankDivision,
        rankedMapCode: mapInfo?.mapCode ?? null,
        rankedMapName: mapInfo?.mapName ?? null,
        closingCareerKills: careerKills,
        closingCareerDamage: careerDamage,
        closingCareerWins: careerWins
      });
    }
    return;
  }

  if (!openSeg) {
    const sessionId = await getOpenSessionId(trackedAccountId);
    if (!sessionId) return;

    await openSegment({
      playSessionId: sessionId,
      trackedAccountId,
      legendAssumed: selectedLegend,
      openingRankScore: rankScore,
      openingRankName: rankName,
      openingRankDivision: rankDivision,
      rankedMapCode: mapInfo?.mapCode ?? null,
      rankedMapName: mapInfo?.mapName ?? null,
      openingCareerKills: careerKills,
      openingCareerDamage: careerDamage,
      openingCareerWins: careerWins
    });
    return;
  }

  const normSelected = normalizeLegendForCompare(selectedLegend);
  const normOpen = normalizeLegendForCompare(openSeg.legendAssumed);
  const legendChanged =
    normSelected !== null && normOpen !== null && normSelected !== normOpen;

  const rpChanged =
    openSeg.openingRankScore !== null && rankScore !== openSeg.openingRankScore;

  if (legendChanged) {
    const durationSec = (Date.now() - new Date(openSeg.startedAt).getTime()) / 1000;
    const rpDelta =
      openSeg.openingRankScore !== null ? rankScore - openSeg.openingRankScore : null;
    const mergeRisk = durationSec > MERGE_RISK_THRESHOLD_SEC;

    await closeSegment({
      segmentId: openSeg.id,
      closingRankScore: rankScore,
      rpDelta,
      confidence: computeConfidence({
        rpConfirmed: rpDelta !== null && rpDelta !== 0,
        rpDelta,
        legendChanged: true,
        durationSec,
        mergeRisk
      }),
      mergeRisk,
      triggerSignals: {
        reason: "legend_change",
        old_legend: openSeg.legendAssumed,
        new_legend: selectedLegend,
        rp_delta: rpDelta,
        duration_sec: Math.round(durationSec)
      },
      closingRankName: rankName,
      closingRankDivision: rankDivision,
      rankedMapCode: mapInfo?.mapCode ?? null,
      rankedMapName: mapInfo?.mapName ?? null,
      closingCareerKills: careerKills,
      closingCareerDamage: careerDamage,
      closingCareerWins: careerWins
    });

    const sessionId = await getOpenSessionId(trackedAccountId);
    if (sessionId) {
      await openSegment({
        playSessionId: sessionId,
        trackedAccountId,
        legendAssumed: selectedLegend,
        openingRankScore: rankScore,
        openingRankName: rankName,
        openingRankDivision: rankDivision,
        rankedMapCode: mapInfo?.mapCode ?? null,
        rankedMapName: mapInfo?.mapName ?? null,
        openingCareerKills: careerKills,
        openingCareerDamage: careerDamage,
        openingCareerWins: careerWins
      });
    }
    return;
  }

  if (rpChanged) {
    const durationSec = (Date.now() - new Date(openSeg.startedAt).getTime()) / 1000;
    const rpDelta = rankScore - (openSeg.openingRankScore ?? 0);
    const mergeRisk = durationSec > MERGE_RISK_THRESHOLD_SEC;

    await closeSegment({
      segmentId: openSeg.id,
      closingRankScore: rankScore,
      rpDelta,
      confidence: computeConfidence({
        rpConfirmed: true,
        rpDelta,
        legendChanged: false,
        durationSec,
        mergeRisk
      }),
      mergeRisk,
      triggerSignals: {
        reason: "rp_change",
        rp_delta: rpDelta,
        opening_rp: openSeg.openingRankScore,
        closing_rp: rankScore,
        duration_sec: Math.round(durationSec),
        confirmed: true
      },
      closingRankName: rankName,
      closingRankDivision: rankDivision,
      rankedMapCode: mapInfo?.mapCode ?? null,
      rankedMapName: mapInfo?.mapName ?? null,
      closingCareerKills: careerKills,
      closingCareerDamage: careerDamage,
      closingCareerWins: careerWins
    });

    const sessionId = await getOpenSessionId(trackedAccountId);
    if (sessionId) {
      await openSegment({
        playSessionId: sessionId,
        trackedAccountId,
        legendAssumed: selectedLegend,
        openingRankScore: rankScore,
        openingRankName: rankName,
        openingRankDivision: rankDivision,
        rankedMapCode: mapInfo?.mapCode ?? null,
        rankedMapName: mapInfo?.mapName ?? null,
        openingCareerKills: careerKills,
        openingCareerDamage: careerDamage,
        openingCareerWins: careerWins
      });
    }
  }
}
