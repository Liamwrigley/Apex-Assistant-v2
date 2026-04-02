"use client";

import { useEffect, useMemo, useState } from "react";

type TPoint = {
  capturedAt: string;
  rankScore: number;
};

/** When set, x positions use absolute time so multiple charts share the same axis. */
export type TSparklineXDomain = { minMs: number; maxMs: number };

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
  const startLabel = new Date(startTime).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const endLabel = new Date(endTime).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const xTicks = [
    { x: dimensions.padX, label: startLabel },
    { x: dimensions.width - dimensions.padX, label: endLabel }
  ];

  return (
    <div className="relative w-full min-w-[240px] max-w-[640px]">
      <div className="relative">
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
              key={`tick-${tick.x}`}
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
        {hoverPoint ? (
          <div className="bg-background/95 pointer-events-none absolute -top-8 left-0 rounded border px-1.5 py-1 text-[10px] shadow">
            {hoverPoint.rankScore.toLocaleString()} RP -{" "}
            {new Date(hoverPoint.capturedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
          </div>
        ) : null}
      </div>
      <div className="text-muted-foreground mt-0.5 flex items-center justify-between text-[9px]">
        <span className="text-left">{xTicks[0].label}</span>
        <span className="text-right">{xTicks[1].label}</span>
      </div>
    </div>
  );
}
