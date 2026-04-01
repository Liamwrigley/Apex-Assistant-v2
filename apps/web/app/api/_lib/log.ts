const enabled = (process.env.DEBUG_LOGS ?? "false").toLowerCase() === "true";

export function debugLog(scope: string, message: string, meta?: Record<string, unknown>) {
  if (!enabled) {
    return;
  }
  const payload = meta ? ` ${JSON.stringify(meta)}` : "";
  console.log(`[web:${scope}] ${message}${payload}`);
}
