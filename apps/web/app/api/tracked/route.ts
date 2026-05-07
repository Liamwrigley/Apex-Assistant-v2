import { listTrackedAccounts } from "@apex-assistant/db";
import { cacheRead, CacheKeys } from "@apex-assistant/cache";
import { NextResponse } from "next/server";
import { debugLog } from "@/app/api/_lib/log";
import { toApiError } from "@/app/api/_lib/responses";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const guildId = url.searchParams.get("guildId");
    debugLog("tracked", "request", { guildId: guildId ?? null });

    const tracked = await cacheRead(
      CacheKeys.tracked(guildId ?? undefined),
      () => listTrackedAccounts(guildId ?? undefined),
    );

    debugLog("tracked", "rows loaded", { guildId, count: tracked.length });
    return NextResponse.json(tracked);
  } catch (error) {
    debugLog("tracked", "error", { message: error instanceof Error ? error.message : "Unknown error" });
    return toApiError(error);
  }
}
