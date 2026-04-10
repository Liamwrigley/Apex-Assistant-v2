import {
  getCareerStatDeltasForTrackedAccount,
  getLegendAggregatesByAccount,
  getMapAggregatesByAccount,
  getMapLegendAggregatesByAccount,
  getRankTimelineByTrackedAccountId,
  getTrackedAccountById,
  getLatestTrackerSnapshotForLegend,
  getTrackerStatDeltasForTrackedAccount,
  hasAnyTrackerObservations,
} from "@apex-assistant/db";
import { buildTrackerRowsForProfile } from "@/lib/tracker-profile-rows";
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

    const selectedLegend = account.realtimeSelectedLegend ?? null;

    const [
      timelineRaw,
      legendAggregates,
      mapAggregates,
      mapLegendAggregates,
      careerDeltas,
      trackerSnapshot,
      trackerDeltas,
      hasTrackerObservations,
    ] = await Promise.all([
      getRankTimelineByTrackedAccountId(id, hours),
      getLegendAggregatesByAccount(id, hours),
      getMapAggregatesByAccount(id, hours),
      getMapLegendAggregatesByAccount(id, hours),
      getCareerStatDeltasForTrackedAccount(id, hours),
      getLatestTrackerSnapshotForLegend(id, selectedLegend ?? ""),
      getTrackerStatDeltasForTrackedAccount(id, hours),
      hasAnyTrackerObservations(id),
    ]);

    const trackerRows = buildTrackerRowsForProfile(trackerSnapshot, trackerDeltas, selectedLegend);

    return NextResponse.json({
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
      selectedLegend,
      hasTrackerObservations,
      legacyApiSummary: {
        kills: account.careerKills,
        damage: account.careerDamage,
        wins: account.careerWins,
      },
    });
  } catch (error) {
    return toApiError(error);
  }
}
