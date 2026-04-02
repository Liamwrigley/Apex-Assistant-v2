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
  source text not null default 'trn'
);

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

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  tracked_account_id uuid not null references tracked_accounts(id) on delete cascade,
  provider text not null default 'match_api',
  provider_match_id text not null,
  played_at timestamptz not null,
  mode text,
  placement integer,
  kills integer,
  assists integer,
  knocks integer,
  damage integer,
  survival_time_sec integer,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tracked_account_id, provider, provider_match_id)
);

create index if not exists idx_matches_account_played on matches (tracked_account_id, played_at desc);

create table if not exists match_participants (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  role text,
  name text,
  legend text,
  kills integer,
  damage integer,
  team_placement integer,
  raw_payload jsonb not null default '{}'::jsonb
);

create table if not exists ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  run_type text not null,
  guild_id text,
  tracked_account_id uuid references tracked_accounts(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  success boolean not null default false,
  status_code integer,
  error_message text,
  processed_items integer not null default 0
);

create index if not exists idx_ingestion_runs_provider_started on ingestion_runs (provider, started_at desc);

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
