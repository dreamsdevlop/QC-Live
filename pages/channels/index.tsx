import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import toast from 'react-hot-toast';
import Layout from '@/components/Layout';
import { getSession } from '@/lib/auth';
import { GetServerSidePropsContext } from 'next';

interface Channel {
  id: string;
  platform: string;
  display_name: string;
  account_name: string | null;
  ingest_url: string;
  auth_mode: string;
  enabled: boolean;
}

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const session = await getSession(context.req, context.res);
  if (!session.user?.isLoggedIn) return { redirect: { destination: '/auth/login', permanent: false } };
  return { props: {} };
}

export default function ChannelsPage() {
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ platform: 'youtube', displayName: '', accountName: '', ingestUrl: 'rtmps://a.rtmp.youtube.com/live2', streamKey: '' });

  const load = async () => {
    try { setChannels((await axios.get('/api/channels')).data.channels); }
    catch (error: any) { toast.error(error.response?.data?.error || 'Could not load channels'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (router.query.oauth === 'success') toast.success('Channel linked automatically');
    if (router.query.oauth === 'error') toast.error(String(router.query.message || 'OAuth channel linking failed'));
  }, [router.query.oauth, router.query.message]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      await axios.post('/api/channels', form);
      toast.success('Channel connected securely');
      setForm({ ...form, displayName: '', accountName: '', streamKey: '' });
      load();
    } catch (error: any) { toast.error(error.response?.data?.error || 'Could not connect channel'); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Remove this saved channel connection?')) return;
    try { await axios.delete(`/api/channels/${id}`); toast.success('Channel removed'); load(); }
    catch { toast.error('Could not remove channel'); }
  };

  return <Layout>
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8"><h1 className="text-3xl font-bold text-foreground">Channel Connections</h1><p className="text-muted-foreground mt-2">Save destinations once, then reuse them for reliable 24/7 streams. Secrets are encrypted server-side and never returned to the browser.</p></div>
      <div className="grid lg:grid-cols-5 gap-8">
        <form onSubmit={save} className="lg:col-span-2 bg-card border border-border rounded-lg p-6 space-y-4">
          <h2 className="text-xl font-semibold">Connect a destination</h2>
          <select value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value, ingestUrl: e.target.value === 'youtube' ? 'rtmps://a.rtmp.youtube.com/live2' : form.ingestUrl })} className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground"><option value="youtube">YouTube Live</option><option value="twitch">Twitch</option><option value="facebook">Facebook Live</option><option value="custom">Custom RTMP</option></select>
          <input required placeholder="Connection name" value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground" />
          <input placeholder="Account or channel name (optional)" value={form.accountName} onChange={e => setForm({ ...form, accountName: e.target.value })} className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground" />
          <input required placeholder="rtmps://provider.example/live" value={form.ingestUrl} onChange={e => setForm({ ...form, ingestUrl: e.target.value })} className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground" />
          <input required type="password" autoComplete="new-password" placeholder="Stream key / ingest secret" value={form.streamKey} onChange={e => setForm({ ...form, streamKey: e.target.value })} className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground" />
          <button disabled={saving} className="w-full py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-50">{saving ? 'Encrypting…' : 'Save connection'}</button>
          <div className="border-t border-border pt-4 space-y-2">
            <p className="text-sm font-medium">Or connect automatically</p>
            <p className="text-xs text-muted-foreground">You will authorize the provider directly. QC Live never asks for your provider password.</p>
            <div className="grid grid-cols-3 gap-2">
              {(['youtube', 'twitch', 'facebook'] as const).map(platform => <a key={platform} href={`/api/channels/oauth/start?platform=${platform}`} className="text-center px-2 py-2 rounded-md border border-border text-xs hover:bg-muted">{platform === 'youtube' ? 'YouTube' : platform === 'twitch' ? 'Twitch' : 'Facebook'}</a>)}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Manual keys work immediately with any RTMP-compatible platform. OAuth requires each provider's developer app credentials and may require platform review.</p>
        </form>
        <section className="lg:col-span-3 bg-card border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Saved channels</h2>
          {loading ? <p className="text-muted-foreground">Loading…</p> : channels.length === 0 ? <p className="text-muted-foreground">No channels connected yet.</p> : <div className="space-y-3">{channels.map(channel => <div key={channel.id} className="border border-border rounded-md p-4 flex items-center justify-between gap-4"><div><div className="font-medium">{channel.display_name}</div><div className="text-sm text-muted-foreground">{channel.platform} · {channel.account_name || 'account not specified'}</div><div className="text-xs text-muted-foreground mt-1">{channel.ingest_url} · secret protected</div></div><button onClick={() => remove(channel.id)} className="text-sm text-destructive hover:underline">Remove</button></div>)}</div>}
        </section>
      </div>
    </div>
  </Layout>;
}
