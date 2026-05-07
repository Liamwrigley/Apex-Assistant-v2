import { NextResponse } from "next/server";
import { getWorkerBaseUrl, getDiscordBotBaseUrl } from "@/lib/service-base-urls";

type THealthResult = {
  name: "worker" | "discord";
  up: boolean;
  status: number;
  latencyMs: number;
  body: Record<string, unknown> | null;
};

async function check(
  name: "worker" | "discord",
  baseUrl: string,
): Promise<THealthResult> {
  const healthUrl = `${baseUrl.replace(/\/$/, "")}/health`;
  const startedAt = Date.now();
  try {
    const response = await fetch(healthUrl, { cache: "no-store" });
    const latencyMs = Date.now() - startedAt;
    const body = response.ok
      ? ((await response.json()) as Record<string, unknown>)
      : null;
    return { name, up: response.ok, status: response.status, latencyMs, body };
  } catch {
    return { name, up: false, status: 0, latencyMs: Date.now() - startedAt, body: null };
  }
}

export async function GET(): Promise<NextResponse> {
  const [worker, discord] = await Promise.all([
    check("worker", getWorkerBaseUrl()),
    check("discord", getDiscordBotBaseUrl()),
  ]);
  return NextResponse.json({ worker, discord });
}
