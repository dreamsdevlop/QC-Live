import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-worker-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Action = 'create' | 'start' | 'stop' | 'heartbeat' | 'claim_events' | 'ack_event';

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}

function adminClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function requireUser(request: Request) {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) throw new Error('Missing bearer token');
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(auth.slice(7));
  if (error || !data.user) throw new Error('Invalid access token');
  return data.user;
}

function requireWorker(request: Request) {
  const expected = Deno.env.get('WORKER_SHARED_SECRET');
  const actual = request.headers.get('x-worker-secret');
  if (!expected || !actual || actual !== expected) throw new Error('Invalid worker secret');
}

async function createJob(db: ReturnType<typeof adminClient>, userId: string, body: any) {
  const { title, sourceUrl = null, sourceObjectKey = null, channelIds, quality = '720p', loopEnabled = true } = body;
  if (typeof title !== 'string' || !title.trim()) throw new Error('title is required');
  if (!sourceUrl && !sourceObjectKey) throw new Error('sourceUrl or sourceObjectKey is required');
  if (!Array.isArray(channelIds) || channelIds.length === 0 || channelIds.length > 50) throw new Error('channelIds must contain 1 to 50 channels');
  if (!['720p', '1080p'].includes(quality)) throw new Error('quality must be 720p or 1080p');

  const uniqueIds = [...new Set(channelIds.map(String))];
  const { data: channels, error: channelError } = await db.from('qc_live_channel_connections').select('id, owner_id, enabled').in('id', uniqueIds).eq('owner_id', userId).eq('enabled', true);
  if (channelError) throw channelError;
  if (!channels || channels.length !== uniqueIds.length) throw new Error('One or more channels are missing, disabled, or not owned by this user');

  const { data: job, error: jobError } = await db.from('qc_live_stream_jobs').insert({ owner_id: userId, title: title.trim(), source_url: sourceUrl, source_object_key: sourceObjectKey, quality, loop_enabled: Boolean(loopEnabled), status: 'queued', desired_state: 'stopped' }).select('id,title,status,desired_state,quality,loop_enabled,created_at').single();
  if (jobError) throw jobError;
  const { error: destinationError } = await db.from('qc_live_stream_destinations').insert(uniqueIds.map((channelId) => ({ job_id: job.id, channel_id: channelId })));
  if (destinationError) {
    await db.from('qc_live_stream_jobs').delete().eq('id', job.id);
    throw destinationError;
  }
  return job;
}

async function setDesiredState(db: ReturnType<typeof adminClient>, userId: string, jobId: string, desiredState: 'running' | 'stopped') {
  const { data, error } = await db.from('qc_live_stream_jobs').update({ desired_state: desiredState, status: desiredState === 'running' ? 'starting' : 'stopping', last_error: null }).eq('id', jobId).eq('owner_id', userId).select('id,status,desired_state,updated_at').single();
  if (error || !data) throw error || new Error('Stream job not found');
  return data;
}

async function heartbeat(db: ReturnType<typeof adminClient>, body: any) {
  const { jobId, destinationId, status, error: lastError = null, remoteStreamId = null } = body;
  if (!jobId || !destinationId || !['starting', 'running', 'stopping', 'stopped', 'error'].includes(status)) throw new Error('jobId, destinationId, and valid status are required');
  const { data: destination, error } = await db.from('qc_live_stream_destinations').update({ status, last_error: lastError, remote_stream_id: remoteStreamId, last_heartbeat_at: new Date().toISOString() }).eq('id', destinationId).eq('job_id', jobId).select('id,status').single();
  if (error || !destination) throw error || new Error('Destination not found');

  const { data: rows } = await db.from('qc_live_stream_destinations').select('status').eq('job_id', jobId);
  const statuses = (rows || []).map((row) => row.status);
  const aggregate = statuses.length && statuses.every((value) => value === 'running') ? 'running' : statuses.some((value) => value === 'running' || value === 'starting') ? 'starting' : statuses.some((value) => value === 'error') ? 'error' : 'stopped';
  await db.from('qc_live_stream_jobs').update({ status: aggregate, last_heartbeat_at: new Date().toISOString(), last_error: lastError }).eq('id', jobId);
  await db.from('qc_live_stream_job_events').insert({ job_id: jobId, event_type: status === 'error' ? 'worker_error' : 'worker_heartbeat', payload: body, processed_at: new Date().toISOString() });
  return destination;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'POST required' }, 405);
  const db = adminClient();
  try {
    const body = await request.json();
    const action = body.action as Action;
    if (!['create', 'start', 'stop', 'heartbeat', 'claim_events', 'ack_event'].includes(action)) return response({ error: 'Unknown action' }, 400);

    if (action === 'heartbeat' || action === 'claim_events' || action === 'ack_event') {
      requireWorker(request);
      if (action === 'heartbeat') return response({ destination: await heartbeat(db, body) });
      if (action === 'claim_events') {
        const { data, error } = await db.rpc('qc_live_claim_stream_job_events', { p_limit: Math.min(Number(body.limit) || 10, 100) });
        if (error) throw error;
        return response({ events: data || [] });
      }
      const { eventId } = body;
      if (!eventId) return response({ error: 'eventId is required' }, 400);
      const { error } = await db.from('qc_live_stream_job_events').update({ processed_at: new Date().toISOString() }).eq('id', eventId);
      if (error) throw error;
      return response({ ok: true });
    }

    const user = await requireUser(request);
    if (action === 'create') return response({ job: await createJob(db, user.id, body) }, 201);
    if (!body.jobId) return response({ error: 'jobId is required' }, 400);
    if (action === 'start') return response({ job: await setDesiredState(db, user.id, body.jobId, 'running') });
    return response({ job: await setDesiredState(db, user.id, body.jobId, 'stopped') });
  } catch (error) {
    console.error('stream-jobs error', error);
    return response({ error: error instanceof Error ? error.message : 'Unexpected error' }, 400);
  }
});
