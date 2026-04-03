"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

type TPoint = {
  capturedAt: string;
  rankScore: number;
};

/** When set, x positions use absolute time so multiple charts share the same axis. */
export type TSparklineXDomain = { minMs: number; maxMs: number };

/** Local calendar dates (as yyyy-mm-dd) that overlap [minMs, maxMs]. */
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
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  return dt;
}

export function PlayerTimelineSparkline(props: {
  trackedAccountId: string;
  hours?: number;
  points?: TPoint[];
  /** Shared time range across leaderboard rows (ms since epoch). */
  xDomain?: TSparklineXDomain | null;
}) {
  const [points, setPoints] = useState<TPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
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
        const response = await fetch(`/api/tracked/${props.trackedAccountId}/timeline?hours=${hours}`, {
          cache: "no-store"
        });
        if (!response.ok) {
          if (!cancelled) {
            setPoints([]);
          }
          return;
        }
        const data = (await response.json()) as TPoint[];
        if (!cancelled) {
          setPoints(data);
        }
      } catch {
        if (!cancelled) {
          setPoints([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [externalPoints, hasExternalPoints, props.hours, props.trackedAccountId]);

  const dimensions = { width: 1000, height: 58, padX: 8, padY: 7 };

  const sortedPoints = useMemo(() => {
    return [...points].sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
  }, [points]);

  const chart = useMemo(() => {
    if (sortedPoints.length < 2) {
      return { pathD: "", circles: [] as Array<{ x: number; y: number }>, min: 0, max: 0 };
    }
    const values = sortedPoints.map((p) => p.rankScore);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(max - min, 1);
    const innerW = dimensions.width - dimensions.padX * 2;
    const innerH = dimensions.height - dimensions.padY * 2;
    const domain = props.xDomain;
    const spanMs =
      domain && domain.maxMs >= domain.minMs ? Math.max(domain.maxMs - domain.minMs, 1) : 1;
    const circles = sortedPoints.map((point, index) => {
      let x: number;
      if (domain && domain.maxMs >= domain.minMs && spanMs > 0) {
        const t = new Date(point.capturedAt).getTime();
        const u = (t - domain.minMs) / spanMs;
        x = dimensions.padX + Math.min(1, Math.max(0, u)) * innerW;
      } else {
        x = dimensions.padX + (index / (sortedPoints.length - 1)) * innerW;
      }
      const y = dimensions.padY + (1 - (point.rankScore - min) / range) * innerH;
      return { x, y };
    });
    const pathParts: string[] = [`M ${circles[0].x} ${circles[0].y}`];
    for (let i = 0; i < circles.length - 1; i += 1) {
      const p0 = circles[i - 1] ?? circles[i];
      const p1 = circles[i];
      const p2 = circles[i + 1];
      const p3 = circles[i + 2] ?? p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      pathParts.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`);
    }
    const pathD = pathParts.join(" ");
    return { pathD, circles, min, max };
  }, [props.xDomain, sortedPoints]);

  const chartAreaRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipLeftPx, setTooltipLeftPx] = useState<number | null>(null);

  const hoverDotX = hoverIndex !== null ? chart.circles[hoverIndex]?.x : null;
  const hoverCaptionKey =
    hoverIndex !== null && sortedPoints[hoverIndex]
      ? `${sortedPoints[hoverIndex].capturedAt}:${sortedPoints[hoverIndex].rankScore}`
      : "";

  useLayoutEffect(() => {
    if (hoverIndex === null || sortedPoints.length < 2 || hoverDotX == null) {
      setTooltipLeftPx(null);
      return;
    }
    const dotX = hoverDotX;

    const area = chartAreaRef.current;
    if (!area) {
      return;
    }

    function layout() {
      const areaEl = chartAreaRef.current;
      const tip = tooltipRef.current;
      if (!areaEl || !tip) {
        return;
      }
      const chartW = areaEl.clientWidth;
      const tipW = tip.getBoundingClientRect().width;
      if (tipW < 4) {
        requestAnimationFrame(layout);
        return;
      }
      const pad = 6;
      const centerX = (dotX / dimensions.width) * chartW;
      let left = centerX - tipW / 2;
      if (left < pad) {
        left = pad;
      }
      if (left + tipW > chartW - pad) {
        left = Math.max(pad, chartW - pad - tipW);
      }
      setTooltipLeftPx(left);
    }

    layout();
    const ro = new ResizeObserver(() => {
      queueMicrotask(layout);
    });
    ro.observe(area);
    return () => ro.disconnect();
  }, [hoverCaptionKey, hoverDotX, hoverIndex, sortedPoints.length]);

  if (isLoading) {
    return <div className="h-[58px] w-full min-w-[240px] animate-pulse rounded bg-muted/50" />;
  }

  if (sortedPoints.length < 2) {
    return <div className="h-[58px] w-full min-w-[240px]" />;
  }

  const start = sortedPoints[0]?.rankScore ?? 0;
  const end = sortedPoints[sortedPoints.length - 1]?.rankScore ?? 0;
  const delta = end - start;
  const lineColor = delta >= 0 ? "#34d399" : "#fb7185";
  const dotColor = lineColor;
  const hoverPoint = hoverIndex !== null ? sortedPoints[hoverIndex] : null;
  const hoverDot = hoverIndex !== null ? chart.circles[hoverIndex] : null;
  const startTime =
    props.xDomain && props.xDomain.maxMs >= props.xDomain.minMs
      ? props.xDomain.minMs
      : new Date(sortedPoints[0].capturedAt).getTime();
  const endTime =
    props.xDomain && props.xDomain.maxMs >= props.xDomain.minMs
      ? props.xDomain.maxMs
      : new Date(sortedPoints[sortedPoints.length - 1].capturedAt).getTime();
  const spanMs = Math.max(endTime - startTime, 1);
  const innerW = dimensions.width - dimensions.padX * 2;
  const dayKeys = localDatesOverlappingRange(startTime, endTime);
  const xTicks = dayKeys.map((dateKey) => {
    const day = parseLocalDateKey(dateKey);
    const noon = day.getTime();
    const u = (noon - startTime) / spanMs;
    const x = dimensions.padX + Math.min(1, Math.max(0, u)) * innerW;
    const label = day.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
    return { dateKey, x, label };
  });

  return (
    <div className="relative w-full min-w-[240px] max-w-[640px] overflow-visible">
      <div ref={chartAreaRef} className="relative h-[58px] w-full overflow-visible">
        {hoverPoint && hoverDot ? (
          <div
            ref={tooltipRef}
            className="bg-background/95 pointer-events-none absolute z-20 mb-1 rounded border px-1.5 py-1 text-[10px] shadow whitespace-nowrap"
            style={{
              bottom: "100%",
              left: tooltipLeftPx ?? 0,
              visibility: tooltipLeftPx === null ? "hidden" : "visible"
            }}
          >
            <span className="font-medium tabular-nums">{hoverPoint.rankScore.toLocaleString()} RP</span>
            <span className="text-muted-foreground">
              {" "}
              ·{" "}
              {new Date(hoverPoint.capturedAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit"
              })}
            </span>
          </div>
        ) : null}
        <svg
          viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
          className="h-[58px] w-full"
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * dimensions.width;
            let nearest = 0;
            let nearestDistance = Number.POSITIVE_INFINITY;
            for (let i = 0; i < chart.circles.length; i += 1) {
              const distance = Math.abs(chart.circles[i].x - x);
              if (distance < nearestDistance) {
                nearestDistance = distance;
                nearest = i;
              }
            }
            setHoverIndex(nearest);
          }}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <path d={chart.pathD} fill="none" stroke={lineColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          {xTicks.map((tick) => (
            <line
              key={tick.dateKey}
              x1={tick.x}
              y1={dimensions.height - dimensions.padY}
              x2={tick.x}
              y2={dimensions.height - dimensions.padY + 2}
              stroke="#6b7280"
              strokeWidth="1"
            />
          ))}
          {hoverDot ? (
            <line
              x1={hoverDot.x}
              y1={dimensions.padY}
              x2={hoverDot.x}
              y2={dimensions.height - dimensions.padY}
              stroke="#9ca3af"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
          ) : null}
          {hoverDot ? <circle cx={hoverDot.x} cy={hoverDot.y} r={2.8} fill={dotColor} /> : null}
        </svg>
      </div>
      <div className="text-muted-foreground relative mt-0.5 h-3.5 w-full text-[9px] leading-none">
        {xTicks.map((tick) => (
          <span
            key={tick.dateKey}
            className="pointer-events-none absolute top-0 -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${(tick.x / dimensions.width) * 100}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>
    </div>
  );
}
