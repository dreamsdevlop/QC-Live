import crypto from 'crypto';
import { createOAuthChannelConnection, ChannelPlatform } from './supabaseChannels';

const providers = {
  youtube: {
    clientId: process.env.YOUTUBE_CLIENT_ID,
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
    scopes: ['https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/youtube.force-ssl'],
  },
  twitch: {
    clientId: process.env.TWITCH_CLIENT_ID,
    clientSecret: process.env.TWITCH_CLIENT_SECRET,
    scopes: ['channel:read:stream_key'],
  },
  facebook: {
    clientId: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    scopes: ['public_profile', 'pages_show_list', 'pages_read_engagement', 'pages_manage_posts'],
  },
} as const;

export type OAuthPlatform = keyof typeof providers;

export function isOAuthConfigured(platform: OAuthPlatform) {
  const provider = providers[platform];
  return Boolean(provider.clientId && provider.clientSecret);
}

export function createState() {
  return crypto.randomBytes(32).toString('base64url');
}

function redirectUri(platform: OAuthPlatform) {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (!base) throw new Error('APP_URL or NEXT_PUBLIC_APP_URL is required for OAuth callbacks');
  return `${base.replace(/\/$/, '')}/api/channels/oauth/callback?platform=${platform}`;
}

export function getAuthorizationUrl(platform: OAuthPlatform, state: string) {
  if (!isOAuthConfigured(platform)) throw new Error(`${platform} OAuth is not configured`);
  const provider = providers[platform];
  if (platform === 'youtube') {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ client_id: provider.clientId!, redirect_uri: redirectUri(platform), response_type: 'code', scope: provider.scopes.join(' '), access_type: 'offline', include_granted_scopes: 'true', prompt: 'consent', state }).toString();
    return url.toString();
  }
  if (platform === 'twitch') {
    const url = new URL('https://id.twitch.tv/oauth2/authorize');
    url.search = new URLSearchParams({ client_id: provider.clientId!, redirect_uri: redirectUri(platform), response_type: 'code', scope: provider.scopes.join(' '), state }).toString();
    return url.toString();
  }
  const url = new URL('https://www.facebook.com/v26.0/dialog/oauth');
  url.search = new URLSearchParams({ client_id: provider.clientId!, redirect_uri: redirectUri(platform), response_type: 'code', scope: provider.scopes.join(','), state }).toString();
  return url.toString();
}

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) throw new Error(payload.error_description || payload.error?.message || payload.message || `Provider request failed (${response.status})`);
  return payload;
}

async function exchangeCode(platform: OAuthPlatform, code: string) {
  const provider = providers[platform];
  const uri = redirectUri(platform);
  if (platform === 'youtube') {
    return jsonRequest('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: provider.clientId!, client_secret: provider.clientSecret!, redirect_uri: uri, grant_type: 'authorization_code' }) });
  }
  if (platform === 'twitch') {
    return jsonRequest('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: provider.clientId!, client_secret: provider.clientSecret!, redirect_uri: uri, grant_type: 'authorization_code' }) });
  }
  const url = new URL('https://graph.facebook.com/v26.0/oauth/access_token');
  url.search = new URLSearchParams({ client_id: provider.clientId!, client_secret: provider.clientSecret!, redirect_uri: uri, code }).toString();
  return jsonRequest(url.toString());
}

export async function linkOAuthChannel(platform: OAuthPlatform, code: string, ownerKey: string, ownerId: string | null) {
  const token = await exchangeCode(platform, code);
  if (platform === 'youtube') {
    const identity = await jsonRequest(`https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true`, { headers: { Authorization: `Bearer ${token.access_token}` } });
    const channel = identity.items?.[0];
    if (!channel) throw new Error('No YouTube channel is available for this Google account');
    const live = await jsonRequest('https://www.googleapis.com/youtube/v3/liveStreams?part=id,snippet,cdn,contentDetails,status', { method: 'POST', headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ snippet: { title: 'QC Live destination' }, cdn: { frameRate: 'variable', ingestionType: 'rtmp', resolution: 'variable' }, contentDetails: { isReusable: true } }) });
    const ingestion = live.cdn?.ingestionInfo;
    if (!ingestion?.ingestionAddress || !ingestion?.streamName) throw new Error('YouTube did not return an ingest destination; confirm Live streaming is enabled');
    return createOAuthChannelConnection(ownerKey, ownerId, { platform, displayName: channel.snippet?.title || 'YouTube channel', accountName: channel.snippet?.title, accountId: channel.id, ingestUrl: ingestion.ingestionAddress, streamKey: ingestion.streamName, accessToken: token.access_token, refreshToken: token.refresh_token });
  }
  if (platform === 'twitch') {
    const identity = await jsonRequest('https://api.twitch.tv/helix/users', { headers: { Authorization: `Bearer ${token.access_token}`, 'Client-Id': providers.twitch.clientId! } });
    const user = identity.data?.[0];
    if (!user) throw new Error('Twitch account could not be identified');
    const key = await jsonRequest(`https://api.twitch.tv/helix/streams/key?broadcaster_id=${encodeURIComponent(user.id)}`, { headers: { Authorization: `Bearer ${token.access_token}`, 'Client-Id': providers.twitch.clientId! } });
    const streamKey = key.data?.[0]?.stream_key;
    if (!streamKey) throw new Error('Twitch did not return a stream key; confirm the channel:read:stream_key permission');
    return createOAuthChannelConnection(ownerKey, ownerId, { platform, displayName: user.display_name || user.login, accountName: user.login, accountId: user.id, ingestUrl: 'rtmps://live.twitch.tv/app', streamKey, accessToken: token.access_token, refreshToken: token.refresh_token });
  }
  const pages = await jsonRequest(`https://graph.facebook.com/v26.0/me/accounts?fields=id,name,access_token,tasks&access_token=${encodeURIComponent(token.access_token)}`);
  const page = pages.data?.[0];
  if (!page?.access_token) throw new Error('No eligible Facebook Page was returned. Grant Page permissions and complete Meta App Review if required.');
  const live = await jsonRequest(`https://graph.facebook.com/v26.0/${page.id}/live_videos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: new URLSearchParams({ access_token: page.access_token, title: 'QC Live destination', status: 'UNPUBLISHED' }) });
  const ingest = live.stream_url || live.secure_stream_url;
  if (!ingest) throw new Error('Facebook did not return an ingest URL for this Page');
  const split = ingest.lastIndexOf('/');
  return createOAuthChannelConnection(ownerKey, ownerId, { platform, displayName: page.name || 'Facebook Page', accountName: page.name, accountId: page.id, ingestUrl: ingest.slice(0, split), streamKey: ingest.slice(split + 1), accessToken: page.access_token, refreshToken: token.access_token });
}
