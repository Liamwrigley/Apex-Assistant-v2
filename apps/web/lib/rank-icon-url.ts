const RANK_ICON_BASE = "https://api.mozambiquehe.re/assets/ranks";

/**
 * Derive the canonical rank icon URL from a rank name and division.
 *
 * Rank tiers: Rookie, Bronze, Silver, Gold, Platinum, Diamond (each with divisions 4‑1).
 * Special tiers: Master (no division), Apex Predator (CDN uses "apexpredator1").
 */
export function getRankIconUrl(
  rankName: string | null | undefined,
  rankDivision: string | null | undefined,
): string | null {
  const name = rankName?.trim().toLowerCase();
  if (!name) return null;

  if (name === "apex predator" || name === "apexpredator") {
    return `${RANK_ICON_BASE}/apexpredator1.png`;
  }

  if (name === "master") {
    return `${RANK_ICON_BASE}/master.png`;
  }

  const div = rankDivision?.trim();
  if (!div) return null;

  return `${RANK_ICON_BASE}/${name}${div}.png`;
}
