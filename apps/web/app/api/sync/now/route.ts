import { AppError } from "@apex-assistant/core";
import { NextResponse } from "next/server";
import { debugLog } from "@/app/api/_lib/log";
import { toApiError } from "@/app/api/_lib/responses";
import { getWorkerBaseUrl } from "@/lib/service-base-urls";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { guildId?: string };
    const guildId = body.guildId?.trim();
    if (!guildId) {
      throw new AppError("Missing guildId in request body.", 400, "BAD_REQUEST");
    }

    debugLog("sync-now", "request", { guildId });
    const workerBaseUrl = getWorkerBaseUrl();
    const secret = process.env.APP_SHARED_SECRET;
    const response = await fetch(`${workerBaseUrl}/ingest/${encodeURIComponent(guildId)}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { "x-app-secret": secret } : {})
      }
    });

    if (!response.ok) {
      const bodyText = await response.text();
      debugLog("sync-now", "worker error response", { status: response.status, body: bodyText.slice(0, 180) });
      throw new AppError(
        `Worker ingest failed with ${response.status}: ${bodyText.slice(0, 180)}`,
        response.status,
        "INGEST_TRIGGER_FAILED"
      );
    }

    const result = (await response.json()) as { processed?: number };
    debugLog("sync-now", "worker success", { guildId, processed: result.processed ?? 0 });
    return NextResponse.json({ ok: true, processed: result.processed ?? 0 });
  } catch (error) {
    debugLog("sync-now", "error", { message: error instanceof Error ? error.message : "Unknown error" });
    return toApiError(error);
  }
}
