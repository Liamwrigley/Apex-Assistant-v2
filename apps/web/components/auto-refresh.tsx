"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

type TAutoRefreshProps = {
  /** Polling interval in ms. Set to 0 to disable the periodic timer (focus/visibility only). */
  intervalMs?: number;
};

export function AutoRefresh(props: TAutoRefreshProps) {
  const router = useRouter();
  const intervalMs = props.intervalMs ?? 60_000;
  const lastRefreshRef = useRef<number>(0);

  useEffect(() => {
    function maybeRefresh() {
      const now = Date.now();
      if (now - lastRefreshRef.current < 2_000) {
        return;
      }
      lastRefreshRef.current = now;
      router.refresh();
    }

    function onFocus() {
      maybeRefresh();
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        maybeRefresh();
      }
    }

    const timer =
      intervalMs > 0
        ? window.setInterval(maybeRefresh, intervalMs)
        : undefined;
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      if (timer !== undefined) {
        window.clearInterval(timer);
      }
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs, router]);

  return null;
}
