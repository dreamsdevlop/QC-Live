import { open, Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs/promises';

let db: Database | null = null;

export async function getDb() {
  if (db) return db;

  const dbPath = path.resolve(process.env.DATABASE_PATH || './data/streams.db');
  const dbDir = path.dirname(dbPath);

  try {
    await fs.mkdir(dbDir, { recursive: true });
  } catch (error) {
    console.error('Error creating database directory:', error);
  }

  db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      thumbnail_path TEXT,
      duration INTEGER,
      file_size INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS streams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      video_id INTEGER REFERENCES videos(id),
      channel_id TEXT,
      rtmp_url TEXT NOT NULL,
      quality TEXT DEFAULT '720p',
      loop_enabled BOOLEAN DEFAULT 1,
      status TEXT DEFAULT 'stopped',
      pid INTEGER,
      started_at DATETIME,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Backward-compatible columns for databases created by older QC Live versions.
  for (const statement of [
    `ALTER TABLE streams ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE streams ADD COLUMN channel_id TEXT`,
  ]) {
    try {
      await db.run(statement);
    } catch {
      // Column already exists.
    }
  }

  return db;
}

export async function logActivity(action: string, details?: string) {
  const database = await getDb();
  await database.run(
    'INSERT INTO activity_logs (action, details) VALUES (?, ?)',
    [action, details]
  );
}
