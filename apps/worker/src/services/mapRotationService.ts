export type TRankedMapInfo = {
  mapCode: string;
  mapName: string;
};

type TMapRotationWindow = {
  map: string;
  code: string;
  start: number;
  end: number;
};

type TCachedRotation = {
  current: TMapRotationWindow;
  next: TMapRotationWindow | null;
  validUntilMs: number;
};

let cached: TCachedRotation | null = null;

function getConfig(): { baseUrl: string; key: string } {
  const key = process.env.APEXLEGENDSAPI_KEY;
  if (!key) throw new Error("APEXLEGENDSAPI_KEY is not configured.");
  return {
    baseUrl: process.env.APEXLEGENDSAPI_BASE_URL ?? "https://api.mozambiquehe.re",
    key
  };
}

async function fetchRotation(): Promise<TCachedRotation> {
  const config = getConfig();
  const endpoint = `${config.baseUrl}/maprotation?version=1&auth=${encodeURIComponent(config.key)}`;
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Map rotation API failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    ranked?: {
      current?: {
        map?: string;
        code?: string;
        start?: number;
        end?: number;
      };
      next?: {
        map?: string;
        code?: string;
        start?: number;
        end?: number;
      };
    };
  };

  const ranked = payload.ranked;
  if (!ranked?.current?.map || !ranked?.current?.code || !ranked?.current?.end) {
    throw new Error("Map rotation API response missing ranked.current data");
  }

  const current: TMapRotationWindow = {
    map: ranked.current.map,
    code: ranked.current.code,
    start: ranked.current.start ?? 0,
    end: ranked.current.end
  };

  const next: TMapRotationWindow | null =
    ranked.next?.map && ranked.next?.code && ranked.next?.end
      ? { map: ranked.next.map, code: ranked.next.code, start: ranked.next.start ?? 0, end: ranked.next.end }
      : null;

  return {
    current,
    next,
    validUntilMs: current.end * 1000
  };
}

/**
 * Returns the current ranked map info using a window-based cache.
 * Cached until the API-reported window end time, then refetches once.
 * Falls back to stale data on fetch errors.
 */
export async function getRankedMap(): Promise<TRankedMapInfo | null> {
  const now = Date.now();

  if (cached && now < cached.validUntilMs) {
    return { mapCode: cached.current.code, mapName: cached.current.map };
  }

  try {
    cached = await fetchRotation();

    if (now < cached.validUntilMs) {
      return { mapCode: cached.current.code, mapName: cached.current.map };
    }

    if (cached.next) {
      return { mapCode: cached.next.code, mapName: cached.next.map };
    }

    return { mapCode: cached.current.code, mapName: cached.current.map };
  } catch (error) {
    console.warn("[worker] map rotation fetch failed, using stale cache", error instanceof Error ? error.message : error);

    if (cached) {
      return { mapCode: cached.current.code, mapName: cached.current.map };
    }

    return null;
  }
}
