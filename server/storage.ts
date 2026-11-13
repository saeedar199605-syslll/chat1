import { Buffer } from 'node:buffer';
import { db } from './db';

// Files live in SQLite (1 MB chunks) so the same code runs on Node and in a Cloudflare Durable Object.
const CHUNK = 1_000_000;

const toBuf = (v: unknown): Buffer => Buffer.from(v instanceof ArrayBuffer ? new Uint8Array(v) : (v as Uint8Array));

export function putFile(key: string, data: Uint8Array): void {
  db.transaction(() => {
    db.prepare(`DELETE FROM file_blobs WHERE key = ?`).run(key);
    for (let i = 0, idx = 0; i < data.length || idx === 0; i += CHUNK, idx++) {
      db.prepare(`INSERT INTO file_blobs (key, idx, data) VALUES (?, ?, ?)`).run(key, idx, data.subarray(i, i + CHUNK));
    }
    db.prepare(`INSERT OR REPLACE INTO file_meta (key, size, createdAt) VALUES (?, ?, ?)`).run(
      key,
      data.length,
      new Date().toISOString()
    );
  });
}

export function fileSize(key: string): number | null {
  const row = db.prepare(`SELECT size FROM file_meta WHERE key = ?`).get(key) as { size: number } | undefined;
  return row ? Number(row.size) : null;
}

export function fileExists(key: string): boolean {
  return fileSize(key) !== null;
}

export function getFile(key: string): Buffer | null {
  if (!fileExists(key)) return null;
  const rows = db.prepare(`SELECT data FROM file_blobs WHERE key = ? ORDER BY idx`).all(key) as Array<{ data: unknown }>;
  return Buffer.concat(rows.map((r) => toBuf(r.data)));
}

export function deleteFile(key: string): void {
  db.transaction(() => {
    db.prepare(`DELETE FROM file_blobs WHERE key = ?`).run(key);
    db.prepare(`DELETE FROM file_meta WHERE key = ?`).run(key);
  });
}
