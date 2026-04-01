import { AppError, type TPlatform } from "./types.js";
import { fetchTrnRank, searchTrnPlayers, type TTrnSearchCandidate } from "./trnClient.js";

export type TStatsProviderName = "trn" | "apexlegendsapi";

export type TStatsRank = {
  rankScore: number;
  rankName: string;
  rankDivision: string | null;
  iconUrl: string | null;
  externalPlayerId?: string | null;
  playerName?: string | null;
  currentLevel?: number | null;
  careerKills?: number | null;
  careerDamage?: number | null;
  careerWins?: number | null;
  realtime?: {
    lobbyState?: string | null;
    isOnline?: number | null;
    isInGame?: number | null;
    canJoin?: number | null;
    partyFull?: number | null;
    selectedLegend?: string | null;
    currentState?: string | null;
    currentStateSinceTimestamp?: number | null;
    currentStateAsText?: string | null;
  };
};

export type TStatsSearchCandidate = TTrnSearchCandidate;

export type IStatsProvider = {
  readonly name: TStatsProviderName;
  getRank(input: { ign: string; platform: TPlatform; externalPlayerId?: string | null }): Promise<TStatsRank>;
  searchPlayers(input: { query: string; platform?: TPlatform }): Promise<TStatsSearchCandidate[]>;
};

export type TStatsSearchCandidateExt = TStatsSearchCandidate & {
  externalPlayerId?: string | null;
};

const APEX_RATE_LIMIT_PER_SECOND = 2;
const APEX_RATE_WINDOW_MS = 1000;
const APEX_RATE_BUFFER_MS = 50;
let apexRateGate: Promise<void> = Promise.resolve();
const apexRequestTimestamps: number[] = [];

function parseCurrentRateHeader(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : null;
}

async function waitForApexRateSlot(): Promise<void> {
  const now = Date.now();
  while (apexRequestTimestamps.length > 0 && now - apexRequestTimestamps[0] >= APEX_RATE_WINDOW_MS) {
    apexRequestTimestamps.shift();
  }

  if (apexRequestTimestamps.length < APEX_RATE_LIMIT_PER_SECOND) {
    apexRequestTimestamps.push(now);
    return;
  }

  const waitMs = APEX_RATE_WINDOW_MS - (now - apexRequestTimestamps[0]) + APEX_RATE_BUFFER_MS;
  await new Promise((resolve) => setTimeout(resolve, Math.max(waitMs, APEX_RATE_BUFFER_MS)));
  await waitForApexRateSlot();
}

