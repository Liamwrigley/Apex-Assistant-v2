import {
  getStackMatesForAccount,
  getBaselineAvgRp,
} from "@apex-assistant/db";
import { cacheRead, CacheKeys } from "@apex-assistant/cache";
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

export async function GET(request: Request, context: TParams): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid account id" }, { status: 400 });
    }
    const url = new URL(request.url);
    const rangeKey = url.searchParams.get("range") ?? "7d";
    const hours = HOUR_OPTIONS[rangeKey] ?? 168;

    const result = await cacheRead(
      CacheKeys.stackMates(id),
      async () => {
        const [stackMates, baseline] = await Promise.all([
          getStackMatesForAccount(id, hours),
          getBaselineAvgRp(id, hours),
        ]);
        return {
          rangeKey,
          baseline,
          stackMates: stackMates.map((m) => ({
            ...m,
            lastPlayedAt: m.lastPlayedAt instanceof Date
              ? m.lastPlayedAt.toISOString()
              : m.lastPlayedAt,
            vsBaseline: baseline
              ? Math.round((m.avgRpDelta - baseline.avgRpDelta) * 10) / 10
              : null,
          })),
        };
      },
    );

    return NextResponse.json(result);
  } catch (error) {
    return toApiError(error);
  }
}
