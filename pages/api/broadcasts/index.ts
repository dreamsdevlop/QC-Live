import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/authMiddleware';
import { createBroadcast, isBroadcastBackendConfigured, listBroadcasts } from '@/lib/supabaseBroadcasts';

function ownerKey(req: NextApiRequest) { return String((req as any).session.user.username); }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return requireAuth(req, res, async (req, res) => {
    if (!isBroadcastBackendConfigured()) return res.status(503).json({ error: 'Supabase broadcast backend is not configured' });
    try {
      if (req.method === 'GET') return res.status(200).json({ broadcasts: await listBroadcasts(ownerKey(req)) });
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { title, sourcePath, sourceUrl, quality = '720p', loopEnabled = true, channelIds } = req.body || {};
      if (!title || (!sourcePath && !sourceUrl) || !Array.isArray(channelIds) || !channelIds.length) return res.status(400).json({ error: 'title, source video, and at least one channel are required' });
      if (!['720p', '1080p'].includes(quality)) return res.status(400).json({ error: 'quality must be 720p or 1080p' });
      const broadcast = await createBroadcast(ownerKey(req), { title, sourcePath, sourceUrl, quality, loopEnabled: Boolean(loopEnabled), channelIds });
      return res.status(202).json({ success: true, broadcast });
    } catch (error: any) {
      console.error('Broadcast API error:', error);
      return res.status(500).json({ error: error.message || 'Broadcast operation failed' });
    }
  });
}
