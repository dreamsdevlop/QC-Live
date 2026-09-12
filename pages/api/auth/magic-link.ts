import { NextApiRequest, NextApiResponse } from 'next';
import { getMagicLinkRedirectUrl, isSupabaseAuthConfigured, sendMagicLink } from '@/lib/supabaseAuth';

export default async function magicLinkRoute(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isSupabaseAuthConfigured()) {
    return res.status(503).json({ error: 'Magic-link login is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY.' });
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });

  const forwardedProto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const forwardedHost = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000').split(',')[0];
  const origin = `${forwardedProto}://${forwardedHost}`;

  try {
    await sendMagicLink(email, getMagicLinkRedirectUrl(origin));
    return res.status(200).json({ success: true, message: 'If that account exists, a sign-in link has been sent.' });
  } catch (error: any) {
    // Avoid revealing whether an email is registered.
    console.error('Magic-link request failed:', error?.message || error);
    return res.status(200).json({ success: true, message: 'If that account exists, a sign-in link has been sent.' });
  }
}
