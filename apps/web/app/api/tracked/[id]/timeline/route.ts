import { getRankTimelineByTrackedAccountId } from "@apex-assistant/db";
import { cacheRead, CacheKeys } from "@apex-assistant/cache";
import { NextResponse } from "next/server";
import { debugLog } from "@/app/api/_lib/log";
import { toApiError } from "@/app/api/_lib/responses";

type TParams = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: TParams): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const url = new URL(request.url);
    const hoursParam = Number(url.searchParams.get("hours") ?? "24");

    const points = await cacheRead(
      CacheKeys.playerTimeline(id, hoursParam),
      () => getRankTimelineByTrackedAccountId(id, hoursParam),
    );

    debugLog("tracked-timeline", "loaded", { id, hours: hoursParam, count: points.length });
    return NextResponse.json(points);
  } catch (error) {
    debugLog("tracked-timeline", "error", { message: error instanceof Error ? error.message : "Unknown error" });
    return toApiError(error);
  }
}
