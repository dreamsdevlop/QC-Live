import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '@/lib/auth';
import { linkOAuthChannel, OAuthPlatform } from '@/lib/channelOAuth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const platform = String(req.query.platform || '') as OAuthPlatform;
  const error = req.query.error ? String(req.query.error) : '';
  if (error) return res.redirect(`/channels?oauth=error&message=${encodeURIComponent(error)}`);
  const code = String(req.query.code || '');
  const state = String(req.query.state || '');
  if (!code || !state || !['youtube', 'twitch', 'facebook'].includes(platform)) return res.redirect('/channels?oauth=error&message=Invalid%20OAuth%20callback');

  try {
    const session = await getSession(req, res);
    const pending = session.oauth;
    if (!session.user?.isLoggedIn || !pending || pending.platform !== platform || pending.state !== state || Date.now() - pending.createdAt > 10 * 60 * 1000) return res.redirect('/channels?oauth=error&message=OAuth%20state%20expired');
    const ownerKey = session.user.username;
    const userId = null; // Existing iron-session users are keyed by username; Supabase Auth owner_id is set by the Edge Function flow.
    await linkOAuthChannel(platform, code, ownerKey, userId);
    delete session.oauth;
    await session.save();
    return res.redirect('/channels?oauth=success');
  } catch (err: any) {
    console.error('OAuth callback error:', err);
    return res.redirect(`/channels?oauth=error&message=${encodeURIComponent(err.message || 'Could not link channel')}`);
  }
}
