import { AppError, withRetry } from "@apex-assistant/core";

export type TProviderMatch = {
  id: string;
  playedAt: string;
  mode: string | null;
  placement: number | null;
  kills: number | null;
  assists: number | null;
  knocks: number | null;
  damage: number | null;
  survivalTimeSec: number | null;
  rawPayload: Record<string, unknown>;
};

function toNullableNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function fetchRecentMatches(input: {
  ign: string;
  platform: string;
}): Promise<TProviderMatch[]> {
  const baseUrl = process.env.MATCH_API_BASE_URL;
  const apiKey = process.env.MATCH_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new AppError("Match provider config is missing.", 500, "CONFIG_ERROR");
  }

  const endpoint = `${baseUrl}/matches?platform=${encodeURIComponent(input.platform)}&player=${encodeURIComponent(
    input.ign
  )}`;

  return withRetry(async () => {
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      throw new AppError(
        `Match provider request failed with ${response.status}.`,
        response.status,
        "MATCH_PROVIDER_ERROR"
      );
    }

    const payload = (await response.json()) as {
      matches?: Array<Record<string, unknown>>;
    };

    return (payload.matches ?? []).map((entry) => ({
      id: String(entry.id ?? entry.matchId ?? crypto.randomUUID()),
      playedAt: String(entry.playedAt ?? entry.timestamp ?? new Date().toISOString()),
      mode: (entry.mode as string | undefined) ?? null,
      placement: toNullableNumber(entry.placement),
      kills: toNullableNumber(entry.kills),
      assists: toNullableNumber(entry.assists),
      knocks: toNullableNumber(entry.knocks),
      damage: toNullableNumber(entry.damage),
      survivalTimeSec: toNullableNumber(entry.survivalTimeSec),
      rawPayload: entry
    }));
  });
}
