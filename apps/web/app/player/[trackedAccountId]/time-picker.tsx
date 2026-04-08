"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

const RANGES = ["24h", "3d", "7d", "14d", "30d"] as const;

export function PlayerProfileTimePicker(props: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setRange(range: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", range);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-1 rounded-md border p-0.5">
      {RANGES.map((r) => (
        <button
          key={r}
          onClick={() => setRange(r)}
          className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
            props.current === r
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
