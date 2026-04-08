import {
  getCareerStatDeltasForTrackedAccount,
  getLegendAggregatesByAccount,
  getMapAggregatesByAccount,
  getMapLegendAggregatesByAccount,
  getRankTimelineByTrackedAccountId,
} from "@apex-assistant/db";
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

    const [timelineRaw, legendAggregates, mapAggregates, mapLegendAggregates, careerDeltas] = await Promise.all([
      getRankTimelineByTrackedAccountId(id, hours),
      getLegendAggregatesByAccount(id, hours),
      getMapAggregatesByAccount(id, hours),
      getMapLegendAggregatesByAccount(id, hours),
      getCareerStatDeltasForTrackedAccount(id, hours),
    ]);

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
    });
  } catch (error) {
    return toApiError(error);
  }
}
