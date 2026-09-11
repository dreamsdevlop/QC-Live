import { getIronSession, IronSession, SessionOptions } from 'iron-session';
import { NextApiRequest, NextApiResponse } from 'next';
import { GetServerSidePropsContext, GetServerSidePropsResult } from 'next';
import bcrypt from 'bcryptjs';
import { config } from './config';

export interface SessionData {
  user?: {
    isLoggedIn: boolean;
    username: string;
  };
  oauth?: {
    state: string;
    platform: 'youtube' | 'twitch' | 'facebook';
    createdAt: number;
  };
}

export const sessionOptions: SessionOptions = {
  password: config.session.secret,
  cookieName: 'streaming-app-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
  },
};

export async function getSession(
  req: NextApiRequest | GetServerSidePropsContext['req'],
  res: NextApiResponse | GetServerSidePropsContext['res']
): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(req, res, sessionOptions);
}

export function withSessionRoute(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const session = await getSession(req, res);
    (req as any).session = session;
    return handler(req, res);
  };
}

export function withSessionSsr<
  P extends { [key: string]: unknown } = { [key: string]: unknown },
>(
  handler: (
    context: GetServerSidePropsContext,
  ) => GetServerSidePropsResult<P> | Promise<GetServerSidePropsResult<P>>,
) {
  return async (context: GetServerSidePropsContext) => {
    const session = await getSession(context.req, context.res);
    (context.req as any).session = session;
    return handler(context);
  };
}

export async function validateCredentials(username: string, password: string): Promise<boolean> {
  const validUsername = config.auth.username;
  const hashedPassword = config.auth.password;
  
  if (username !== validUsername) {
    return false;
  }

  try {
    return await bcrypt.compare(password, hashedPassword);
  } catch (error) {
    console.error('Error comparing passwords:', error);
    return false;
  }
}
