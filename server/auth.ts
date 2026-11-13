import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { db, uid } from './db';
import type { Role, User } from '../src/types/index';

const IS_PROD = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || 'workstream-dev-jwt-secret-2026';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'workstream-dev-refresh-secret-2026';
if (IS_PROD && (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_REFRESH_SECRET.length < 32)) {
  throw new Error('Production requires JWT_SECRET and JWT_REFRESH_SECRET (min 32 chars each).');
}

export interface AuthPayload {
  userId: string;
  email: string;
  role: Role;
  iat?: number;
}

export interface AuthenticatedRequest extends Request {
  authUser?: User;
}

export function signAccessToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
}

export function signRefreshToken(payload: AuthPayload): string {
  const token = jwt.sign({ ...payload, jti: crypto.randomBytes(8).toString('hex') }, JWT_REFRESH_SECRET, {
    expiresIn: '7d',
  });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`INSERT INTO refresh_tokens (id, token, userId, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?)`).run(
    uid('rt'),
    token,
    payload.userId,
    expiresAt,
    new Date().toISOString()
  );
  return token;
}

export function verifyAccessToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): AuthPayload | null {
  try {
    const row = db
      .prepare(`SELECT token, expiresAt FROM refresh_tokens WHERE token = ?`)
      .get(token) as { token: string; expiresAt: string } | undefined;
    if (!row) return null;
    if (new Date(row.expiresAt).getTime() < Date.now()) return null;
    return jwt.verify(token, JWT_REFRESH_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

export function getRoleMatrixFromDb(): Record<string, Record<string, boolean>> {
  const rows = db.prepare(`SELECT role, permissionsJson FROM role_permissions`).all() as Array<{
    role: string;
    permissionsJson: string;
  }>;
  const matrix: Record<string, Record<string, boolean>> = {};
  for (const r of rows) {
    try {
      matrix[r.role] = JSON.parse(r.permissionsJson || '{}');
    } catch {
      matrix[r.role] = {};
    }
  }
  return matrix;
}

export function getUserById(userId: string): User | null {
  const row = db
    .prepare(
      `SELECT id, email, fullName, displayName, avatarUrl, jobTitle, department, timezone, role, presence, customStatus, customEmoji, dndEnabled, dndStartHour, dndEndHour, managerId, COALESCE(isActive, 1) as isActive, COALESCE(customPermissionsJson, '{}') as customPermissionsJson, COALESCE(groupAddPolicy, 'DIRECT') as groupAddPolicy
       FROM users WHERE id = ?`
    )
    .get(userId) as
    | (Omit<User, 'dndEnabled' | 'isActive' | 'customPermissions' | 'groupAddPolicy'> & {
        dndEnabled: number;
        isActive: number;
        customPermissionsJson: string;
        groupAddPolicy: string;
      })
    | undefined;
  if (!row) return null;
  let customPermissions: Record<string, boolean> = {};
  try {
    customPermissions = JSON.parse(row.customPermissionsJson || '{}');
  } catch {
    customPermissions = {};
  }
  const { customPermissionsJson: _ignored, groupAddPolicy, ...rest } = row;
  return {
    ...rest,
    dndEnabled: Boolean(row.dndEnabled),
    isActive: Boolean(row.isActive),
    groupAddPolicy: groupAddPolicy === 'REQUEST' ? 'REQUEST' : 'DIRECT',
    customPermissions,
  };
}

export function revokeAllSessionsForUser(userId: string): number {
  const revokedAt = Date.now() - 1000;
  db.prepare(`UPDATE users SET tokenRevokedBefore = ? WHERE id = ?`).run(revokedAt, userId);
  db.prepare(`DELETE FROM refresh_tokens WHERE userId = ?`).run(userId);
  return revokedAt;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
  const rawToken = header?.startsWith('Bearer ') ? header.slice(7) : queryToken;

  if (!rawToken) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const decoded = verifyAccessToken(rawToken);
  if (!decoded) {
    res.status(401).json({ error: 'Invalid or expired access token' });
    return;
  }

  const revRow = db.prepare(`SELECT COALESCE(tokenRevokedBefore, 0) as tokenRevokedBefore FROM users WHERE id = ?`).get(decoded.userId) as
    | { tokenRevokedBefore: number }
    | undefined;
  if (revRow && revRow.tokenRevokedBefore > 0 && (decoded.iat || 0) * 1000 < revRow.tokenRevokedBefore) {
    res.status(401).json({ error: 'Session revoked. Please sign in again.' });
    return;
  }

  const user = getUserById(decoded.userId);
  if (!user) {
    res.status(401).json({ error: 'User account not found' });
    return;
  }
  if (user.isActive === false) {
    res.status(403).json({ error: 'Account suspended by administrator' });
    return;
  }

  req.authUser = user;
  next();
}


export type Access = 'ok' | 'missing' | 'denied';

/** Channel access: members always; PUBLIC/ANNOUNCEMENT also for members of the same workspace. */
export function channelAccess(userId: string, channelId: string): Access {
  const ch = db.prepare(`SELECT id, type, workspaceId FROM channels WHERE id = ?`).get(channelId) as
    | { id: string; type: string; workspaceId: string }
    | undefined;
  if (!ch) return 'missing';
  if (db.prepare(`SELECT 1 FROM channel_members WHERE channelId = ? AND userId = ?`).get(channelId, userId)) return 'ok';
  if (
    (ch.type === 'PUBLIC' || ch.type === 'ANNOUNCEMENT') &&
    db.prepare(`SELECT 1 FROM workspace_members WHERE workspaceId = ? AND userId = ?`).get(ch.workspaceId, userId)
  ) {
    return 'ok';
  }
  return 'denied';
}
