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
create index if not exists idx_tracked_accounts_external_player_id on tracked_accounts (external_player_id);
create index if not exists idx_tracked_accounts_claim on tracked_accounts (is_active, ingest_claimed_until, last_checked_at);

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
