create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  discord_user_id text unique not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tracked_accounts (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  owner_user_id text not null,
  ign text not null,
  platform text not null check (platform in ('origin', 'psn', 'xbl')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_checked_at timestamptz,
  ingest_claimed_until timestamptz,
  ingest_claimed_by text,
  unique (guild_id, owner_user_id, ign, platform)
);

create index if not exists idx_tracked_accounts_guild on tracked_accounts (guild_id);
alter table tracked_accounts add column if not exists external_player_id text;
alter table tracked_accounts add column if not exists external_source text;
alter table tracked_accounts add column if not exists ingest_claimed_until timestamptz;
alter table tracked_accounts add column if not exists ingest_claimed_by text;
alter table tracked_accounts add column if not exists current_level integer;
alter table tracked_accounts add column if not exists current_rank_name text;
alter table tracked_accounts add column if not exists current_rank_division text;
alter table tracked_accounts add column if not exists current_rank_icon_url text;
alter table tracked_accounts add column if not exists career_kills integer;
alter table tracked_accounts add column if not exists career_damage integer;
alter table tracked_accounts add column if not exists career_wins integer;
alter table tracked_accounts add column if not exists identity_group_id uuid;
alter table tracked_accounts add column if not exists realtime_lobby_state text;
alter table tracked_accounts add column if not exists realtime_is_online integer;
alter table tracked_accounts add column if not exists realtime_is_in_game integer;
alter table tracked_accounts add column if not exists realtime_can_join integer;
alter table tracked_accounts add column if not exists realtime_party_full integer;
alter table tracked_accounts add column if not exists realtime_selected_legend text;
alter table tracked_accounts add column if not exists realtime_current_state text;
alter table tracked_accounts add column if not exists realtime_current_state_as_text text;
alter table tracked_accounts add column if not exists realtime_current_state_since_timestamp bigint;
alter table tracked_accounts add column if not exists realtime_updated_at timestamptz;
create index if not exists idx_tracked_accounts_external_player_id on tracked_accounts (external_player_id);
create index if not exists idx_tracked_accounts_identity_group_id on tracked_accounts (identity_group_id);
create index if not exists idx_tracked_accounts_claim on tracked_accounts (is_active, ingest_claimed_until, last_checked_at);
create unique index if not exists uq_tracked_accounts_external_unique
  on tracked_accounts (guild_id, platform, external_source, external_player_id)
  where external_player_id is not null and external_source is not null;

create table if not exists rank_snapshots (
  id uuid primary key default gen_random_uuid(),
  tracked_account_id uuid not null references tracked_accounts(id) on delete cascade,
  captured_at timestamptz not null default now(),
  rank_score integer not null,
  rank_name text not null,
  rank_division text,
  icon_url text,
  source text not null default 'apexlegendsapi'
);

alter table rank_snapshots add column if not exists ranked_map_code text;
alter table rank_snapshots add column if not exists ranked_map_name text;

create index if not exists idx_rank_snapshots_account_captured on rank_snapshots (tracked_account_id, captured_at desc);

create table if not exists player_stat_snapshots (
  id uuid primary key default gen_random_uuid(),
  tracked_account_id uuid not null references tracked_accounts(id) on delete cascade,
  captured_at timestamptz not null default now(),
  current_level integer,
  career_kills integer,
  career_damage integer,
  career_wins integer
);

create index if not exists idx_player_stat_snapshots_account_captured
  on player_stat_snapshots (tracked_account_id, captured_at desc);

-- Removed: matches, match_participants, ingestion_runs tables (no longer used).
-- Run these manually on existing databases to clean up:
-- DROP TABLE IF EXISTS match_participants CASCADE;
-- DROP TABLE IF EXISTS matches CASCADE;
-- DROP TABLE IF EXISTS ingestion_runs CASCADE;

create table if not exists identity_link_events (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null,
  actor_user_id text not null,
  event_type text not null check (event_type in ('auto_link', 'manual_link', 'manual_unlink')),
  tracked_account_id uuid not null references tracked_accounts(id) on delete cascade,
  peer_tracked_account_id uuid references tracked_accounts(id) on delete set null,
  old_group_id uuid,
  new_group_id uuid,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_identity_link_events_account_created
  on identity_link_events (tracked_account_id, created_at desc);

create table if not exists play_sessions (
  id uuid primary key default gen_random_uuid(),
  tracked_account_id uuid not null references tracked_accounts(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  opening_rank_score integer,
  latest_rank_score integer,
  opening_rank_name text,
  opening_rank_division text,
  opening_rank_icon_url text,
  latest_rank_name text,
  latest_rank_division text,
  latest_rank_icon_url text
);

alter table play_sessions add column if not exists opening_rank_name text;
alter table play_sessions add column if not exists opening_rank_division text;
alter table play_sessions add column if not exists opening_rank_icon_url text;
alter table play_sessions add column if not exists latest_rank_name text;
alter table play_sessions add column if not exists latest_rank_division text;
alter table play_sessions add column if not exists latest_rank_icon_url text;

create index if not exists idx_play_sessions_account_started
  on play_sessions (tracked_account_id, started_at desc);

create index if not exists idx_play_sessions_ended
  on play_sessions (ended_at desc);

create unique index if not exists uq_play_sessions_one_open_per_account
  on play_sessions (tracked_account_id)
  where ended_at is null;

create table if not exists play_session_legends (
  id uuid primary key default gen_random_uuid(),
  play_session_id uuid not null references play_sessions(id) on delete cascade,
  legend text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  seen_polls integer not null default 1,
  unique (play_session_id, legend)
);

create index if not exists idx_play_session_legends_session
  on play_session_legends (play_session_id);

create table if not exists presence_snapshots (
  id uuid primary key default gen_random_uuid(),
  tracked_account_id uuid not null references tracked_accounts(id) on delete cascade,
  captured_at timestamptz not null default now(),
  selected_legend text,
  is_in_game boolean not null default false,
  lobby_state text,
  current_state text,
  current_state_as_text text,
  derived_status text not null default 'offline'
);

create index if not exists idx_presence_snapshots_account_captured
  on presence_snapshots (tracked_account_id, captured_at desc);

create table if not exists inferred_game_segments (
  id uuid primary key default gen_random_uuid(),
  play_session_id uuid not null references play_sessions(id) on delete cascade,
  tracked_account_id uuid not null references tracked_accounts(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  legend_assumed text,
  opening_rank_score integer,
  closing_rank_score integer,
  rp_delta integer,
  confidence text not null default 'low',
  merge_risk boolean not null default false,
  trigger_signals jsonb not null default '{}'::jsonb
);

alter table inferred_game_segments add column if not exists opening_rank_name text;
alter table inferred_game_segments add column if not exists opening_rank_division text;
alter table inferred_game_segments add column if not exists closing_rank_name text;
alter table inferred_game_segments add column if not exists closing_rank_division text;
alter table inferred_game_segments add column if not exists ranked_map_code_open text;
alter table inferred_game_segments add column if not exists ranked_map_name_open text;
alter table inferred_game_segments add column if not exists ranked_map_code_close text;
alter table inferred_game_segments add column if not exists ranked_map_name_close text;

create index if not exists idx_inferred_game_segments_session
  on inferred_game_segments (play_session_id, started_at desc);

create index if not exists idx_inferred_game_segments_account
  on inferred_game_segments (tracked_account_id, started_at desc);

create unique index if not exists uq_inferred_game_segments_one_open_per_account
  on inferred_game_segments (tracked_account_id)
  where ended_at is null;
