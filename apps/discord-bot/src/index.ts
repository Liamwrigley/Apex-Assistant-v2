import {
  AppError,
  SlidingWindowLimiter,
  assertOwnerOrAdmin,
  getStatsProvider,
  type TPlatform,
} from "@apex-assistant/core";
import {
  addTrackedAccount,
  countTrackedByGuild,
  countTrackedByOwner,
  listTrackedAccountsByOwner,
  pool,
  searchTrackedAccountsByOwner,
  upsertUser,
  openVoiceInterval,
  closeVoiceInterval,
} from "@apex-assistant/db";
import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  Client,
  DiscordAPIError,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from "discord.js";
import dotenv from "dotenv";
import { createServer } from "node:http";
import { resolve } from "node:path";

dotenv.config({ path: resolve(process.cwd(), "../../.env") });

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId) {
  throw new Error("Missing DISCORD_TOKEN or DISCORD_CLIENT_ID");
}

const limiter = new SlidingWindowLimiter(
  Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000),
  Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 60),
);
/** Railway / PaaS set PORT; local dev can use DISCORD_BOT_PORT. */
const healthPort = Number(
  process.env.PORT ?? process.env.DISCORD_BOT_PORT ?? 4300,
);
const statsProvider = getStatsProvider();
const selectCache = new Map<
  string,
  {
    guildId: string;
    ownerUserId: string;
    expiresAt: number;
    options: Array<{
      ign: string;
      platform: TPlatform;
      label: string;
      externalPlayerId?: string | null;
    }>;
  }
>();

/**
 * Slash command access (guild context):
 * - /track add — any member; adds to their own list (per-user + per-guild caps).
 * - /track list — any member; shows only that member’s tracked accounts.
 * - /track remove — account owner OR server Administrator; removes one tracked row by id.
 * - /dashboard — any member; posts the public web dashboard URL.
 */
const DEFAULT_DASHBOARD_URL = "https://apex-assistant.xyz";

