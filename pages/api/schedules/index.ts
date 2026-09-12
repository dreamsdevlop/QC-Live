import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/authMiddleware';
import { createSchedule, isBroadcastBackendConfigured, listSchedules } from '@/lib/supabaseBroadcasts';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return requireAuth(req, res, async (req, res) => {
    if (!isBroadcastBackendConfigured()) return res.status(503).json({ error: 'Supabase broadcast backend is not configured' });
    const ownerKey = String((req as any).session.user.username);
    try {
      if (req.method === 'GET') return res.status(200).json({ schedules: await listSchedules(ownerKey) });
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { title, sourcePath, sourceUrl, quality = '720p', loopEnabled = true, channelIds, recurrence = 'once', timezone = 'UTC', startsAt } = req.body || {};
      if (!title || !startsAt || !Array.isArray(channelIds) || !channelIds.length) return res.status(400).json({ error: 'title, startsAt, and at least one channel are required' });
      if (!['once', 'daily', 'weekly'].includes(recurrence)) return res.status(400).json({ error: 'Invalid recurrence' });
      const schedule = await createSchedule(ownerKey, { title, sourcePath, sourceUrl, quality, loopEnabled: Boolean(loopEnabled), channelIds, recurrence, timezone, startsAt });
      return res.status(201).json({ success: true, schedule });
    } catch (error: any) { return res.status(500).json({ error: error.message || 'Schedule operation failed' }); }
  });
}
