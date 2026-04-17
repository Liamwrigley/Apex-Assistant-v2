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

/** Max match-grid cells returned per profile range response. 12 full rows
 *  (12 × 20 = 240) leaves ample room for the "Show more" UX without any extra
 *  round-trip to the server. */
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
    const hours = HOUR_OPTIONS[rangeKey] ?? 168;

    const account = await getTrackedAccountById(id);
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

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

    return NextResponse.json(
      {
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
      },
      {
        status: 200,
        headers: {
          // Private: keyed per-user since the profile page is personal.
          // max-age=30 lets the browser instantly serve repeat clicks on the
          // same range. SWR=120 keeps the response usable while a background
          // refresh runs, so toggles feel instant even after the fresh window.
          "Cache-Control":
            "private, max-age=30, stale-while-revalidate=120",
        },
      },
    );
  } catch (error) {
    return toApiError(error);
  }
}
