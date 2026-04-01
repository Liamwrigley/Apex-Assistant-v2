"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function SyncNowButton(props: { guildId: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setIsLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/sync/now", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ guildId: props.guildId })
      });
      const body = (await response.json()) as { ok?: boolean; processed?: number; error?: string };
      if (!response.ok) {
        setMessage(body.error ?? "Sync request failed.");
        return;
      }
      setMessage(`Sync started. Processed accounts: ${body.processed ?? 0}.`);
      window.location.reload();
    } catch {
      setMessage("Sync request failed.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button onClick={handleClick} disabled={isLoading}>
        {isLoading ? "Syncing..." : "Sync Now"}
      </Button>
      {message ? <p className="text-muted-foreground text-xs">{message}</p> : null}
    </div>
  );
}
