import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { getSession } from '@/lib/auth';
import { GetServerSidePropsContext } from 'next';
import axios from 'axios';
import VideoUpload from '@/components/VideoUpload';
import VideoLibrary from '@/components/VideoLibrary';
import Layout from '@/components/Layout';
import toast from 'react-hot-toast';

export const getServerSideProps = async (context: GetServerSidePropsContext) => {
  const session = await getSession(context.req, context.res);
  
  if (!session.user?.isLoggedIn) {
    return {
      redirect: {
        destination: '/auth/login',
        permanent: false,
      },
    };
  }

  return {
    props: {},
  };
};

export default function VideosPage() {
  const [videos, setVideos] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sourceUrl, setSourceUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const fetchVideos = async () => {
    try {
      const response = await axios.get('/api/videos/list');
      setVideos(response.data.videos);
    } catch (error) {
      console.error('Failed to fetch videos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVideos();
  }, []);

  const importVideo = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsImporting(true);
    try {
      await axios.post('/api/videos/import', { url: sourceUrl });
      setSourceUrl('');
      toast.success('Video imported into your library');
      fetchVideos();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Could not import video');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Video Library</h1>
          <p className="text-muted-foreground">Upload and manage your videos</p>
        </div>

        <div className="space-y-8">
          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">Upload Video</h2>
            <VideoUpload onUploadComplete={fetchVideos} />
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-xl font-semibold text-foreground mb-2">Import from a public video URL</h2>
            <p className="text-sm text-muted-foreground mb-4">Import one video, then select it in Streams to broadcast it to your linked platforms.</p>
            <form onSubmit={importVideo} className="flex flex-col sm:flex-row gap-3">
              <input type="url" required value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://example.com/public-video" className="flex-1 px-3 py-2 bg-input border border-border rounded-md text-foreground" />
              <button type="submit" disabled={isImporting} className="px-4 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-50">{isImporting ? 'Importing…' : 'Import video'}</button>
            </form>
            <p className="text-xs text-muted-foreground mt-3">Only public, permitted downloads are supported. Private videos, DRM, paywalls, playlists, and access-control bypasses are not supported. The importer runs on the persistent worker, not Vercel.</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">Your Videos</h2>
            {isLoading ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Loading videos...</p>
              </div>
            ) : (
              <VideoLibrary videos={videos} onRefresh={fetchVideos} />
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
