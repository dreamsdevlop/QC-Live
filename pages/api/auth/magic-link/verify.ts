import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '@/lib/auth';
import { getSupabaseUser, isSupabaseAuthConfigured } from '@/lib/supabaseAuth';

export default async function verifyMagicLinkRoute(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isSupabaseAuthConfigured()) return res.status(503).json({ error: 'Magic-link login is not configured' });

  const accessToken = typeof req.body?.access_token === 'string' ? req.body.access_token : '';
  if (!accessToken) return res.status(400).json({ error: 'Missing magic-link token' });

  try {
    const user = await getSupabaseUser(accessToken);
    const session = await getSession(req, res);
    session.user = { isLoggedIn: true, username: user.email };
    await session.save();
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Magic-link verification failed:', error?.message || error);
    return res.status(401).json({ error: 'Invalid or expired magic link' });
  }
}
