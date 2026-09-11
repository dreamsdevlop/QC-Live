import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/authMiddleware';
import { getDb, logActivity } from '@/lib/database';
import { getChannelDestination, isSupabaseChannelsConfigured } from '@/lib/supabaseChannels';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return requireAuth(req, res, async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { name, videoId, rtmpUrl: requestedRtmpUrl, channelId, quality, loopEnabled } = req.body;

    let rtmpUrl = requestedRtmpUrl;
    if (channelId) {
      if (!isSupabaseChannelsConfigured()) return res.status(503).json({ error: 'Saved channel linking is not configured' });
      rtmpUrl = await getChannelDestination((req as any).session.user.username, channelId);
    }

    if (!name || !videoId || !rtmpUrl) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      const db = await getDb();
      
      // Check if video exists
      const video = await db.get('SELECT * FROM videos WHERE id = ?', [videoId]);
      
      if (!video) {
        return res.status(404).json({ error: 'Video not found' });
      }

      // Check if stream already exists
      const existingStream = await db.get(
        'SELECT * FROM streams WHERE name = ? AND video_id = ? AND rtmp_url = ?',
        [name, videoId, rtmpUrl]
      );

      if (existingStream) {
        return res.status(400).json({ error: 'Stream already exists with this configuration' });
      }

      // Create stream record (not started)
      const result = await db.run(
        'INSERT INTO streams (name, video_id, channel_id, rtmp_url, quality, loop_enabled, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [name, videoId, channelId || null, rtmpUrl, quality || '720p', loopEnabled ? 1 : 0, 'stopped']
      );

      await logActivity('stream_created', `Stream "${name}" created`);

      res.status(200).json({ 
        success: true, 
        streamId: result.lastID,
        message: 'Stream created successfully' 
      });
    } catch (error) {
      console.error('Create stream error:', error);
      res.status(500).json({ error: 'Failed to create stream' });
    }
  });
}
