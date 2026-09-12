import crypto from 'crypto';

const workerUrl = process.env.MEDIA_WORKER_URL?.replace(/\/$/, '');
const workerToken = process.env.MEDIA_WORKER_TOKEN;

export function isMediaWorkerConfigured() {
  return Boolean(workerUrl && workerToken);
}

function headers() {
  if (!workerToken) throw new Error('MEDIA_WORKER_TOKEN is not configured');
  return {
    Authorization: `Bearer ${workerToken}`,
    'Content-Type': 'application/json',
    'X-QC-Live-Timestamp': String(Math.floor(Date.now() / 1000)),
  };
}

export async function dispatchMediaJob(payload: Record<string, unknown>) {
  if (!workerUrl || !workerToken) throw new Error('Media worker is not configured');
  const response = await fetch(`${workerUrl}/api/v1/media/jobs/`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Media worker rejected the job');
  return result as { success: boolean; jobId: string; status: string };
}

export async function getMediaJobStatus(jobId: string) {
  if (!workerUrl || !workerToken) throw new Error('Media worker is not configured');
  const response = await fetch(`${workerUrl}/api/v1/media/jobs/${encodeURIComponent(jobId)}/`, {
    headers: headers(),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Could not read media worker status');
  return result;
}

export async function stopMediaJob(jobId: string) {
  if (!workerUrl || !workerToken) throw new Error('Media worker is not configured');
  const response = await fetch(`${workerUrl}/api/v1/media/jobs/${encodeURIComponent(jobId)}/stop/`, {
    method: 'POST',
    headers: headers(),
    body: '{}',
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Could not stop media worker job');
  return result;
}

export function createWorkerSignature(payload: string, timestamp: string) {
  if (!workerToken) throw new Error('MEDIA_WORKER_TOKEN is not configured');
  return crypto.createHmac('sha256', workerToken).update(`${timestamp}.${payload}`).digest('hex');
}
