import { listTrackedAccounts } from "@apex-assistant/db";
import { evaluateRealtimePresence } from "@/lib/realtime-presence";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function msToAge(ms: number | null): string {
  if (ms === null) {
    return "-";
  }
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) {
    return `${sec}s`;
  }
  const min = Math.floor(sec / 60);
  if (min < 60) {
    return `${min}m`;
  }
  const hours = Math.floor(min / 60);
  return `${hours}h`;
}

function platformLabel(platform: string): string {
  if (platform === "origin") {
    return "PC";
  }
  if (platform === "psn") {
    return "PS4";
  }
  if (platform === "xbl") {
    return "X1";
  }
  return platform.toUpperCase();
}

export default async function RealtimeDebugPage() {
  const guildId = process.env.DISCORD_GUILD_ID ?? "";
  const tracked = await listTrackedAccounts(guildId || undefined);
  const rows = tracked
    .map((row) => {
      const evalResult = evaluateRealtimePresence({
        realtimeUpdatedAt: row.realtimeUpdatedAt ? row.realtimeUpdatedAt.toISOString() : null,
        realtimeIsOnline: row.realtimeIsOnline,
        realtimeIsInGame: row.realtimeIsInGame,
        realtimeCurrentState: row.realtimeCurrentState,
        realtimeCurrentStateAsText: row.realtimeCurrentStateAsText
      });
      return {
        id: row.id,
        ign: row.ign,
        platform: row.platform,
        level: row.currentLevel,
        realtimeUpdatedAt: row.realtimeUpdatedAt?.toISOString() ?? null,
        realtimeIsOnline: row.realtimeIsOnline,
        realtimeIsInGame: row.realtimeIsInGame,
        realtimeCanJoin: row.realtimeCanJoin,
        realtimeLobbyState: row.realtimeLobbyState,
        realtimeCurrentState: row.realtimeCurrentState,
        realtimeCurrentStateAsText: row.realtimeCurrentStateAsText,
        derivedStatus: evalResult.status,
        shouldShow: evalResult.shouldShow,
        reason: evalResult.reason,
        ageMs: evalResult.ageMs
      };
    })
    .sort((a, b) => a.ign.localeCompare(b.ign));

  return (
    <main className="mx-auto w-full max-w-7xl space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Realtime Presence Diagnostics</CardTitle>
          <CardDescription>
            Raw provider fields and derived visibility decision for each tracked account.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-2 py-2">Player</th>
                <th className="px-2 py-2">Platform</th>
                <th className="px-2 py-2">Lvl</th>
                <th className="px-2 py-2">Updated</th>
                <th className="px-2 py-2">Age</th>
                <th className="px-2 py-2">isOnline</th>
                <th className="px-2 py-2">isInGame</th>
                <th className="px-2 py-2">canJoin</th>
                <th className="px-2 py-2">Lobby</th>
                <th className="px-2 py-2">Current State</th>
                <th className="px-2 py-2">State Text</th>
                <th className="px-2 py-2">Derived</th>
                <th className="px-2 py-2">Show</th>
                <th className="px-2 py-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-2 py-2">{row.ign}</td>
                  <td className="px-2 py-2">{platformLabel(row.platform)}</td>
                  <td className="px-2 py-2">{row.level ?? "-"}</td>
                  <td className="px-2 py-2">{row.realtimeUpdatedAt ? new Date(row.realtimeUpdatedAt).toLocaleString() : "-"}</td>
                  <td className="px-2 py-2">{msToAge(row.ageMs)}</td>
                  <td className="px-2 py-2">{row.realtimeIsOnline ?? "-"}</td>
                  <td className="px-2 py-2">{row.realtimeIsInGame ?? "-"}</td>
                  <td className="px-2 py-2">{row.realtimeCanJoin ?? "-"}</td>
                  <td className="px-2 py-2">{row.realtimeLobbyState ?? "-"}</td>
                  <td className="px-2 py-2">{row.realtimeCurrentState ?? "-"}</td>
                  <td className="px-2 py-2">{row.realtimeCurrentStateAsText ?? "-"}</td>
                  <td className="px-2 py-2 uppercase">{row.derivedStatus}</td>
                  <td className="px-2 py-2">{row.shouldShow ? "yes" : "no"}</td>
                  <td className="px-2 py-2">{row.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </main>
  );
}

