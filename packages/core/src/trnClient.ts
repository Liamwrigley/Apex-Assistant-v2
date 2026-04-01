import { withRetry } from "./retry.js";
import { AppError, type TPlatform } from "./types.js";

export type TTrnRank = {
  rankScore: number;
  rankName: string;
  rankDivision: string | null;
  iconUrl: string | null;
};

export type TTrnSearchCandidate = {
  platform: TPlatform;
  handle: string;
  displayName: string;
  externalPlayerId?: string | null;
};

function codeToPlatform(code: unknown): TPlatform | null {
  const normalized = String(code ?? "");
  if (normalized === "1" || normalized === "xbl") {
    return "xbl";
  }
  if (normalized === "2" || normalized === "psn") {
    return "psn";
  }
  if (normalized === "5" || normalized === "origin" || normalized === "pc") {
    return "origin";
  }
  return null;
}

function getApiKey(): string {
  const apiKey = process.env.TRN_API_KEY;
  if (!apiKey) {
    throw new AppError("TRN_API_KEY is not configured.", 500, "CONFIG_ERROR");
  }
  return apiKey;
}

export async function fetchTrnRank(input: {
  ign: string;
  platform: TPlatform;
}): Promise<TTrnRank> {
  const apiKey = getApiKey();
  const endpoint = process.env.TRN_BASE_URL
    ? `${process.env.TRN_BASE_URL}/${input.platform}/${encodeURIComponent(input.ign)}`
    : `https://public-api.tracker.gg/v2/apex/standard/profile/${input.platform}/${encodeURIComponent(input.ign)}`;

  return withRetry(async () => {
    const response = await fetch(endpoint, {
      headers: { "TRN-Api-Key": apiKey },
    });
    if (!response.ok) {
      throw new AppError(
        `TRN request failed with ${response.status}.`,
        response.status,
        "TRN_ERROR",
      );
    }

    const payload = (await response.json()) as {
      data?: {
        segments?: Array<{
          stats?: {
            rankScore?: {
              value?: number;
              metadata?: {
                rankName?: string;
                iconUrl?: string;
                rankDivision?: string;
              };
            };
          };
        }>;
      };
    };

    const rankScore = payload.data?.segments?.[0]?.stats?.rankScore?.value;
    const rankName =
      payload.data?.segments?.[0]?.stats?.rankScore?.metadata?.rankName;
    const iconUrl =
      payload.data?.segments?.[0]?.stats?.rankScore?.metadata?.iconUrl;
    const rankDivision =
      payload.data?.segments?.[0]?.stats?.rankScore?.metadata?.rankDivision;

    if (typeof rankScore !== "number" || !rankName) {
      throw new AppError(
        "TRN payload is missing rank metadata.",
        502,
        "TRN_PARSE_ERROR",
      );
    }

    return {
      rankScore,
      rankName,
      rankDivision: rankDivision ?? null,
      iconUrl: iconUrl ?? null,
    };
  });
}

export async function searchTrnPlayers(input: {
  query: string;
  platform?: TPlatform;
}): Promise<TTrnSearchCandidate[]> {
  const apiKey = getApiKey();
  const query = input.query.trim();
  if (!query) {
    return [];
  }

  const searchBase =
    process.env.TRN_SEARCH_BASE_URL ?? "https://public-api.tracker.gg";
  const endpoints = [
    `${searchBase}/v2/apex/standard/search?query=${encodeURIComponent(query)}`,
    `${searchBase}/apex/v1/standard/search?query=${encodeURIComponent(query)}`,
  ];

  const results: TTrnSearchCandidate[] = [];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers: { "TRN-Api-Key": apiKey },
      });
      if (response.status === 401 || response.status === 403) {
        throw new AppError(
          "TRN authentication failed. Verify TRN_API_KEY.",
          401,
          "TRN_AUTH_ERROR",
        );
      }
      if (!response.ok) {
        continue;
      }
      const payload = (await response.json()) as {
        data?: Array<Record<string, unknown>>;
        results?: Array<Record<string, unknown>>;
      };
      const entries = payload.data ?? payload.results ?? [];
      for (const entry of entries) {
        const metadata =
          typeof entry.metadata === "object" && entry.metadata !== null
            ? (entry.metadata as Record<string, unknown>)
            : undefined;
        const platform = codeToPlatform(
          entry.platform ??
            entry.platformId ??
            entry.platformSlug ??
            metadata?.platform,
        );
        const handle = String(
          entry.value ??
            entry.handle ??
            entry.name ??
            entry.platformUserHandle ??
            "",
        ).trim();
        const displayName = String(
          entry.displayValue ??
            entry.displayName ??
            entry.platformUserIdentifier ??
            handle,
        ).trim();
        if (!platform || !handle) {
          continue;
        }
        if (input.platform && input.platform !== platform) {
          continue;
        }
        results.push({ platform, handle, displayName: displayName || handle });
      }
      if (results.length > 0) {
        break;
      }
    } catch {
      // Continue with endpoint fallbacks.
    }
  }

  if (results.length > 0) {
    return results.slice(0, 10);
  }

  const platforms: TPlatform[] = input.platform
    ? [input.platform]
    : ["origin", "psn", "xbl"];
  const fallback: TTrnSearchCandidate[] = [];
  for (const platform of platforms) {
    try {
      await fetchTrnRank({ ign: query, platform });
      fallback.push({ platform, handle: query, displayName: query });
    } catch {
      // Probe next platform.
    }
  }
  return fallback;
}
