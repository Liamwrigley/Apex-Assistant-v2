import Image from "next/image";
import Link from "next/link";
import {
  getDiscordBotBaseUrl,
  getWorkerBaseUrl,
} from "@/lib/service-base-urls";

type TServiceHealthRow = {
  name: "worker" | "discord";
  baseUrl: string;
  healthUrl: string;
  up: boolean;
  status: number;
  latencyMs: number;
  body: Record<string, unknown> | null;
};

async function fetchServiceHealth(): Promise<TServiceHealthRow[]> {
  const workerBaseUrl = getWorkerBaseUrl();
  const discordBaseUrl = getDiscordBotBaseUrl();

  const check = async (
    name: "worker" | "discord",
    baseUrl: string,
  ): Promise<TServiceHealthRow> => {
    const healthUrl = `${baseUrl.replace(/\/$/, "")}/health`;
    const startedAt = Date.now();
    try {
      const response = await fetch(healthUrl, { cache: "no-store" });
      const latencyMs = Date.now() - startedAt;
      const body = response.ok
        ? ((await response.json()) as Record<string, unknown>)
        : null;
      return { name, baseUrl, healthUrl, up: response.ok, status: response.status, latencyMs, body };
    } catch {
      return { name, baseUrl, healthUrl, up: false, status: 0, latencyMs: Date.now() - startedAt, body: null };
    }
  };

  return Promise.all([
    check("worker", workerBaseUrl),
    check("discord", discordBaseUrl),
  ]);
}

function healthStatusTooltip(row: TServiceHealthRow | undefined): string | undefined {
  if (!row) return undefined;
  const origin = row.baseUrl.replace(/\/$/, "");
  const detail = row.up
    ? `${row.latencyMs} ms · HTTP ${row.status}`
    : "Unreachable or error";
  const lines = [`GET ${row.healthUrl}`, detail, `Base: ${origin}`];
  if (row.name === "worker") {
    lines.push(`Sync Now: POST ${origin}/ingest/{guildId}`);
  }
  return lines.join("\n");
}

export async function SiteHeader() {
  const serviceHealth = await fetchServiceHealth();
  const workerHealth = serviceHealth.find((item) => item.name === "worker");
  const discordHealth = serviceHealth.find((item) => item.name === "discord");
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
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="Apex Assistant logo"
            width={44}
            height={44}
            className="rounded-full"
            priority
          />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Apex Assistant
            </h1>
            <p className="text-muted-foreground text-sm">
              Live tracker dashboard
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          <div className="text-muted-foreground flex items-center gap-3 text-xs">
            <span
              className="inline-flex cursor-help items-center gap-1.5"
              title={healthStatusTooltip(workerHealth)}
            >
              <span
                className={`inline-block h-2 w-2 rounded-full ${workerHealth?.up ? "bg-emerald-400" : "bg-rose-400"}`}
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
              title={healthStatusTooltip(discordHealth)}
            >
              <span
                className={`inline-block h-2 w-2 rounded-full ${discordHealth?.up ? "bg-emerald-400" : "bg-rose-400"}`}
              />
              <span>Discord</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
