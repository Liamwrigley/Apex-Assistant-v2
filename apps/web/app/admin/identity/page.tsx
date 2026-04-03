import { listTrackedAccounts, unlinkTrackedAccount } from "@apex-assistant/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type TSearchParams = Promise<Record<string, string | string[] | undefined>>;

async function unlinkAction(formData: FormData): Promise<void> {
  "use server";
  const adminKey = process.env.ADMIN_UI_KEY;
  if (!adminKey) {
    throw new Error("ADMIN_UI_KEY is missing.");
  }
  const key = String(formData.get("key") ?? "");
  if (key !== adminKey) {
    throw new Error("Forbidden.");
  }
  const guildId = String(formData.get("guildId") ?? "");
  const trackedAccountId = String(formData.get("trackedAccountId") ?? "");
  if (!guildId || !trackedAccountId) {
    throw new Error("Missing guild/account id.");
  }
  await unlinkTrackedAccount({
    guildId,
    actorUserId: "admin-ui",
    trackedAccountId,
    reason: "manual_unlink_admin_ui"
  });
  revalidatePath("/admin/identity");
  redirect(`/admin/identity?key=${encodeURIComponent(key)}`);
}

export default async function IdentityAdminPage(props: {
  searchParams: TSearchParams;
}) {
  const searchParams = await props.searchParams;
  const adminKey = process.env.ADMIN_UI_KEY;
  if (!adminKey) {
    return <main className="p-6 text-sm">Set `ADMIN_UI_KEY` to enable this page.</main>;
  }
  const key = typeof searchParams.key === "string" ? searchParams.key : "";
  if (key !== adminKey) {
    return <main className="p-6 text-sm">Forbidden.</main>;
  }

  const guildId = process.env.DISCORD_GUILD_ID ?? "";
  const rows = await listTrackedAccounts(guildId || undefined);
  const grouped = rows.reduce(
    (acc, row) => {
      const groupKey = row.identityGroupId ?? `solo:${row.id}`;
      if (!acc[groupKey]) {
        acc[groupKey] = [];
      }
      acc[groupKey].push(row);
      return acc;
    },
    {} as Record<string, typeof rows>
  );
  const linkedGroups = Object.entries(grouped).filter(([, members]) => members.length > 1);

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Identity Link Repair</h1>
      <p className="text-muted-foreground text-sm">
        Hidden admin page. Unlink members when a crossplay identity was grouped incorrectly.
      </p>
      {linkedGroups.length === 0 ? (
        <p className="text-sm">No linked groups found.</p>
      ) : (
        linkedGroups.map(([groupId, members]) => (
          <section key={groupId} className="border-border/60 rounded-lg border">
            <div className="border-border/60 border-b bg-muted/40 px-3 py-2 text-sm font-medium">
              Group {groupId}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-xs">
                    <th className="px-2 py-2 font-medium">Player</th>
                    <th className="px-2 py-2 font-medium">Platform</th>
                    <th className="px-2 py-2 font-medium">UID</th>
                    <th className="px-2 py-2 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.id} className="border-border/60 border-b last:border-0">
                      <td className="px-2 py-2">{member.ign}</td>
                      <td className="px-2 py-2 uppercase">{member.platform}</td>
                      <td className="px-2 py-2 font-mono text-xs">{member.externalPlayerId ?? "-"}</td>
                      <td className="px-2 py-2 text-right">
                        <form action={unlinkAction}>
                          <input type="hidden" name="key" value={key} />
                          <input type="hidden" name="guildId" value={member.guildId} />
                          <input type="hidden" name="trackedAccountId" value={member.id} />
                          <button
                            type="submit"
                            className="rounded border border-rose-500/40 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/10"
                          >
                            Unlink
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </main>
  );
}

