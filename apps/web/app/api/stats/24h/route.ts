import { getRankMovers24h } from "@apex-assistant/db";
import { NextResponse } from "next/server";
import { debugLog } from "@/app/api/_lib/log";
import { toApiError } from "@/app/api/_lib/responses";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const guildId = url.searchParams.get("guildId");
    debugLog("stats-24h", "request", { guildId: guildId ?? null });
    const movers = await getRankMovers24h(guildId ?? undefined);
    debugLog("stats-24h", "computed", {
      highestGainer: movers.highestGainer?.ign ?? null,
      biggestLoser: movers.biggestLoser?.ign ?? null
    });
    return NextResponse.json(movers);
  } catch (error) {
    debugLog("stats-24h", "error", { message: error instanceof Error ? error.message : "Unknown error" });
    return toApiError(error);
  }
}
