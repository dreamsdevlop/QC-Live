create extension if not exists pgcrypto;

create table if not exists public.qc_live_channel_connections (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  platform text not null check (platform in ('youtube', 'twitch', 'facebook', 'custom')),
  display_name text not null,
  account_name text,
  account_id text,
  ingest_url text not null,
  encrypted_stream_key text not null,
  auth_mode text not null default 'manual' check (auth_mode in ('manual', 'oauth')),
  enabled boolean not null default true,
  last_tested_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists qc_live_channel_connections_owner_idx
  on public.qc_live_channel_connections (owner_key, created_at desc);

create or replace function public.qc_live_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists qc_live_channel_connections_updated_at
  on public.qc_live_channel_connections;
create trigger qc_live_channel_connections_updated_at
before update on public.qc_live_channel_connections
for each row execute function public.qc_live_set_updated_at();

alter table public.qc_live_channel_connections enable row level security;

-- The Next.js server uses the service role after authenticating the existing QC-Live session.
-- No client-side policy is granted, preventing accidental exposure of encrypted credentials.
drop policy if exists qc_live_no_direct_client_access
  on public.qc_live_channel_connections;
create policy qc_live_no_direct_client_access
  on public.qc_live_channel_connections
  for all
  to anon, authenticated
  using (false)
  with check (false);
