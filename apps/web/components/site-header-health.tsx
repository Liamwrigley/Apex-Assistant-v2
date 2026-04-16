"use client";

import { useQuery } from "@tanstack/react-query";

type THealthResult = {
  name: "worker" | "discord";
  up: boolean;
  status: number;
  latencyMs: number;
  body: Record<string, unknown> | null;
};

type THealthPayload = {
  worker: THealthResult;
  discord: THealthResult;
};

function healthTooltip(
  row: THealthResult | undefined,
  baseUrl: string,
): string | undefined {
  if (!row) return undefined;
  const detail = row.up
    ? `${row.latencyMs} ms · HTTP ${row.status}`
    : "Unreachable or error";
  return [`GET ${baseUrl}/health`, detail].join("\n");
}

export function SiteHeaderHealth() {
  const { data } = useQuery<THealthPayload>({
    queryKey: ["service-health"],
    queryFn: async () => {
      const res = await fetch("/api/health");
      if (!res.ok) throw new Error(`Health fetch failed: ${res.status}`);
      return res.json();
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const workerHealth = data?.worker;
  const discordHealth = data?.discord;
  const workerQueue =
    workerHealth?.body &&
    typeof workerHealth.body === "object" &&
    "queue" in workerHealth.body
      ? (workerHealth.body.queue as {
          activeCount?: number;
          dueCount?: number;
          claimedCount?: number;
        })
      : null;

  return (
    <div className="flex items-center gap-3">
      <div className="text-muted-foreground flex items-center gap-3 text-xs">
        <span
          className="inline-flex cursor-help items-center gap-1.5"
          title={healthTooltip(workerHealth, "")}
        >
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              workerHealth === undefined
                ? "animate-pulse bg-zinc-500"
                : workerHealth.up
                  ? "bg-emerald-400"
                  : "bg-rose-400"
            }`}
          />
          <span className="inline-flex items-center gap-1.5">
            <span>Worker</span>
            {workerQueue ? (
              <>
                <span
                  className={
                    (workerQueue.dueCount ?? 0) > 0
                      ? "text-amber-300"
                      : "text-muted-foreground"
                  }
                  title="Due accounts (ready to be polled)"
                >
                  D:{workerQueue.dueCount ?? 0}
                </span>
                <span
                  className={
                    (workerQueue.claimedCount ?? 0) > 0
                      ? "text-cyan-300"
                      : "text-muted-foreground"
                  }
                  title="Currently claimed by workers"
                >
                  C:{workerQueue.claimedCount ?? 0}
                </span>
                <span
                  className="text-muted-foreground"
                  title="Total active tracked accounts"
                >
                  A:{workerQueue.activeCount ?? 0}
                </span>
              </>
            ) : null}
          </span>
        </span>
        <span
          className="inline-flex cursor-help items-center gap-1.5"
          title={healthTooltip(discordHealth, "")}
        >
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              discordHealth === undefined
                ? "animate-pulse bg-zinc-500"
                : discordHealth.up
                  ? "bg-emerald-400"
                  : "bg-rose-400"
            }`}
          />
          <span>Discord</span>
        </span>
      </div>
    </div>
  );
}
