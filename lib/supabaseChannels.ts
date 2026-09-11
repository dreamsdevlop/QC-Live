import crypto from 'crypto';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const encryptionSecret = process.env.CHANNEL_ENCRYPTION_SECRET || process.env.SESSION_SECRET;

export type ChannelPlatform = 'youtube' | 'twitch' | 'facebook' | 'custom';

export interface ChannelConnection {
  id: string;
  platform: ChannelPlatform;
  display_name: string;
  account_name: string | null;
  account_id: string | null;
  ingest_url: string;
  auth_mode: 'manual' | 'oauth';
  enabled: boolean;
  last_tested_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

function assertConfigured() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  if (!encryptionSecret || encryptionSecret.length < 32) {
    throw new Error('CHANNEL_ENCRYPTION_SECRET or SESSION_SECRET must be at least 32 characters.');
  }
}

function encryptionKey() {
  return crypto.createHash('sha256').update(encryptionSecret as string).digest();
}

export function encryptChannelSecret(value: string) {
  assertConfigured();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptChannelSecret(value: string) {
  assertConfigured();
  const [ivEncoded, tagEncoded, encryptedEncoded] = value.split('.');
  if (!ivEncoded || !tagEncoded || !encryptedEncoded) throw new Error('Invalid encrypted channel secret');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivEncoded, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedEncoded, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

async function supabaseRequest(path: string, init: RequestInit = {}) {
  assertConfigured();
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey as string,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${detail}`);
  }
  return response.status === 204 ? null : response.json();
}

export async function listChannelConnections(ownerKey: string) {
  const query = new URLSearchParams({ owner_key: `eq.${ownerKey}`, select: 'id,platform,display_name,account_name,account_id,ingest_url,auth_mode,enabled,last_tested_at,last_error,created_at,updated_at', order: 'created_at.desc' });
  return supabaseRequest(`qc_live_channel_connections?${query.toString()}`) as Promise<ChannelConnection[]>;
}

export async function createChannelConnection(ownerKey: string, input: {
  platform: ChannelPlatform;
  displayName: string;
  accountName?: string;
  accountId?: string;
  ingestUrl: string;
  streamKey: string;
  authMode?: 'manual' | 'oauth';
}) {
  const rows = await supabaseRequest('qc_live_channel_connections', {
    method: 'POST',
    body: JSON.stringify({
      owner_key: ownerKey,
      platform: input.platform,
      display_name: input.displayName,
      account_name: input.accountName || null,
      account_id: input.accountId || null,
      ingest_url: input.ingestUrl.replace(/\/$/, ''),
      encrypted_stream_key: encryptChannelSecret(input.streamKey),
      auth_mode: input.authMode || 'manual',
    }),
  });
  return (rows as ChannelConnection[])[0];
}

export async function createOAuthChannelConnection(ownerKey: string, ownerId: string | null, input: {
  platform: ChannelPlatform;
  displayName: string;
  accountName?: string;
  accountId?: string;
  ingestUrl: string;
  streamKey: string;
  accessToken: string;
  refreshToken?: string | null;
}) {
  const rows = await supabaseRequest('qc_live_channel_connections', {
    method: 'POST',
    body: JSON.stringify({
      owner_key: ownerKey,
      owner_id: ownerId,
      platform: input.platform,
      display_name: input.displayName,
      account_name: input.accountName || null,
      account_id: input.accountId || null,
      ingest_url: input.ingestUrl.replace(/\/$/, ''),
      encrypted_stream_key: encryptChannelSecret(input.streamKey),
      encrypted_access_token: encryptChannelSecret(input.accessToken),
      encrypted_refresh_token: input.refreshToken ? encryptChannelSecret(input.refreshToken) : null,
      oauth_provider: input.platform,
      oauth_account_id: input.accountId || null,
      auth_mode: 'oauth',
    }),
  });
  return (rows as ChannelConnection[])[0];
}

export async function deleteChannelConnection(ownerKey: string, id: string) {
  const query = new URLSearchParams({ owner_key: `eq.${ownerKey}`, id: `eq.${id}` });
  await supabaseRequest(`qc_live_channel_connections?${query.toString()}`, { method: 'DELETE' });
}

export async function getChannelDestination(ownerKey: string, id: string) {
  const query = new URLSearchParams({ owner_key: `eq.${ownerKey}`, id: `eq.${id}`, select: 'ingest_url,encrypted_stream_key' });
  const rows = await supabaseRequest(`qc_live_channel_connections?${query.toString()}`) as Array<{ ingest_url: string; encrypted_stream_key: string }>;
  if (!rows[0]) return null;
  return `${rows[0].ingest_url}/${decryptChannelSecret(rows[0].encrypted_stream_key)}`;
}

export function isSupabaseChannelsConfigured() {
  return Boolean(supabaseUrl && serviceRoleKey && encryptionSecret && encryptionSecret.length >= 32);
}
