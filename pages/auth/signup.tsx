import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import axios from 'axios';
import toast from 'react-hot-toast';

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ displayName: '', email: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (form.password !== form.confirmPassword) return toast.error('Passwords do not match');
    setLoading(true);
    try {
      const { data } = await axios.post('/api/auth/signup', form);
      if (data.requiresEmailConfirmation) {
        toast.success('Account created. Check your email to confirm, then sign in.');
        router.push('/auth/login');
      } else {
        toast.success('Account created');
        router.push('/dashboard');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Could not create account');
    } finally {
      setLoading(false);
    }
  }

  return <div className="min-h-screen flex items-center justify-center bg-background px-4">
    <form onSubmit={submit} className="w-full max-w-md space-y-5 bg-card border border-border rounded-lg p-8">
      <div><h1 className="text-3xl font-bold text-foreground">Create QC Live account</h1><p className="text-sm text-muted-foreground mt-2">Use your account to save channels and manage live jobs.</p></div>
      <a href="/api/auth/google/start" className="w-full py-2 rounded-md border border-border text-foreground hover:bg-muted flex items-center justify-center gap-2"><span className="font-semibold">G</span> Sign up with Google</a>
      <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px bg-border flex-1" /><span>or use email</span><span className="h-px bg-border flex-1" /></div>
      <input placeholder="Display name (optional)" value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground" />
      <input required type="email" autoComplete="email" placeholder="Email address" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground" />
      <input required minLength={8} type="password" autoComplete="new-password" placeholder="Password (8+ characters)" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground" />
      <input required minLength={8} type="password" autoComplete="new-password" placeholder="Confirm password" value={form.confirmPassword} onChange={e => setForm({ ...form, confirmPassword: e.target.value })} className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground" />
      <button disabled={loading} className="w-full py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-50">{loading ? 'Creating account…' : 'Sign up'}</button>
      <p className="text-sm text-center text-muted-foreground">Already registered? <Link href="/auth/login" className="text-primary hover:underline">Sign in</Link></p>
    </form>
  </div>;
}