const commands = [
  new SlashCommandBuilder()
    .setName("track")
    .setDescription("Manage tracked Apex accounts.")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Find and track your account.")
        .addStringOption((opt) =>
          opt
            .setName("query")
            .setDescription("Name to search")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("platform")
            .setDescription("Platform (PC, PS4, X1)")
            .setRequired(false)
            .addChoices(
              { name: "PC (Origin/Steam)", value: "origin" },
              { name: "PS4 (PlayStation)", value: "psn" },
              { name: "X1 (Xbox)", value: "xbl" },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("add-uid")
        .setDescription(
          "Track an account directly by provider UUID (auto-detect platform).",
        )
        .addStringOption((opt) =>
          opt
            .setName("uid")
            .setDescription("Provider UUID (external player id)")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove one of your tracked accounts.")
        .addStringOption((opt) =>
          opt
            .setName("id")
            .setDescription("Tracked account id")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List your tracked accounts."),
    ),
  new SlashCommandBuilder()
    .setName("dashboard")
    .setDescription("Get the link to the Apex Assistant web dashboard."),
].map((command) => command.toJSON());

/**
 * Guild commands apply immediately. Global commands can take up to ~1 hour to show in clients,
 * which is why we prefer guild registration whenever we know the guild id(s).
 */
async function syncSlashCommandsWithDiscord(): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(token as string);
  const id = clientId as string;
  const singleGuild = guildId?.trim();

  if (singleGuild) {
    await rest.put(Routes.applicationCommands(id), { body: [] });
    await rest.put(Routes.applicationGuildCommands(id, singleGuild), {
      body: commands,
    });
    console.log(`[discord] Slash commands synced for guild ${singleGuild}.`);
    return;
  }

  await rest.put(Routes.applicationCommands(id), { body: [] });
  let count = 0;
  for (const g of client.guilds.cache.values()) {
    await rest.put(Routes.applicationGuildCommands(id, g.id), {
      body: commands,
    });
    count += 1;
  }
  console.log(
    `[discord] Slash commands synced in ${count} guild(s) (guild-scoped, immediate).`,
  );
}

async function handleTrack(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const effectiveGuildId = interaction.guildId ?? guildId ?? "dm";
  const userId = interaction.user.id;
  limiter.assertAllowed(`${effectiveGuildId}:${userId}:track:${subcommand}`);

  if (subcommand === "add" || subcommand === "add-uid") {
    await interaction.deferReply({ ephemeral: true });
    const platform = interaction.options.getString(
      "platform",
      false,
    ) as TPlatform | null;
    const query =
      subcommand === "add"
        ? interaction.options.getString("query", true)
        : null;
    const uid =
      subcommand === "add-uid"
        ? interaction.options.getString("uid", true).trim()
        : null;

    const maxByUser = Number(process.env.MAX_TRACKED_ACCOUNTS_PER_USER ?? 5);
    const maxByGuild = Number(
      process.env.MAX_TRACKED_ACCOUNTS_PER_GUILD ?? 100,
    );
    const ownerCount = await countTrackedByOwner(effectiveGuildId, userId);
    const guildCount = await countTrackedByGuild(effectiveGuildId);

    if (ownerCount >= maxByUser) {
      throw new AppError(
        "You reached your tracked account limit.",
        400,
        "USER_LIMIT",
      );
    }
    if (guildCount >= maxByGuild) {
      throw new AppError("Guild tracking limit reached.", 400, "GUILD_LIMIT");
    }

    if (subcommand === "add-uid") {
      if (!uid) {
        throw new AppError(
          "uid is required for /track add-uid.",
          400,
          "UID_REQUIRED",
        );
      }

      const probePlatforms: TPlatform[] = platform
        ? [platform]
        : ["origin", "psn", "xbl"];
      let resolvedPlatform: TPlatform | null = null;
      let resolvedIgn: string | null = null;
      for (const probe of probePlatforms) {
        try {
          const rank = await statsProvider.getRank({
            ign: uid,
            platform: probe,
            externalPlayerId: uid,
          });
          resolvedPlatform = probe;
          resolvedIgn = (rank.playerName ?? "").trim() || uid;
          break;
        } catch {
          // Probe next platform
        }
      }
      if (!resolvedPlatform || !resolvedIgn) {
        throw new AppError(
          "Could not resolve this uid on PC/PS4/X1.",
          404,
          "UID_NOT_FOUND",
        );
      }

      await upsertUser({
        discordUserId: userId,
        displayName: interaction.user.globalName ?? interaction.user.username,
      });
      const created = await addTrackedAccount({
        guildId: effectiveGuildId,
        ownerUserId: userId,
        ign: resolvedIgn,
        platform: resolvedPlatform,
        externalPlayerId: uid,
        externalSource: statsProvider.name,
      });
      await interaction.editReply(
        `Now tracking ${created.ign} (${created.platform}) via uid \`${uid}\` with id \`${created.id}\`.`,
      );
      return;
    }

    const candidates = await statsProvider.searchPlayers({
      query: query ?? "",
      platform: platform ?? undefined,
    });

    if (candidates.length === 0) {
      await interaction.editReply({
        content:
          "No candidates found. Try exact name or specify platform.",
        components: [],
      });
      return;
    }

    if (candidates.length === 1) {
      const candidate = candidates[0];
      await upsertUser({
        discordUserId: userId,
        displayName: interaction.user.globalName ?? interaction.user.username,
      });
      const created = await addTrackedAccount({
        guildId: effectiveGuildId,
        ownerUserId: userId,
        ign: candidate.handle,
        platform: candidate.platform,
        externalPlayerId: candidate.externalPlayerId ?? null,
        externalSource: statsProvider.name,
      });
      await interaction.editReply(
        `Now tracking ${created.ign} (${created.platform}) with id \`${created.id}\`.`,
      );
      return;
    }

    const selectId = `track-add:${interaction.id}`;
    selectCache.set(selectId, {
      guildId: effectiveGuildId,
      ownerUserId: userId,
      expiresAt: Date.now() + 5 * 60 * 1000,
      options: candidates.map((candidate) => ({
        ign: candidate.handle,
        platform: candidate.platform,
        label: `${candidate.displayName} (${candidate.platform})`,
        externalPlayerId: candidate.externalPlayerId ?? null,
      })),
    });

    const menu = new StringSelectMenuBuilder()
      .setCustomId(selectId)
      .setPlaceholder("Select the account to track")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        candidates.slice(0, 25).map((candidate, index) => ({
          label: `${candidate.displayName}`.slice(0, 90),
          description: `${candidate.platform} | ${candidate.handle}`.slice(
            0,
            90,
          ),
          value: String(index),
        })),
      );
    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      menu,
    );

    await interaction.editReply({
      content: "I found multiple matches. Pick the correct account:",
      components: [row],
    });
    return;
  }

  if (subcommand === "remove") {
    const id = interaction.options.getString("id", true);
    const existing = await pool.query<{ ownerUserId: string }>(
      'select owner_user_id as "ownerUserId" from tracked_accounts where id = $1 and guild_id = $2',
      [id, effectiveGuildId],
    );
    if (existing.rowCount === 0) {
      throw new AppError("Tracked account not found.", 404, "NOT_FOUND");
    }

    assertOwnerOrAdmin({
      ownerUserId: existing.rows[0].ownerUserId,
      requesterUserId: userId,
      isAdmin: interaction.memberPermissions?.has("Administrator") ?? false,
    });

    await pool.query("delete from tracked_accounts where id = $1", [id]);
    await interaction.reply(`Removed tracked account \`${id}\`.`);
    return;
  }

  const rows = await listTrackedAccountsByOwner(effectiveGuildId, userId);
  const message =
    rows.length === 0
      ? "You are not tracking any accounts yet."
      : rows
          .map(
            (row) =>
              `- \`${row.id}\` ${row.ign} (${row.platform})` +
              (row.externalPlayerId ? ` uid:${row.externalPlayerId}` : ""),
          )
          .join("\n");
  await interaction.reply(message);
}

