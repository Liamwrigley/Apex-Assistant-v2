/**
 * Legend portraits from apexlegendsstatus.com (WebP).
 * Pattern: .../humanesas/{LegendName}.webp — usually one PascalCase word (e.g. Wraith);
 * Mad Maggie is the outlier: Mad-maggie.webp on the CDN.
 * @see https://apexlegendsstatus.com/assets/legends/humanesas/Wraith.webp
 */
const LEGEND_ICON_BASE =
  "https://apexlegendsstatus.com/assets/legends/humanesas";

/** Compact-key overrides when the on-disk name does not match our default stem. */
const LEGEND_FILE_ALIASES: Record<string, string> = {
  madmaggie: "Mad-maggie"
};

function compactKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** e.g. "wraith" → "Wraith"; "mad maggie" → "Mad-maggie" (CDN filename). */
function legendNameToFileStem(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "";
  }
  const keyed = compactKey(trimmed);
  const alias = LEGEND_FILE_ALIASES[keyed];
  if (alias) {
    return alias;
  }
  const parts = trimmed.split(/[\s\-_]+/).filter(Boolean);
  if (parts.length === 0) {
    return "";
  }
  const lower = parts.map((p) => p.toLowerCase());
  if (lower.length === 2 && lower[0] === "mad" && lower[1] === "maggie") {
    return "Mad-maggie";
  }
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join("");
}

export function getLegendIconUrl(legendName: string | null | undefined): string | null {
  if (!legendName?.trim()) {
    return null;
  }
  const stem = legendNameToFileStem(legendName);
  if (!stem) {
    return null;
  }
  return `${LEGEND_ICON_BASE}/${encodeURIComponent(stem)}.webp`;
}
