import { getStackCompositionBreakdown } from "@apex-assistant/db";
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
    const teammatesParam = url.searchParams.get("teammates");
    if (!teammatesParam) {
      return NextResponse.json({ error: "Missing teammates parameter" }, { status: 400 });
    }

    const teammateIds = teammatesParam.split(",");
    if (teammateIds.length === 0 || teammateIds.some((t) => !UUID_RE.test(t))) {
      return NextResponse.json({ error: "Invalid teammate ids" }, { status: 400 });
    }

    const rangeKey = url.searchParams.get("range") ?? "7d";
    const hours = HOUR_OPTIONS[rangeKey] ?? 168;

    const breakdown = await getStackCompositionBreakdown(id, teammateIds, hours);

    return NextResponse.json({ breakdown });
  } catch (error) {
    return toApiError(error);
  }
}
