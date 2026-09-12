import { spawn, ChildProcess, exec } from 'child_process';
import { getDb, logActivity } from './database';
import { registerStream, unregisterStream } from './stream-manager';
import { killFFmpegProcess } from './processKiller';
import { updateStreamStats, clearStreamStats } from './streamStats';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface StreamProcess {
  process: ChildProcess;
  streamId: number;
  pid?: number;
}

const activeStreams = new Map<number, StreamProcess>();
const MAX_ERROR_OUTPUT_BYTES = 256_000;

export interface StreamOptions {
  videoPath: string;
  rtmpUrl: string;
  quality: '720p' | '1080p';
  loop: boolean;
}

const qualityPresets = {
  '720p': {
    resolution: '1280:720',
    videoBitrate: '3000k',
    maxBitrate: '3500k',
    bufferSize: '7000k',
  },
  '1080p': {
    resolution: '1920:1080',
    videoBitrate: '6000k',
    maxBitrate: '7000k',
    bufferSize: '14000k',
  },
};

export async function startStream(streamId: number, options: StreamOptions): Promise<void> {
  const preset = qualityPresets[options.quality];
  
  // Add a unique metadata comment to help identify this specific FFmpeg process
  const args = [
    '-re',
    ...(options.loop ? ['-stream_loop', '-1'] : []),
    '-i', options.videoPath,
    '-metadata', `comment=streamid:${streamId}`,
    '-metadata', `title=Stream ${streamId}`,
    '-c:v', 'libx264',
    '-preset', process.env.FFMPEG_PRESET || 'faster',
    '-tune', 'zerolatency',
    '-profile:v', 'high',
    '-pix_fmt', 'yuv420p',
    '-b:v', preset.videoBitrate,
    '-maxrate', preset.maxBitrate,
    '-bufsize', preset.bufferSize,
    '-vf', `scale=${preset.resolution}:force_original_aspect_ratio=decrease,pad=${preset.resolution}:(ow-iw)/2:(oh-ih)/2:color=black`,
    '-r', '30',
    '-g', '60',
    '-keyint_min', '60',
    '-sc_threshold', '0',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '48000',
    '-ac', '2',
    '-f', 'flv',
    options.rtmpUrl,
  ];

  // Try to find ffmpeg in common locations or use system PATH
  let ffmpegPath = 'ffmpeg';
  
  // Check common Windows locations
  const possiblePaths = [
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
    path.join(process.cwd(), 'ffmpeg', 'bin', 'ffmpeg.exe'),
    path.join(process.cwd(), 'ffmpeg', 'ffmpeg.exe'),
  ];
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      ffmpegPath = p;
      console.log('Using FFmpeg from:', p);
      break;
    }
  }
  
  const ffmpegProcess = spawn(ffmpegPath, args, {
    // Keep each broadcast in its own process group so stopping one stream
    // cannot terminate the worker or another broadcast.
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  console.log(`Started FFmpeg process for stream ${streamId} with PID: ${ffmpegProcess.pid}`);
  
  activeStreams.set(streamId, {
    process: ffmpegProcess,
    streamId,
    pid: ffmpegProcess.pid || undefined,
  });

  const db = await getDb();

  ffmpegProcess.on('error', async (error) => {
    console.error(`FFmpeg error for stream ${streamId}:`, error);
    await db.run(
      'UPDATE streams SET status = ?, error_message = ?, pid = NULL WHERE id = ?',
      ['error', error.message, streamId]
    );
    await logActivity('stream_error', `Stream ${streamId} encountered an error: ${error.message}`);
    activeStreams.delete(streamId);
    unregisterStream(streamId);
  });

  ffmpegProcess.on('exit', async (code, signal) => {
    console.log(`[STREAM EXIT] Stream ${streamId} - Code: ${code}, Signal: ${signal}, Time: ${new Date().toISOString()}`);
    
    // Log more details about the exit
    if (signal) {
      console.log(`[STREAM EXIT SIGNAL] Stream ${streamId} received signal: ${signal}`);
      console.trace('Exit signal trace');
    }
    
    // Remove from active streams immediately
    activeStreams.delete(streamId);
    unregisterStream(streamId);
    clearStreamStats(streamId);
    
    // Log the stack trace to help debug unexpected exits
    if (code !== 0 && code !== null && signal !== 'SIGTERM' && signal !== 'SIGKILL') {
      console.error(`[UNEXPECTED EXIT] Stream ${streamId} exited unexpectedly with code ${code}`);
      console.trace();
      // Only show actual errors, not termination messages
      const errorLines = errorOutput.split('\n').filter(line => 
        line.includes('error') || line.includes('Error') || line.includes('failed')
      );
      
      const errorMessage = errorLines.length > 0 
        ? `Stream error: ${errorLines[errorLines.length - 1]}`
        : `Process exited with code ${code}`;
        
      await db.run(
        'UPDATE streams SET status = ?, error_message = ?, pid = NULL WHERE id = ?',
        ['stopped', errorMessage, streamId]
      );
    } else {
      // Clean stop - check if this was intentional
      console.log(`[CLEAN EXIT] Stream ${streamId} stopped cleanly`);
      await db.run(
        'UPDATE streams SET status = ?, error_message = NULL, pid = NULL WHERE id = ?',
        ['stopped', streamId]
      );
    }
  });

  let errorOutput = '';
  
  ffmpegProcess.stderr?.on('data', (data) => {
    const output = data.toString().replace(options.rtmpUrl, '[RTMP_REDACTED]');
    console.log(`Stream ${streamId} FFmpeg:`, output);
    errorOutput = (errorOutput + output).slice(-MAX_ERROR_OUTPUT_BYTES);
    
    // Update stream statistics
    updateStreamStats(streamId, output);
  });

  // Also handle 'close' event as a fallback
  ffmpegProcess.on('close', (code, signal) => {
    console.log(`FFmpeg process for stream ${streamId} closed with code ${code} and signal ${signal}`);
    // Ensure it's removed from active streams
    if (activeStreams.has(streamId)) {
      activeStreams.delete(streamId);
      unregisterStream(streamId);
    }
  });

  // Update stream status to running
  await db.run(
    'UPDATE streams SET status = ?, pid = ?, started_at = CURRENT_TIMESTAMP, error_message = NULL WHERE id = ?',
    ['running', ffmpegProcess.pid || null, streamId]
  );

  // Register stream globally
  registerStream(streamId);

  await logActivity('stream_started', `Stream ${streamId} started`);
}

export async function stopStream(streamId: number, caller?: string): Promise<void> {
  const streamProcess = activeStreams.get(streamId);
  const db = await getDb();
  
  console.log(`[STOP REQUEST] Stream ${streamId} - Process exists: ${!!streamProcess}, Caller: ${caller || new Error().stack?.split('\n')[2]?.trim()}`);
  
  // Add safety check - verify this is an intentional stop
  const stream = await db.get('SELECT status, pid, rtmp_url FROM streams WHERE id = ?', [streamId]);
  if (!stream) {
    console.error(`[STOP ABORT] Stream ${streamId} not found in database`);
    return;
  }
  
  // Only stop if stream is actually running in database
  if (stream.status !== 'running') {
    console.log(`[STOP SKIP] Stream ${streamId} is already ${stream.status}, skipping stop`);
    return;
  }
  
  // Remove from active streams first
  activeStreams.delete(streamId);
  unregisterStream(streamId);
  
  // Update database immediately to reflect stopped status
  await db.run(
    'UPDATE streams SET status = ?, pid = NULL WHERE id = ?',
    ['stopped', streamId]
  );
  
  let killed = false;
  
  // Method 1: Try to kill using the ChildProcess object
  if (streamProcess?.process && !streamProcess.process.killed) {
    try {
      if (process.platform !== 'win32' && streamProcess.process.pid) {
        process.kill(-streamProcess.process.pid, 'SIGKILL');
      } else {
        streamProcess.process.kill('SIGKILL');
      }
      killed = true;
      console.log(`Killed stream ${streamId} process group`);
    } catch (e) {
      console.log('ChildProcess.kill() failed:', e);
    }
  }
  
  // Method 2: Try to kill using stored PID
  const pid = streamProcess?.process?.pid || stream?.pid;
  if (pid && !killed) {
    console.log(`Trying to kill FFmpeg process with PID: ${pid}`);
    
    try {
      // Use kill -9 which is most reliable
      await execAsync(`kill -9 ${pid}`);
      killed = true;
      console.log(`Successfully killed FFmpeg process ${pid} for stream ${streamId}`);
    } catch (e) {
      console.log(`kill -9 ${pid} failed:`, e);
      
      // Try Node.js process.kill
      try {
        process.kill(pid, 'SIGKILL');
        killed = true;
        console.log(`Killed process ${pid} using process.kill`);
      } catch (e2) {
        console.log('process.kill also failed:', e2);
      }
    }
  }
  
  // Method 3: Kill by stream ID pattern (most reliable)
  try {
    // First try to find by stream ID metadata
    const { stdout: psOutput } = await execAsync(`ps aux | grep ffmpeg | grep "streamid:${streamId}" | grep -v grep`);
    const processes = psOutput.trim().split('\n').filter(line => line);
    
    console.log(`Found ${processes.length} FFmpeg processes with streamid:${streamId}`);
    
    for (const proc of processes) {
      const parts = proc.split(/\s+/);
      const procPid = parts[1];
      if (procPid) {
        try {
          await execAsync(`kill -9 ${procPid}`);
          killed = true;
          console.log(`Killed FFmpeg process ${procPid} by stream ID match`);
        } catch (e) {
          console.log(`Failed to kill PID ${procPid}:`, e);
        }
      }
    }
  } catch (e) {
    console.log('ps/grep for stream ID failed:', e);
  }
  
  // Method 4: Kill by RTMP URL pattern (fallback)
  if (!killed && stream?.rtmp_url) {
    try {
      // Try to find by RTMP URL
      const { stdout } = await execAsync(`ps aux | grep ffmpeg | grep "${stream.rtmp_url}" | grep -v grep`);
      const processes = stdout.trim().split('\n').filter(line => line);
      
      console.log(`Found ${processes.length} FFmpeg processes with RTMP URL: ${stream.rtmp_url}`);
      
      for (const proc of processes) {
        const parts = proc.split(/\s+/);
        const procPid = parts[1];
        if (procPid) {
          try {
            await execAsync(`kill -9 ${procPid}`);
            killed = true;
            console.log(`Killed FFmpeg process ${procPid} by RTMP URL match`);
          } catch (e) {
            console.log(`Failed to kill PID ${procPid}:`, e);
          }
        }
      }
    } catch (e) {
      console.log('ps/grep for RTMP URL failed:', e);
    }
    
    // Also try pkill as last resort
    if (!killed) {
      try {
        // First try by stream ID
        await execAsync(`pkill -9 -f "streamid:${streamId}"`);
        console.log(`Used pkill to stop processes with streamid:${streamId}`);
      } catch (e) {
        // Try by RTMP URL
        try {
          await execAsync(`pkill -9 -f "${stream.rtmp_url}"`);
          console.log(`Used pkill to stop processes with RTMP URL: ${stream.rtmp_url}`);
        } catch (e2) {
          console.log('pkill attempts failed:', (e as Error).message, (e2 as Error).message);
        }
      }
    }
  }
  
  // Method 5: Use dedicated kill script (ultimate fallback)
  if (!killed) {
    try {
      const scriptPath = path.join(process.cwd(), 'scripts', 'kill-stream.sh');
      await execAsync(`sh "${scriptPath}" ${streamId} "${stream?.rtmp_url || ''}"`);
      console.log(`Used kill script to stop stream ${streamId}`);
    } catch (e) {
      console.log('Kill script failed:', e);
    }
  }
  
  // Clear stream statistics
  clearStreamStats(streamId);
  
  await logActivity('stream_stopped', `Stream ${streamId} stop requested`);
}

export function getActiveStreams(): number[] {
  return Array.from(activeStreams.keys());
}

export async function stopAllStreams(): Promise<void> {
  activeStreams.forEach((streamProcess, streamId) => {
    streamProcess.process.kill('SIGTERM');
  });
  activeStreams.clear();
  
  const db = await getDb();
  await db.run('UPDATE streams SET status = ?, pid = NULL WHERE status = ?', ['stopped', 'running']);
}
