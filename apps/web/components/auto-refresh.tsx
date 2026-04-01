"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type TAutoRefreshProps = {
  intervalMs?: number;
};

export function AutoRefresh(props: TAutoRefreshProps) {
  const router = useRouter();
  const intervalMs = props.intervalMs ?? 60_000;
  const lastRefreshRef = useRef<number>(0);

  useEffect(() => {
    function maybeRefresh() {
      const now = Date.now();
      // Avoid duplicate refreshes when focus + visibility fire together.
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

    const timer = window.setInterval(maybeRefresh, intervalMs);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs, router]);

  return null;
}
