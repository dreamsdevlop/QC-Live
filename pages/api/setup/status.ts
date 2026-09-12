import type { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '@/lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const session = await getSession(req, res);
  if (!session.user?.isLoggedIn) return res.status(401).json({ error: 'Unauthorized' });

  let database = false;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && supabaseKey) {
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/qc_live_stream_jobs?select=id&limit=1`, { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } });
      database = response.ok;
    } catch { database = false; }
  }
  const mediaWorkerConfigured = Boolean(process.env.MEDIA_WORKER_URL && process.env.MEDIA_WORKER_TOKEN);
  const supabaseConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
  const productionUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://qc-live-henna.vercel.app';

  return res.status(200).json({
    ready: database && mediaWorkerConfigured,
    checks: { database, mediaWorkerConfigured, supabaseConfigured, productionUrl },
    steps: [
      { id: 'account', label: 'Account created', complete: true },
      { id: 'video', label: 'Upload a video', complete: false, href: '/videos' },
      { id: 'destination', label: 'Add a streaming destination', complete: false, href: '/channels' },
      { id: 'stream', label: 'Create and start your first broadcast', complete: false, href: '/broadcasts' },
    ],
  });
}
