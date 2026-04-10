import { AppError, type TPlatform } from "./types.js";

export type TStatsProviderName = "apexlegendsapi";

export type TStatsRank = {
  rankScore: number;
  rankName: string;
  rankDivision: string | null;
  iconUrl: string | null;
  externalPlayerId?: string | null;
  playerName?: string | null;
  currentLevel?: number | null;
  /** Legacy: mixed API aggregate from `total.*` — not guaranteed global career. */
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

/** One tracker row from `legends.selected` or `legends.all[legend].data[]`. */
export type TTrackerObservation = {
  legendName: string;
  trackerKey: string;
  displayName: string;
  value: number;
  globalFlag: boolean | null;
  dataIndex: number;
  source: "selected" | "all";
};

export type TStatsSearchCandidate = {
  platform: TPlatform;
  handle: string;
  displayName: string;
  externalPlayerId?: string | null;
};

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

/** Normalize legend bucket names for stable (legend, key) series. */
export function normalizeLegendName(name: string): string {
  return name.trim();
}

type TLegendDataEntry = {
  name?: string;
  value?: number;
  key?: string;
  global?: boolean;
};

type TLegendBucket = {
  data?: TLegendDataEntry[];
  LegendName?: string;
  ImgAssets?: unknown;
  gameInfo?: unknown;
};

type TLegendsPayload = {
  selected?: TLegendBucket & { LegendName?: string };
  all?: Record<string, TLegendBucket>;
};

/**
 * Build tracker observations from `legends.selected` and `legends.all` (when ingestAllLegends is true).
 */
export function parseTrackerObservations(
  legends: TLegendsPayload | undefined,
  options: { ingestAllLegends: boolean }
): TTrackerObservation[] {
  const out: TTrackerObservation[] = [];

  const pushRows = (
    legendName: string,
    data: TLegendDataEntry[] | undefined,
    source: "selected" | "all"
  ) => {
    const normLegend = normalizeLegendName(legendName);
    if (!data?.length) return;
    data.forEach((entry, dataIndex) => {
      const key = typeof entry.key === "string" && entry.key.length > 0 ? entry.key : null;
      if (!key) return;
      const value =
        typeof entry.value === "number" && Number.isFinite(entry.value) ? entry.value : null;
      if (value === null) return;
      const displayName = typeof entry.name === "string" ? entry.name : key;
      const globalFlag =
        typeof entry.global === "boolean" ? entry.global : null;
      out.push({
        legendName: normLegend,
        trackerKey: key,
        displayName,
        value,
        globalFlag,
        dataIndex,
        source,
      });
    });
  };

  const selected = legends?.selected;
  const selectedName =
    typeof selected?.LegendName === "string" && selected.LegendName.length > 0
      ? selected.LegendName
      : null;
  if (selectedName) {
    pushRows(selectedName, selected?.data, "selected");
  }

  if (options.ingestAllLegends && legends?.all) {
    for (const [legendKey, bucket] of Object.entries(legends.all)) {
      if (legendKey === "selected") continue;
      pushRows(legendKey, bucket?.data, "all");
    }
  }

  return out;
}

async function fetchApexLegendsApiProfile(input: {
  ign: string;
  platform: TPlatform;
  externalPlayerId?: string | null;
}): Promise<{
  rank: TStatsRank;
  externalPlayerId: string | null;
  trackerObservations: TTrackerObservation[];
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
    total?: Record<string, { name?: string; value?: number | string } | number | undefined>;
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
    legends?: TLegendsPayload;
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
    if (value && typeof value === "object" && typeof value.value === "number" && Number.isFinite(value.value)) {
      return value.value;
    }
    return null;
  };

  const ingestAllLegends = process.env.APEX_INGEST_ALL_LEGEND_TRACKERS === "true";
  const trackerObservations = parseTrackerObservations(payload.legends, { ingestAllLegends });

  return {
    rank: {
      rankScore: rank.rankScore,
      rankName: rank.rankName,
      rankDivision: rank.rankDiv !== undefined ? String(rank.rankDiv) : null,
      iconUrl: rank.rankImg ?? null,
      externalPlayerId,
      playerName: payload.global?.name ?? null,
      currentLevel: typeof payload.global?.level === "number" ? payload.global.level : null,
      careerKills: toTotalNumber(payload.total?.career_kills as { value?: number } | number | undefined),
      careerDamage: toTotalNumber(payload.total?.damage as { value?: number } | number | undefined),
      careerWins: toTotalNumber(payload.total?.career_wins as { value?: number } | number | undefined),
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
    externalPlayerId,
    trackerObservations
  };
}

/**
 * Full profile fetch for ingestion: rank + tracker rows (selected + optional all legends).
 * Use this in the worker instead of `getRank` to persist tracker observations in one HTTP round-trip.
 */
export async function fetchApexProfileForIngest(input: {
  ign: string;
  platform: TPlatform;
  externalPlayerId?: string | null;
}): Promise<{
  rank: TStatsRank;
  externalPlayerId: string | null;
  trackerObservations: TTrackerObservation[];
}> {
  return fetchApexLegendsApiProfile(input);
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

export function getStatsProvider(): IStatsProvider {
  return {
    name: "apexlegendsapi",
    getRank: fetchApexLegendsApiRank,
    searchPlayers: searchApexLegendsApiPlayers
  };
}
