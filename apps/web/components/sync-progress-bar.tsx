"use client";

import { useEffect, useMemo, useState } from "react";

type TSyncProgressBarProps = {
  nextSyncAt: string | null;
  pollMinutes: number;
  lastStartedAt: string | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function SyncProgressBar(props: TSyncProgressBarProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const progress = useMemo(() => {
    if (!props.nextSyncAt) {
      return 0;
    }

    const nextMs = new Date(props.nextSyncAt).getTime();
    if (!Number.isFinite(nextMs)) {
      return 0;
    }

    const intervalMs = Math.max(props.pollMinutes, 1) * 60_000;
    const fallbackStartMs = nextMs - intervalMs;
    const lastStartMs = props.lastStartedAt ? new Date(props.lastStartedAt).getTime() : fallbackStartMs;
    const startMs = Number.isFinite(lastStartMs) ? lastStartMs : fallbackStartMs;
    const elapsed = nowMs - startMs;
    return clamp(elapsed / intervalMs, 0, 1);
  }, [nowMs, props.lastStartedAt, props.nextSyncAt, props.pollMinutes]);

  const percent = `${(progress * 100).toFixed(1)}%`;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-muted/35">
      <div
        className="h-full bg-primary transition-[width] duration-500 ease-linear"
        style={{ width: percent }}
        aria-label="Sync progress to next scan"
      />
    </div>
  );
}
