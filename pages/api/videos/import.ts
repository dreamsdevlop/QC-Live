import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/authMiddleware';
import { importPublicVideo } from '@/lib/videoImporter';

export const config = { api: { bodyParser: { sizeLimit: '32kb' } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return requireAuth(req, res, async (req, res) => {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const { url } = req.body || {};
    if (typeof url !== 'string' || !url.trim()) { res.status(400).json({ error: 'A public video URL is required' }); return; }
    try {
      const video = await importPublicVideo(url.trim());
      res.status(201).json({ success: true, video });
    } catch (error: any) {
      console.error('Video import error:', error);
      res.status(422).json({ error: error.message || 'Video import failed' });
    }
  });
}
