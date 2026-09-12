import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleOAuthUrl, isSupabaseAuthConfigured } from '@/lib/supabaseAuth';

export default function googleStartRoute(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!isSupabaseAuthConfigured()) return res.status(503).json({ error: 'Google login is not configured' });
  return res.redirect(302, getGoogleOAuthUrl());
}
