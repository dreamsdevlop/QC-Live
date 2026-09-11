import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '@/lib/auth';
import { createState, getAuthorizationUrl, isOAuthConfigured, OAuthPlatform } from '@/lib/channelOAuth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const platform = String(req.query.platform || '') as OAuthPlatform;
  if (!['youtube', 'twitch', 'facebook'].includes(platform)) return res.status(400).json({ error: 'Unsupported OAuth platform' });
  if (!isOAuthConfigured(platform)) return res.status(503).json({ error: `${platform} OAuth is not configured. Add its client ID and secret in Vercel.` });
  try {
    const session = await getSession(req, res);
    if (!session.user?.isLoggedIn) return res.redirect('/auth/login');
    const state = createState();
    session.oauth = { state, platform, createdAt: Date.now() };
    await session.save();
    return res.redirect(getAuthorizationUrl(platform, state));
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Could not start OAuth' });
  }
}
