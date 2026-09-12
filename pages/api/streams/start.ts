import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/authMiddleware';
import { getDb, logActivity } from '@/lib/database';
import { startStream } from '@/lib/ffmpeg';
import { setStreamRunning } from '@/lib/streamState';
import { dispatchMediaJob, isMediaWorkerConfigured } from '@/lib/mediaWorker';
import path from 'path';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return requireAuth(req, res, async (req, res) => {

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { streamId } = req.body;

  if (!streamId) {
    return res.status(400).json({ error: 'Missing stream ID' });
  }

  try {
    const db = await getDb();
    
    // Get stream details
    const stream = await db.get(
      'SELECT s.*, v.file_path FROM streams s JOIN videos v ON s.video_id = v.id WHERE s.id = ?',
      [streamId]
    );
    
    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    if (stream.status === 'running') {
      return res.status(400).json({ error: 'Stream is already running' });
    }

    if (isMediaWorkerConfigured()) {
      const workerJobId = `qc-stream-${stream.id}-${Date.now()}`;
      const workerMediaRoot = process.env.MEDIA_WORKER_MEDIA_ROOT || '/app/media';
      const mediaPath = path.join(workerMediaRoot, path.basename(stream.file_path));
      const job = await dispatchMediaJob({
        jobId: workerJobId,
        broadcastId: `qc-stream-${stream.id}`,
        idempotencyKey: workerJobId,
        videoPath: mediaPath,
        quality: stream.quality || '1080p',
        loop: stream.loop_enabled === 1,
        destinations: [{
          id: String(stream.channel_id || `stream-${stream.id}`),
          ingestUrl: String(stream.rtmp_url).replace(/\/[^/]*$/, ''),
          streamKey: String(stream.rtmp_url).split('/').pop(),
        }],
      });
      await db.run(
        'UPDATE streams SET status = ?, worker_job_id = ?, pid = NULL, error_message = NULL WHERE id = ?',
        ['starting', job.jobId, stream.id]
      );
      await logActivity('stream_worker_started', `Stream ${stream.id} dispatched to PyRunner job ${job.jobId}`);
      return res.status(202).json({ success: true, streamId: stream.id, workerJobId: job.jobId, message: 'Stream dispatched to media worker' });
    }

    // Start FFmpeg process
    await startStream(stream.id, {
      videoPath: stream.file_path,
      rtmpUrl: stream.rtmp_url,
      quality: stream.quality || '720p',
      loop: stream.loop_enabled === 1,
    });

    // Mark stream as running in global state
    setStreamRunning(stream.id);

    res.status(200).json({ 
      success: true, 
      streamId: stream.id,
      message: 'Stream started successfully' 
    });
  } catch (error) {
    console.error('Start stream error:', error);
    res.status(500).json({ error: 'Failed to start stream' });
  }
  });
}
