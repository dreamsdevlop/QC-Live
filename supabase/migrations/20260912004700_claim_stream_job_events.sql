create or replace function public.qc_live_claim_stream_job_events(p_limit integer default 10)
returns setof public.qc_live_stream_job_events
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimed as (
    select id
    from public.qc_live_stream_job_events
    where processed_at is null
      and claimed_at is null
    order by created_at
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  )
  update public.qc_live_stream_job_events e
  set claimed_at = now()
  from claimed
  where e.id = claimed.id
  returning e.*;
end;
$$;

grant execute on function public.qc_live_claim_stream_job_events(integer) to service_role;
