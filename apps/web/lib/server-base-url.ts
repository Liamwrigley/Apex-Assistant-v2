/**
 * Origin for server-side fetch() to this app's own `/api/*` routes.
 * 1. WEB_BASE_URL — optional override (custom domain, etc.)
 * 2. VERCEL_URL — Vercel-injected hostname (no protocol); see system env vars in Vercel docs
 * 3. RAILWAY_PUBLIC_DOMAIN — set on Railway web service if you deploy there
 * 4. localhost for local dev
 */
export function getServerBaseUrl(): string {
  const trimSlash = (s: string) => s.replace(/\/$/, "");

  const manual = process.env.WEB_BASE_URL?.trim();
  if (manual) {
    return trimSlash(manual);
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    return trimSlash(`https://${vercel}`);
  }

  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railway) {
    if (railway.startsWith("http://") || railway.startsWith("https://")) {
      return trimSlash(railway);
    }
    return trimSlash(`https://${railway}`);
  }

  return "http://localhost:3000";
}
