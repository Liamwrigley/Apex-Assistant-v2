import { listTrackedAccounts } from "@apex-assistant/db";
import { NextResponse } from "next/server";
import { debugLog } from "@/app/api/_lib/log";
import { toApiError } from "@/app/api/_lib/responses";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const guildId = url.searchParams.get("guildId");
    debugLog("tracked", "request", { guildId: guildId ?? null });
    const tracked = await listTrackedAccounts(guildId ?? undefined);
    debugLog("tracked", "rows loaded", { guildId, count: tracked.length });
    return NextResponse.json(tracked, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
    });
  } catch (error) {
    debugLog("tracked", "error", { message: error instanceof Error ? error.message : "Unknown error" });
    return toApiError(error);
  }
}
