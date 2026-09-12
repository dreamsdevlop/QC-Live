import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/authMiddleware';
import { stopStream } from '@/lib/ffmpeg';
import { setStreamStopped } from '@/lib/streamState';
import { isMediaWorkerConfigured, stopMediaJob } from '@/lib/mediaWorker';
import { getDb } from '@/lib/database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return requireAuth(req, res, async (req, res) => {

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { streamId } = req.body;

  if (!streamId) {
    return res.status(400).json({ error: 'Stream ID is required' });
  }

  try {
    if (isMediaWorkerConfigured()) {
      const db = await getDb();
      const stream = await db.get('SELECT worker_job_id FROM streams WHERE id = ?', [streamId]);
      if (!stream) return res.status(404).json({ error: 'Stream not found' });
      if (stream.worker_job_id) await stopMediaJob(String(stream.worker_job_id));
      await db.run('UPDATE streams SET status = ?, pid = NULL WHERE id = ?', ['stopping', streamId]);
      setStreamStopped(streamId);
      return res.status(202).json({ success: true, message: 'Stop request sent to media worker' });
    }
    await stopStream(streamId, 'API /api/streams/stop');
    setStreamStopped(streamId);
    res.status(200).json({ success: true, message: 'Stream stopped successfully' });
  } catch (error) {
    console.error('Stop stream error:', error);
    res.status(500).json({ error: 'Failed to stop stream' });
  }
  });
}
