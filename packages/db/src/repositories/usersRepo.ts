import { pool } from "../client.js";

export async function upsertUser(input: {
  discordUserId: string;
  displayName?: string | null;
}): Promise<void> {
  await pool.query(
    `
    insert into users (discord_user_id, display_name)
    values ($1, $2)
    on conflict (discord_user_id)
    do update set
      display_name = coalesce(excluded.display_name, users.display_name),
      updated_at = now()
    `,
    [input.discordUserId, input.displayName ?? null]
  );
}
