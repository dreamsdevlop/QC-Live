import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/authMiddleware';
import { getDb, logActivity } from '@/lib/database';
import { getChannelDestination, isSupabaseChannelsConfigured } from '@/lib/supabaseChannels';
import { startStream } from '@/lib/ffmpeg';
import { setStreamRunning } from '@/lib/streamState';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return requireAuth(req, res, async (req, res) => {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    if (!isSupabaseChannelsConfigured()) { res.status(503).json({ error: 'Channel linking is not configured' }); return; }

    const { name, videoId, channelIds, quality = '720p', loopEnabled = true } = req.body || {};
    if (!name || !videoId || !Array.isArray(channelIds) || channelIds.length === 0) {
      res.status(400).json({ error: 'name, videoId, and at least one channelId are required' }); return;
    }
    if (!['720p', '1080p'].includes(quality)) { res.status(400).json({ error: 'Invalid quality' }); return; }

    try {
      const db = await getDb();
      const video = await db.get('SELECT id, file_path FROM videos WHERE id = ?', [videoId]);
      if (!video) { res.status(404).json({ error: 'Video not found' }); return; }

      const ownerKey = (req as any).session.user.username as string;
      const results: Array<{ channelId: string; streamId?: number; status: 'started' | 'failed'; error?: string }> = [];

      for (const channelId of [...new Set(channelIds.map(String))]) {
        try {
          const destination = await getChannelDestination(ownerKey, channelId);
          if (!destination) throw new Error('Channel not found');
          const channel = await db.get('SELECT id FROM streams WHERE channel_id = ? AND video_id = ? AND status = ?', [channelId, videoId, 'running']);
          if (channel) throw new Error('This channel is already running this video');

          const insert = await db.run(
            'INSERT INTO streams (name, video_id, channel_id, rtmp_url, quality, loop_enabled, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [`${name} · ${channelId.slice(0, 8)}`, videoId, channelId, destination, quality, loopEnabled ? 1 : 0, 'stopped']
          );
          const streamId = insert.lastID as number;
          await startStream(streamId, { videoPath: video.file_path, rtmpUrl: destination, quality, loop: Boolean(loopEnabled) });
          setStreamRunning(streamId);
          results.push({ channelId, streamId, status: 'started' });
        } catch (error: any) {
          results.push({ channelId, status: 'failed', error: error.message || 'Destination failed' });
        }
      }

      await logActivity('multi_platform_orchestrated', `Started ${results.filter((r) => r.status === 'started').length}/${results.length} destinations`);
      const successful = results.filter((result) => result.status === 'started').length;
      res.status(successful > 0 ? 200 : 502).json({ success: successful > 0, results });
    } catch (error: any) {
      console.error('Orchestration error:', error);
      res.status(500).json({ error: error.message || 'Failed to orchestrate streams' });
    }
  });
}
