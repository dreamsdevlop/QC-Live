import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '@/lib/auth';
import { isSupabaseAuthConfigured, signUpWithSupabase } from '@/lib/supabaseAuth';

export default async function signupRoute(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isSupabaseAuthConfigured()) return res.status(503).json({ error: 'Supabase Auth is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY.' });

  const { email, password, displayName } = req.body || {};
  if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'A valid email address is required' });
  if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    const result = await signUpWithSupabase(email.trim().toLowerCase(), password, displayName);
    if (result.access_token) {
      const session = await getSession(req, res);
      session.user = { isLoggedIn: true, username: result.user?.email || email.trim().toLowerCase() };
      await session.save();
    }
    res.status(201).json({ success: true, requiresEmailConfirmation: !result.access_token, user: { id: result.user?.id, email: result.user?.email || email.trim().toLowerCase() } });
  } catch (error: any) {
    console.error('Signup error:', error);
    res.status(400).json({ error: error.message || 'Could not create account' });
  }
}
