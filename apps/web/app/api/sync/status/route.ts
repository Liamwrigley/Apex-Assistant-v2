import { getLatestTrackedSyncAt } from "@apex-assistant/db";
import { NextResponse } from "next/server";
import { debugLog } from "@/app/api/_lib/log";
import { toApiError } from "@/app/api/_lib/responses";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const guildId = url.searchParams.get("guildId");

    debugLog("sync-status", "request", { guildId: guildId ?? null });
    const latestSyncAt = await getLatestTrackedSyncAt(guildId ?? undefined);
    const pollMinutes = Number(process.env.INGEST_POLL_MINUTES ?? 15);
    const nextSyncAt = latestSyncAt ? new Date(latestSyncAt.getTime() + pollMinutes * 60_000).toISOString() : null;
    const latest = latestSyncAt
      ? {
          provider: "tracked_accounts",
          runType: "sync",
          startedAt: latestSyncAt,
          finishedAt: latestSyncAt,
          success: true,
          processedItems: 0,
          errorMessage: null
        }
      : null;

    debugLog("sync-status", "status loaded", { guildId, hasLatest: Boolean(latestSyncAt), nextSyncAt });
    return NextResponse.json({
      pollMinutes,
      nextSyncAt,
      latest
    });
  } catch (error) {
    debugLog("sync-status", "error", { message: error instanceof Error ? error.message : "Unknown error" });
    return toApiError(error);
  }
}
