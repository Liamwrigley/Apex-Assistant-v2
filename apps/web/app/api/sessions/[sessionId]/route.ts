import { getCompletedSessionById, getSegmentsBySessionIds } from "@apex-assistant/db";
import { NextResponse } from "next/server";
import { debugLog } from "@/app/api/_lib/log";
import { toApiError } from "@/app/api/_lib/responses";
import {
  buildGranularSnapshotsByAccount,
  buildTrackerObsByAccount,
  mapSessionsToRecentSessionRows,
} from "@/lib/recent-session-rows";

type TParams = {
  params: Promise<{ sessionId: string }>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Full detail row (sparkline + tracker deltas) for one completed session. */
export async function GET(_request: Request, context: TParams): Promise<NextResponse> {
  try {
    const { sessionId } = await context.params;
    if (!UUID_RE.test(sessionId)) {
      return NextResponse.json({ error: "Invalid session id", code: "BAD_REQUEST" }, { status: 400 });
    }

    const session = await getCompletedSessionById(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const [segmentsBySession, granularSnapshotsByAccount] = await Promise.all([
      getSegmentsBySessionIds([sessionId]),
      buildGranularSnapshotsByAccount([session]),
    ]);
    const trackerObsByAccount = await buildTrackerObsByAccount(segmentsBySession);
    const [row] = mapSessionsToRecentSessionRows(
      [session],
      segmentsBySession,
      granularSnapshotsByAccount,
      trackerObsByAccount,
    );

    debugLog("session-detail", "loaded", {
      sessionId,
      points: row.rankSparklinePoints.length,
      games: row.estimatedGames?.length ?? 0,
    });
    return NextResponse.json(row, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
    });
  } catch (error) {
    debugLog("session-detail", "error", { message: error instanceof Error ? error.message : "Unknown error" });
    return toApiError(error);
  }
}
