import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import toast from 'react-hot-toast';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [magicEmail, setMagicEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMagicLoading, setIsMagicLoading] = useState(false);

  useEffect(() => {
    const oauthCode = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('code') : null;
    if (oauthCode) {
      setIsMagicLoading(true);
      axios.post('/api/auth/google/callback', { code: oauthCode })
        .then(() => { window.history.replaceState({}, document.title, window.location.pathname); toast.success('Google login successful!'); router.push('/dashboard'); })
        .catch((error: any) => { toast.error(error.response?.data?.error || 'Google sign-in could not be completed.'); window.history.replaceState({}, document.title, window.location.pathname); })
        .finally(() => setIsMagicLoading(false));
      return;
    }
    const oauthError = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('error_description') : null;
    if (oauthError) {
      toast.error(`Google sign-in failed: ${oauthError.replace(/\+/g, ' ')}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    const accessToken = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.hash.slice(1)).get('access_token')
      : null;
    if (!accessToken) return;
    setIsMagicLoading(true);
    axios.post('/api/auth/magic-link/verify', { access_token: accessToken })
      .then(() => {
        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        toast.success('Login successful!');
        router.push('/dashboard');
      })
      .catch(() => toast.error('This magic link is invalid or expired.'))
      .finally(() => setIsMagicLoading(false));
  }, [router]);

  const requestMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsMagicLoading(true);
    try {
      const response = await axios.post('/api/auth/magic-link', { email: magicEmail });
      toast.success(response.data.message);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Could not send magic link');
    } finally {
      setIsMagicLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await axios.post('/api/auth/login', { username, password });
      toast.success('Login successful!');
      router.push('/dashboard');
    } catch {
      toast.error('Invalid credentials');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-foreground">QC Live</h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">Sign in securely to manage your streams</p>
        </div>

        <a href="/api/auth/google/start" className="w-full py-2 px-4 rounded-md border border-border text-foreground hover:bg-muted flex items-center justify-center gap-2">
          <span className="font-semibold">G</span> Continue with Google
        </a>

        <form className="space-y-4" onSubmit={requestMagicLink}>
          <div>
            <h3 className="text-lg font-medium text-foreground">Sign in with email</h3>
            <p className="mt-1 text-sm text-muted-foreground">We’ll email you a secure, single-use sign-in link. No password required.</p>
          </div>
          <input
            id="magic-email" name="email" type="email" autoComplete="email" required
            className="w-full px-3 py-2 border border-border placeholder-muted-foreground text-foreground rounded-md bg-input"
            placeholder="you@example.com" value={magicEmail} onChange={(e) => setMagicEmail(e.target.value)}
          />
          <button type="submit" disabled={isLoading || isMagicLoading} className="w-full py-2 px-4 rounded-md text-primary-foreground bg-primary disabled:opacity-50">
            {isMagicLoading ? 'Sending secure link...' : 'Email me a magic link'}
          </button>
        </form>

        <details className="border-t border-border pt-5">
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">Use admin password instead</summary>
          <form className="space-y-4 mt-4" onSubmit={handleSubmit}>
            <input
              id="username" name="username" type="text" autoComplete="username" required
              className="w-full px-3 py-2 border border-border placeholder-muted-foreground text-foreground rounded-md bg-input"
              placeholder="Email or admin username" value={username} onChange={(e) => setUsername(e.target.value)}
            />
            <input
              id="password" name="password" type="password" autoComplete="current-password" required
              className="w-full px-3 py-2 border border-border placeholder-muted-foreground text-foreground rounded-md bg-input"
              placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
            />
            <button type="submit" disabled={isLoading || isMagicLoading} className="w-full py-2 px-4 rounded-md border border-primary text-primary hover:bg-primary/10 disabled:opacity-50">
              {isLoading ? 'Signing in...' : 'Sign in with password'}
            </button>
          </form>
        </details>

        <p className="text-sm text-center text-muted-foreground">
          New to QC Live? <Link href="/auth/signup" className="text-primary hover:underline">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
