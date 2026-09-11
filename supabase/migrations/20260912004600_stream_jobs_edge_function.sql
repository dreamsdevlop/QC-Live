-- QC Live stream-job control plane for Supabase Edge Functions.
-- This manages desired state and worker events; it does not run FFmpeg.

create table if not exists public.qc_live_stream_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  source_url text,
  source_object_key text,
  status text not null default 'draft' check (status in ('draft', 'queued', 'starting', 'running', 'stopping', 'stopped', 'error')),
  desired_state text not null default 'stopped' check (desired_state in ('stopped', 'running')),
  quality text not null default '720p' check (quality in ('720p', '1080p')),
  loop_enabled boolean not null default true,
  last_error text,
  last_heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_url is not null or source_object_key is not null)
);

create table if not exists public.qc_live_stream_destinations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.qc_live_stream_jobs(id) on delete cascade,
  channel_id uuid not null references public.qc_live_channel_connections(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'starting', 'running', 'stopping', 'stopped', 'error')),
  remote_stream_id text,
  last_error text,
  last_heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, channel_id)
);

create table if not exists public.qc_live_stream_job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.qc_live_stream_jobs(id) on delete cascade,
  event_type text not null check (event_type in ('job_created', 'job_start_requested', 'job_stop_requested', 'worker_heartbeat', 'worker_error', 'job_finished')),
  payload jsonb not null default '{}'::jsonb,
  claimed_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists qc_live_stream_jobs_owner_idx on public.qc_live_stream_jobs(owner_id, created_at desc);
create index if not exists qc_live_stream_destinations_job_idx on public.qc_live_stream_destinations(job_id, status);
create index if not exists qc_live_stream_job_events_queue_idx on public.qc_live_stream_job_events(processed_at, claimed_at, created_at);

create or replace function public.qc_live_job_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists qc_live_stream_jobs_updated_at on public.qc_live_stream_jobs;
create trigger qc_live_stream_jobs_updated_at before update on public.qc_live_stream_jobs
for each row execute function public.qc_live_job_touch_updated_at();

drop trigger if exists qc_live_stream_destinations_updated_at on public.qc_live_stream_destinations;
create trigger qc_live_stream_destinations_updated_at before update on public.qc_live_stream_destinations
for each row execute function public.qc_live_job_touch_updated_at();

create or replace function public.qc_live_enqueue_job_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.qc_live_stream_job_events(job_id, event_type, payload)
    values (new.id, 'job_created', jsonb_build_object('status', new.status, 'desired_state', new.desired_state));
  elsif new.desired_state is distinct from old.desired_state then
    insert into public.qc_live_stream_job_events(job_id, event_type, payload)
    values (new.id, case when new.desired_state = 'running' then 'job_start_requested' else 'job_stop_requested' end,
            jsonb_build_object('desired_state', new.desired_state));
  end if;
  return new;
end;
$$;

drop trigger if exists qc_live_stream_jobs_enqueue on public.qc_live_stream_jobs;
create trigger qc_live_stream_jobs_enqueue after insert or update of desired_state on public.qc_live_stream_jobs
for each row execute function public.qc_live_enqueue_job_event();

alter table public.qc_live_stream_jobs enable row level security;
alter table public.qc_live_stream_destinations enable row level security;
alter table public.qc_live_stream_job_events enable row level security;

drop policy if exists qc_live_jobs_owner_select on public.qc_live_stream_jobs;
create policy qc_live_jobs_owner_select on public.qc_live_stream_jobs for select to authenticated using (owner_id = auth.uid());
drop policy if exists qc_live_jobs_owner_insert on public.qc_live_stream_jobs;
create policy qc_live_jobs_owner_insert on public.qc_live_stream_jobs for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists qc_live_jobs_owner_update on public.qc_live_stream_jobs;
create policy qc_live_jobs_owner_update on public.qc_live_stream_jobs for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists qc_live_destinations_owner_select on public.qc_live_stream_destinations;
create policy qc_live_destinations_owner_select on public.qc_live_stream_destinations for select to authenticated using (exists (select 1 from public.qc_live_stream_jobs j where j.id = job_id and j.owner_id = auth.uid()));

drop policy if exists qc_live_events_owner_select on public.qc_live_stream_job_events;
create policy qc_live_events_owner_select on public.qc_live_stream_job_events for select to authenticated using (exists (select 1 from public.qc_live_stream_jobs j where j.id = job_id and j.owner_id = auth.uid()));

-- Writes involving destination rows, event claiming, and channel secrets are server-only.
revoke all on public.qc_live_stream_destinations from anon, authenticated;
revoke all on public.qc_live_stream_job_events from anon, authenticated;
