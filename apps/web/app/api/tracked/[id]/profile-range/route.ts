import {
  getCareerStatDeltasForTrackedAccount,
  getLegendAggregatesByAccount,
  getMapAggregatesByAccount,
  getMapLegendAggregatesByAccount,
  getRankTimelineByTrackedAccountId,
  getRecentGamesByTrackedAccountIds,
  getTrackedAccountById,
  getLatestTrackerSnapshotForLegend,
  getTrackerStatDeltasForTrackedAccount,
  hasAnyTrackerObservations,
  getStackCompositions,
  getBaselineAvgRp,
  getBestStackByMap,
} from "@apex-assistant/db";
import { cacheRead, CacheKeys } from "@apex-assistant/cache";

const RECENT_MATCH_GAMES_LIMIT = 240;
import { buildTrackerRowsForProfile } from "@/lib/tracker-profile-rows";
import { getLegendIconUrl } from "@/lib/legend-icon-url";
import { resolveProfileDisplayLegendName } from "@/lib/profile-display-legend";
import { evaluateRealtimePresence } from "@/lib/realtime-presence";
import { NextResponse } from "next/server";
import { toApiError } from "@/app/api/_lib/responses";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HOUR_OPTIONS: Record<string, number> = {
  "24h": 24,
  "3d": 72,
  "7d": 168,
  "14d": 336,
  "30d": 720,
};

type TParams = { params: Promise<{ id: string }> };

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

export async function GET(request: Request, context: TParams): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid account id" }, { status: 400 });
    }
    const url = new URL(request.url);
    const rangeKey = url.searchParams.get("range") ?? "7d";
    if (!(rangeKey in HOUR_OPTIONS)) {
      return NextResponse.json({ error: "Invalid range" }, { status: 400 });
    }

    const payload = await cacheRead(
      CacheKeys.profileRange(id, rangeKey),
      () => computeProfileRange(id, rangeKey),
    );

    if (!payload) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json(payload);
  } catch (error) {
    return toApiError(error);
  }
}

async function computeProfileRange(id: string, rangeKey: string) {
  const hours = HOUR_OPTIONS[rangeKey] ?? 168;

  const account = await getTrackedAccountById(id);
  if (!account) return null;

  const lastSeenLegendIconUrl = account.realtimeSelectedLegend
    ? getLegendIconUrl(account.realtimeSelectedLegend)
    : null;
  const presenceEval = evaluateRealtimePresence({
    realtimeUpdatedAt: account.realtimeUpdatedAt ? toIso(account.realtimeUpdatedAt) : null,
    realtimeIsOnline: account.realtimeIsOnline,
    realtimeIsInGame: account.realtimeIsInGame,
    realtimeCurrentState: account.realtimeCurrentState,
    realtimeCurrentStateAsText: account.realtimeCurrentStateAsText,
  });

  const [
    timelineRaw,
    legendAggregates,
    mapAggregates,
    mapLegendAggregates,
    careerDeltas,
    trackerDeltas,
    hasTrackerObservations,
    stackCompositions,
    baselineAvgRp,
    bestStackByMap,
    recentGamesByAccount,
  ] = await Promise.all([
    getRankTimelineByTrackedAccountId(id, hours),
    getLegendAggregatesByAccount(id, hours),
    getMapAggregatesByAccount(id, hours),
    getMapLegendAggregatesByAccount(id, hours),
    getCareerStatDeltasForTrackedAccount(id, hours),
    getTrackerStatDeltasForTrackedAccount(id, hours),
    hasAnyTrackerObservations(id),
    getStackCompositions(id, hours),
    getBaselineAvgRp(id, hours),
    getBestStackByMap(id, hours),
    getRecentGamesByTrackedAccountIds([id], RECENT_MATCH_GAMES_LIMIT),
  ]);

  const recentMatchGames = (recentGamesByAccount[id] ?? []).map((cell) => ({
    ...cell,
    startedAt: toIso(cell.startedAt),
    endedAt: toIso(cell.endedAt),
  }));

  const displayLegend = resolveProfileDisplayLegendName({
    isOnline: presenceEval.shouldShow,
    lastSeenLegendIconUrl,
    realtimeSelectedLegend: account.realtimeSelectedLegend,
    legendAggregates,
  });

  const trackerSnapshot = await getLatestTrackerSnapshotForLegend(id, displayLegend ?? "");
  const trackerRows = buildTrackerRowsForProfile(trackerSnapshot, trackerDeltas, displayLegend);

  return {
    rangeKey,
    timelinePoints: timelineRaw.map((p) => ({
      capturedAt: toIso(p.capturedAt),
      rankScore: p.rankScore,
    })),
    legendAggregates,
    mapAggregates,
    mapLegendAggregates,
    careerDeltas,
    trackerRows,
    selectedLegend: displayLegend,
    hasTrackerObservations,
    legacyApiSummary: {
      kills: account.careerKills,
      damage: account.careerDamage,
      wins: account.careerWins,
    },
    stackCompositions,
    baselineAvgRp,
    bestStackByMap,
    recentMatchGames,
  };
}
