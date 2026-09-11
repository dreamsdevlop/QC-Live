import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

interface Video {
  id: number;
  original_name: string;
}

interface Channel {
  id: string;
  display_name: string;
  platform: string;
  ingest_url: string;
}

interface StreamFormProps {
  onSuccess: () => void;
}

export default function StreamForm({ onSuccess }: StreamFormProps) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [platform, setPlatform] = useState<'youtube' | 'custom'>('youtube');
  const [streamKey, setStreamKey] = useState('');
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [useBackup, setUseBackup] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    videoId: '',
    rtmpUrl: '',
    quality: '720p',
    loopEnabled: true,
  });

  useEffect(() => {
    fetchVideos();
    fetchChannels();
  }, []);

  useEffect(() => {
    if (platform === 'youtube' && streamKey) {
      const baseUrl = useBackup 
        ? 'rtmp://b.rtmp.youtube.com/live2?backup=1'
        : 'rtmp://a.rtmp.youtube.com/live2';
      setFormData(prev => ({ ...prev, rtmpUrl: `${baseUrl}/${streamKey}` }));
    }
  }, [platform, streamKey, useBackup]);

  const fetchVideos = async () => {
    try {
      const response = await axios.get('/api/videos/list');
      setVideos(response.data.videos);
    } catch (error) {
      toast.error('Failed to load videos');
    }
  };

  const fetchChannels = async () => {
    try {
      const response = await axios.get('/api/channels');
      setChannels(response.data.channels || []);
    } catch {
      // Channel linking is optional; manual RTMP creation remains available.
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.videoId) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (selectedChannelIds.length === 0 && platform === 'youtube' && !streamKey) {
      toast.error('Please enter your YouTube stream key');
      return;
    }

    if (selectedChannelIds.length === 0 && !formData.rtmpUrl) {
      toast.error('Please provide an RTMP URL');
      return;
    }

    setIsLoading(true);

    try {
      if (selectedChannelIds.length > 0) {
        const response = await axios.post('/api/streams/orchestrate', { ...formData, channelIds: selectedChannelIds });
        const started = response.data.results.filter((result: { status: string }) => result.status === 'started').length;
        const failed = response.data.results.length - started;
        toast.success(`Started ${started} platform${started === 1 ? '' : 's'}${failed ? `; ${failed} failed` : ''}`);
      } else {
        await axios.post('/api/streams/create', { ...formData });
        toast.success('Stream created! You can start it from the stream list.');
      }
      setFormData({
        name: '',
        videoId: '',
        rtmpUrl: '',
        quality: '720p',
        loopEnabled: true,
      });
      setStreamKey('');
      setSelectedChannelIds([]);
      setPlatform('youtube');
      setUseBackup(false);
      onSuccess();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to create stream');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-foreground mb-1">
          Stream Name
        </label>
        <input
          type="text"
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="My 24/7 Stream"
          required
        />
      </div>

      <div>
        <label htmlFor="video" className="block text-sm font-medium text-foreground mb-1">
          Select Video
        </label>
        <select
          id="video"
          value={formData.videoId}
          onChange={(e) => setFormData({ ...formData, videoId: e.target.value })}
          className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          required
        >
          <option value="">Choose a video...</option>
          {videos.map((video) => (
            <option key={video.id} value={video.id}>
              {video.original_name}
            </option>
          ))}
        </select>
      </div>

      {channels.length > 0 && (
        <div>
          <span className="block text-sm font-medium text-foreground mb-1">Stream to linked channels</span>
          <div className="space-y-2 rounded-md border border-border p-3">
            {channels.map((channel) => (
              <label key={channel.id} className="flex items-center gap-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={selectedChannelIds.includes(channel.id)}
                  onChange={(event) => setSelectedChannelIds((current) => event.target.checked ? [...current, channel.id] : current.filter((id) => id !== channel.id))}
                  className="h-4 w-4 text-primary focus:ring-primary border-border rounded"
                />
                <span>{channel.display_name} <span className="text-muted-foreground">· {channel.platform}</span></span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Select multiple channels to fan out one video. Each destination runs independently; encrypted secrets stay on the server.</p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          Streaming Platform
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPlatform('youtube')}
            className={`flex items-center p-3 border rounded-md cursor-pointer transition-all w-full ${
              platform === 'youtube' 
                ? 'border-primary bg-primary/10' 
                : 'border-border hover:bg-secondary/10'
            }`}
          >
            <input
              type="radio"
              value="youtube"
              checked={platform === 'youtube'}
              onChange={(e) => setPlatform('youtube')}
              className="sr-only"
            />
            <div className="flex items-center space-x-2">
              <svg className="w-6 h-6 text-red-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
              <div>
                <span className="text-sm font-medium">YouTube</span>
                <p className="text-xs text-muted-foreground">Live streaming</p>
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setPlatform('custom')}
            className={`flex items-center p-3 border rounded-md cursor-pointer transition-all w-full ${
              platform === 'custom' 
                ? 'border-primary bg-primary/10' 
                : 'border-border hover:bg-secondary/10'
            }`}
          >
            <input
              type="radio"
              value="custom"
              checked={platform === 'custom'}
              onChange={(e) => setPlatform('custom')}
              className="sr-only"
            />
            <div className="flex items-center space-x-2">
              <svg className="w-6 h-6 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <div>
                <span className="text-sm font-medium">Custom</span>
                <p className="text-xs text-muted-foreground">Twitch, Facebook, etc</p>
              </div>
            </div>
          </button>
        </div>
      </div>

      {platform === 'youtube' ? (
        <>
          <div>
            <label htmlFor="streamKey" className="block text-sm font-medium text-foreground mb-1">
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4 text-red-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
                <span>YouTube Stream Key</span>
              </div>
            </label>
            <div className={`relative transition-all duration-200 ${streamKey ? 'shadow-sm' : ''}`}>
              <input
                type="text"
                id="streamKey"
                value={streamKey}
                onChange={(e) => setStreamKey(e.target.value)}
                className={`w-full px-3 py-2 border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all duration-200 ${
                  streamKey 
                    ? 'bg-green-50 dark:bg-green-950/20 border-green-300 dark:border-green-800' 
                    : 'bg-input border-border'
                }`}
                placeholder="xxxx-xxxx-xxxx-xxxx"
                required
              />
              {streamKey && (
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                  <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Get your stream key from YouTube Studio → Go Live → Stream Key
            </p>
          </div>

          <div className={`p-3 rounded-md border transition-all duration-200 ${
            useBackup 
              ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-300 dark:border-blue-800' 
              : 'bg-secondary/10 border-border'
          }`}>
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                id="useBackup"
                checked={useBackup}
                onChange={(e) => setUseBackup(e.target.checked)}
                className="h-4 w-4 text-primary focus:ring-primary border-border rounded"
              />
              <div className="ml-3">
                <span className="text-sm font-medium text-foreground">Use backup server</span>
                <p className="text-xs text-muted-foreground">Recommended for better stability and redundancy</p>
              </div>
            </label>
          </div>

          {formData.rtmpUrl && (
            <div className="bg-green-50 dark:bg-green-950/20 border border-green-300 dark:border-green-800 p-3 rounded-md">
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <code className="text-xs text-green-800 dark:text-green-200 break-all">{formData.rtmpUrl}</code>
              </div>
            </div>
          )}
        </>
      ) : (
        <div>
          <label htmlFor="rtmpUrl" className="block text-sm font-medium text-foreground mb-1">
            Custom RTMP URL
          </label>
          <input
            type="text"
            id="rtmpUrl"
            value={formData.rtmpUrl}
            onChange={(e) => setFormData({ ...formData, rtmpUrl: e.target.value })}
            className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="rtmp://your.server/live/stream_key"
            required
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Enter your Twitch, Facebook, or other platform's RTMP URL
          </p>
        </div>
      )}

      <div>
        <label htmlFor="quality" className="block text-sm font-medium text-foreground mb-1">
          Stream Quality
        </label>
        <select
          id="quality"
          value={formData.quality}
          onChange={(e) => setFormData({ ...formData, quality: e.target.value })}
          className="w-full px-3 py-2 bg-input border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="720p">720p (2 Mbps)</option>
          <option value="1080p">1080p (3.5 Mbps)</option>
        </select>
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="loop"
          checked={formData.loopEnabled}
          onChange={(e) => setFormData({ ...formData, loopEnabled: e.target.checked })}
          className="h-4 w-4 text-primary focus:ring-primary border-border rounded"
        />
        <label htmlFor="loop" className="ml-2 block text-sm text-foreground">
          Loop video continuously (24/7 streaming)
        </label>
      </div>

      <button
        type="submit"
        disabled={isLoading || videos.length === 0}
        className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Creating Stream...' : 'Create Stream'}
      </button>

      {videos.length === 0 && (
        <p className="text-sm text-muted-foreground text-center">
          Upload a video first to create a stream
        </p>
      )}
    </form>
  );
}
