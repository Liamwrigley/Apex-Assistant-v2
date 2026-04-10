"use client";

import { useEffect, useMemo, useState } from "react";
import type { Chart, Plugin, TooltipItem } from "chart.js";
import { Line } from "react-chartjs-2";
import "@/lib/chartjs-register";

const PROGRESSIVE_LINE_DURATION_MS = 1000;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

type TChartWithProgressive = Chart & {
  $progressiveLineProgress?: number;
  $progressiveLineRafId?: number;
};

function cancelProgressiveAnimation(chart: TChartWithProgressive) {
  if (chart.$progressiveLineRafId != null) {
    cancelAnimationFrame(chart.$progressiveLineRafId);
    chart.$progressiveLineRafId = undefined;
  }
}

function startProgressiveLineAnimation(chart: TChartWithProgressive) {
  cancelProgressiveAnimation(chart);
  chart.$progressiveLineProgress = 0;
  const t0 = performance.now();
  const tick = (now: number) => {
    const elapsed = now - t0;
    const linear = Math.min(1, elapsed / PROGRESSIVE_LINE_DURATION_MS);
    chart.$progressiveLineProgress = easeOutCubic(linear);
    chart.draw();
    if (linear < 1) {
      chart.$progressiveLineRafId = requestAnimationFrame(tick);
    } else {
      chart.$progressiveLineProgress = 1;
      chart.$progressiveLineRafId = undefined;
      chart.draw();
    }
  };
  chart.$progressiveLineRafId = requestAnimationFrame(tick);
}

/**
 * Left-to-right clip so the line appears to draw in (similar to Chart.js “progressive line” samples).
 */
const progressiveLinePlugin: Plugin<"line"> = {
  id: "progressiveLineDraw",
  beforeInit(chart) {
    (chart as TChartWithProgressive).$progressiveLineProgress = 0;
  },
  afterInit(chart) {
    const ch = chart as TChartWithProgressive;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      ch.$progressiveLineProgress = 1;
      return;
    }
    startProgressiveLineAnimation(ch);
  },
  beforeDestroy(chart) {
    cancelProgressiveAnimation(chart as TChartWithProgressive);
  },
  beforeDatasetDraw(chart, args) {
    if (args.index !== 0) return;
    const ch = chart as TChartWithProgressive;
    const p = ch.$progressiveLineProgress ?? 1;
    if (p >= 1) return;
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    const { left, top, right, bottom } = chartArea;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, (right - left) * p, bottom - top);
    ctx.clip();
  },
  afterDatasetDraw(chart, args) {
    if (args.index !== 0) return;
    const p = (chart as TChartWithProgressive).$progressiveLineProgress ?? 1;
    if (p >= 1) return;
    chart.ctx.restore();
  },
};

type TPoint = {
  capturedAt: string;
  rankScore: number;
};

/** When set, x positions use absolute time so multiple charts share the same axis. */
export type TSparklineXDomain = { minMs: number; maxMs: number };

function localDatesOverlappingRange(minMs: number, maxMs: number): string[] {
  const keys: string[] = [];
  const cur = new Date(minMs);
  cur.setHours(12, 0, 0, 0);
  const end = new Date(maxMs);
  end.setHours(12, 0, 0, 0);
  const seen = new Set<string>();
  while (cur.getTime() <= end.getTime()) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    const key = `${y}-${m}-${d}`;
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return keys;
}

function parseLocalDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

const scrubLinePlugin: Plugin<"line"> = {
  id: "playerTimelineScrubLine",
  afterDatasetsDraw(chart) {
    const active = chart.getActiveElements();
    if (active.length === 0) return;
    const { datasetIndex, index } = active[0];
    const meta = chart.getDatasetMeta(datasetIndex);
    const pt = meta.data[index];
    if (!pt) return;
    const { x } = pt.getProps(["x"], true);
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([2, 2]);
    ctx.strokeStyle = "rgb(156 163 175)";
    ctx.lineWidth = 1;
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.restore();
  },
};