async function withApexRateLimit<T>(task: () => Promise<T>): Promise<T> {
  const run = apexRateGate.then(async () => {
    await waitForApexRateSlot();
    return task();
  });
  apexRateGate = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function mapPlatformToApexApi(platform: TPlatform): "PC" | "PS4" | "X1" {
  if (platform === "psn") {
    return "PS4";
  }
  if (platform === "xbl") {
    return "X1";
  }
  return "PC";
}

function getApexApiConfig(): { baseUrl: string; key: string } {
  const key = process.env.APEXLEGENDSAPI_KEY;
  if (!key) {
    throw new AppError("APEXLEGENDSAPI_KEY is not configured.", 500, "CONFIG_ERROR");
  }
  return {
    baseUrl: process.env.APEXLEGENDSAPI_BASE_URL ?? "https://api.mozambiquehe.re",
    key
  };
}

async function fetchApexLegendsApiProfile(input: {
  ign: string;
  platform: TPlatform;
  externalPlayerId?: string | null;
}): Promise<{
  rank: TStatsRank;
  externalPlayerId: string | null;
}> {
  const config = getApexApiConfig();
  const userQuery = input.externalPlayerId
    ? `&uid=${encodeURIComponent(input.externalPlayerId)}`
    : `&player=${encodeURIComponent(input.ign)}`;
  const endpoint =
    `${config.baseUrl}/bridge?version=5` +
    `&platform=${encodeURIComponent(mapPlatformToApexApi(input.platform))}` +
    userQuery +
    `&auth=${encodeURIComponent(config.key)}`;

  const response = await withApexRateLimit(async () => fetch(endpoint));
  if (!response.ok) {
    throw new AppError(
      `ApexLegendsAPI request failed with ${response.status}.`,
      response.status,
      "APEX_API_ERROR"
    );
  }

  const currentRate = parseCurrentRateHeader(response.headers.get("X-Current-Rate"));
  if (currentRate !== null && currentRate >= APEX_RATE_LIMIT_PER_SECOND) {
    await new Promise((resolve) => setTimeout(resolve, APEX_RATE_WINDOW_MS));
  }

  const payload = (await response.json()) as {
    Error?: string;
    global?: {
      name?: string;
      uid?: string | number;
      level?: number;
      rank?: {
        rankScore?: number;
        rankName?: string;
        rankDiv?: number | string;
        rankImg?: string;
      };
    };
    total?: {
      career_kills?: { value?: number } | number;
      damage?: { value?: number } | number;
      career_wins?: { value?: number } | number;
    };
    realtime?: {
      lobbyState?: string;
      isOnline?: number;
      isInGame?: number;
      canJoin?: number;
      partyFull?: number;
      selectedLegend?: string;
      currentState?: string;
      currentStateSinceTimestamp?: number;
      currentStateAsText?: string;
    };
  };

  if (payload.Error) {
    throw new AppError(payload.Error, 400, "APEX_API_ERROR");
  }

  const rank = payload.global?.rank;
  if (!rank || typeof rank.rankScore !== "number" || !rank.rankName) {
    throw new AppError("ApexLegendsAPI payload missing rank metadata.", 502, "APEX_API_PARSE_ERROR");
  }

  const externalPlayerId =
    payload.global?.uid !== undefined && payload.global?.uid !== null
      ? String(payload.global.uid)
      : null;
  const toTotalNumber = (value: { value?: number } | number | undefined): number | null => {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    if (value && typeof value.value === "number" && Number.isFinite(value.value)) {
      return value.value;
    }
    return null;
  };
  return {
    rank: {
      rankScore: rank.rankScore,
      rankName: rank.rankName,
      rankDivision: rank.rankDiv !== undefined ? String(rank.rankDiv) : null,
      iconUrl: rank.rankImg ?? null,
      externalPlayerId,
      playerName: payload.global?.name ?? null,
      currentLevel: typeof payload.global?.level === "number" ? payload.global.level : null,
      careerKills: toTotalNumber(payload.total?.career_kills),
      careerDamage: toTotalNumber(payload.total?.damage),
      careerWins: toTotalNumber(payload.total?.career_wins),
      realtime: {
        lobbyState: payload.realtime?.lobbyState ?? null,
        isOnline: typeof payload.realtime?.isOnline === "number" ? payload.realtime.isOnline : null,
        isInGame: typeof payload.realtime?.isInGame === "number" ? payload.realtime.isInGame : null,
        canJoin: typeof payload.realtime?.canJoin === "number" ? payload.realtime.canJoin : null,
        partyFull: typeof payload.realtime?.partyFull === "number" ? payload.realtime.partyFull : null,
        selectedLegend: payload.realtime?.selectedLegend ?? null,
        currentState: payload.realtime?.currentState ?? null,
        currentStateSinceTimestamp:
          typeof payload.realtime?.currentStateSinceTimestamp === "number"
            ? payload.realtime.currentStateSinceTimestamp
            : null,
        currentStateAsText: payload.realtime?.currentStateAsText ?? null
      }
    },
    externalPlayerId
  };
}

async function fetchApexLegendsApiRank(input: {
  ign: string;
  platform: TPlatform;
  externalPlayerId?: string | null;
}): Promise<TStatsRank> {
  const profile = await fetchApexLegendsApiProfile(input);
  return profile.rank;
}

async function searchApexLegendsApiPlayers(input: {
  query: string;
  platform?: TPlatform;
}): Promise<TStatsSearchCandidateExt[]> {
  const query = input.query.trim();
  if (!query) {
    return [];
  }

  // ApexLegendsAPI does not consistently expose a public fuzzy search endpoint.
  // Fallback strategy: probe profile lookup for one or all platforms.
  const platforms: TPlatform[] = input.platform ? [input.platform] : ["origin", "psn", "xbl"];
  const candidates: TStatsSearchCandidateExt[] = [];
  for (const platform of platforms) {
    try {
      const profile = await fetchApexLegendsApiProfile({ ign: query, platform });
      candidates.push({
        platform,
        handle: query,
        displayName: query,
        externalPlayerId: profile.externalPlayerId
      });
    } catch {
      // Probe next platform.
    }
  }
  return candidates;
}

export function getStatsProvider(providerName = process.env.STATS_PROVIDER): IStatsProvider {
  const selected = (providerName?.toLowerCase() as TStatsProviderName | undefined) ?? "apexlegendsapi";

  if (selected === "trn") {
    return {
      name: "trn",
      getRank: fetchTrnRank,
      searchPlayers: searchTrnPlayers
    };
  }

  return {
    name: "apexlegendsapi",
    getRank: fetchApexLegendsApiRank,
    searchPlayers: searchApexLegendsApiPlayers
  };
}
