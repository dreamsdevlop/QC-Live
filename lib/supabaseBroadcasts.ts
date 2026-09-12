import { getChannelDestination } from './supabaseChannels';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const workerUrl = process.env.MEDIA_WORKER_URL?.replace(/\/$/, '');
const workerToken = process.env.MEDIA_WORKER_TOKEN;

export type BroadcastStatus = 'draft' | 'queued' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

async function request(path: string, init: RequestInit = {}) {
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase service role is not configured');
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`Supabase request failed (${response.status}): ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

export function isBroadcastBackendConfigured() {
  return Boolean(supabaseUrl && serviceRoleKey);
}

export async function createBroadcast(ownerKey: string, input: {
  title: string;
  sourcePath?: string;
  sourceUrl?: string;
  quality: '720p' | '1080p';
  loopEnabled: boolean;
  channelIds: string[];
}) {
  if (!input.sourcePath && !input.sourceUrl) throw new Error('A source video is required');
  if (!input.channelIds.length) throw new Error('At least one destination is required');
  const jobs = await request('qc_live_stream_jobs', {
    method: 'POST',
    body: JSON.stringify({
      owner_key: ownerKey,
      title: input.title.slice(0, 160),
      source_url: input.sourceUrl || null,
      source_object_key: input.sourcePath || null,
      quality: input.quality,
      loop_enabled: input.loopEnabled,
      status: 'queued',
      desired_state: 'running',
    }),
  }) as Array<{ id: string }>;
  const job = jobs[0];
  if (!job?.id) throw new Error('Supabase did not return a broadcast job');

  const destinations: Array<{ id: string; ingestUrl: string; streamKey: string }> = [];
  for (const channelId of [...new Set(input.channelIds.map(String))]) {
    const combined = await getChannelDestination(ownerKey, channelId);
    if (!combined) throw new Error(`Destination ${channelId} was not found`);
    const separator = combined.lastIndexOf('/');
    destinations.push({ id: channelId, ingestUrl: combined.slice(0, separator), streamKey: combined.slice(separator + 1) });
    await request('qc_live_stream_destinations', {
      method: 'POST',
      body: JSON.stringify({ job_id: job.id, channel_id: channelId, status: 'starting' }),
    });
  }

  if (!workerUrl || !workerToken) {
    await updateBroadcast(job.id, { status: 'error', desired_state: 'stopped', last_error: 'Media worker is not configured' });
    throw new Error('Media worker is not configured');
  }

  const workerPayload = {
    jobId: job.id,
    broadcastId: job.id,
    idempotencyKey: job.id,
    videoPath: input.sourcePath ? `/app/media/${input.sourcePath.split('/').pop()}` : undefined,
    videoUrl: input.sourceUrl,
    quality: input.quality,
    loop: input.loopEnabled,
    destinations,
  };
  const workerResponse = await fetch(`${workerUrl}/api/v1/media/jobs/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${workerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(workerPayload),
  });
  if (!workerResponse.ok) {
    const detail = await workerResponse.text();
    await updateBroadcast(job.id, { status: 'error', desired_state: 'stopped', last_error: detail.slice(0, 1000) });
    throw new Error(`Media worker rejected the broadcast (${workerResponse.status})`);
  }
  await updateBroadcast(job.id, { status: 'starting' });
  return { ...job, status: 'starting' as BroadcastStatus };
}

export async function updateBroadcast(id: string, patch: Record<string, unknown>) {
  const query = new URLSearchParams({ id: `eq.${id}` });
  return request(`qc_live_stream_jobs?${query.toString()}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export async function listBroadcasts(ownerKey: string) {
  const query = new URLSearchParams({ owner_key: `eq.${ownerKey}`, select: 'id,title,status,desired_state,quality,loop_enabled,last_error,last_heartbeat_at,created_at,updated_at', order: 'created_at.desc', limit: '50' });
  return request(`qc_live_stream_jobs?${query.toString()}`);
}

export async function stopBroadcast(ownerKey: string, id: string) {
  const query = new URLSearchParams({ id: `eq.${id}`, owner_key: `eq.${ownerKey}`, select: 'id' });
  const rows = await request(`qc_live_stream_jobs?${query.toString()}`) as Array<{ id: string }>;
  if (!rows[0]) throw new Error('Broadcast not found');
  if (workerUrl && workerToken) {
    const response = await fetch(`${workerUrl}/api/v1/media/jobs/${encodeURIComponent(id)}/stop/`, {
      method: 'POST', headers: { Authorization: `Bearer ${workerToken}`, 'Content-Type': 'application/json' }, body: '{}',
    });
    if (!response.ok) throw new Error('Media worker could not stop the broadcast');
  }
  await updateBroadcast(id, { status: 'stopping', desired_state: 'stopped' });
  return { id, status: 'stopping' };
}

export async function createSchedule(ownerKey: string, input: {
  title: string; sourcePath?: string; sourceUrl?: string; quality: '720p' | '1080p';
  loopEnabled: boolean; channelIds: string[]; recurrence: 'once' | 'daily' | 'weekly'; timezone: string; startsAt: string;
}) {
  if (!input.sourcePath && !input.sourceUrl) throw new Error('A source video is required');
  if (!input.channelIds.length) throw new Error('At least one destination is required');
  const rows = await request('qc_live_broadcast_schedules', {
    method: 'POST',
    body: JSON.stringify({ owner_key: ownerKey, title: input.title.slice(0, 160), source_object_key: input.sourcePath || null, source_url: input.sourceUrl || null, quality: input.quality, loop_enabled: input.loopEnabled, channel_ids: input.channelIds, recurrence: input.recurrence, timezone: input.timezone, starts_at: input.startsAt, next_run_at: input.startsAt, enabled: true }),
  });
  return (rows as unknown[])[0];
}

export async function listSchedules(ownerKey: string) {
  const query = new URLSearchParams({ owner_key: `eq.${ownerKey}`, select: 'id,title,quality,recurrence,timezone,starts_at,next_run_at,enabled,last_error', order: 'next_run_at.asc', limit: '50' });
  return request(`qc_live_broadcast_schedules?${query.toString()}`);
}
