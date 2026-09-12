import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/authMiddleware';
import { isBroadcastBackendConfigured, stopBroadcast } from '@/lib/supabaseBroadcasts';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return requireAuth(req, res, async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!isBroadcastBackendConfigured()) return res.status(503).json({ error: 'Supabase broadcast backend is not configured' });
    try {
      const result = await stopBroadcast(String((req as any).session.user.username), String(req.query.id));
      return res.status(202).json({ success: true, broadcast: result });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Could not stop broadcast' });
    }
  });
}
