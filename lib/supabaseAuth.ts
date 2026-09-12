const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

export function isSupabaseAuthConfigured() {
  return Boolean(supabaseUrl && anonKey);
}

async function authRequest(path: string, body: Record<string, unknown>) {
  if (!isSupabaseAuthConfigured()) throw new Error('Supabase Auth is not configured');
  const response = await fetch(`${supabaseUrl}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: anonKey as string, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error_description || payload.msg || payload.message || 'Supabase Auth request failed');
  return payload;
}

export async function signUpWithSupabase(email: string, password: string, displayName?: string) {
  return authRequest('signup', { email, password, data: { display_name: displayName || email.split('@')[0] } });
}

export async function createConfirmedUserWithSupabase(email: string, password: string, displayName?: string) {
  if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase service role is not configured');
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { display_name: displayName || email.split('@')[0] } }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 422) throw new Error(payload.msg || payload.message || 'Could not create account');
  return signInWithSupabase(email, password);
}

export async function signInWithSupabase(email: string, password: string) {
  return authRequest('token?grant_type=password', { email, password });
}

export async function sendMagicLink(email: string, redirectTo: string) {
  // Passwordless onboarding: Supabase creates the user when the email is not
  // registered yet, then sends the same single-use confirmation link.
  return authRequest('otp', {
    email,
    create_user: true,
    options: { email_redirect_to: redirectTo },
  });
}

export async function getSupabaseUser(accessToken: string) {
  if (!isSupabaseAuthConfigured()) throw new Error('Supabase Auth is not configured');
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey as string, Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.email) throw new Error('Invalid or expired magic link');
  return payload as { id: string; email: string };
}

export function getMagicLinkRedirectUrl(_origin?: string) {
  return process.env.SUPABASE_AUTH_REDIRECT_URL || 'https://qc-live-henna.vercel.app/auth/login';
}
