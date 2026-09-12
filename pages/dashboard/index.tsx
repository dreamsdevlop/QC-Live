import { useState, useEffect } from 'react';
import { getSession } from '@/lib/auth';
import { GetServerSidePropsContext } from 'next';
import axios from 'axios';
import Link from 'next/link';
import Layout from '@/components/Layout';
import dayjs from 'dayjs';

interface MetricCardProps {
  title: string;
  value: string;
  subtitle: string;
  color: string;
  showProgress?: boolean;
  progress?: number;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const MetricCard = ({ title, value, subtitle, color, showProgress, progress }: MetricCardProps) => {
  const colorClasses = {
    blue: 'text-blue-600 bg-blue-100 dark:bg-blue-900/20',
    purple: 'text-purple-600 bg-purple-100 dark:bg-purple-900/20',
    green: 'text-green-600 bg-green-100 dark:bg-green-900/20',
    orange: 'text-orange-600 bg-orange-100 dark:bg-orange-900/20',
    red: 'text-red-600 bg-red-100 dark:bg-red-900/20',
    indigo: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-900/20',
    pink: 'text-pink-600 bg-pink-100 dark:bg-pink-900/20',
  };

  const bgColor = colorClasses[color as keyof typeof colorClasses] || colorClasses.blue;

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="text-sm text-muted-foreground mb-1">{title}</div>
      <div className="text-2xl font-bold text-foreground mb-1">{value}</div>
      {showProgress && progress !== undefined && (
        <div className="w-full bg-secondary rounded-full h-2 mb-2">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${bgColor.split(' ')[0]}`}
            style={{ width: `${Math.min(progress, 100)}%`, backgroundColor: 'currentColor' }}
          />
        </div>
      )}
      <div className="text-xs text-muted-foreground">{subtitle}</div>
    </div>
  );
};

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

interface DashboardData {
  videoCount: number;
  streamCount: number;
  activeStreamCount: number;
  recentActivity: any[];
}

interface SystemStats {
  systemCpu: number;
  amsCpu: number;
  dbAvgQueryTime: number;
  activeStreams: number;
  idealStreams: number;
  disk: {
    used: number;
    total: number;
    percent: number;
    usedFormatted: string;
    totalFormatted: string;
  };
  memory: {
    used: number;
    total: number;
    percent: number;
    usedFormatted: string;
    totalFormatted: string;
  };
  heap: {
    used: number;
    total: number;
    percent: number;
    usedFormatted: string;
    totalFormatted: string;
  };
}

interface StreamStatsData {
  averages: {
    avgBitrate: number;
    avgFps: number;
    avgSpeed: number;
    totalDataTransferred: number;
    totalDroppedFrames: number;
    overallQuality: 'excellent' | 'good' | 'fair' | 'poor';
    problemStreams: number[];
  };
  summary: {
    totalStreams: number;
    excellentStreams: number;
    goodStreams: number;
    fairStreams: number;
    poorStreams: number;
    streamsWithErrors: number;
  };
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>({
    videoCount: 0,
    streamCount: 0,
    activeStreamCount: 0,
    recentActivity: [],
  });
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [streamStats, setStreamStats] = useState<StreamStatsData | null>(null);
  const [setup, setSetup] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
    fetchSystemStats();
    fetchStreamStats();
    axios.get('/api/setup/status').then((response) => setSetup(response.data)).catch(() => undefined);
    const interval = setInterval(() => {
      fetchDashboardData();
      fetchSystemStats();
      fetchStreamStats();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [videosRes, streamsRes, statusRes] = await Promise.all([
        axios.get('/api/videos/list'),
        axios.get('/api/streams/list'),
        axios.get('/api/streams/dashboard-status'), // Use dashboard-specific endpoint
      ]);

      setData({
        videoCount: videosRes.data.videos.length,
        streamCount: streamsRes.data.streams.length,
        activeStreamCount: statusRes.data.activeCount,
        recentActivity: [], // Would fetch from activity_logs table
      });
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSystemStats = async () => {
    try {
      const response = await axios.get('/api/system/stats');
      setSystemStats(response.data);
    } catch (error) {
      console.error('Failed to fetch system stats:', error);
    }
  };

  const fetchStreamStats = async () => {
    try {
      const response = await axios.get('/api/streams/stats');
      setStreamStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stream stats:', error);
    }
  };

  const stats: Array<{
    label: string;
    value: number;
    subtitle?: string;
    href: string;
    color: string;
  }> = [
    {
      label: 'Total Videos',
      value: data.videoCount,
      href: '/videos',
      color: 'bg-blue-500',
    },
    {
      label: 'Total Streams',
      value: data.streamCount,
      href: '/streams',
      color: 'bg-purple-500',
    },
    {
      label: 'Active Streams',
      value: data.activeStreamCount,
      subtitle: systemStats ? `Ideal: ${systemStats.idealStreams}` : undefined,
      href: '/streams',
      color: systemStats && data.activeStreamCount > systemStats.idealStreams ? 'bg-orange-500' : 'bg-green-500',
    },
  ];

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome to QC Live - Professional Streaming Application
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Start your first live stream</h2>
              <p className="text-sm text-muted-foreground mt-1">Complete these simple steps. QC Live handles the worker and stream process for you.</p>
            </div>
            <Link href="/broadcasts" className="inline-flex justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">Open stream setup</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-5">
            {[
              { number: '1', title: 'Upload video', text: 'Choose an MP4 or supported video file.', href: '/videos' },
              { number: '2', title: 'Connect destination', text: 'Add YouTube, Twitch, Facebook, or custom RTMP.', href: '/channels' },
              { number: '3', title: 'Start streaming', text: 'Pick your video, quality, and click Start.', href: '/broadcasts' },
            ].map((step) => (
              <Link href={step.href} key={step.number} className="flex gap-3 rounded-md border border-border p-4 hover:border-primary transition-colors">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">{step.number}</span>
                <span><span className="block font-medium text-foreground">{step.title}</span><span className="block text-xs text-muted-foreground mt-1">{step.text}</span></span>
              </Link>
            ))}
          </div>
          {setup && !setup.ready && (
            <div className="mt-4 rounded-md border border-orange-300 bg-orange-50 dark:bg-orange-900/20 p-3 text-sm text-orange-800 dark:text-orange-200">
              {!setup.checks?.database ? 'Supabase is not reachable. ' : ''}{!setup.checks?.workerReachable ? 'The persistent PyRunner/FFmpeg worker is not reachable from Vercel. Configure MEDIA_WORKER_URL and MEDIA_WORKER_TOKEN, deploy the worker with FFmpeg, and make sure its /api/v1/media/health/ endpoint is reachable.' : ''}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading dashboard...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {stats.map((stat) => (
                <Link key={stat.label} href={stat.href}>
                  <div className="bg-card border border-border rounded-lg p-6 hover:border-primary transition-colors cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{stat.label}</p>
                        <p className="text-3xl font-bold text-foreground mt-1">{stat.value}</p>
                        {stat.subtitle && (
                          <p className="text-sm text-muted-foreground mt-1">{stat.subtitle}</p>
                        )}
                      </div>
                      <div className={`w-12 h-12 ${stat.color} rounded-lg opacity-20`} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* System Metrics */}
            {systemStats && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <MetricCard
                  title="System CPU"
                  value={`${systemStats.systemCpu}%`}
                  subtitle={`${systemStats.systemCpu}%`}
                  color="blue"
                />
                <MetricCard
                  title="AMS CPU"
                  value={`${systemStats.amsCpu}%`}
                  subtitle={`${systemStats.amsCpu}%`}
                  color="purple"
                />
                <MetricCard
                  title="DB Average Query Time"
                  value={`${systemStats.dbAvgQueryTime}ms`}
                  subtitle={`${systemStats.dbAvgQueryTime}ms`}
                  color="green"
                />
                <MetricCard
                  title="Active Live Streams"
                  value={systemStats.activeStreams.toString()}
                  subtitle={systemStats.activeStreams.toString()}
                  color="orange"
                />
                <MetricCard
                  title="System Disk"
                  value={`${systemStats.disk.percent}%`}
                  subtitle={`${systemStats.disk.usedFormatted} / ${systemStats.disk.totalFormatted}`}
                  color="red"
                  showProgress={true}
                  progress={systemStats.disk.percent}
                />
                <MetricCard
                  title="System Memory"
                  value={`${systemStats.memory.percent}%`}
                  subtitle={`${systemStats.memory.usedFormatted} / ${systemStats.memory.totalFormatted}`}
                  color="indigo"
                  showProgress={true}
                  progress={systemStats.memory.percent}
                />
                <MetricCard
                  title="JVM Heap Memory"
                  value={`${systemStats.heap.percent}%`}
                  subtitle={`${systemStats.heap.usedFormatted} / ${systemStats.heap.totalFormatted}`}
                  color="pink"
                  showProgress={true}
                  progress={systemStats.heap.percent}
                />
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-card border border-border rounded-lg p-6">
                <h2 className="text-xl font-semibold text-foreground mb-4">Quick Actions</h2>
                <div className="space-y-3">
                  <Link href="/videos">
                    <button className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-left">
                      Upload New Video
                    </button>
                  </Link>
                  <Link href="/streams">
                    <button className="w-full px-4 py-3 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors text-left">
                      Create New Stream
                    </button>
                  </Link>
                </div>
              </div>

              <div className="bg-card border border-border rounded-lg p-6">
                <h2 className="text-xl font-semibold text-foreground mb-4">System Status</h2>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">App Status</span>
                    <span className="text-green-500 flex items-center">
                      <div className="w-2 h-2 bg-green-500 rounded-full mr-2" />
                      Online
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Active Streams</span>
                    <span className="text-foreground">{data.activeStreamCount}</span>
                  </div>
                  {systemStats && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Stream Capacity</span>
                      <div className="flex items-center">
                        <span className={`text-sm ${
                          data.activeStreamCount > systemStats.idealStreams 
                            ? 'text-orange-500' 
                            : 'text-green-500'
                        }`}>
                          {data.activeStreamCount} / {systemStats.idealStreams}
                        </span>
                        <div className="ml-2 text-xs text-muted-foreground">
                          ({Math.round((data.activeStreamCount / systemStats.idealStreams) * 100)}%)
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Server Time</span>
                    <span className="text-foreground">{dayjs().format('h:mm A')}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Stream Health Section */}
            {streamStats && data.activeStreamCount > 0 && (
              <div className="mt-8 bg-card border border-border rounded-lg p-6">
                <h2 className="text-xl font-semibold text-foreground mb-4">Stream Health</h2>
                
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-foreground">
                      {Math.round(streamStats.averages.avgBitrate)} kbps
                    </div>
                    <div className="text-sm text-muted-foreground">Avg Bitrate</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-foreground">
                      {streamStats.averages.avgFps.toFixed(1)} fps
                    </div>
                    <div className="text-sm text-muted-foreground">Avg FPS</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${
                      streamStats.averages.avgSpeed >= 0.95 && streamStats.averages.avgSpeed <= 1.05
                        ? 'text-green-500'
                        : 'text-orange-500'
                    }`}>
                      {streamStats.averages.avgSpeed.toFixed(2)}x
                    </div>
                    <div className="text-sm text-muted-foreground">Avg Speed</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${
                      streamStats.averages.overallQuality === 'excellent' ? 'text-green-500' :
                      streamStats.averages.overallQuality === 'good' ? 'text-blue-500' :
                      streamStats.averages.overallQuality === 'fair' ? 'text-yellow-500' : 'text-red-500'
                    }`}>
                      {streamStats.averages.overallQuality.charAt(0).toUpperCase() + 
                       streamStats.averages.overallQuality.slice(1)}
                    </div>
                    <div className="text-sm text-muted-foreground">Overall Quality</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-green-500 rounded-full mr-2" />
                    <span className="text-muted-foreground">Excellent:</span>
                    <span className="ml-1 font-medium">{streamStats.summary.excellentStreams}</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-blue-500 rounded-full mr-2" />
                    <span className="text-muted-foreground">Good:</span>
                    <span className="ml-1 font-medium">{streamStats.summary.goodStreams}</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-yellow-500 rounded-full mr-2" />
                    <span className="text-muted-foreground">Fair:</span>
                    <span className="ml-1 font-medium">{streamStats.summary.fairStreams}</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-red-500 rounded-full mr-2" />
                    <span className="text-muted-foreground">Poor:</span>
                    <span className="ml-1 font-medium">{streamStats.summary.poorStreams}</span>
                  </div>
                </div>

                {streamStats.averages.problemStreams.length > 0 && (
                  <div className="mt-4 p-3 bg-orange-100 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-800 rounded">
                    <p className="text-sm text-orange-800 dark:text-orange-200">
                      <strong>Attention:</strong> {streamStats.averages.problemStreams.length} stream(s) 
                      experiencing issues (IDs: {streamStats.averages.problemStreams.join(', ')})
                    </p>
                  </div>
                )}

                {streamStats.summary.streamsWithErrors > 0 && (
                  <div className="mt-2 p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded">
                    <p className="text-sm text-red-800 dark:text-red-200">
                      <strong>Errors:</strong> {streamStats.summary.streamsWithErrors} stream(s) 
                      have reported errors
                    </p>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Total Data Transferred:</span>
                    <span className="font-medium text-foreground">
                      {formatBytes(streamStats.averages.totalDataTransferred)}
                    </span>
                  </div>
                  {streamStats.averages.totalDroppedFrames > 0 && (
                    <div className="flex justify-between items-center text-sm mt-2">
                      <span className="text-muted-foreground">Total Dropped Frames:</span>
                      <span className="font-medium text-orange-500">
                        {streamStats.averages.totalDroppedFrames.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