async function handleDashboard(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const effectiveGuildId = interaction.guildId ?? guildId ?? "dm";
  limiter.assertAllowed(`${effectiveGuildId}:${interaction.user.id}:dashboard`);
  const raw = (process.env.DASHBOARD_URL ?? DEFAULT_DASHBOARD_URL).trim();
  const url = raw.replace(/\/$/, "");
  await interaction.reply({
    content: `**Apex Assistant dashboard**\n${url}`,
    allowedMentions: { parse: [] },
  });
}

async function handleTrackAddSelection(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const cached = selectCache.get(interaction.customId);
  if (!cached || cached.expiresAt < Date.now()) {
    await interaction.update({
      content: "This selection expired. Run `/track add` again.",
      components: [],
    });
    return;
  }

  if (cached.ownerUserId !== interaction.user.id) {
    await interaction.reply({
      content: "Only the original requester can use this selector.",
      ephemeral: true,
    });
    return;
  }

  const index = Number(interaction.values[0]);
  const selected = cached.options[index];
  if (!selected) {
    await interaction.update({
      content: "Invalid selection. Run `/track add` again.",
      components: [],
    });
    return;
  }

  const maxByUser = Number(process.env.MAX_TRACKED_ACCOUNTS_PER_USER ?? 5);
  const maxByGuild = Number(process.env.MAX_TRACKED_ACCOUNTS_PER_GUILD ?? 100);
  const ownerCount = await countTrackedByOwner(
    cached.guildId,
    interaction.user.id,
  );
  const guildCount = await countTrackedByGuild(cached.guildId);
  if (ownerCount >= maxByUser) {
    throw new AppError(
      "You reached your tracked account limit.",
      400,
      "USER_LIMIT",
    );
  }
  if (guildCount >= maxByGuild) {
    throw new AppError("Guild tracking limit reached.", 400, "GUILD_LIMIT");
  }

  const created = await addTrackedAccount({
    guildId: cached.guildId,
    ownerUserId: interaction.user.id,
    ign: selected.ign,
    platform: selected.platform,
    externalPlayerId: selected.externalPlayerId ?? null,
    externalSource: statsProvider.name,
  });
  await upsertUser({
    discordUserId: interaction.user.id,
    displayName: interaction.user.globalName ?? interaction.user.username,
  });
  selectCache.delete(interaction.customId);
  await interaction.update({
    content: `Now tracking ${created.ign} (${created.platform}) with id \`${created.id}\`.`,
    components: [],
  });
}

