import type { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '@/lib/auth';
import { exchangeOAuthCode, getSupabaseUser, isSupabaseAuthConfigured } from '@/lib/supabaseAuth';

export default async function googleCallbackRoute(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isSupabaseAuthConfigured()) return res.status(503).json({ error: 'Google login is not configured' });
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  if (!code) return res.status(400).json({ error: 'Missing Google authorization code' });
  try {
    const token = await exchangeOAuthCode(code);
    const user = token.user?.email ? token.user : await getSupabaseUser(token.access_token);
    if (!user?.email) throw new Error('Google account email was not returned');
    const session = await getSession(req, res);
    session.user = { isLoggedIn: true, username: user.email };
    await session.save();
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Google OAuth callback failed:', error?.message || error);
    return res.status(401).json({ error: 'Unable to complete Google sign-in. Check the Supabase callback and Google OAuth settings.' });
  }
}
