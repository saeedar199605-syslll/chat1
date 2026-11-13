import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import bcrypt from 'bcryptjs';

// PBKDF2 is native in both Node and Cloudflare Workers (bcryptjs is pure JS: too slow for Workers' CPU limits).
// Workers cap PBKDF2 at 100k iterations; the count is stored in the hash so it can be raised later.
const ITERATIONS = 100_000;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const dk = crypto.pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha512');
  return `pbkdf2$${ITERATIONS}$${salt.toString('hex')}$${dk.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (stored.startsWith('pbkdf2$')) {
    const [, iter, saltHex, hashHex] = stored.split('$');
    const dk = crypto.pbkdf2Sync(password, Buffer.from(saltHex, 'hex'), Number(iter), 32, 'sha512');
    const expected = Buffer.from(hashHex, 'hex');
    return dk.length === expected.length && crypto.timingSafeEqual(dk, expected);
  }
  // Legacy bcrypt hashes (older databases) still verify.
  return bcrypt.compareSync(password, stored);
}