async function handleTrackRemoveAutocomplete(
  interaction: AutocompleteInteraction,
): Promise<void> {
  if (
    interaction.commandName !== "track" ||
    interaction.options.getSubcommand() !== "remove"
  ) {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused(true);
  const effectiveGuildId = interaction.guildId ?? guildId ?? "dm";
  const rows = await searchTrackedAccountsByOwner({
    guildId: effectiveGuildId,
    ownerUserId: interaction.user.id,
    query: focused.value,
    limit: 25,
  });
  await interaction.respond(
    rows.map((row) => ({
      name: `${row.ign} (${row.platform})`,
      value: row.id,
    })),
  );
}

const voiceTrackingEnabled =
  (process.env.DISCORD_VOICE_TRACKING_ENABLED ?? "true").toLowerCase() !== "false";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    ...(voiceTrackingEnabled ? [GatewayIntentBits.GuildVoiceStates] : []),
  ],
});

function isUnknownInteractionError(error: unknown): boolean {
  return error instanceof DiscordAPIError && error.code === 10062;
}

async function safeInteractionErrorResponse(
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction,
  message: string,
): Promise<void> {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({
        content: `Error: ${message}`,
        ephemeral: true,
      });
      return;
    }
    await interaction.reply({ content: `Error: ${message}`, ephemeral: true });
  } catch (error) {
    if (!isUnknownInteractionError(error)) {
      throw error;
    }
    console.warn("Dropped stale interaction response (10062).");
  }
}

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      await handleTrackRemoveAutocomplete(interaction);
      return;
    }

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId.startsWith("track-add:")
    ) {
      await handleTrackAddSelection(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    if (interaction.commandName === "track") {
      await handleTrack(interaction);
      return;
    }
    if (interaction.commandName === "dashboard") {
      await handleDashboard(interaction);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (interaction.isAutocomplete()) {
      await interaction.respond([]);
      return;
    }
    if (interaction.isStringSelectMenu()) {
      await safeInteractionErrorResponse(interaction, message);
      return;
    }
    if (interaction.isChatInputCommand()) {
      await safeInteractionErrorResponse(interaction, message);
    }
  }
});

client.on("error", (error) => {
  console.error("Discord client error event:", error);
});

client.once("ready", () => {
  void syncSlashCommandsWithDiscord().catch((error: unknown) => {
    console.error("[discord] Slash command sync failed", error);
  });
});

if (voiceTrackingEnabled) {
  client.on("voiceStateUpdate", (oldState, newState) => {
    const gId = newState.guild.id;
    const userId = newState.id;
    const oldChannel = oldState.channelId;
    const newChannel = newState.channelId;

    if (oldChannel === newChannel) return;

    void (async () => {
      try {
        if (oldChannel && !newChannel) {
          await closeVoiceInterval(gId, userId);
        } else if (!oldChannel && newChannel) {
          await openVoiceInterval({ guildId: gId, discordUserId: userId, channelId: newChannel });
        } else if (oldChannel && newChannel) {
          await closeVoiceInterval(gId, userId);
          await openVoiceInterval({ guildId: gId, discordUserId: userId, channelId: newChannel });
        }
      } catch (error) {
        console.error("[discord] Voice interval tracking error:", error);
      }
    })();
  });
  console.log("[discord] Voice state tracking enabled.");
}

client.on("guildCreate", (guild) => {
  if (guildId?.trim()) {
    return;
  }
  const rest = new REST({ version: "10" }).setToken(token as string);
  void rest
    .put(Routes.applicationGuildCommands(clientId as string, guild.id), {
      body: commands,
    })
    .then(() =>
      console.log(`[discord] Slash commands synced for new guild ${guild.id}.`),
    )
    .catch((error: unknown) =>
      console.error("[discord] Slash sync for new guild failed", error),
    );
});

void client.login(token).catch((error: unknown) => {
  console.error("Discord boot failed", error);
  process.exit(1);
});

const healthPath = (url: string | undefined) => (url ?? "").split("?")[0];

createServer((req, res) => {
  const path = healthPath(req.url);
  if (path === "/health" || path === "/health/") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "discord-bot" }));
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: false }));
}).listen(healthPort, "0.0.0.0", () => {
  console.log(`Discord health endpoint listening on 0.0.0.0:${healthPort}`);
});