export function PlayerTimelineSparkline(props: {
  trackedAccountId: string;
  hours?: number;
  points?: TPoint[];
  xDomain?: TSparklineXDomain | null;
  /** Taller chart with axis labels for profile page; compact sparkline for leaderboard. */
  variant?: "compact" | "profile";
}) {
  const variant = props.variant ?? "compact";
  const [points, setPoints] = useState<TPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const hasExternalPoints = Array.isArray(props.points);
  const externalPoints = props.points ?? [];

  useEffect(() => {
    if (hasExternalPoints) {
      setPoints(externalPoints);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    async function run() {
      setIsLoading(true);
      try {
        const hours = props.hours ?? 24;
        const response = await fetch(
          `/api/tracked/${props.trackedAccountId}/timeline?hours=${hours}`,
          { cache: "no-store" }
        );
        if (!response.ok) {
          if (!cancelled) setPoints([]);
          return;
        }
        const data = (await response.json()) as TPoint[];
        if (!cancelled) setPoints(data);
      } catch {
        if (!cancelled) setPoints([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [externalPoints, hasExternalPoints, props.hours, props.trackedAccountId]);

  const sortedPoints = useMemo(() => {
    return [...points].sort(
      (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
    );
  }, [points]);

  const lineColor = useMemo(() => {
    if (sortedPoints.length < 2) return "#34d399";
    const start = sortedPoints[0].rankScore;
    const end = sortedPoints[sortedPoints.length - 1].rankScore;
    return end - start >= 0 ? "#34d399" : "#fb7185";
  }, [sortedPoints]);

  const timeBounds = useMemo(() => {
    if (sortedPoints.length < 2) return null;
    const domain = props.xDomain;
    if (domain && domain.maxMs >= domain.minMs) {
      return { minMs: domain.minMs, maxMs: domain.maxMs };
    }
    return {
      minMs: new Date(sortedPoints[0].capturedAt).getTime(),
      maxMs: new Date(sortedPoints[sortedPoints.length - 1].capturedAt).getTime(),
    };
  }, [props.xDomain, sortedPoints]);

  const dayTickLayout = useMemo(() => {
    if (!timeBounds) return [];
    const spanMs = Math.max(timeBounds.maxMs - timeBounds.minMs, 1);
    const dayKeys = localDatesOverlappingRange(timeBounds.minMs, timeBounds.maxMs);
    return dayKeys.map((dateKey) => {
      const day = parseLocalDateKey(dateKey);
      const noon = day.getTime();
      const u = (noon - timeBounds.minMs) / spanMs;
      const leftPct = Math.min(1, Math.max(0, u)) * 100;
      const label = day.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
      return { dateKey, leftPct, label };
    });
  }, [timeBounds]);

  const chartKey = useMemo(() => {
    if (sortedPoints.length === 0) return "empty";
    const first = sortedPoints[0].capturedAt;
    const last = sortedPoints[sortedPoints.length - 1].capturedAt;
    return `${sortedPoints.length}-${first}-${last}`;
  }, [sortedPoints]);

  const chartData = useMemo(
    () => ({
      datasets: [
        {
          data: sortedPoints.map((p) => ({
            x: p.capturedAt,
            y: p.rankScore,
          })),
          borderColor: lineColor,
          backgroundColor: lineColor,
          borderWidth: variant === "profile" ? 2 : 1.8,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBorderWidth: 0,
          pointHoverBackgroundColor: lineColor,
        },
      ],
    }),
    [lineColor, sortedPoints, variant]
  );

  const chartOptions = useMemo(() => {
    const isProfile = variant === "profile";
    const xMin = timeBounds?.minMs;
    const xMax = timeBounds?.maxMs;
    const profileXTime =
      isProfile && xMin != null && xMax != null
        ? (() => {
            const spanMs = Math.max(xMax - xMin, 1);
            const spanHours = spanMs / 3_600_000;
            const spanDays = spanMs / 86_400_000;
            let unit: "hour" | "day" | "week" | "month" = "day";
            if (spanHours <= 36) unit = "hour";
            else if (spanDays <= 21) unit = "day";
            else if (spanDays <= 120) unit = "week";
            else unit = "month";
            return {
              time: {
                unit,
                displayFormats: {
                  hour: "MMM d, HH:mm",
                  day: "MMM d",
                  week: "MMM d",
                  month: "MMM yyyy",
                },
              },
              ticks: {
                display: true,
                maxRotation: 0,
                maxTicksLimit: spanHours <= 36 ? 14 : 12,
                color: "rgba(255, 255, 255, 0.5)",
                font: { size: 11 },
              },
            };
          })()
        : null;
    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: isProfile ? { padding: { bottom: 6 } } : undefined,
      // Progressive draw is handled by progressiveLinePlugin (~1s); disable default dataset animation.
      animation: {
        duration: 0,
      },
      interaction: {
        mode: "index" as const,
        intersect: false,
        axis: "x" as const,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "hsl(0 0% 9% / 0.95)",
          titleColor: "hsl(0 0% 63%)",
          bodyColor: "hsl(0 0% 98%)",
          borderColor: "hsl(0 0% 20%)",
          borderWidth: 1,
          padding: 8,
          displayColors: false,
          callbacks: {
            title(tooltipItems: TooltipItem<"line">[]) {
              const x = tooltipItems[0]?.parsed.x;
              if (x == null || typeof x !== "number") return "";
              return new Date(x).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });
            },
            label(item: TooltipItem<"line">) {
              const y = item.parsed.y;
              if (y == null) return "";
              return `${Number(y).toLocaleString()} RP`;
            },
          },
        },
      },
      scales: {
        x: {
          type: "time" as const,
          min: xMin,
          max: xMax,
          display: isProfile,
          grid: {
            display: isProfile,
            color: "rgba(255,255,255,0.06)",
          },
          ...(profileXTime ?? {
            ticks: { display: false },
          }),
          border: { display: isProfile },
        },
        y: {
          display: isProfile,
          grace: "10%",
          grid: {
            display: isProfile,
            color: "rgba(255,255,255,0.06)",
          },
          border: { display: isProfile },
          ticks: {
            callback: (v: string | number) =>
              typeof v === "number" ? v.toLocaleString() : v,
          },
        },
      },
    };
  }, [timeBounds, variant]);

  const chartHeightClass = variant === "profile" ? "h-[220px]" : "h-[58px]";

  if (isLoading) {
    return (
      <div
        className={`${chartHeightClass} w-full min-w-[240px] animate-pulse rounded bg-muted/50`}
      />
    );
  }

  if (sortedPoints.length < 2) {
    return <div className={`${chartHeightClass} w-full min-w-[240px]`} />;
  }

  return (
    <div
      className={`relative w-full min-w-[240px] overflow-visible ${variant === "compact" ? "max-w-[640px]" : ""}`}
    >
      <div className={`relative w-full overflow-visible ${chartHeightClass}`}>
        <Line
          key={chartKey}
          data={chartData}
          options={chartOptions}
          plugins={[progressiveLinePlugin, scrubLinePlugin]}
        />
      </div>
      {variant === "compact" && dayTickLayout.length > 0 ? (
        <div className="text-muted-foreground relative mt-0.5 h-3.5 w-full text-[9px] leading-none">
          {dayTickLayout.map((tick) => (
            <span
              key={tick.dateKey}
              className="pointer-events-none absolute top-0 -translate-x-1/2 whitespace-nowrap"
              style={{ left: `${tick.leftPct}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
