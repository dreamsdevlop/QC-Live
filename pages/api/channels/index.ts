import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/authMiddleware';
import {
  ChannelPlatform,
  createChannelConnection,
  isSupabaseChannelsConfigured,
  listChannelConnections,
} from '@/lib/supabaseChannels';

function ownerKey(req: NextApiRequest) {
  return (req as any).session.user.username as string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return requireAuth(req, res, async (req, res) => {
    if (!isSupabaseChannelsConfigured()) {
      return res.status(503).json({ error: 'Channel linking is not configured. Add Supabase and channel encryption environment variables.' });
    }

    try {
      if (req.method === 'GET') {
        res.status(200).json({ channels: await listChannelConnections(ownerKey(req)) });
        return;
      }
      if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

      const { platform, displayName, accountName, accountId, ingestUrl, streamKey, authMode } = req.body || {};
      const platforms: ChannelPlatform[] = ['youtube', 'twitch', 'facebook', 'custom'];
      if (!platforms.includes(platform) || !displayName || !ingestUrl || !streamKey) {
        res.status(400).json({ error: 'platform, displayName, ingestUrl, and streamKey are required' }); return;
      }
      if (!/^rtmps?:\/\//i.test(ingestUrl)) { res.status(400).json({ error: 'ingestUrl must be an RTMP or RTMPS URL' }); return; }
      const channel = await createChannelConnection(ownerKey(req), { platform, displayName, accountName, accountId, ingestUrl, streamKey, authMode });
      res.status(201).json({ channel });
    } catch (error: any) {
      console.error('Channel API error:', error);
      return res.status(500).json({ error: error.message || 'Channel operation failed' });
    }
  });
}
