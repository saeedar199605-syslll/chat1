import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import type { NextFunction, Request, Response } from 'express';
import { putFile } from './storage';

export interface UploadedFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
  size: number;
  /** Storage key (see storage.ts). */
  filename: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      rawBody?: Buffer;
      file?: UploadedFile;
    }
  }
}

const maxBody = () => (Number(process.env.MAX_UPLOAD_MB) || 25) * 1024 * 1024;
const MAX_JSON = 10 * 1024 * 1024;

/**
 * Reads the whole request body (no body-parser / multer: they need Node stream internals that
 * Cloudflare Workers lack). JSON and urlencoded bodies are parsed; req.rawBody always holds the bytes.
 */
export function readBody(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    req.body = {};
    next();
    return;
  }
  const limit = maxBody();
  if (Number(req.headers['content-length'] || 0) > limit) {
    res.status(413).json({ error: 'Payload too large' });
    return;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  let rejected = false;
  req.on('data', (c: Buffer) => {
    if (rejected) return;
    size += c.length;
    if (size > limit) {
      rejected = true;
      res.status(413).json({ error: 'Payload too large' });
      return;
    }
    chunks.push(c);
  });
  req.on('error', () => {
    if (!rejected) {
      rejected = true;
      res.status(400).json({ error: 'Bad request' });
    }
  });
  req.on('end', () => {
    if (rejected) return;
    const raw = Buffer.concat(chunks);
    req.rawBody = raw;
    const type = String(req.headers['content-type'] || '').toLowerCase();
    req.body = {};
    if (type.includes('application/json')) {
      if (raw.length > MAX_JSON) {
        res.status(413).json({ error: 'Payload too large' });
        return;
      }
      try {
        req.body = raw.length ? JSON.parse(raw.toString('utf8')) : {};
      } catch {
        res.status(400).json({ error: 'Invalid JSON body' });
        return;
      }
    } else if (type.includes('application/x-www-form-urlencoded')) {
      req.body = Object.fromEntries(new URLSearchParams(raw.toString('utf8')));
    }
    next();
  });
}

interface Part {
  name: string;
  filename?: string;
  contentType: string;
  data: Buffer;
}

function parseMultipart(raw: Buffer, contentType: string): Part[] | null {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!m) return null;
  const boundary = Buffer.from('--' + (m[1] || m[2]).trim());
  const parts: Part[] = [];
  let pos = raw.indexOf(boundary);
  while (pos !== -1) {
    pos += boundary.length;
    if (raw[pos] === 0x2d && raw[pos + 1] === 0x2d) break; // closing "--"
    pos += 2; // CRLF after the boundary line
    const headerEnd = raw.indexOf('\r\n\r\n', pos);
    if (headerEnd < 0) break;
    const header = raw.subarray(pos, headerEnd).toString('utf8');
    const next = raw.indexOf(boundary, headerEnd + 4);
    if (next < 0) break;
    const name = /\bname="([^"]*)"/i.exec(header)?.[1];
    const filename = /\bfilename="([^"]*)"/i.exec(header)?.[1];
    const ct = /^content-type:\s*([^\r\n]+)/im.exec(header)?.[1]?.trim();
    if (name !== undefined) {
      parts.push({ name, filename, contentType: ct || 'application/octet-stream', data: raw.subarray(headerEnd + 4, next - 2) });
    }
    pos = next;
  }
  return parts;
}

/** multer.single() replacement: stores the accepted file via storage.ts and sets req.file. */
export function uploadSingle(field: string, opts: { maxBytes?: number; accept?: (mime: string) => boolean } = {}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ct = String(req.headers['content-type'] || '');
    if (!/multipart\/form-data/i.test(ct) || !req.rawBody) {
      next();
      return;
    }
    const parts = parseMultipart(req.rawBody, ct);
    if (!parts) {
      res.status(400).json({ error: 'Invalid multipart body' });
      return;
    }
    const body: Record<string, string> = {};
    for (const p of parts) if (p.filename === undefined) body[p.name] = p.data.toString('utf8');
    req.body = { ...(req.body || {}), ...body };

    const f = parts.find((p) => p.name === field && p.filename !== undefined);
    if (f) {
      if (opts.maxBytes && f.data.length > opts.maxBytes) {
        res.status(413).json({ error: 'File too large' });
        return;
      }
      if (!opts.accept || opts.accept(f.contentType)) {
        const safeName = (f.filename || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
        const key = `${Date.now()}_${crypto.randomBytes(16).toString('hex')}_${safeName}`;
        putFile(key, f.data);
        req.file = { fieldname: field, originalname: f.filename || 'file', mimetype: f.contentType, size: f.data.length, filename: key };
      }
    }
    next();
  };
}

/** Client IP for rate limiting. cf-connecting-ip is only trusted when running behind Cloudflare. */
export function clientIp(req: Request): string {
  if (process.env.TRUST_CF_IP === 'true') {
    const h = req.headers['cf-connecting-ip'];
    if (typeof h === 'string' && h) return h;
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}
