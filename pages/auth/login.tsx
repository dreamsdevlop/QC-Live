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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-foreground">QC Live</h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">Sign in to manage your streams</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <h3 className="text-lg font-medium text-foreground">Password login</h3>
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
          <button type="submit" disabled={isLoading || isMagicLoading} className="w-full py-2 px-4 rounded-md text-primary-foreground bg-primary disabled:opacity-50">
            {isLoading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="border-t border-border pt-6">
          <form className="space-y-4" onSubmit={requestMagicLink}>
            <div>
              <h3 className="text-lg font-medium text-foreground">Passwordless login</h3>
              <p className="mt-1 text-sm text-muted-foreground">Use the email address of an existing Supabase account.</p>
            </div>
            <input
              id="magic-email" name="email" type="email" autoComplete="email" required
              className="w-full px-3 py-2 border border-border placeholder-muted-foreground text-foreground rounded-md bg-input"
              placeholder="you@example.com" value={magicEmail} onChange={(e) => setMagicEmail(e.target.value)}
            />
            <button type="submit" disabled={isLoading || isMagicLoading} className="w-full py-2 px-4 rounded-md border border-primary text-primary hover:bg-primary/10 disabled:opacity-50">
              {isMagicLoading ? 'Sending link...' : 'Email me a magic link'}
            </button>
          </form>
        </div>

        <p className="text-sm text-center text-muted-foreground">
          New to QC Live? <Link href="/auth/signup" className="text-primary hover:underline">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
