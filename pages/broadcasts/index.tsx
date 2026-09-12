import { useEffect, useState } from 'react';
import axios from 'axios';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { getSession } from '@/lib/auth';
import type { GetServerSidePropsContext } from 'next';
import toast from 'react-hot-toast';

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const session = await getSession(context.req, context.res);
  if (!session.user?.isLoggedIn) return { redirect: { destination: '/auth/login', permanent: false } };
  return { props: {} };
}

type Video = { id: number; original_name: string; file_path: string };
type Channel = { id: string; display_name: string; platform: string; enabled: boolean };
type Broadcast = { id: string; title: string; status: string; quality: string; last_error?: string };

export default function BroadcastsPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [videoId, setVideoId] = useState('');
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [title, setTitle] = useState('My first QC Live broadcast');
  const [quality, setQuality] = useState('720p');
  const [loopEnabled, setLoopEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [videosRes, channelsRes, broadcastsRes] = await Promise.all([
        axios.get('/api/videos/list'), axios.get('/api/channels'), axios.get('/api/broadcasts'),
      ]);
      setVideos(videosRes.data.videos || []); setChannels(channelsRes.data.channels || []); setBroadcasts(broadcastsRes.data.broadcasts || []);
      if (!videoId && videosRes.data.videos?.[0]) setVideoId(String(videosRes.data.videos[0].id));
    } catch (error: any) { toast.error(error.response?.data?.error || 'Complete backend setup before creating a broadcast'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); const timer = setInterval(load, 8000); return () => clearInterval(timer); }, []);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    const video = videos.find(item => String(item.id) === videoId);
    if (!video || !channelIds.length) return toast.error('Choose a video and at least one destination');
    setSaving(true);
    try {
      await axios.post('/api/broadcasts', { title, sourcePath: video.file_path, quality, loopEnabled, channelIds });
      toast.success('Broadcast sent to the PyRunner media worker'); load();
    } catch (error: any) { toast.error(error.response?.data?.error || 'Could not start broadcast'); }
    finally { setSaving(false); }
  };

  const stop = async (id: string) => {
    try { await axios.post(`/api/broadcasts/${id}/stop`); toast.success('Stop request sent'); load(); }
    catch (error: any) { toast.error(error.response?.data?.error || 'Could not stop broadcast'); }
  };

  return <Layout><div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div className="mb-8"><h1 className="text-3xl font-bold text-foreground">Create a broadcast</h1><p className="text-muted-foreground mt-2">Choose a video, select destinations, and start a high-quality live stream in one step.</p></div>
    <div className="grid lg:grid-cols-5 gap-8">
      <form onSubmit={create} className="lg:col-span-3 bg-card border border-border rounded-lg p-6 space-y-5">
        <div><label className="block text-sm font-medium mb-1">1. Broadcast name</label><input required value={title} onChange={e => setTitle(e.target.value)} className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground" /></div>
        <div><label className="block text-sm font-medium mb-1">2. Choose a video</label>{videos.length ? <select required value={videoId} onChange={e => setVideoId(e.target.value)} className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground">{videos.map(video => <option key={video.id} value={video.id}>{video.original_name}</option>)}</select> : <p className="text-sm text-muted-foreground">No videos yet. <Link className="text-primary underline" href="/videos">Upload one first</Link>.</p>}</div>
        <div><label className="block text-sm font-medium mb-2">3. Select destinations</label>{channels.length ? <div className="space-y-2">{channels.map(channel => <label key={channel.id} className="flex items-center gap-3 rounded-md border border-border p-3"><input type="checkbox" checked={channelIds.includes(channel.id)} onChange={e => setChannelIds(current => e.target.checked ? [...current, channel.id] : current.filter(id => id !== channel.id))} /><span><span className="block font-medium">{channel.display_name}</span><span className="text-xs text-muted-foreground">{channel.platform}</span></span></label>)}</div> : <p className="text-sm text-muted-foreground">No destinations yet. <Link className="text-primary underline" href="/channels">Connect one first</Link>.</p>}</div>
        <div className="grid sm:grid-cols-2 gap-4"><label className="block text-sm font-medium">Quality<select value={quality} onChange={e => setQuality(e.target.value)} className="mt-1 w-full px-3 py-2 bg-input border border-border rounded-md text-foreground"><option value="720p">720p — balanced</option><option value="1080p">1080p — highest quality</option></select></label><label className="flex items-center gap-2 mt-6 text-sm"><input type="checkbox" checked={loopEnabled} onChange={e => setLoopEnabled(e.target.checked)} /> Loop video continuously</label></div>
        <button disabled={saving || loading || !videos.length || !channels.length} className="w-full rounded-md bg-primary py-3 font-medium text-primary-foreground disabled:opacity-50">{saving ? 'Starting on PyRunner…' : 'Start broadcast now'}</button>
      </form>
      <section className="lg:col-span-2 bg-card border border-border rounded-lg p-6"><h2 className="text-xl font-semibold mb-4">Recent broadcasts</h2>{broadcasts.length ? <div className="space-y-3">{broadcasts.map(item => <div key={item.id} className="border border-border rounded-md p-4"><div className="flex justify-between gap-3"><span className="font-medium">{item.title}</span><span className="text-xs uppercase text-muted-foreground">{item.status}</span></div><p className="text-xs text-muted-foreground mt-1">{item.quality}</p>{item.last_error && <p className="text-xs text-destructive mt-2">{item.last_error}</p>}{['starting', 'running', 'stopping'].includes(item.status) && <button onClick={() => stop(item.id)} className="mt-3 text-sm text-destructive hover:underline">Stop broadcast</button>}</div>)}</div> : <p className="text-sm text-muted-foreground">Your broadcasts will appear here.</p>}</section>
    </div>
  </div></Layout>;
}
