import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/authMiddleware';
import { deleteChannelConnection, isSupabaseChannelsConfigured } from '@/lib/supabaseChannels';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return requireAuth(req, res, async (req, res) => {
    if (req.method !== 'DELETE') { res.status(405).json({ error: 'Method not allowed' }); return; }
    if (!isSupabaseChannelsConfigured()) { res.status(503).json({ error: 'Channel linking is not configured' }); return; }
    const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
    if (!id) { res.status(400).json({ error: 'Channel id is required' }); return; }
    try {
      await deleteChannelConnection((req as any).session.user.username, id);
      res.status(204).end();
    } catch (error: any) {
      console.error('Delete channel error:', error);
      res.status(500).json({ error: error.message || 'Failed to delete channel' });
    }
  });
}
