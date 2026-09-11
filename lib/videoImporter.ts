import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { promisify } from 'util';
import { execFile } from 'child_process';
import { saveFile, generateFileName, isVideoFile, MAX_FILE_SIZE } from './storage';
import { generateThumbnail } from './thumbnail';
import { getDb, logActivity } from './database';

const execFileAsync = promisify(execFile);
const MAX_IMPORT_BYTES = Math.min(MAX_FILE_SIZE, 2 * 1024 * 1024 * 1024);

function validatePublicUrl(rawUrl: string) {
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { throw new Error('Enter a valid video URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP and HTTPS video URLs are supported');
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname === '::1' || hostname.endsWith('.local') || /^127\.|^10\.|^192\.168\.|^169\.254\./.test(hostname)) {
    throw new Error('Private and local network URLs are not allowed');
  }
  return parsed.toString();
}

async function findDownloadedFile(directory: string) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const fullPath = path.join(directory, entry.name);
    const stat = await fs.stat(fullPath);
    if (stat.size > MAX_IMPORT_BYTES) throw new Error('Downloaded file exceeds the configured size limit');
    if (isVideoFile(entry.name)) candidates.push({ fullPath, size: stat.size });
  }
  if (!candidates.length) throw new Error('The source did not produce a supported video file');
  return candidates.sort((a, b) => b.size - a.size)[0];
}

export async function importPublicVideo(rawUrl: string) {
  const url = validatePublicUrl(rawUrl);
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'qc-live-import-'));
  try {
    const outputTemplate = path.join(workdir, '%(id)s.%(ext)s');
    await execFileAsync('yt-dlp', [
      '--no-playlist',
      '--restrict-filenames',
      '--max-filesize', `${MAX_IMPORT_BYTES}`,
      '--merge-output-format', 'mp4',
      '--output', outputTemplate,
      '--print', 'after_move:filepath',
      url,
    ], { timeout: 30 * 60 * 1000, maxBuffer: 1024 * 1024 });

    const downloaded = await findDownloadedFile(workdir);
    const originalName = path.basename(downloaded.fullPath).replace(/\.[^/.]+$/, '') + path.extname(downloaded.fullPath);
    const filename = generateFileName(originalName);
    const buffer = await fs.readFile(downloaded.fullPath);
    const filePath = await saveFile(buffer, filename);
    let thumbnailPath: string | null = null;
    try {
      thumbnailPath = await generateThumbnail(filePath, filename.replace(/\.[^/.]+$/, '') + '_thumb.jpg');
    } catch (error) {
      console.error('Imported video thumbnail failed:', error);
    }

    const db = await getDb();
    const result = await db.run(
      'INSERT INTO videos (filename, original_name, file_path, thumbnail_path, file_size) VALUES (?, ?, ?, ?, ?)',
      [filename, originalName, filePath, thumbnailPath, downloaded.size]
    );
    await logActivity('video_imported', `Public video imported as "${originalName}"`);
    return { id: result.lastID, filename, originalName, fileSize: downloaded.size, thumbnailPath };
  } finally {
    await fs.rm(workdir, { recursive: true, force: true }).catch(() => undefined);
  }
}
