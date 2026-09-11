-- QC Live: Supabase Auth ownership and channel-linking metadata.
-- Apply after 20260911235000_qc_live_channel_connections.sql.
-- Channel secrets remain server-only; the table intentionally has no direct client policy.

create table if not exists public.qc_live_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.qc_live_handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.qc_live_profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists qc_live_on_auth_user_created on auth.users;
create trigger qc_live_on_auth_user_created
after insert on auth.users
for each row execute function public.qc_live_handle_new_user();

alter table public.qc_live_channel_connections
  add column if not exists owner_id uuid references auth.users(id) on delete cascade,
  add column if not exists oauth_provider text check (oauth_provider in ('youtube', 'twitch', 'facebook', 'custom')),
  add column if not exists oauth_account_id text,
  add column if not exists oauth_scope text,
  add column if not exists encrypted_access_token text,
  add column if not exists encrypted_refresh_token text,
  add column if not exists token_expires_at timestamptz;

create index if not exists qc_live_channel_connections_owner_id_idx
  on public.qc_live_channel_connections (owner_id, created_at desc);

-- Existing QC-Live records use owner_key and continue to work through the server adapter.
-- New Supabase Auth records should always set owner_id = auth.uid().

alter table public.qc_live_profiles enable row level security;
drop policy if exists qc_live_profiles_select_own on public.qc_live_profiles;
create policy qc_live_profiles_select_own
  on public.qc_live_profiles for select to authenticated
  using (id = auth.uid());
drop policy if exists qc_live_profiles_update_own on public.qc_live_profiles;
create policy qc_live_profiles_update_own
  on public.qc_live_profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Do not grant direct CRUD over channel rows: encrypted keys and OAuth tokens must never
-- be readable by a browser. Use the QC-Live server routes or a reviewed Edge Function.
alter table public.qc_live_channel_connections enable row level security;
drop policy if exists qc_live_no_direct_client_access on public.qc_live_channel_connections;
drop policy if exists qc_live_channels_owner_access on public.qc_live_channel_connections;
create policy qc_live_no_direct_client_access
  on public.qc_live_channel_connections for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on public.qc_live_channel_connections from anon, authenticated;
revoke all on public.qc_live_profiles from anon;
grant select, update on public.qc_live_profiles to authenticated;
