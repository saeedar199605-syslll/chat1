import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { z } from 'zod';
import { backupDir, db, uid, uploadDir } from './db';
import {
  type AuthenticatedRequest,
  getRoleMatrixFromDb,
  getUserById,
  requireAuth,
  revokeAllSessionsForUser,
  channelAccess,
  type Access,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from './auth';
import {
  getAllUsers,
  getChannelMessages,
  getChannelWiki,
  getThreadMessages,
  getWorkspaceChannels,
  hydrateMessage,
} from './queries';
import { getIO } from './socket';
import {
  buildDefaultRoleMatrix,
  canPerformAction,
  canPerformWithMatrix,
  extractMentions,
  parseSearchQuery,
  sanitizeHtmlText,
  validateBackupBundle,
  wouldCreateOrgCycle,
} from '../src/utils/chatLogic';
import type { AuditCategory, AuditSeverity, BroadcastLevel, ChannelType, NotificationType, Role } from '../src/types/index';

const BACKUP_TABLES = [
  'users',
  'workspaces',
  'workspace_members',
  'channels',
  'channel_members',
  'messages',
  'message_edit_history',
  'attachments',
  'reactions',
  'bookmarks',
  'polls',
  'poll_options',
  'poll_votes',
  'tasks',
  'wiki_docs',
  'notifications',
  'custom_emojis',
  'role_permissions',
  'approval_requests',
  'standup_checkins',
  'group_join_requests',
] as const;

function computeTablesSha256(tables: Record<string, unknown>): string {
  return crypto.createHash('sha256').update(JSON.stringify(tables)).digest('hex');
}

function buildBackupBundle() {
  const tables: Record<string, Array<Record<string, unknown>>> = {};
  const counts: Record<string, number> = {};
  for (const tbl of BACKUP_TABLES) {
    const rows = db.prepare(`SELECT * FROM ${tbl}`).all() as Array<Record<string, unknown>>;
    tables[tbl] = rows;
    counts[tbl] = rows.length;
  }
  const sha256 = computeTablesSha256(tables);
  return {
    schemaVersion: 'workstream.v2',
    exportedAt: new Date().toISOString(),
    sha256,
    counts,
    tables,
  };
}

function getLiveTableCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const tbl of BACKUP_TABLES) {
    const row = db.prepare(`SELECT COUNT(*) as cnt FROM ${tbl}`).get() as { cnt: number };
    counts[tbl] = Number(row.cnt ?? 0);
  }
  return counts;
}

function emitUserNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  channelId: string | null;
  messageId: string | null;
  senderName?: string;
  avatarUrl?: string | null;
  inviteId?: string;
}) {
  const id = uid('ntf');
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO notifications (id, userId, type, title, body, channelId, messageId, isRead, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(id, params.userId, params.type, params.title, params.body, params.channelId, params.messageId, now);

  const notification = {
    id,
    userId: params.userId,
    type: params.type,
    title: params.title,
    body: params.body,
    channelId: params.channelId,
    messageId: params.messageId,
    isRead: false,
    createdAt: now,
  };
  getIO()?.to(`user:${params.userId}`).emit('notification:new', {
    channelId: params.channelId,
    messageId: params.messageId,
    notification,
    senderName: params.senderName,
    avatarUrl: params.avatarUrl ?? null,
    inviteId: params.inviteId,
  });
  return notification;
}

function recordAuditLog(params: {
  actor?: { id: string; displayName: string; email: string } | null;
  actorId?: string | null;
  actorName?: string;
  actorEmail?: string | null;
  action: string;
  category: AuditCategory;
  severity?: AuditSeverity;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  details?: Record<string, unknown> | null;
}) {
  try {
    const id = uid('aud');
    const createdAt = new Date().toISOString();
    const actorId = params.actor?.id ?? params.actorId ?? null;
    const actorName = params.actor?.displayName ?? params.actorName ?? 'سیستم';
    const actorEmail = params.actor?.email ?? params.actorEmail ?? null;
    const severity = params.severity ?? 'INFO';
    const detailsJson = params.details ? JSON.stringify(params.details) : null;

    db.prepare(
      `INSERT INTO audit_logs (id, actorId, actorName, actorEmail, action, category, severity, targetType, targetId, targetLabel, detailsJson, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      actorId,
      actorName,
      actorEmail,
      params.action,
      params.category,
      severity,
      params.targetType ?? null,
      params.targetId ?? null,
      params.targetLabel ?? null,
      detailsJson,
      createdAt
    );

    const entry = {
      id,
      actorId,
      actorName,
      actorEmail,
      action: params.action,
      category: params.category,
      severity,
      targetType: params.targetType ?? null,
      targetId: params.targetId ?? null,
      targetLabel: params.targetLabel ?? null,
      detailsJson,
      createdAt,
    };
    getIO()?.to('role:SUPER_ADMIN').emit('audit:new', { entry });
    return entry;
  } catch {
    return null;
  }
}


const presignTokens = new Map<
  string,
  { channelId: string; userId: string; fileName: string; mimeType: string; sizeBytes: number; expiresAt: number }
>();

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${crypto.randomBytes(16).toString('hex')}_${safeName}`);
  },
});

const upload = multer({ storage: diskStorage, limits: { fileSize: 50 * 1024 * 1024 } });

// Logos/avatars: raster images only (SVG/HTML could carry script), 5 MB max.
const imageUpload = multer({
  storage: diskStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(png|jpeg|webp|gif)$/.test(file.mimetype)),
});

const authRateBuckets = new Map<string, number[]>();

function rateLimitAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const key = `${ip}:${req.path}`;
  const now = Date.now();
  const windowMs = 15 * 60_000;
  const maxAttempts = 20;

  const recent = (authRateBuckets.get(key) || []).filter((ts) => now - ts < windowMs);
  if (recent.length >= maxAttempts) {
    recordAuditLog({
      actorName: ip,
      action: 'AUTH_RATE_LIMITED',
      category: 'SECURITY',
      severity: 'WARN',
      targetType: 'endpoint',
      targetLabel: req.path,
      details: { ip, attemptsInWindow: recent.length },
    });
    res.status(429).json({ error: 'Too many authentication attempts. Please try again shortly.' });
    return;
  }

  // Login counts only failed attempts (see noteLoginFailure) so shared office IPs aren't locked out by normal use.
  if (req.path !== '/api/auth/login') recent.push(now);
  authRateBuckets.set(key, recent);
  next();
}

function noteLoginFailure(req: express.Request): void {
  const key = `${req.ip || req.socket.remoteAddress || 'unknown'}:${req.path}`;
  authRateBuckets.set(key, [...(authRateBuckets.get(key) || []), Date.now()]);
}

function sendAccess(res: express.Response, a: Access): boolean {
  if (a === 'ok') return true;
  res.status(a === 'missing' ? 404 : 403).json({ error: a === 'missing' ? 'Not found' : 'You do not have access to this channel' });
  return false;
}

function activeSuperAdminCount(excludeUserId?: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) as c FROM users WHERE role = 'SUPER_ADMIN' AND COALESCE(isActive, 1) = 1 AND id != ?`)
    .get(excludeUserId ?? '') as { c: number };
  return row.c;
}

const ALLOW_REGISTRATION = process.env.ALLOW_REGISTRATION
  ? process.env.ALLOW_REGISTRATION === 'true'
  : process.env.NODE_ENV !== 'production';

const PRIMARY_WS_SQL = `(SELECT id FROM workspaces ORDER BY createdAt, id LIMIT 1)`;
const primaryWorkspaceId = () =>
  (db.prepare(`SELECT id FROM workspaces ORDER BY createdAt, id LIMIT 1`).get() as { id: string } | undefined)?.id ?? '';
const defaultApproverId = () =>
  (db.prepare(`SELECT id FROM users WHERE role = 'SUPER_ADMIN' AND COALESCE(isActive, 1) = 1 ORDER BY createdAt LIMIT 1`).get() as { id: string } | undefined)?.id ?? null;
const announcementChannelId = () =>
  (db.prepare(`SELECT id FROM channels WHERE type = 'ANNOUNCEMENT' AND workspaceId = ${PRIMARY_WS_SQL} LIMIT 1`).get() as { id: string } | undefined)?.id ?? null;

const DEMO_SWITCH_ENABLED = process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEMO_SWITCH === 'true';

function requireBackupAdmin(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction): void {
  if (!canPerformAction(req.authUser!.role, 'backup:manage')) {
    res.status(403).json({ error: 'Only Admins and Department Managers can access backups' });
    return;
  }
  next();
}

export function registerApiRoutes(app: Express): void {
  // Every route with :channelId / :workspaceId / message / task ids is authorized here, once.
  app.param('channelId', (req: AuthenticatedRequest, res, next, channelId) => {
    requireAuth(req, res, () => {
      if (sendAccess(res, channelAccess(req.authUser!.id, channelId))) next();
    });
  });
  app.param('workspaceId', (req: AuthenticatedRequest, res, next, workspaceId) => {
    requireAuth(req, res, () => {
      const m = db.prepare(`SELECT 1 FROM workspace_members WHERE workspaceId = ? AND userId = ?`).get(workspaceId, req.authUser!.id);
      if (!m) {
        res.status(403).json({ error: 'You are not a member of this workspace' });
        return;
      }
      next();
    });
  });
  app.use('/api/messages/:id', (req: AuthenticatedRequest, res, next) => {
    requireAuth(req, res, () => {
      const row = db.prepare(`SELECT channelId FROM messages WHERE id = ?`).get(req.params.id) as { channelId: string } | undefined;
      if (row && !sendAccess(res, channelAccess(req.authUser!.id, row.channelId))) return;
      next();
    });
  });
  app.use('/api/tasks/:taskId', (req: AuthenticatedRequest, res, next) => {
    requireAuth(req, res, () => {
      const row = db.prepare(`SELECT channelId FROM tasks WHERE id = ?`).get(req.params.taskId) as { channelId: string } | undefined;
      if (row && !sendAccess(res, channelAccess(req.authUser!.id, row.channelId))) return;
      next();
    });
  });
  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'workstream',
      timestamp: new Date().toISOString(),
      demo: DEMO_SWITCH_ENABLED,
      registration: ALLOW_REGISTRATION,
    });
  });

  // ---------------------------------------------------------------------------
  // AUTHENTICATION & ACCOUNT SWITCHING
  // ---------------------------------------------------------------------------
  app.post('/api/auth/login', rateLimitAuth, (req, res) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid email and password are required' });
      return;
    }

    const row = db
      .prepare(`SELECT id, email, passwordHash, role, COALESCE(isActive, 1) as isActive FROM users WHERE lower(email) = lower(?)`)
      .get(parsed.data.email) as { id: string; email: string; passwordHash: string; role: Role; isActive: number } | undefined;

    if (!row || !bcrypt.compareSync(parsed.data.password, row.passwordHash)) {
      noteLoginFailure(req);
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    if (!row.isActive) {
      res.status(403).json({ error: 'Account is suspended. Contact your Super Admin.' });
      return;
    }

    const user = getUserById(row.id)!;
    const accessToken = signAccessToken({ userId: user.id, email: user.email, role: user.role });
    const refreshToken = signRefreshToken({ userId: user.id, email: user.email, role: user.role });
    recordAuditLog({
      actor: user,
      action: 'AUTH_LOGIN',
      category: 'AUTH',
      severity: 'INFO',
      targetType: 'user',
      targetId: user.id,
      targetLabel: user.email,
      details: { role: user.role },
    });
    res.json({ accessToken, refreshToken, user });
  });

  app.post('/api/auth/register', rateLimitAuth, (req, res) => {
    if (!ALLOW_REGISTRATION) {
      res.status(403).json({ error: 'Self-registration is disabled. Ask your administrator for an account.' });
      return;
    }
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      fullName: z.string().min(2).max(80),
      jobTitle: z.string().min(2).max(80).optional(),
      department: z.string().min(2).max(80).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid registration fields' });
      return;
    }

    const existing = db.prepare(`SELECT id FROM users WHERE lower(email) = lower(?)`).get(parsed.data.email);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists' });
      return;
    }

    const userId = uid('usr');
    const now = new Date().toISOString();
    const hash = bcrypt.hashSync(parsed.data.password, 10);
    const fullName = sanitizeHtmlText(parsed.data.fullName);

    db.prepare(
      `INSERT INTO users (id, email, passwordHash, fullName, displayName, avatarUrl, jobTitle, department, timezone, role, presence, managerId, createdAt)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 'America/Los_Angeles', 'MEMBER', 'ONLINE', (SELECT id FROM users WHERE role = 'SUPER_ADMIN' ORDER BY createdAt LIMIT 1), ?)`
    ).run(
      userId,
      parsed.data.email.toLowerCase(),
      hash,
      fullName,
      fullName,
      sanitizeHtmlText(parsed.data.jobTitle || 'Software Engineer'),
      sanitizeHtmlText(parsed.data.department || 'Engineering'),
      now
    );

    db.prepare(`INSERT INTO workspace_members (id, workspaceId, userId, role, joinedAt) VALUES (?, ${PRIMARY_WS_SQL}, ?, 'MEMBER', ?)`).run(
      uid('wm'),
      userId,
      now
    );

    const publicChannels = db
      .prepare(`SELECT id FROM channels WHERE workspaceId = ${PRIMARY_WS_SQL} AND type IN ('PUBLIC', 'ANNOUNCEMENT')`)
      .all() as Array<{ id: string }>;
    for (const ch of publicChannels) {
      db.prepare(
        `INSERT INTO channel_members (id, channelId, userId, isStarred, isMuted, lastReadAt, joinedAt) VALUES (?, ?, ?, 0, 0, ?, ?)`
      ).run(uid('cm'), ch.id, userId, now, now);
    }

    const user = getUserById(userId)!;
    const accessToken = signAccessToken({ userId: user.id, email: user.email, role: user.role });
    const refreshToken = signRefreshToken({ userId: user.id, email: user.email, role: user.role });
    recordAuditLog({
      actor: user,
      action: 'AUTH_REGISTER',
      category: 'AUTH',
      severity: 'INFO',
      targetType: 'user',
      targetId: user.id,
      targetLabel: user.email,
      details: { department: user.department, jobTitle: user.jobTitle },
    });
    res.status(201).json({ accessToken, refreshToken, user });
  });

  app.post('/api/auth/refresh', (req, res) => {
    const refreshToken = req.body?.refreshToken as string | undefined;
    if (!refreshToken) {
      res.status(400).json({ error: 'refreshToken is required' });
      return;
    }
    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired refresh token' });
      return;
    }
    const user = getUserById(payload.userId);
    if (!user || user.isActive === false) {
      res.status(401).json({ error: 'User not found or suspended' });
      return;
    }
    const accessToken = signAccessToken({ userId: user.id, email: user.email, role: user.role });
    res.json({ accessToken, user });
  });

  // Seamless enterprise persona switcher (issues real signed JWTs for testing RBAC & multi-user sockets)
  app.post('/api/auth/demo-switch', (req, res) => {
    // Passwordless impersonation: demo only.
    if (!DEMO_SWITCH_ENABLED) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const userId = (req.body?.userId as string | undefined) || 'usr_elena';
    const user = getUserById(userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const accessToken = signAccessToken({ userId: user.id, email: user.email, role: user.role });
    const refreshToken = signRefreshToken({ userId: user.id, email: user.email, role: user.role });
    recordAuditLog({
      actor: user,
      action: 'AUTH_DEMO_SWITCH',
      category: 'AUTH',
      severity: 'INFO',
      targetType: 'user',
      targetId: user.id,
      targetLabel: user.email,
    });
    res.json({ accessToken, refreshToken, user });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ user: req.authUser });
  });

  app.get('/api/auth/sessions', requireAuth, (req: AuthenticatedRequest, res) => {
    const userId = req.authUser!.id;
    const activeRefreshTokens = db
      .prepare(`SELECT id, expiresAt, createdAt FROM refresh_tokens WHERE userId = ? ORDER BY createdAt DESC LIMIT 20`)
      .all(userId);
    const recentSecurityEvents = db
      .prepare(
        `SELECT id, action, severity, targetLabel, createdAt
         FROM audit_logs
         WHERE actorId = ? AND category IN ('AUTH', 'SECURITY', 'USER')
         ORDER BY createdAt DESC LIMIT 12`
      )
      .all(userId);
    res.json({ activeRefreshTokens, recentSecurityEvents });
  });

  app.post('/api/auth/revoke-sessions', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const revokedAt = revokeAllSessionsForUser(actor.id);
    const accessToken = signAccessToken({ userId: actor.id, email: actor.email, role: actor.role });
    const refreshToken = signRefreshToken({ userId: actor.id, email: actor.email, role: actor.role });
    recordAuditLog({
      actor,
      action: 'AUTH_SESSIONS_REVOKED',
      category: 'SECURITY',
      severity: 'WARN',
      targetType: 'user',
      targetId: actor.id,
      targetLabel: actor.email,
      details: { revokedAt },
    });
    res.json({ ok: true, revokedAt, accessToken, refreshToken, user: actor });
  });

  // ---------------------------------------------------------------------------
  // WORKSPACES & RBAC
  // ---------------------------------------------------------------------------
  app.get('/api/workspaces', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role === 'SUPER_ADMIN') {
      const rows = db
        .prepare(
          `SELECT w.*, COALESCE(wm.role, 'SUPER_ADMIN') as role,
                  (SELECT COUNT(*) FROM workspace_members wm2 WHERE wm2.workspaceId = w.id) as memberCount
           FROM workspaces w
           LEFT JOIN workspace_members wm ON wm.workspaceId = w.id AND wm.userId = ?
           ORDER BY w.createdAt ASC`
        )
        .all(actor.id);
      res.json({ workspaces: rows });
      return;
    }

    const rows = db
      .prepare(
        `SELECT w.*, wm.role,
                (SELECT COUNT(*) FROM workspace_members wm2 WHERE wm2.workspaceId = w.id) as memberCount
         FROM workspaces w
         JOIN workspace_members wm ON wm.workspaceId = w.id AND wm.userId = ?
         ORDER BY w.createdAt ASC`
      )
      .all(actor.id);
    res.json({ workspaces: rows });
  });

  app.post('/api/workspaces', requireAuth, (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      name: z.string().min(2).max(60),
      domain: z.string().max(80).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Workspace name is required' });
      return;
    }

    const user = req.authUser!;
    if (!canPerformAction(user.role, 'workspace:manage_roles')) {
      res.status(403).json({ error: 'Only Super Admins can create workspaces' });
      return;
    }
    const wsId = uid('ws');
    const cleanName = sanitizeHtmlText(parsed.data.name);
    const rawSlug = cleanName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const slug = `${rawSlug || 'company'}-${crypto.randomBytes(2).toString('hex')}`;
    const logoText = cleanName
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    const now = new Date().toISOString();
    const domain = parsed.data.domain?.trim() || `${slug}.esfahan-chalak.ir`;

    db.prepare(`INSERT INTO workspaces (id, name, slug, domain, logoText, logoUrl, createdAt) VALUES (?, ?, ?, ?, ?, NULL, ?)`).run(
      wsId,
      cleanName,
      slug,
      domain,
      logoText || 'ش',
      now
    );

    db.prepare(`INSERT INTO workspace_members (id, workspaceId, userId, role, joinedAt) VALUES (?, ?, ?, 'SUPER_ADMIN', ?)`).run(
      uid('wm'),
      wsId,
      user.id,
      now
    );

    const chId = uid('ch');
    db.prepare(
      `INSERT INTO channels (id, workspaceId, name, slug, description, topic, type, createdById, createdAt)
       VALUES (?, ?, 'general', 'general', 'کانال عمومی گفتگوهای شرکت', 'خوش آمدید به فضای کاری جدید', 'PUBLIC', ?, ?)`
    ).run(chId, wsId, user.id, now);
    db.prepare(
      `INSERT INTO channel_members (id, channelId, userId, isStarred, isMuted, lastReadAt, joinedAt) VALUES (?, ?, ?, 1, 0, ?, ?)`
    ).run(uid('cm'), chId, user.id, now, now);

    // Enroll all active users so multi-company switching is seamless across team members
    const otherUsers = db.prepare(`SELECT id, role FROM users WHERE id != ? AND COALESCE(isActive, 1) = 1`).all(user.id) as Array<{
      id: string;
      role: Role;
    }>;
    for (const ou of otherUsers) {
      db.prepare(`INSERT OR IGNORE INTO workspace_members (id, workspaceId, userId, role, joinedAt) VALUES (?, ?, ?, ?, ?)`).run(
        uid('wm'),
        wsId,
        ou.id,
        ou.role,
        now
      );
      db.prepare(
        `INSERT OR IGNORE INTO channel_members (id, channelId, userId, isStarred, isMuted, lastReadAt, joinedAt) VALUES (?, ?, ?, 0, 0, ?, ?)`
      ).run(uid('cm'), chId, ou.id, now, now);
    }

    const createdWs = db
      .prepare(
        `SELECT w.*, COALESCE(wm.role, 'SUPER_ADMIN') as role,
                (SELECT COUNT(*) FROM workspace_members wm2 WHERE wm2.workspaceId = w.id) as memberCount
         FROM workspaces w
         LEFT JOIN workspace_members wm ON wm.workspaceId = w.id AND wm.userId = ?
         WHERE w.id = ?`
      )
      .get(user.id, wsId);

    recordAuditLog({
      actor: user,
      action: 'WORKSPACE_CREATED',
      category: 'WORKSPACE',
      severity: 'INFO',
      targetType: 'workspace',
      targetId: wsId,
      targetLabel: cleanName,
      details: { domain },
    });
    getIO()?.emit('workspace:updated', { workspace: createdWs });
    res.status(201).json({ workspace: createdWs });
  });

  app.patch('/api/workspaces/:workspaceId', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const { workspaceId } = req.params;
    const memberRow = db
      .prepare(`SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?`)
      .get(workspaceId, actor.id) as { role: Role } | undefined;
    const effectiveRole = actor.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : memberRow?.role ?? actor.role;
    if (effectiveRole !== 'SUPER_ADMIN' && effectiveRole !== 'DEPT_MANAGER') {
      res.status(403).json({ error: 'Only Admins or Department Managers can update workspace settings' });
      return;
    }

    const existing = db.prepare(`SELECT * FROM workspaces WHERE id = ?`).get(workspaceId) as
      | { id: string; name: string; slug: string; domain: string | null; logoText: string; logoUrl: string | null }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    const schema = z.object({
      name: z.string().min(2).max(80).optional(),
      domain: z.string().max(100).optional(),
      logoText: z.string().min(1).max(6).optional(),
      logoUrl: z.string().max(500).nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid workspace update fields' });
      return;
    }

    const nextName = parsed.data.name ? sanitizeHtmlText(parsed.data.name) : existing.name;
    const nextDomain = parsed.data.domain !== undefined ? sanitizeHtmlText(parsed.data.domain) || null : existing.domain;
    const nextLogoText = parsed.data.logoText
      ? sanitizeHtmlText(parsed.data.logoText)
      : parsed.data.name
        ? nextName
            .split(/\s+/)
            .map((w) => w[0])
            .join('')
            .slice(0, 2)
            .toUpperCase()
        : existing.logoText;
    const nextLogoUrl = parsed.data.logoUrl !== undefined ? parsed.data.logoUrl : existing.logoUrl;

    db.prepare(`UPDATE workspaces SET name = ?, domain = ?, logoText = ?, logoUrl = ? WHERE id = ?`).run(
      nextName,
      nextDomain,
      nextLogoText,
      nextLogoUrl,
      workspaceId
    );

    const updatedWs = db
      .prepare(
        `SELECT w.*, COALESCE(wm.role, ?) as role,
                (SELECT COUNT(*) FROM workspace_members wm2 WHERE wm2.workspaceId = w.id) as memberCount
         FROM workspaces w
         LEFT JOIN workspace_members wm ON wm.workspaceId = w.id AND wm.userId = ?
         WHERE w.id = ?`
      )
      .get(effectiveRole, actor.id, workspaceId);

    recordAuditLog({
      actor,
      action: 'WORKSPACE_UPDATED',
      category: 'WORKSPACE',
      severity: 'INFO',
      targetType: 'workspace',
      targetId: workspaceId,
      targetLabel: nextName,
      details: { domain: nextDomain, logoText: nextLogoText, hasLogoUrl: Boolean(nextLogoUrl) },
    });
    getIO()?.emit('workspace:updated', { workspace: updatedWs });
    res.json({ workspace: updatedWs });
  });

  app.post('/api/workspaces/:workspaceId/logo', requireAuth, imageUpload.single('logo'), (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const { workspaceId } = req.params;
    const memberRow = db
      .prepare(`SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?`)
      .get(workspaceId, actor.id) as { role: Role } | undefined;
    const effectiveRole = actor.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : memberRow?.role ?? actor.role;
    if (effectiveRole !== 'SUPER_ADMIN' && effectiveRole !== 'DEPT_MANAGER') {
      res.status(403).json({ error: 'Only Admins or Department Managers can upload a workspace logo' });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Logo image file is required' });
      return;
    }

    const existing = db.prepare(`SELECT * FROM workspaces WHERE id = ?`).get(workspaceId) as { id: string; name: string } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    const logoUrl = `/api/files/download/${encodeURIComponent(file.filename)}`;
    db.prepare(`UPDATE workspaces SET logoUrl = ? WHERE id = ?`).run(logoUrl, workspaceId);

    const updatedWs = db
      .prepare(
        `SELECT w.*, COALESCE(wm.role, ?) as role,
                (SELECT COUNT(*) FROM workspace_members wm2 WHERE wm2.workspaceId = w.id) as memberCount
         FROM workspaces w
         LEFT JOIN workspace_members wm ON wm.workspaceId = w.id AND wm.userId = ?
         WHERE w.id = ?`
      )
      .get(effectiveRole, actor.id, workspaceId);

    recordAuditLog({
      actor,
      action: 'WORKSPACE_LOGO_UPLOADED',
      category: 'WORKSPACE',
      severity: 'INFO',
      targetType: 'workspace',
      targetId: workspaceId,
      targetLabel: existing.name,
      details: { fileName: file.originalname, logoUrl },
    });
    getIO()?.emit('workspace:updated', { workspace: updatedWs });
    res.json({ workspace: updatedWs, logoUrl });
  });

  app.patch('/api/workspaces/:workspaceId/members/:targetUserId/role', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    if (!canPerformAction(actor.role, 'workspace:manage_roles')) {
      res.status(403).json({ error: 'Only Super Admins can modify organization roles' });
      return;
    }

    const roleSchema = z.object({ role: z.enum(['SUPER_ADMIN', 'DEPT_MANAGER', 'MEMBER', 'GUEST']) });
    const parsed = roleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid role is required' });
      return;
    }

    const { workspaceId, targetUserId } = req.params;
    const roleTarget = getUserById(targetUserId);
    if (!roleTarget || !db.prepare(`SELECT 1 FROM workspace_members WHERE workspaceId = ? AND userId = ?`).get(workspaceId, targetUserId)) {
      res.status(404).json({ error: 'Member not found in this workspace' });
      return;
    }
    if (roleTarget.role === 'SUPER_ADMIN' && parsed.data.role !== 'SUPER_ADMIN' && activeSuperAdminCount(targetUserId) === 0) {
      res.status(400).json({ error: 'At least one active Super Admin is required' });
      return;
    }
    db.prepare(`UPDATE workspace_members SET role = ? WHERE workspaceId = ? AND userId = ?`).run(
      parsed.data.role,
      workspaceId,
      targetUserId
    );
    db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(parsed.data.role, targetUserId);

    const updatedUser = getUserById(targetUserId);
    recordAuditLog({
      actor,
      action: 'MEMBER_ROLE_CHANGED',
      category: 'RBAC',
      severity: 'WARN',
      targetType: 'user',
      targetId: targetUserId,
      targetLabel: updatedUser?.displayName || targetUserId,
      details: { role: parsed.data.role, workspaceId },
    });
    getIO()?.emit('directory:updated', { user: updatedUser });
    res.json({ user: updatedUser });
  });

  // ---------------------------------------------------------------------------
  // CHANNELS & DIRECT MESSAGES
  // ---------------------------------------------------------------------------
  app.get('/api/workspaces/:workspaceId/channels', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const workspaceId = req.params.workspaceId;
    if (actor.role === 'SUPER_ADMIN') {
      const publicChannels = db
        .prepare(`SELECT id FROM channels WHERE workspaceId = ? AND type IN ('PUBLIC', 'ANNOUNCEMENT')`)
        .all(workspaceId) as Array<{ id: string }>;
      const now = new Date().toISOString();
      for (const ch of publicChannels) {
        db.prepare(
          `INSERT OR IGNORE INTO channel_members (id, channelId, userId, isStarred, isMuted, lastReadAt, joinedAt) VALUES (?, ?, ?, 0, 0, ?, ?)`
        ).run(uid('cm'), ch.id, actor.id, now, now);
      }
    }
    const channels = getWorkspaceChannels(workspaceId, actor.id);
    res.json({ channels });
  });

  app.post('/api/workspaces/:workspaceId/channels', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    if (!canPerformAction(actor.role, 'channel:create')) {
      res.status(403).json({ error: 'Your role cannot create channels' });
      return;
    }

    const schema = z.object({
      name: z.string().min(2).max(50),
      description: z.string().max(240).optional(),
      type: z.enum(['PUBLIC', 'PRIVATE', 'ANNOUNCEMENT']).default('PUBLIC'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid channel name and type are required' });
      return;
    }

    const { workspaceId } = req.params;
    const cleanName = sanitizeHtmlText(parsed.data.name).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    const slug = `${cleanName}-${crypto.randomBytes(2).toString('hex')}`;
    const chId = uid('ch');
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO channels (id, workspaceId, name, slug, description, topic, type, createdById, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      chId,
      workspaceId,
      cleanName,
      slug,
      sanitizeHtmlText(parsed.data.description || ''),
      parsed.data.type === 'ANNOUNCEMENT' ? 'Official announcements' : 'Active collaboration',
      parsed.data.type,
      actor.id,
      now
    );

    if (parsed.data.type === 'PRIVATE') {
      db.prepare(
        `INSERT INTO channel_members (id, channelId, userId, isStarred, isMuted, lastReadAt, joinedAt) VALUES (?, ?, ?, 0, 0, ?, ?)`
      ).run(uid('cm'), chId, actor.id, now, now);
    } else {
      const wsMembers = db
        .prepare(`SELECT userId FROM workspace_members WHERE workspaceId = ?`)
        .all(workspaceId) as Array<{ userId: string }>;
      for (const m of wsMembers) {
        db.prepare(
          `INSERT OR IGNORE INTO channel_members (id, channelId, userId, isStarred, isMuted, lastReadAt, joinedAt) VALUES (?, ?, ?, 0, 0, ?, ?)`
        ).run(uid('cm'), chId, m.userId, now, now);
      }
    }

    // Create starter Wiki Doc
    db.prepare(
      `INSERT INTO wiki_docs (id, channelId, title, content, version, updatedById, updatedAt) VALUES (?, ?, ?, ?, 1, ?, ?)`
    ).run(
      uid('wiki'),
      chId,
      `#${cleanName} — Team Wiki`,
      `# #${cleanName}\n\nUse this live collaborative document for meeting notes, SOPs, and architectural decisions.`,
      actor.id,
      now
    );

    getIO()?.to(`workspace:${workspaceId}`).emit('channel:created', { workspaceId, channelId: chId });
    const channels = getWorkspaceChannels(workspaceId, actor.id);
    const created = channels.find((c) => c.id === chId);
    res.status(201).json({ channel: created });
  });

  app.post('/api/workspaces/:workspaceId/dm', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const targetUserId = req.body?.targetUserId as string | undefined;
    if (!targetUserId) {
      res.status(400).json({ error: 'targetUserId is required' });
      return;
    }
    const { workspaceId } = req.params;
    if (
      !db.prepare(`SELECT 1 FROM workspace_members WHERE workspaceId = ? AND userId = ?`).get(workspaceId, targetUserId) ||
      !getUserById(targetUserId)?.isActive
    ) {
      res.status(404).json({ error: 'Target user not found in this workspace' });
      return;
    }

    // Check if DM between actor and target already exists
    const existing = db
      .prepare(
        `SELECT c.id FROM channels c
         JOIN channel_members cm1 ON cm1.channelId = c.id AND cm1.userId = ?
         JOIN channel_members cm2 ON cm2.channelId = c.id AND cm2.userId = ?
         WHERE c.workspaceId = ? AND c.type = 'DM' LIMIT 1`
      )
      .get(actor.id, targetUserId, workspaceId) as { id: string } | undefined;

    if (existing) {
      const channels = getWorkspaceChannels(workspaceId, actor.id);
      res.json({ channel: channels.find((c) => c.id === existing.id) });
      return;
    }

    const chId = uid('ch');
    const now = new Date().toISOString();
    const slug = `dm-${actor.id}-${targetUserId}-${crypto.randomBytes(2).toString('hex')}`;
    db.prepare(
      `INSERT INTO channels (id, workspaceId, name, slug, description, topic, type, createdById, createdAt)
       VALUES (?, ?, ?, ?, 'Direct message', NULL, 'DM', ?, ?)`
    ).run(chId, workspaceId, slug, slug, actor.id, now);

    db.prepare(
      `INSERT INTO channel_members (id, channelId, userId, isStarred, isMuted, lastReadAt, joinedAt) VALUES (?, ?, ?, 0, 0, ?, ?)`
    ).run(uid('cm'), chId, actor.id, now, now);
    if (targetUserId !== actor.id) {
      db.prepare(
        `INSERT INTO channel_members (id, channelId, userId, isStarred, isMuted, lastReadAt, joinedAt) VALUES (?, ?, ?, 0, 0, ?, ?)`
      ).run(uid('cm'), chId, targetUserId, now, now);
    }

    getIO()?.to(`user:${targetUserId}`).emit('channel:created', { workspaceId, channelId: chId });
    const channels = getWorkspaceChannels(workspaceId, actor.id);
    res.status(201).json({ channel: channels.find((c) => c.id === chId) });
  });

  app.patch('/api/channels/:channelId/star', requireAuth, (req: AuthenticatedRequest, res) => {
    const isStarred = req.body?.isStarred ? 1 : 0;
    db.prepare(`UPDATE channel_members SET isStarred = ? WHERE channelId = ? AND userId = ?`).run(
      isStarred,
      req.params.channelId,
      req.authUser!.id
    );
    res.json({ ok: true, isStarred: Boolean(isStarred) });
  });

  app.patch('/api/channels/:channelId/mute', requireAuth, (req: AuthenticatedRequest, res) => {
    const isMuted = req.body?.isMuted ? 1 : 0;
    db.prepare(`UPDATE channel_members SET isMuted = ? WHERE channelId = ? AND userId = ?`).run(
      isMuted,
      req.params.channelId,
      req.authUser!.id
    );
    res.json({ ok: true, isMuted: Boolean(isMuted) });
  });

  app.post('/api/channels/:channelId/read', requireAuth, (req: AuthenticatedRequest, res) => {
    const { channelId } = req.params;
    const userId = req.authUser!.id;
    const now = new Date().toISOString();
    db.prepare(`UPDATE channel_members SET lastReadAt = ? WHERE channelId = ? AND userId = ?`).run(
      now,
      channelId,
      userId
    );

    // Update read receipts on latest messages in channel
    const recentMsgs = db
      .prepare(`SELECT id, readByJson FROM messages WHERE channelId = ? AND parentId IS NULL ORDER BY createdAt DESC LIMIT 20`)
      .all(channelId) as Array<{ id: string; readByJson: string }>;

    for (const msg of recentMsgs) {
      let arr: string[] = [];
      try {
        arr = JSON.parse(msg.readByJson || '[]');
      } catch {
        arr = [];
      }
      if (!arr.includes(userId)) {
        arr.push(userId);
        db.prepare(`UPDATE messages SET readByJson = ? WHERE id = ?`).run(JSON.stringify(arr), msg.id);
      }
    }

    getIO()?.to(`channel:${channelId}`).emit('channel:read-receipt', { channelId, userId });
    res.json({ ok: true });
  });

  app.post('/api/workspaces/:workspaceId/groups', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const schema = z.object({
      name: z.string().min(2).max(60),
      description: z.string().max(240).optional(),
      memberIds: z.array(z.string()).default([]),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid group name is required' });
      return;
    }

    const { workspaceId } = req.params;
    const cleanName = sanitizeHtmlText(parsed.data.name).trim();
    const asciiBase = cleanName
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const slug = `${asciiBase || 'group'}-${crypto.randomBytes(3).toString('hex')}`;
    const chId = uid('grp');
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO channels (id, workspaceId, name, slug, description, topic, type, createdById, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, 'GROUP_DM', ?, ?)`
    ).run(
      chId,
      workspaceId,
      cleanName,
      slug,
      sanitizeHtmlText(parsed.data.description || ''),
      'همکاری گروهی چالاک',
      actor.id,
      now
    );

    db.prepare(
      `INSERT INTO channel_members (id, channelId, userId, isStarred, isMuted, lastReadAt, joinedAt) VALUES (?, ?, ?, 0, 0, ?, ?)`
    ).run(uid('cm'), chId, actor.id, now, now);

    const addedUserIds: string[] = [];
    const requestedUserIds: string[] = [];
    const uniqueTargets = Array.from(new Set(parsed.data.memberIds)).filter((id) => id !== actor.id);

    for (const targetId of uniqueTargets) {
      const targetUser = getUserById(targetId);
      if (!targetUser) continue;

      if (targetUser.groupAddPolicy === 'REQUEST') {
        const invId = uid('ginv');
        db.prepare(
          `INSERT INTO group_join_requests (id, channelId, workspaceId, inviterId, inviteeId, status, createdAt, respondedAt)
           VALUES (?, ?, ?, ?, ?, 'PENDING', ?, NULL)`
        ).run(invId, chId, workspaceId, actor.id, targetUser.id, now);
        requestedUserIds.push(targetUser.id);

        emitUserNotification({
          userId: targetUser.id,
          type: 'GROUP_INVITE',
          title: `دعوت به گروه «${cleanName}»`,
          body: `${actor.displayName} شما را به گروه کاری «${cleanName}» دعوت کرد. برای عضویت تأیید یا رد کنید.`,
          channelId: chId,
          messageId: null,
          senderName: actor.displayName,
          avatarUrl: actor.avatarUrl,
          inviteId: invId,
        });
        getIO()?.to(`user:${targetUser.id}`).emit('group:invite', { inviteId: invId, channelId: chId });
      } else {
        db.prepare(
          `INSERT OR IGNORE INTO channel_members (id, channelId, userId, isStarred, isMuted, lastReadAt, joinedAt) VALUES (?, ?, ?, 0, 0, ?, ?)`
        ).run(uid('cm'), chId, targetUser.id, now, now);
        addedUserIds.push(targetUser.id);

        emitUserNotification({
          userId: targetUser.id,
          type: 'SYSTEM',
          title: `عضویت در گروه «${cleanName}»`,
          body: `${actor.displayName} شما را به گروه «${cleanName}» اضافه کرد.`,
          channelId: chId,
          messageId: null,
          senderName: actor.displayName,
          avatarUrl: actor.avatarUrl,
        });
        getIO()?.to(`user:${targetUser.id}`).emit('channel:created', { workspaceId, channelId: chId });
      }
    }

    recordAuditLog({
      actor,
      action: 'GROUP_CREATED',
      category: 'CHANNEL',
      severity: 'INFO',
      targetType: 'channel',
      targetId: chId,
      targetLabel: cleanName,
      details: { addedCount: addedUserIds.length, requestedCount: requestedUserIds.length },
    });

    getIO()?.to(`user:${actor.id}`).emit('channel:created', { workspaceId, channelId: chId });
    const channels = getWorkspaceChannels(workspaceId, actor.id);
    const created = channels.find((c) => c.id === chId);
    res.status(201).json({ channel: created, addedUserIds, requestedUserIds });
  });

  app.post('/api/channels/:channelId/members', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const { channelId } = req.params;
    const ch = db.prepare(`SELECT id, workspaceId, name, type FROM channels WHERE id = ?`).get(channelId) as
      | { id: string; workspaceId: string; name: string; type: ChannelType }
      | undefined;
    if (!ch) {
      res.status(404).json({ error: 'Channel or group not found' });
      return;
    }

    const schema = z.object({ userIds: z.array(z.string()).min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'userIds array is required' });
      return;
    }

    const now = new Date().toISOString();
    const addedUserIds: string[] = [];
    const requestedUserIds: string[] = [];

    for (const targetId of Array.from(new Set(parsed.data.userIds))) {
      const already = db
        .prepare(`SELECT id FROM channel_members WHERE channelId = ? AND userId = ?`)
        .get(channelId, targetId);
      if (already) continue;

      const targetUser = getUserById(targetId);
      if (!targetUser) continue;

      if (targetUser.groupAddPolicy === 'REQUEST') {
        const pending = db
          .prepare(`SELECT id FROM group_join_requests WHERE channelId = ? AND inviteeId = ? AND status = 'PENDING'`)
          .get(channelId, targetUser.id);
        if (!pending) {
          const invId = uid('ginv');
          db.prepare(
            `INSERT INTO group_join_requests (id, channelId, workspaceId, inviterId, inviteeId, status, createdAt, respondedAt)
             VALUES (?, ?, ?, ?, ?, 'PENDING', ?, NULL)`
          ).run(invId, channelId, ch.workspaceId, actor.id, targetUser.id, now);
          requestedUserIds.push(targetUser.id);
          emitUserNotification({
            userId: targetUser.id,
            type: 'GROUP_INVITE',
            title: `دعوت به گروه «${ch.name}»`,
            body: `${actor.displayName} درخواست افزودن شما به «${ch.name}» را ارسال کرد.`,
            channelId,
            messageId: null,
            senderName: actor.displayName,
            avatarUrl: actor.avatarUrl,
            inviteId: invId,
          });
          getIO()?.to(`user:${targetUser.id}`).emit('group:invite', { inviteId: invId, channelId });
        }
      } else {
        db.prepare(
          `INSERT OR IGNORE INTO channel_members (id, channelId, userId, isStarred, isMuted, lastReadAt, joinedAt) VALUES (?, ?, ?, 0, 0, ?, ?)`
        ).run(uid('cm'), channelId, targetUser.id, now, now);
        addedUserIds.push(targetUser.id);
        emitUserNotification({
          userId: targetUser.id,
          type: 'SYSTEM',
          title: `افزوده شدید به «${ch.name}»`,
          body: `${actor.displayName} شما را به این گفتگو اضافه کرد.`,
          channelId,
          messageId: null,
          senderName: actor.displayName,
          avatarUrl: actor.avatarUrl,
        });
        getIO()?.to(`user:${targetUser.id}`).emit('channel:created', { workspaceId: ch.workspaceId, channelId });
      }
    }

    getIO()?.to(`workspace:${ch.workspaceId}`).emit('channel:updated', { channelId });
    res.json({ addedUserIds, requestedUserIds });
  });

  app.get('/api/group-invites', requireAuth, (req: AuthenticatedRequest, res) => {
    const rows = db
      .prepare(
        `SELECT r.*, c.name as channelName, c.description as channelDescription,
                u.displayName as inviterName, u.avatarUrl as inviterAvatarUrl,
                (SELECT COUNT(*) FROM channel_members cm WHERE cm.channelId = r.channelId) as memberCount
         FROM group_join_requests r
         JOIN channels c ON c.id = r.channelId
         JOIN users u ON u.id = r.inviterId
         WHERE r.inviteeId = ? AND r.status = 'PENDING'
         ORDER BY r.createdAt DESC`
      )
      .all(req.authUser!.id);
    res.json({ invites: rows });
  });

  app.post('/api/group-invites/:id/respond', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const schema = z.object({ action: z.enum(['ACCEPT', 'DECLINE']) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid action ACCEPT or DECLINE required' });
      return;
    }

    const invite = db
      .prepare(`SELECT * FROM group_join_requests WHERE id = ? AND inviteeId = ?`)
      .get(req.params.id, actor.id) as
      | { id: string; channelId: string; workspaceId: string; inviterId: string; status: string }
      | undefined;

    if (!invite) {
      res.status(404).json({ error: 'Group invite request not found' });
      return;
    }
    if (invite.status !== 'PENDING') {
      res.json({ ok: true, status: invite.status, channelId: invite.channelId });
      return;
    }

    const now = new Date().toISOString();
    const nextStatus = parsed.data.action === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';
    db.prepare(`UPDATE group_join_requests SET status = ?, respondedAt = ? WHERE id = ?`).run(nextStatus, now, invite.id);

    if (parsed.data.action === 'ACCEPT') {
      db.prepare(
        `INSERT OR IGNORE INTO channel_members (id, channelId, userId, isStarred, isMuted, lastReadAt, joinedAt) VALUES (?, ?, ?, 0, 0, ?, ?)`
      ).run(uid('cm'), invite.channelId, actor.id, now, now);
      getIO()?.to(`user:${actor.id}`).emit('channel:created', { workspaceId: invite.workspaceId, channelId: invite.channelId });
      getIO()?.to(`workspace:${invite.workspaceId}`).emit('channel:updated', { channelId: invite.channelId });
    }

    getIO()?.to(`user:${actor.id}`).emit('group:invite-responded', { inviteId: invite.id, status: nextStatus });
    getIO()?.to(`user:${invite.inviterId}`).emit('group:invite-responded', { inviteId: invite.id, status: nextStatus });

    recordAuditLog({
      actor,
      action: parsed.data.action === 'ACCEPT' ? 'GROUP_INVITE_ACCEPTED' : 'GROUP_INVITE_DECLINED',
      category: 'CHANNEL',
      severity: 'INFO',
      targetType: 'channel',
      targetId: invite.channelId,
      targetLabel: invite.id,
    });

    res.json({ ok: true, status: nextStatus, channelId: invite.channelId });
  });

  app.get('/api/channels/:channelId/members', requireAuth, (req, res) => {
    const rows = db
      .prepare(
        `SELECT u.id, u.email, u.fullName, u.displayName, u.avatarUrl, u.jobTitle, u.department, u.timezone, u.role, u.presence, u.customStatus, u.customEmoji, u.dndEnabled, u.dndStartHour, u.dndEndHour, u.managerId, COALESCE(u.groupAddPolicy, 'DIRECT') as groupAddPolicy
         FROM channel_members cm
         JOIN users u ON u.id = cm.userId
         WHERE cm.channelId = ? ORDER BY u.fullName ASC`
      )
      .all(req.params.channelId);
    res.json({ members: rows });
  });

  app.patch('/api/channels/:channelId/topic', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    if (!canPerformAction(actor.role, 'channel:delete')) {
      res.status(403).json({ error: 'Only Admins and Department Managers can update channel topics' });
      return;
    }
    const topic = sanitizeHtmlText(String(req.body?.topic ?? '')).slice(0, 200);
    const ch = db.prepare(`SELECT id, workspaceId FROM channels WHERE id = ?`).get(req.params.channelId) as
      | { id: string; workspaceId: string }
      | undefined;
    if (!ch) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }
    db.prepare(`UPDATE channels SET topic = ? WHERE id = ?`).run(topic || null, ch.id);
    recordAuditLog({
      actor,
      action: 'CHANNEL_TOPIC_UPDATED',
      category: 'CHANNEL',
      severity: 'INFO',
      targetType: 'channel',
      targetId: ch.id,
      targetLabel: topic || '(پاک شده)',
    });
    getIO()?.to(`workspace:${ch.workspaceId}`).emit('channel:updated', { channelId: ch.id, topic: topic || null });
    res.json({ ok: true, topic: topic || null });
  });

  app.post('/api/channels/:channelId/archive', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    if (!canPerformAction(actor.role, 'channel:delete')) {
      res.status(403).json({ error: 'Only Admins and Department Managers can archive channels' });
      return;
    }
    const ch = db.prepare(`SELECT id, workspaceId, name FROM channels WHERE id = ?`).get(req.params.channelId) as
      | { id: string; workspaceId: string; name: string }
      | undefined;
    if (!ch) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }
    const now = new Date().toISOString();
    db.prepare(`UPDATE channels SET isArchived = 1, archivedAt = ? WHERE id = ?`).run(now, ch.id);
    recordAuditLog({
      actor,
      action: 'CHANNEL_ARCHIVED',
      category: 'CHANNEL',
      severity: 'WARN',
      targetType: 'channel',
      targetId: ch.id,
      targetLabel: `#${ch.name}`,
    });
    getIO()?.to(`workspace:${ch.workspaceId}`).emit('channel:archived', { channelId: ch.id, isArchived: true });
    res.json({ ok: true, isArchived: true, archivedAt: now });
  });

  app.post('/api/channels/:channelId/unarchive', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    if (!canPerformAction(actor.role, 'channel:delete')) {
      res.status(403).json({ error: 'Only Admins and Department Managers can restore archived channels' });
      return;
    }
    const ch = db.prepare(`SELECT id, workspaceId, name FROM channels WHERE id = ?`).get(req.params.channelId) as
      | { id: string; workspaceId: string; name: string }
      | undefined;
    if (!ch) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }
    db.prepare(`UPDATE channels SET isArchived = 0, archivedAt = NULL WHERE id = ?`).run(ch.id);
    recordAuditLog({
      actor,
      action: 'CHANNEL_RESTORED',
      category: 'CHANNEL',
      severity: 'INFO',
      targetType: 'channel',
      targetId: ch.id,
      targetLabel: `#${ch.name}`,
    });
    getIO()?.to(`workspace:${ch.workspaceId}`).emit('channel:archived', { channelId: ch.id, isArchived: false });
    res.json({ ok: true, isArchived: false });
  });

  // ---------------------------------------------------------------------------
  // MESSAGES, THREADS, REACTIONS, PINS, BOOKMARKS, POLLS
  // ---------------------------------------------------------------------------
  app.get('/api/channels/:channelId/messages', requireAuth, (req: AuthenticatedRequest, res) => {
    const messages = getChannelMessages(req.params.channelId, req.authUser!.id, 200);
    res.json({ messages });
  });

  app.post('/api/channels/:channelId/messages', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const { channelId } = req.params;

    const channelRow = db.prepare(`SELECT id, name, type, workspaceId FROM channels WHERE id = ?`).get(channelId) as
      | { id: string; name: string; type: ChannelType; workspaceId: string }
      | undefined;

    if (!channelRow) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    if ((db.prepare(`SELECT isArchived FROM channels WHERE id = ?`).get(channelId) as { isArchived: number }).isArchived) {
      res.status(409).json({ error: 'This channel is archived and read-only' });
      return;
    }
    if (!canPerformAction(actor.role, 'message:post', channelRow.type)) {
      res.status(403).json({
        error: 'This announcement channel is read-only for your role. Only Admins and Department Managers can post.',
      });
      return;
    }

    const schema = z.object({
      content: z.string().max(8000),
      parentId: z.string().nullable().optional(),
      attachmentIds: z.array(z.string()).optional(),
      poll: z
        .object({
          question: z.string().min(1).max(240),
          options: z.array(z.string().min(1).max(120)).min(2).max(6),
        })
        .optional(),
      task: z
        .object({
          title: z.string().min(1).max(200),
          assigneeHandle: z.string().optional(),
          dueDate: z.string().optional(),
        })
        .optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid message payload' });
      return;
    }

    const cleanContent = sanitizeHtmlText(parsed.data.content);
    const attachmentIds = parsed.data.attachmentIds ?? [];
    if (!cleanContent && attachmentIds.length === 0 && !parsed.data.poll && !parsed.data.task) {
      res.status(400).json({ error: 'Message cannot be empty' });
      return;
    }

    const msgId = uid('msg');
    const now = new Date().toISOString();
    const msgType = parsed.data.poll ? 'POLL' : parsed.data.task ? 'TASK' : 'TEXT';

    db.prepare(
      `INSERT INTO messages (id, channelId, authorId, parentId, type, content, isPinned, isEdited, deletedAt, readByJson, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, NULL, ?, ?, ?)`
    ).run(msgId, channelId, actor.id, parsed.data.parentId ?? null, msgType, cleanContent, JSON.stringify([actor.id]), now, now);

    // Link uploaded attachments
    for (const attId of attachmentIds) {
      db.prepare(`UPDATE attachments SET messageId = ? WHERE id = ? AND uploaderId = ?`).run(msgId, attId, actor.id);
    }

    // Create Poll if requested
    if (parsed.data.poll) {
      const pollId = uid('poll');
      db.prepare(`INSERT INTO polls (id, messageId, question, createdAt) VALUES (?, ?, ?, ?)`).run(
        pollId,
        msgId,
        sanitizeHtmlText(parsed.data.poll.question),
        now
      );
      parsed.data.poll.options.forEach((opt, idx) => {
        db.prepare(`INSERT INTO poll_options (id, pollId, label, sortOrder) VALUES (?, ?, ?, ?)`).run(
          uid('popt'),
          pollId,
          sanitizeHtmlText(opt),
          idx
        );
      });
    }

    // Create Task if requested
    if (parsed.data.task) {
      let assigneeId: string | null = null;
      if (parsed.data.task.assigneeHandle) {
        const handle = parsed.data.task.assigneeHandle.toLowerCase();
        const found = db
          .prepare(`SELECT id FROM users WHERE lower(email) LIKE ? OR lower(replace(displayName, ' ', '.')) = ? LIMIT 1`)
          .get(`${handle}%`, handle) as { id: string } | undefined;
        assigneeId = found?.id ?? null;
      }
      db.prepare(
        `INSERT INTO tasks (id, channelId, messageId, creatorId, assigneeId, title, description, status, dueDate, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, NULL, 'TODO', ?, ?)`
      ).run(uid('tsk'), channelId, msgId, actor.id, assigneeId, sanitizeHtmlText(parsed.data.task.title), parsed.data.task.dueDate ?? null, now);
    }

    // Generate smart notifications for @mentions and thread replies
    const mentions = extractMentions(cleanContent);
    const channelMembers = db
      .prepare(`SELECT userId FROM channel_members WHERE channelId = ?`)
      .all(channelId) as Array<{ userId: string }>;

    if (mentions.mentionsChannel || mentions.mentionsHere) {
      for (const m of channelMembers) {
        if (m.userId === actor.id) continue;
        emitUserNotification({
          userId: m.userId,
          type: 'MENTION',
          title: `${actor.displayName} mentioned @channel in #${channelRow.name}`,
          body: cleanContent.slice(0, 140),
          channelId,
          messageId: msgId,
          senderName: actor.displayName,
          avatarUrl: actor.avatarUrl,
        });
      }
    } else if (mentions.handles.length > 0) {
      const allUsers = getAllUsers();
      for (const h of mentions.handles) {
        const target = allUsers.find(
          (u) =>
            u.email.toLowerCase().startsWith(h) ||
            u.displayName.toLowerCase().replace(/\s+/g, '.') === h ||
            u.displayName.toLowerCase().split(' ')[0] === h
        );
        if (target && target.id !== actor.id) {
          emitUserNotification({
            userId: target.id,
            type: 'MENTION',
            title: `${actor.displayName} mentioned you in #${channelRow.name}`,
            body: cleanContent.slice(0, 140),
            channelId,
            messageId: msgId,
            senderName: actor.displayName,
            avatarUrl: actor.avatarUrl,
          });
        }
      }
    }

    if (parsed.data.parentId) {
      const parentRow = db.prepare(`SELECT authorId FROM messages WHERE id = ?`).get(parsed.data.parentId) as
        | { authorId: string }
        | undefined;
      if (parentRow && parentRow.authorId !== actor.id) {
        emitUserNotification({
          userId: parentRow.authorId,
          type: 'THREAD_REPLY',
          title: `${actor.displayName} replied to your thread in #${channelRow.name}`,
          body: cleanContent.slice(0, 140),
          channelId,
          messageId: parsed.data.parentId,
          senderName: actor.displayName,
          avatarUrl: actor.avatarUrl,
        });
      }
    }

    const message = hydrateMessage(msgId, actor.id)!;
    getIO()?.to(`channel:${channelId}`).emit('message:new', { channelId, message });
    res.status(201).json({ message });
  });

  app.get('/api/messages/:id/thread', requireAuth, (req: AuthenticatedRequest, res) => {
    const thread = getThreadMessages(req.params.id, req.authUser!.id);
    if (!thread.parent) {
      res.status(404).json({ error: 'Parent message not found' });
      return;
    }
    res.json(thread);
  });

  app.patch('/api/messages/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const msgRow = db.prepare(`SELECT id, channelId, authorId, content FROM messages WHERE id = ?`).get(req.params.id) as
      | { id: string; channelId: string; authorId: string; content: string }
      | undefined;

    if (!msgRow) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    if (msgRow.authorId !== actor.id) {
      res.status(403).json({ error: 'You can only edit your own messages' });
      return;
    }

    const newContent = sanitizeHtmlText(String(req.body?.content || ''));
    if (!newContent) {
      res.status(400).json({ error: 'Content cannot be empty' });
      return;
    }

    const now = new Date().toISOString();
    db.prepare(`INSERT INTO message_edit_history (id, messageId, previousContent, editedAt) VALUES (?, ?, ?, ?)`).run(
      uid('meh'),
      msgRow.id,
      msgRow.content,
      now
    );
    db.prepare(`UPDATE messages SET content = ?, isEdited = 1, updatedAt = ? WHERE id = ?`).run(newContent, now, msgRow.id);

    const updated = hydrateMessage(msgRow.id, actor.id)!;
    recordAuditLog({
      actor,
      action: 'MESSAGE_EDITED',
      category: 'MESSAGE',
      severity: 'INFO',
      targetType: 'message',
      targetId: msgRow.id,
      targetLabel: newContent.slice(0, 60),
    });
    getIO()?.to(`channel:${msgRow.channelId}`).emit('message:updated', { channelId: msgRow.channelId, message: updated });
    res.json({ message: updated });
  });

  app.delete('/api/messages/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const msgRow = db.prepare(`SELECT id, channelId, authorId FROM messages WHERE id = ?`).get(req.params.id) as
      | { id: string; channelId: string; authorId: string }
      | undefined;
    if (!msgRow) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    if (msgRow.authorId !== actor.id && !canPerformAction(actor.role, 'message:delete_any')) {
      res.status(403).json({ error: 'Insufficient permissions to delete this message' });
      return;
    }

    const now = new Date().toISOString();
    db.prepare(`UPDATE messages SET deletedAt = ?, updatedAt = ? WHERE id = ?`).run(now, now, msgRow.id);
    const updated = hydrateMessage(msgRow.id, actor.id)!;
    recordAuditLog({
      actor,
      action: 'MESSAGE_DELETED',
      category: 'MESSAGE',
      severity: 'WARN',
      targetType: 'message',
      targetId: msgRow.id,
      targetLabel: msgRow.channelId,
    });
    getIO()?.to(`channel:${msgRow.channelId}`).emit('message:updated', { channelId: msgRow.channelId, message: updated });
    res.json({ message: updated });
  });

  app.post('/api/messages/:id/pin', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    if (!canPerformAction(actor.role, 'message:pin')) {
      res.status(403).json({ error: 'Insufficient permissions to pin messages' });
      return;
    }
    const msgRow = db.prepare(`SELECT id, channelId, isPinned FROM messages WHERE id = ?`).get(req.params.id) as
      | { id: string; channelId: string; isPinned: number }
      | undefined;
    if (!msgRow) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    const nextPinned = msgRow.isPinned ? 0 : 1;
    db.prepare(`UPDATE messages SET isPinned = ? WHERE id = ?`).run(nextPinned, msgRow.id);
    const updated = hydrateMessage(msgRow.id, actor.id)!;
    recordAuditLog({
      actor,
      action: nextPinned ? 'MESSAGE_PINNED' : 'MESSAGE_UNPINNED',
      category: 'MESSAGE',
      severity: 'INFO',
      targetType: 'message',
      targetId: msgRow.id,
      targetLabel: msgRow.channelId,
    });
    getIO()?.to(`channel:${msgRow.channelId}`).emit('message:updated', { channelId: msgRow.channelId, message: updated });
    res.json({ message: updated });
  });

  app.post('/api/messages/:id/archive', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const msgRow = db.prepare(`SELECT id, channelId, authorId FROM messages WHERE id = ?`).get(req.params.id) as
      | { id: string; channelId: string; authorId: string }
      | undefined;
    if (!msgRow) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    if (msgRow.authorId !== actor.id && !canPerformAction(actor.role, 'message:pin')) {
      res.status(403).json({ error: 'Insufficient permissions to archive this message' });
      return;
    }
    const now = new Date().toISOString();
    db.prepare(`UPDATE messages SET isArchived = 1, archivedAt = ? WHERE id = ?`).run(now, msgRow.id);
    recordAuditLog({
      actor,
      action: 'MESSAGE_ARCHIVED',
      category: 'MESSAGE',
      severity: 'INFO',
      targetType: 'message',
      targetId: msgRow.id,
      targetLabel: msgRow.channelId,
    });
    getIO()?.to(`channel:${msgRow.channelId}`).emit('message:archived', {
      channelId: msgRow.channelId,
      messageId: msgRow.id,
      isArchived: true,
    });
    res.json({ ok: true, isArchived: true, archivedAt: now });
  });

  app.post('/api/messages/:id/unarchive', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const msgRow = db.prepare(`SELECT id, channelId, authorId FROM messages WHERE id = ?`).get(req.params.id) as
      | { id: string; channelId: string; authorId: string }
      | undefined;
    if (!msgRow) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    if (msgRow.authorId !== actor.id && !canPerformAction(actor.role, 'message:pin')) {
      res.status(403).json({ error: 'Insufficient permissions to restore this message' });
      return;
    }
    db.prepare(`UPDATE messages SET isArchived = 0, archivedAt = NULL WHERE id = ?`).run(msgRow.id);
    const updated = hydrateMessage(msgRow.id, actor.id);
    getIO()?.to(`channel:${msgRow.channelId}`).emit('message:archived', {
      channelId: msgRow.channelId,
      messageId: msgRow.id,
      isArchived: false,
    });
    res.json({ ok: true, message: updated, isArchived: false });
  });

  app.post('/api/messages/:id/bookmark', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const existing = db
      .prepare(`SELECT id FROM bookmarks WHERE messageId = ? AND userId = ?`)
      .get(req.params.id, actor.id) as { id: string } | undefined;

    if (existing) {
      db.prepare(`DELETE FROM bookmarks WHERE id = ?`).run(existing.id);
    } else {
      db.prepare(`INSERT INTO bookmarks (id, messageId, userId, createdAt) VALUES (?, ?, ?, ?)`).run(
        uid('bm'),
        req.params.id,
        actor.id,
        new Date().toISOString()
      );
    }
    const updated = hydrateMessage(req.params.id, actor.id);
    res.json({ message: updated, isBookmarked: !existing });
  });

  app.get('/api/bookmarks', requireAuth, (req: AuthenticatedRequest, res) => {
    const rows = db
      .prepare(`SELECT messageId FROM bookmarks WHERE userId = ? ORDER BY createdAt DESC`)
      .all(req.authUser!.id) as Array<{ messageId: string }>;
    const messages = rows
      .map((r) => hydrateMessage(r.messageId, req.authUser!.id))
      .filter(Boolean);
    res.json({ messages });
  });

  app.post('/api/messages/:id/forward', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const targetChannelId = req.body?.targetChannelId as string | undefined;
    if (!targetChannelId) {
      res.status(400).json({ error: 'targetChannelId is required' });
      return;
    }
    const orig = hydrateMessage(req.params.id, actor.id);
    if (!orig) {
      res.status(404).json({ error: 'Source message not found' });
      return;
    }
    if (!sendAccess(res, channelAccess(actor.id, targetChannelId))) return;
    const tch = db.prepare(`SELECT type, isArchived FROM channels WHERE id = ?`).get(targetChannelId) as { type: ChannelType; isArchived: number };
    if (tch.isArchived || !canPerformAction(actor.role, 'message:post', tch.type)) {
      res.status(403).json({ error: 'You cannot post in the target channel' });
      return;
    }
    const newId = uid('msg');
    const now = new Date().toISOString();
    const forwardedContent = `> Forwarded from **${orig.author.displayName}**\n\n${orig.content}`;
    db.prepare(
      `INSERT INTO messages (id, channelId, authorId, parentId, type, content, isPinned, isEdited, deletedAt, readByJson, createdAt, updatedAt)
       VALUES (?, ?, ?, NULL, 'TEXT', ?, 0, 0, NULL, ?, ?, ?)`
    ).run(newId, targetChannelId, actor.id, forwardedContent, JSON.stringify([actor.id]), now, now);

    const created = hydrateMessage(newId, actor.id)!;
    getIO()?.to(`channel:${targetChannelId}`).emit('message:new', { channelId: targetChannelId, message: created });
    res.status(201).json({ message: created });
  });

  app.post('/api/messages/:id/reactions', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const emoji = String(req.body?.emoji || '').trim();
    if (!emoji) {
      res.status(400).json({ error: 'Emoji is required' });
      return;
    }
    const msgRow = db.prepare(`SELECT id, channelId FROM messages WHERE id = ?`).get(req.params.id) as
      | { id: string; channelId: string }
      | undefined;
    if (!msgRow) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    const existing = db
      .prepare(`SELECT id FROM reactions WHERE messageId = ? AND userId = ? AND emoji = ?`)
      .get(msgRow.id, actor.id, emoji) as { id: string } | undefined;
    if (existing) {
      db.prepare(`DELETE FROM reactions WHERE id = ?`).run(existing.id);
    } else {
      db.prepare(`INSERT INTO reactions (id, messageId, userId, emoji, createdAt) VALUES (?, ?, ?, ?, ?)`).run(
        uid('rx'),
        msgRow.id,
        actor.id,
        emoji,
        new Date().toISOString()
      );
    }

    const updated = hydrateMessage(msgRow.id, actor.id)!;
    getIO()?.to(`channel:${msgRow.channelId}`).emit('message:updated', { channelId: msgRow.channelId, message: updated });
    res.json({ message: updated });
  });

  // ---------------------------------------------------------------------------
  // POLLS, TASKS & LIVE WIKI
  // ---------------------------------------------------------------------------
  app.post('/api/polls/:pollId/vote', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const optionId = String(req.body?.optionId || '');
    const pollRow = db.prepare(`SELECT id, messageId FROM polls WHERE id = ?`).get(req.params.pollId) as
      | { id: string; messageId: string }
      | undefined;
    if (!pollRow) {
      res.status(404).json({ error: 'Poll not found' });
      return;
    }

    if (!db.prepare(`SELECT 1 FROM poll_options WHERE id = ? AND pollId = ?`).get(optionId, pollRow.id)) {
      res.status(400).json({ error: 'Invalid poll option' });
      return;
    }
    const pollMsg = db.prepare(`SELECT channelId FROM messages WHERE id = ?`).get(pollRow.messageId) as { channelId: string } | undefined;
    if (!pollMsg || !sendAccess(res, channelAccess(actor.id, pollMsg.channelId))) return;

    // Single-choice poll per user: remove prior votes by this user on this poll
    db.prepare(
      `DELETE FROM poll_votes WHERE userId = ? AND optionId IN (SELECT id FROM poll_options WHERE pollId = ?)`
    ).run(actor.id, pollRow.id);
    db.prepare(`INSERT INTO poll_votes (id, optionId, userId, createdAt) VALUES (?, ?, ?, ?)`).run(
      uid('pv'),
      optionId,
      actor.id,
      new Date().toISOString()
    );

    const msgRow = db.prepare(`SELECT channelId FROM messages WHERE id = ?`).get(pollRow.messageId) as { channelId: string };
    const updated = hydrateMessage(pollRow.messageId, actor.id)!;
    getIO()?.to(`channel:${msgRow.channelId}`).emit('message:updated', { channelId: msgRow.channelId, message: updated });
    res.json({ message: updated });
  });

  app.get('/api/tasks', requireAuth, (req, res) => {
    const workspaceId = String(req.query.workspaceId || '');
    const status = String(req.query.status || '');
    const priority = String(req.query.priority || '');
    const assigneeId = String(req.query.assigneeId || '');
    const channelId = String(req.query.channelId || '');

    let sql = `
      SELECT t.*, ch.name as channelName, c.displayName as creatorName, a.displayName as assigneeName
      FROM tasks t
      JOIN channels ch ON ch.id = t.channelId
      JOIN users c ON c.id = t.creatorId
      LEFT JOIN users a ON a.id = t.assigneeId
      WHERE 1=1
    `;
    const params: string[] = [];
    if (workspaceId) {
      sql += ` AND ch.workspaceId = ?`;
      params.push(workspaceId);
    }
    if (status) {
      sql += ` AND t.status = ?`;
      params.push(status);
    }
    if (priority) {
      sql += ` AND COALESCE(t.priority, 'MEDIUM') = ?`;
      params.push(priority);
    }
    if (assigneeId) {
      sql += ` AND t.assigneeId = ?`;
      params.push(assigneeId);
    }
    if (channelId) {
      sql += ` AND t.channelId = ?`;
      params.push(channelId);
    }
    sql += ` ORDER BY t.createdAt DESC`;

    const tasks = db.prepare(sql).all(...params);
    res.json({ tasks });
  });

  app.get('/api/channels/:channelId/tasks', requireAuth, (req, res) => {
    const tasks = db
      .prepare(
        `SELECT t.*, ch.name as channelName, c.displayName as creatorName, a.displayName as assigneeName
         FROM tasks t
         JOIN channels ch ON ch.id = t.channelId
         JOIN users c ON c.id = t.creatorId
         LEFT JOIN users a ON a.id = t.assigneeId
         WHERE t.channelId = ? ORDER BY t.createdAt DESC`
      )
      .all(req.params.channelId);
    res.json({ tasks });
  });

  app.post('/api/channels/:channelId/tasks', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const { channelId } = req.params;
    const schema = z.object({
      title: z.string().min(2).max(200),
      description: z.string().max(1000).optional(),
      assigneeId: z.string().nullable().optional(),
      dueDate: z.string().nullable().optional(),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
      status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional(),
      sourceMessageId: z.string().nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Task title is required' });
      return;
    }

    const now = new Date().toISOString();
    const taskId = uid('tsk');
    const cleanTitle = sanitizeHtmlText(parsed.data.title);
    const priority = parsed.data.priority ?? 'MEDIUM';
    const status = parsed.data.status ?? 'TODO';

    // If converting an existing chat message, avoid violating UNIQUE(messageId) if already converted
    let linkedMsgId: string | null = null;
    if (parsed.data.sourceMessageId) {
      const existingTask = db
        .prepare(`SELECT id FROM tasks WHERE messageId = ?`)
        .get(parsed.data.sourceMessageId);
      if (!existingTask) {
        linkedMsgId = parsed.data.sourceMessageId;
      }
    }

    db.prepare(
      `INSERT INTO tasks (id, channelId, messageId, creatorId, assigneeId, title, description, status, priority, dueDate, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      taskId,
      channelId,
      linkedMsgId,
      actor.id,
      parsed.data.assigneeId ?? null,
      cleanTitle,
      parsed.data.description ? sanitizeHtmlText(parsed.data.description) : null,
      status,
      priority,
      parsed.data.dueDate ?? null,
      now
    );

    if (parsed.data.assigneeId && parsed.data.assigneeId !== actor.id) {
      emitUserNotification({
        userId: parsed.data.assigneeId,
        type: 'TASK_ASSIGNED',
        title: `${actor.displayName} assigned you a task`,
        body: cleanTitle,
        channelId,
        messageId: linkedMsgId,
        senderName: actor.displayName,
        avatarUrl: actor.avatarUrl,
      });
    }

    const task = db
      .prepare(
        `SELECT t.*, ch.name as channelName, c.displayName as creatorName, a.displayName as assigneeName
         FROM tasks t JOIN channels ch ON ch.id = t.channelId JOIN users c ON c.id = t.creatorId LEFT JOIN users a ON a.id = t.assigneeId WHERE t.id = ?`
      )
      .get(taskId);

    recordAuditLog({
      actor,
      action: 'TASK_CREATED',
      category: 'TASK',
      severity: 'INFO',
      targetType: 'task',
      targetId: taskId,
      targetLabel: cleanTitle,
      details: { priority, status, assigneeId: parsed.data.assigneeId ?? null },
    });
    getIO()?.to(`channel:${channelId}`).emit('task:updated', { channelId, task });
    getIO()?.to(`channel:${channelId}`).emit('tasks:changed', { channelId, task });
    res.status(201).json({ task });
  });

  app.patch('/api/tasks/:taskId', requireAuth, (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      title: z.string().min(2).max(200).optional(),
      description: z.string().max(1000).nullable().optional(),
      status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional(),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
      assigneeId: z.string().nullable().optional(),
      dueDate: z.string().nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid task update' });
      return;
    }

    const existing = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(req.params.taskId) as
      | {
          id: string;
          channelId: string;
          messageId: string | null;
          title: string;
          description: string | null;
          status: string;
          priority: string;
          assigneeId: string | null;
          dueDate: string | null;
        }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const nextTitle = parsed.data.title ? sanitizeHtmlText(parsed.data.title) : existing.title;
    const nextDesc =
      parsed.data.description !== undefined
        ? parsed.data.description
          ? sanitizeHtmlText(parsed.data.description)
          : null
        : existing.description;

    db.prepare(`UPDATE tasks SET title = ?, description = ?, status = ?, priority = ?, assigneeId = ?, dueDate = ? WHERE id = ?`).run(
      nextTitle,
      nextDesc,
      parsed.data.status ?? existing.status,
      parsed.data.priority ?? existing.priority ?? 'MEDIUM',
      parsed.data.assigneeId !== undefined ? parsed.data.assigneeId : existing.assigneeId,
      parsed.data.dueDate !== undefined ? parsed.data.dueDate : existing.dueDate,
      existing.id
    );

    const task = db
      .prepare(
        `SELECT t.*, ch.name as channelName, c.displayName as creatorName, a.displayName as assigneeName
         FROM tasks t JOIN channels ch ON ch.id = t.channelId JOIN users c ON c.id = t.creatorId LEFT JOIN users a ON a.id = t.assigneeId WHERE t.id = ?`
      )
      .get(existing.id);

    recordAuditLog({
      actor: req.authUser!,
      action: 'TASK_UPDATED',
      category: 'TASK',
      severity: 'INFO',
      targetType: 'task',
      targetId: existing.id,
      targetLabel: nextTitle,
      details: { status: parsed.data.status ?? existing.status, priority: parsed.data.priority ?? existing.priority },
    });
    getIO()?.to(`channel:${existing.channelId}`).emit('task:updated', { channelId: existing.channelId, task });
    getIO()?.to(`channel:${existing.channelId}`).emit('tasks:changed', { channelId: existing.channelId, task });
    if (existing.messageId) {
      const msg = hydrateMessage(existing.messageId, req.authUser!.id);
      if (msg) getIO()?.to(`channel:${existing.channelId}`).emit('message:updated', { channelId: existing.channelId, message: msg });
    }
    res.json({ task });
  });

  app.delete('/api/tasks/:taskId', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const existing = db.prepare(`SELECT id, channelId, creatorId, title FROM tasks WHERE id = ?`).get(req.params.taskId) as
      | { id: string; channelId: string; creatorId: string; title: string }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    if (existing.creatorId !== actor.id && !canPerformAction(actor.role, 'message:delete_any')) {
      res.status(403).json({ error: 'Only task creators, managers, or admins can delete tasks' });
      return;
    }
    db.prepare(`DELETE FROM tasks WHERE id = ?`).run(existing.id);
    recordAuditLog({
      actor,
      action: 'TASK_DELETED',
      category: 'TASK',
      severity: 'WARN',
      targetType: 'task',
      targetId: existing.id,
      targetLabel: existing.title,
    });
    getIO()?.to(`channel:${existing.channelId}`).emit('task:updated', { channelId: existing.channelId });
    getIO()?.to(`channel:${existing.channelId}`).emit('tasks:changed', { channelId: existing.channelId });
    res.json({ ok: true });
  });

  app.get('/api/channels/:channelId/wiki', requireAuth, (req, res) => {
    const wiki = getChannelWiki(req.params.channelId);
    res.json({ wiki });
  });

  app.put('/api/channels/:channelId/wiki', requireAuth, (req: AuthenticatedRequest, res) => {
    if (!canPerformAction(req.authUser!.role, 'message:pin')) {
      res.status(403).json({ error: 'Guests cannot edit wiki pages' });
      return;
    }
    const actor = req.authUser!;
    const { channelId } = req.params;
    const title = sanitizeHtmlText(String(req.body?.title || 'Channel Wiki'));
    const content = String(req.body?.content || '');
    const now = new Date().toISOString();

    const existing = db.prepare(`SELECT id, version FROM wiki_docs WHERE channelId = ?`).get(channelId) as
      | { id: string; version: number }
      | undefined;

    if (existing) {
      db.prepare(`UPDATE wiki_docs SET title = ?, content = ?, version = ?, updatedById = ?, updatedAt = ? WHERE id = ?`).run(
        title,
        content,
        existing.version + 1,
        actor.id,
        now,
        existing.id
      );
    } else {
      db.prepare(
        `INSERT INTO wiki_docs (id, channelId, title, content, version, updatedById, updatedAt) VALUES (?, ?, ?, ?, 1, ?, ?)`
      ).run(uid('wiki'), channelId, title, content, actor.id, now);
    }

    const wiki = getChannelWiki(channelId)!;
    getIO()?.to(`channel:${channelId}`).emit('wiki:updated', wiki);
    res.json({ wiki });
  });

  // ---------------------------------------------------------------------------
  // PRESIGNED S3-COMPATIBLE UPLOADS & CHANNEL/ORG FILE REPOSITORY
  // ---------------------------------------------------------------------------
  app.post('/api/uploads/presign', requireAuth, (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      channelId: z.string(),
      fileName: z.string().min(1).max(200),
      mimeType: z.string().min(1).max(120),
      sizeBytes: z.number().int().positive().max(100 * 1024 * 1024),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid presign upload request' });
      return;
    }

    if (!sendAccess(res, channelAccess(req.authUser!.id, parsed.data.channelId))) return;
    const safeName = parsed.data.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `${Date.now()}_${crypto.randomBytes(16).toString('hex')}_${safeName}`;
    presignTokens.set(storageKey, {
      channelId: parsed.data.channelId,
      userId: req.authUser!.id,
      fileName: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      sizeBytes: parsed.data.sizeBytes,
      expiresAt: Date.now() + 10 * 60_000,
    });

    res.json({
      storageKey,
      uploadUrl: `/api/uploads/presigned/${encodeURIComponent(storageKey)}`,
      method: 'PUT',
      expiresInSeconds: 600,
    });
  });

  app.put(
    '/api/uploads/presigned/:key',
    requireAuth,
    express.raw({ type: '*/*', limit: '50mb' }),
    (req: AuthenticatedRequest, res) => {
      const storageKey = path.basename(req.params.key);
      const meta = presignTokens.get(storageKey);
      if (!meta || meta.expiresAt < Date.now() || meta.userId !== req.authUser!.id) {
        res.status(403).json({ error: 'Invalid or expired presigned upload key' });
        return;
      }

      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
      fs.writeFileSync(path.join(uploadDir, storageKey), buf);
      presignTokens.delete(storageKey);

      const attId = uid('att');
      const now = new Date().toISOString();
      const url = `/api/files/download/${encodeURIComponent(storageKey)}`;
      db.prepare(
        `INSERT INTO attachments (id, messageId, channelId, uploaderId, fileName, mimeType, sizeBytes, storageKey, url, createdAt)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(attId, meta.channelId, meta.userId, meta.fileName, meta.mimeType, buf.length || meta.sizeBytes, storageKey, url, now);

      const attachment = db
        .prepare(`SELECT a.*, u.displayName as uploaderName FROM attachments a JOIN users u ON u.id = a.uploaderId WHERE a.id = ?`)
        .get(attId);
      res.status(201).json({ attachment });
    }
  );

  app.post('/api/uploads', requireAuth, upload.single('file'), (req: AuthenticatedRequest, res) => {
    const file = req.file;
    const channelId = String(req.body?.channelId || '');
    if (!file || !channelId) {
      res.status(400).json({ error: 'File and channelId are required' });
      if (file) fs.rmSync(file.path, { force: true });
      return;
    }
    if (!sendAccess(res, channelAccess(req.authUser!.id, channelId))) {
      fs.rmSync(file.path, { force: true });
      return;
    }

    const attId = uid('att');
    const now = new Date().toISOString();
    const url = `/api/files/download/${encodeURIComponent(file.filename)}`;
    db.prepare(
      `INSERT INTO attachments (id, messageId, channelId, uploaderId, fileName, mimeType, sizeBytes, storageKey, url, createdAt)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(attId, channelId, req.authUser!.id, file.originalname, file.mimetype, file.size, file.filename, url, now);

    const attachment = db
      .prepare(`SELECT a.*, u.displayName as uploaderName FROM attachments a JOIN users u ON u.id = a.uploaderId WHERE a.id = ?`)
      .get(attId);
    res.status(201).json({ attachment });
  });

  app.get('/api/files', requireAuth, (req: AuthenticatedRequest, res) => {
    const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;
    const channelId = typeof req.query.channelId === 'string' ? req.query.channelId : undefined;
    const typeFilter = typeof req.query.type === 'string' ? req.query.type : undefined;

    let sql = `
      SELECT a.*, u.displayName as uploaderName, c.name as channelName
      FROM attachments a
      JOIN users u ON u.id = a.uploaderId
      JOIN channels c ON c.id = a.channelId
      JOIN channel_members cm ON cm.channelId = c.id AND cm.userId = ?
      WHERE 1=1
    `;
    const params: Array<string> = [req.authUser!.id];

    if (workspaceId) {
      sql += ` AND c.workspaceId = ?`;
      params.push(workspaceId);
    }
    if (channelId) {
      sql += ` AND a.channelId = ?`;
      params.push(channelId);
    }
    if (typeFilter === 'image') {
      sql += ` AND a.mimeType LIKE 'image/%'`;
    } else if (typeFilter === 'video') {
      sql += ` AND (a.mimeType LIKE 'video/%' OR a.mimeType LIKE 'audio/%')`;
    } else if (typeFilter === 'document') {
      sql += ` AND a.mimeType NOT LIKE 'image/%' AND a.mimeType NOT LIKE 'video/%'`;
    }

    sql += ` ORDER BY a.createdAt DESC LIMIT 100`;
    const files = db.prepare(sql).all(...params);
    res.json({ files });
  });

  app.get('/api/files/download/:key', (req, res) => {
    const safeKey = path.basename(req.params.key);
    const filePath = path.join(uploadDir, safeKey);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    const meta = db.prepare(`SELECT fileName, mimeType FROM attachments WHERE storageKey = ?`).get(safeKey) as
      | { fileName: string; mimeType: string }
      | undefined;
    if (meta?.mimeType) {
      res.setHeader('Content-Type', meta.mimeType);
    }
    const rawName = (meta?.fileName || safeKey).replace(/["\r\n\\/]/g, '_');
    const isSvg = /\.svg$/i.test(rawName) || meta?.mimeType === 'image/svg+xml';
    if (isSvg) {
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    }
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; media-src 'self'");
    const inlineOk = /^(image\/(png|jpe?g|gif|webp|svg\+xml)|application\/pdf|audio\/|video\/|text\/plain)/.test(meta?.mimeType || '');
    res.setHeader(
      'Content-Disposition',
      `${inlineOk ? 'inline' : 'attachment'}; filename="${rawName.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(rawName)}`
    );
    res.sendFile(filePath);
  });

  app.delete('/api/files/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const att = db.prepare(`SELECT * FROM attachments WHERE id = ?`).get(req.params.id) as
      | { id: string; uploaderId: string; storageKey: string }
      | undefined;
    if (!att) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    if (att.uploaderId !== actor.id && !canPerformAction(actor.role, 'file:delete_any')) {
      res.status(403).json({ error: 'Insufficient permissions to delete this file' });
      return;
    }
    db.prepare(`DELETE FROM attachments WHERE id = ?`).run(att.id);
    const targetPath = path.join(uploadDir, path.basename(att.storageKey));
    if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // GLOBAL SEARCH, DIRECTORY, USER STATUS, NOTIFICATIONS, CUSTOM EMOJIS
  // ---------------------------------------------------------------------------
  app.get('/api/search', requireAuth, (req: AuthenticatedRequest, res) => {
    const rawQ = String(req.query.q || '');
    const workspaceId = String(req.query.workspaceId || primaryWorkspaceId());
    const parsed = parseSearchQuery(rawQ);
    const userId = req.authUser!.id;

    let msgSql = `
      SELECT m.id, c.name as channelName
      FROM messages m
      JOIN channels c ON c.id = m.channelId
      JOIN channel_members cm ON cm.channelId = c.id AND cm.userId = ?
      JOIN users u ON u.id = m.authorId
      WHERE c.workspaceId = ? AND m.deletedAt IS NULL
    `;
    const msgParams: Array<string> = [userId, workspaceId];

    if (parsed.text) {
      msgSql += ` AND lower(m.content) LIKE ?`;
      msgParams.push(`%${parsed.text.toLowerCase()}%`);
    }
    if (parsed.fromUser) {
      msgSql += ` AND (lower(u.displayName) LIKE ? OR lower(u.email) LIKE ?)`;
      msgParams.push(`%${parsed.fromUser}%`, `%${parsed.fromUser}%`);
    }
    if (parsed.inChannel) {
      msgSql += ` AND lower(c.name) LIKE ?`;
      msgParams.push(`%${parsed.inChannel}%`);
    }
    if (parsed.beforeDate) {
      msgSql += ` AND m.createdAt <= ?`;
      msgParams.push(`${parsed.beforeDate}T23:59:59.999Z`);
    }
    if (parsed.hasFile) {
      msgSql += ` AND EXISTS (SELECT 1 FROM attachments a WHERE a.messageId = m.id)`;
    }

    msgSql += ` ORDER BY m.createdAt DESC LIMIT 20`;
    const msgRows = db.prepare(msgSql).all(...msgParams) as Array<{ id: string; channelName: string }>;
    const messages = msgRows
      .map((r) => {
        const hydrated = hydrateMessage(r.id, userId);
        return hydrated ? { ...hydrated, channelName: r.channelName } : null;
      })
      .filter(Boolean);

    const term = `%${parsed.text.toLowerCase()}%`;
    const files = db
      .prepare(
        `SELECT a.*, u.displayName as uploaderName, c.name as channelName
         FROM attachments a
         JOIN users u ON u.id = a.uploaderId
         JOIN channels c ON c.id = a.channelId
         JOIN channel_members cm ON cm.channelId = c.id AND cm.userId = ?
         WHERE c.workspaceId = ? AND lower(a.fileName) LIKE ?
         ORDER BY a.createdAt DESC LIMIT 15`
      )
      .all(userId, workspaceId, term);

    const channels = getWorkspaceChannels(workspaceId, userId).filter(
      (c) => !parsed.text || c.name.toLowerCase().includes(parsed.text.toLowerCase())
    );

    const people = getAllUsers().filter(
      (u) =>
        !parsed.text ||
        u.fullName.toLowerCase().includes(parsed.text.toLowerCase()) ||
        u.department.toLowerCase().includes(parsed.text.toLowerCase()) ||
        u.jobTitle.toLowerCase().includes(parsed.text.toLowerCase())
    );

    res.json({ messages, files, channels, people });
  });

  app.get('/api/directory', requireAuth, (_req, res) => {
    res.json({ users: getAllUsers() });
  });

  app.post('/api/directory', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    if (!canPerformAction(actor.role, 'channel:delete')) {
      res.status(403).json({ error: 'Only Admins and Department Managers can add employees to the org chart' });
      return;
    }
    const schema = z.object({
      fullName: z.string().min(2).max(80),
      email: z.string().email(),
      jobTitle: z.string().min(2).max(80),
      department: z.string().min(2).max(80),
      timezone: z.string().min(2).max(60).default('America/Los_Angeles'),
      role: z.enum(['SUPER_ADMIN', 'DEPT_MANAGER', 'MEMBER', 'GUEST']).default('MEMBER'),
      managerId: z.string().nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid employee name, email, job title, and department are required' });
      return;
    }
    const existing = db.prepare(`SELECT id FROM users WHERE lower(email) = lower(?)`).get(parsed.data.email);
    if (existing) {
      res.status(409).json({ error: 'An employee with this email already exists' });
      return;
    }

    const assignedRole: Role =
      actor.role === 'SUPER_ADMIN'
        ? parsed.data.role
        : parsed.data.role === 'SUPER_ADMIN'
          ? 'DEPT_MANAGER'
          : parsed.data.role;

    const userId = uid('usr');
    const now = new Date().toISOString();
    const hash = bcrypt.hashSync('Workstream!2026', 10);
    const fullName = sanitizeHtmlText(parsed.data.fullName);

    db.prepare(
      `INSERT INTO users (id, email, passwordHash, fullName, displayName, avatarUrl, jobTitle, department, timezone, role, presence, managerId, createdAt)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 'ONLINE', ?, ?)`
    ).run(
      userId,
      parsed.data.email.toLowerCase(),
      hash,
      fullName,
      fullName,
      sanitizeHtmlText(parsed.data.jobTitle),
      sanitizeHtmlText(parsed.data.department),
      sanitizeHtmlText(parsed.data.timezone),
      assignedRole,
      parsed.data.managerId ?? null,
      now
    );

    db.prepare(`INSERT INTO workspace_members (id, workspaceId, userId, role, joinedAt) VALUES (?, ${PRIMARY_WS_SQL}, ?, ?, ?)`).run(
      uid('wm'),
      userId,
      assignedRole,
      now
    );

    const publicChannels = db
      .prepare(`SELECT id FROM channels WHERE workspaceId = ${PRIMARY_WS_SQL} AND type IN ('PUBLIC', 'ANNOUNCEMENT')`)
      .all() as Array<{ id: string }>;
    for (const ch of publicChannels) {
      db.prepare(
        `INSERT OR IGNORE INTO channel_members (id, channelId, userId, isStarred, isMuted, lastReadAt, joinedAt) VALUES (?, ?, ?, 0, 0, ?, ?)`
      ).run(uid('cm'), ch.id, userId, now, now);
    }

    const created = getUserById(userId)!;
    getIO()?.emit('directory:updated', { user: created });
    res.status(201).json({ user: created });
  });

  app.patch('/api/directory/:userId', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    if (!canPerformAction(actor.role, 'channel:delete')) {
      res.status(403).json({ error: 'Only Admins and Department Managers can configure the org chart' });
      return;
    }

    const target = getUserById(req.params.userId);
    if (!target) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }

    const schema = z.object({
      fullName: z.string().min(2).max(80).optional(),
      jobTitle: z.string().min(2).max(80).optional(),
      department: z.string().min(2).max(80).optional(),
      timezone: z.string().min(2).max(60).optional(),
      role: z.enum(['SUPER_ADMIN', 'DEPT_MANAGER', 'MEMBER', 'GUEST']).optional(),
      managerId: z.string().nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid organization chart update' });
      return;
    }

    if (parsed.data.role && parsed.data.role !== target.role && !canPerformAction(actor.role, 'workspace:manage_roles')) {
      res.status(403).json({ error: 'Only Super Admins can change user permission roles' });
      return;
    }
    if (target.role === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Only Super Admins can edit a Super Admin' });
      return;
    }
    if (target.role === 'SUPER_ADMIN' && parsed.data.role && parsed.data.role !== 'SUPER_ADMIN' && activeSuperAdminCount(target.id) === 0) {
      res.status(400).json({ error: 'At least one active Super Admin is required' });
      return;
    }

    const allUsers = getAllUsers();
    const nextManagerId = parsed.data.managerId !== undefined ? parsed.data.managerId || null : target.managerId;
    if (wouldCreateOrgCycle(allUsers, target.id, nextManagerId)) {
      res.status(400).json({ error: 'Invalid reporting line: this manager assignment creates a cycle in the org chart' });
      return;
    }

    const nextName = parsed.data.fullName ? sanitizeHtmlText(parsed.data.fullName) : target.fullName;
    const nextRole = parsed.data.role ?? target.role;

    db.prepare(
      `UPDATE users SET fullName = ?, displayName = ?, jobTitle = ?, department = ?, timezone = ?, role = ?, managerId = ? WHERE id = ?`
    ).run(
      nextName,
      nextName,
      parsed.data.jobTitle ? sanitizeHtmlText(parsed.data.jobTitle) : target.jobTitle,
      parsed.data.department ? sanitizeHtmlText(parsed.data.department) : target.department,
      parsed.data.timezone ? sanitizeHtmlText(parsed.data.timezone) : target.timezone,
      nextRole,
      nextManagerId,
      target.id
    );

    if (parsed.data.role) {
      db.prepare(`UPDATE workspace_members SET role = ? WHERE userId = ?`).run(nextRole, target.id);
    }

    const updated = getUserById(target.id)!;
    getIO()?.emit('directory:updated', { user: updated });
    res.json({ user: updated });
  });

  app.patch('/api/users/me/status', requireAuth, (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      presence: z.enum(['ONLINE', 'IN_MEETING', 'FOCUS_MODE', 'AWAY', 'OFFLINE']).optional(),
      customStatus: z.string().max(80).nullable().optional(),
      customEmoji: z.string().max(8).nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid status update' });
      return;
    }

    const user = req.authUser!;
    db.prepare(`UPDATE users SET presence = ?, customStatus = ?, customEmoji = ? WHERE id = ?`).run(
      parsed.data.presence ?? user.presence,
      parsed.data.customStatus !== undefined ? sanitizeHtmlText(parsed.data.customStatus || '') || null : user.customStatus,
      parsed.data.customEmoji !== undefined ? parsed.data.customEmoji : user.customEmoji,
      user.id
    );

    const updated = getUserById(user.id)!;
    getIO()?.emit('directory:updated', { user: updated });
    res.json({ user: updated });
  });

  app.patch('/api/users/me/dnd', requireAuth, (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      dndEnabled: z.boolean(),
      dndStartHour: z.number().int().min(0).max(23).optional(),
      dndEndHour: z.number().int().min(0).max(23).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid DND configuration' });
      return;
    }
    const user = req.authUser!;
    db.prepare(`UPDATE users SET dndEnabled = ?, dndStartHour = ?, dndEndHour = ? WHERE id = ?`).run(
      parsed.data.dndEnabled ? 1 : 0,
      parsed.data.dndStartHour ?? user.dndStartHour,
      parsed.data.dndEndHour ?? user.dndEndHour,
      user.id
    );
    const updated = getUserById(user.id)!;
    res.json({ user: updated });
  });

  app.patch('/api/users/me/group-policy', requireAuth, (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      groupAddPolicy: z.enum(['DIRECT', 'REQUEST']),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid groupAddPolicy (DIRECT or REQUEST) is required' });
      return;
    }
    const user = req.authUser!;
    db.prepare(`UPDATE users SET groupAddPolicy = ? WHERE id = ?`).run(parsed.data.groupAddPolicy, user.id);
    const updated = getUserById(user.id)!;
    recordAuditLog({
      actor: user,
      action: 'USER_GROUP_POLICY_UPDATED',
      category: 'USER',
      severity: 'INFO',
      targetType: 'user',
      targetId: user.id,
      targetLabel: updated.displayName,
      details: { groupAddPolicy: parsed.data.groupAddPolicy },
    });
    getIO()?.emit('directory:updated', { user: updated });
    res.json({ user: updated });
  });

  app.get('/api/notifications', requireAuth, (req: AuthenticatedRequest, res) => {
    const rows = db
      .prepare(`SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT 50`)
      .all(req.authUser!.id) as Array<Record<string, unknown>>;
    res.json({
      notifications: rows.map((r) => ({ ...r, isRead: Boolean(r.isRead) })),
    });
  });

  app.post('/api/notifications/test', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const title = sanitizeHtmlText(String(req.body?.title || 'Marcus Vance in #engineering-core'));
    const body = sanitizeHtmlText(
      String(req.body?.body || 'p95 WebSocket latency verified at 18ms. Ready for Q4 architecture sign-off.')
    );
    const channelId = (req.body?.channelId as string | undefined) || null;
    const type = (req.body?.type as NotificationType | undefined) || 'MENTION';

    const notification = emitUserNotification({
      userId: actor.id,
      type,
      title,
      body,
      channelId,
      messageId: null,
      senderName: 'Marcus Vance',
      avatarUrl: 'marcus.jpg',
    });
    res.status(201).json({ notification });
  });

  app.post('/api/notifications/read-all', requireAuth, (req: AuthenticatedRequest, res) => {
    db.prepare(`UPDATE notifications SET isRead = 1 WHERE userId = ?`).run(req.authUser!.id);
    res.json({ ok: true });
  });

  app.post('/api/notifications/:id/read', requireAuth, (req: AuthenticatedRequest, res) => {
    db.prepare(`UPDATE notifications SET isRead = 1 WHERE id = ? AND userId = ?`).run(req.params.id, req.authUser!.id);
    res.json({ ok: true });
  });

  app.get('/api/custom-emojis', requireAuth, (req, res) => {
    const workspaceId = String(req.query.workspaceId || primaryWorkspaceId());
    const emojis = db.prepare(`SELECT id, shortcode, glyph FROM custom_emojis WHERE workspaceId = ?`).all(workspaceId);
    res.json({ emojis });
  });

  // ---------------------------------------------------------------------------
  // ARCHIVE CENTER (CHANNELS, MESSAGES & COMPLETED TASKS)
  // ---------------------------------------------------------------------------
  app.get('/api/archive', requireAuth, (req: AuthenticatedRequest, res) => {
    const workspaceId = String(req.query.workspaceId || primaryWorkspaceId());
    const userId = req.authUser!.id;

    const allChannels = getWorkspaceChannels(workspaceId, userId, true);
    const archivedChannels = allChannels.filter((c) => c.isArchived);

    const archivedMsgRows = db
      .prepare(
        `SELECT m.id
         FROM messages m
         JOIN channels c ON c.id = m.channelId
         WHERE c.workspaceId = ? AND COALESCE(m.isArchived, 0) = 1 AND m.deletedAt IS NULL
         ORDER BY COALESCE(m.archivedAt, m.updatedAt) DESC LIMIT 100`
      )
      .all(workspaceId) as Array<{ id: string }>;
    const archivedMessages = archivedMsgRows
      .map((r) => hydrateMessage(r.id, userId))
      .filter(Boolean);

    const completedTasks = db
      .prepare(
        `SELECT t.*, ch.name as channelName, c.displayName as creatorName, a.displayName as assigneeName
         FROM tasks t
         JOIN channels ch ON ch.id = t.channelId
         JOIN users c ON c.id = t.creatorId
         LEFT JOIN users a ON a.id = t.assigneeId
         WHERE ch.workspaceId = ? AND t.status = 'DONE'
         ORDER BY t.createdAt DESC LIMIT 100`
      )
      .all(workspaceId);

    res.json({
      channels: archivedChannels,
      messages: archivedMessages,
      tasks: completedTasks,
    });
  });

  // ---------------------------------------------------------------------------
  // PRECISE BACKUP & RECOVERY ENGINE (SHA-256 VERIFIED SNAPSHOTS)
  // ---------------------------------------------------------------------------
  app.get('/api/backup/snapshots', requireAuth, requireBackupAdmin, (_req, res) => {
    const rows = db
      .prepare(
        `SELECT b.*, u.displayName as createdByName
         FROM backup_snapshots b
         LEFT JOIN users u ON u.id = b.createdById
         ORDER BY b.createdAt DESC`
      )
      .all() as Array<Record<string, unknown>>;

    const snapshots = rows.map((r) => {
      let counts: Record<string, number> = {};
      try {
        counts = JSON.parse(String(r.countsJson || '{}'));
      } catch {
        counts = {};
      }
      return {
        id: String(r.id),
        label: String(r.label),
        createdById: String(r.createdById),
        createdByName: (r.createdByName as string | undefined) ?? 'System Admin',
        sha256: String(r.sha256),
        sizeBytes: Number(r.sizeBytes),
        counts,
        createdAt: String(r.createdAt),
      };
    });

    res.json({ snapshots, liveCounts: getLiveTableCounts() });
  });

  app.post('/api/backup/snapshots', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    if (!canPerformAction(actor.role, 'channel:delete')) {
      res.status(403).json({ error: 'Only Admins and Department Managers can create system backups' });
      return;
    }

    const label = sanitizeHtmlText(String(req.body?.label || `Snapshot ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`));
    const bundle = buildBackupBundle();
    const snapId = uid('bkp');
    const fileName = `${snapId}.json`;
    const serialized = JSON.stringify(bundle, null, 2);
    fs.writeFileSync(path.join(backupDir, fileName), serialized, 'utf-8');
    const sizeBytes = Buffer.byteLength(serialized, 'utf-8');
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO backup_snapshots (id, label, createdById, sha256, sizeBytes, countsJson, fileName, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(snapId, label, actor.id, bundle.sha256, sizeBytes, JSON.stringify(bundle.counts), fileName, now);

    recordAuditLog({
      actor,
      action: 'BACKUP_SNAPSHOT_CREATED',
      category: 'BACKUP',
      severity: 'INFO',
      targetType: 'backup',
      targetId: snapId,
      targetLabel: label,
      details: { sha256: bundle.sha256, sizeBytes },
    });

    res.status(201).json({
      snapshot: {
        id: snapId,
        label,
        createdById: actor.id,
        createdByName: actor.displayName,
        sha256: bundle.sha256,
        sizeBytes,
        counts: bundle.counts,
        createdAt: now,
      },
      liveCounts: bundle.counts,
    });
  });

  app.get('/api/backup/snapshots/:id/download', requireAuth, requireBackupAdmin, (req, res) => {
    const row = db.prepare(`SELECT fileName, label FROM backup_snapshots WHERE id = ?`).get(req.params.id) as
      | { fileName: string; label: string }
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Snapshot not found' });
      return;
    }
    const target = path.join(backupDir, path.basename(row.fileName));
    if (!fs.existsSync(target)) {
      res.status(404).json({ error: 'Snapshot archive file missing on disk' });
      return;
    }
    res.setHeader('Content-Disposition', `attachment; filename="workstream-${req.params.id}.json"`);
    res.type('application/json');
    fs.createReadStream(target).pipe(res);
  });

  app.get('/api/backup/export', requireAuth, requireBackupAdmin, (_req, res) => {
    const bundle = buildBackupBundle();
    res.setHeader('Content-Disposition', `attachment; filename="workstream-backup-${Date.now()}.json"`);
    res.json(bundle);
  });

  app.post('/api/backup/verify', requireAuth, requireBackupAdmin, (req, res) => {
    let payload: unknown = req.body?.bundle;
    if (req.body?.snapshotId) {
      const row = db.prepare(`SELECT fileName, sha256 FROM backup_snapshots WHERE id = ?`).get(req.body.snapshotId) as
        | { fileName: string; sha256: string }
        | undefined;
      if (!row) {
        res.status(404).json({ error: 'Snapshot not found' });
        return;
      }
      const target = path.join(backupDir, path.basename(row.fileName));
      if (!fs.existsSync(target)) {
        res.status(404).json({ error: 'Snapshot file missing on disk' });
        return;
      }
      payload = JSON.parse(fs.readFileSync(target, 'utf-8'));
    }

    const structural = validateBackupBundle(payload);
    if (!structural.valid) {
      res.json({ valid: false, checksumMatch: false, errors: structural.errors, counts: structural.counts });
      return;
    }
    const obj = payload as { sha256?: string; tables: Record<string, unknown> };
    const computedSha256 = computeTablesSha256(obj.tables);
    const checksumMatch = !obj.sha256 || obj.sha256 === computedSha256;

    res.json({
      valid: structural.valid && checksumMatch,
      checksumMatch,
      expectedSha256: obj.sha256 || null,
      computedSha256,
      errors: checksumMatch ? [] : ['SHA-256 integrity digest mismatch — backup may have been altered'],
      counts: structural.counts,
    });
  });

  app.post('/api/backup/restore', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    if (!canPerformAction(actor.role, 'workspace:manage_roles')) {
      res.status(403).json({ error: 'Only Super Admins can execute a transactional database restore' });
      return;
    }

    let payload: unknown = req.body?.bundle;
    if (req.body?.snapshotId) {
      const row = db.prepare(`SELECT fileName FROM backup_snapshots WHERE id = ?`).get(req.body.snapshotId) as
        | { fileName: string }
        | undefined;
      if (!row) {
        res.status(404).json({ error: 'Snapshot not found' });
        return;
      }
      const target = path.join(backupDir, path.basename(row.fileName));
      if (!fs.existsSync(target)) {
        res.status(404).json({ error: 'Snapshot archive file missing' });
        return;
      }
      payload = JSON.parse(fs.readFileSync(target, 'utf-8'));
    }

    const structural = validateBackupBundle(payload);
    if (!structural.valid) {
      res.status(400).json({ error: `Invalid backup bundle: ${structural.errors.join(', ')}` });
      return;
    }

    const bundle = payload as { sha256?: string; tables: Record<string, Array<Record<string, unknown>>> };
    const computedSha256 = computeTablesSha256(bundle.tables);
    if (bundle.sha256 && bundle.sha256 !== computedSha256) {
      res.status(400).json({ error: 'Restore aborted: SHA-256 checksum verification failed' });
      return;
    }

    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec('BEGIN TRANSACTION;');
    try {
      for (const tbl of BACKUP_TABLES) {
        const rows = bundle.tables[tbl];
        if (!Array.isArray(rows)) continue;
        const tableCols = (db.prepare(`PRAGMA table_info(${tbl})`).all() as Array<{ name: string }>).map((c) => c.name);
        db.exec(`DELETE FROM ${tbl}`);
        for (const r of rows) {
          const keys = Object.keys(r).filter((k) => tableCols.includes(k));
          if (keys.length === 0) continue;
          const placeholders = keys.map(() => '?').join(', ');
          const values = keys.map((k) => {
            const v = r[k];
            if (v === undefined) return null;
            return v as string | number | null;
          });
          db.prepare(`INSERT INTO ${tbl} (${keys.join(', ')}) VALUES (${placeholders})`).run(...values);
        }
      }
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      db.exec('PRAGMA foreign_keys = ON;');
      res.status(500).json({ error: `Transactional restore failed: ${(err as Error).message}` });
      return;
    }
    db.exec('PRAGMA foreign_keys = ON;');

    recordAuditLog({
      actor,
      action: 'BACKUP_RESTORED',
      category: 'BACKUP',
      severity: 'CRITICAL',
      targetType: 'backup',
      targetId: req.body?.snapshotId || 'uploaded_bundle',
      targetLabel: 'بازیابی تراکنشی پایگاه داده',
      details: { sha256: computedSha256 },
    });

    getIO()?.emit('backup:restored', { restoredBy: actor.displayName, timestamp: new Date().toISOString() });
    res.json({ ok: true, restoredCounts: getLiveTableCounts(), sha256: computedSha256 });
  });

  // ---------------------------------------------------------------------------
  // GRANULAR RBAC MATRIX & FULL USER ACCOUNT GOVERNANCE
  // ---------------------------------------------------------------------------
  app.get('/api/rbac/matrix', requireAuth, (_req, res) => {
    const defaults = buildDefaultRoleMatrix();
    const saved = getRoleMatrixFromDb();
    const merged: Record<string, Record<string, boolean>> = {};
    for (const r of ['SUPER_ADMIN', 'DEPT_MANAGER', 'MEMBER', 'GUEST'] as const) {
      merged[r] = { ...defaults[r], ...(saved[r] || {}) };
    }
    res.json({ matrix: merged });
  });

  app.put('/api/rbac/matrix', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const dbMatrix = getRoleMatrixFromDb();
    if (!canPerformWithMatrix(actor, 'workspace:manage_roles', 'PUBLIC', dbMatrix)) {
      res.status(403).json({ error: 'Only Super Admins can modify the permission matrix' });
      return;
    }

    const schema = z.object({
      matrix: z.record(z.string(), z.record(z.string(), z.boolean())),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid permission matrix is required' });
      return;
    }

    const now = new Date().toISOString();
    for (const role of ['SUPER_ADMIN', 'DEPT_MANAGER', 'MEMBER', 'GUEST'] as const) {
      const row = parsed.data.matrix[role];
      if (!row) continue;
      // Super Admin always keeps role governance to avoid accidental lockout
      if (role === 'SUPER_ADMIN') {
        row['workspace:manage_roles'] = true;
        row['user:manage'] = true;
      }
      db.prepare(
        `INSERT INTO role_permissions (role, permissionsJson, updatedAt)
         VALUES (?, ?, ?)
         ON CONFLICT(role) DO UPDATE SET permissionsJson = excluded.permissionsJson, updatedAt = excluded.updatedAt`
      ).run(role, JSON.stringify(row), now);
    }

    const updated = getRoleMatrixFromDb();
    recordAuditLog({
      actor,
      action: 'RBAC_MATRIX_UPDATED',
      category: 'RBAC',
      severity: 'WARN',
      targetType: 'rbac',
      targetId: 'role_permissions',
      targetLabel: 'ماتریس سطوح دسترسی',
    });
    getIO()?.emit('rbac:updated', { matrix: updated });
    res.json({ matrix: updated });
  });

  app.post('/api/users/admin/create', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const dbMatrix = getRoleMatrixFromDb();
    if (!canPerformWithMatrix(actor, 'user:manage', 'PUBLIC', dbMatrix)) {
      res.status(403).json({ error: 'Only Super Admins can provision new user accounts' });
      return;
    }

    const schema = z.object({
      fullName: z.string().min(2).max(80),
      email: z.string().email(),
      password: z.string().min(8).max(100),
      jobTitle: z.string().min(2).max(80),
      department: z.string().min(2).max(80),
      timezone: z.string().default('Asia/Tehran'),
      role: z.enum(['SUPER_ADMIN', 'DEPT_MANAGER', 'MEMBER', 'GUEST']).default('MEMBER'),
      managerId: z.string().nullable().optional(),
      isActive: z.boolean().default(true),
      customPermissions: z.record(z.string(), z.boolean()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid name, email, password (min 6 chars), job title, and department are required' });
      return;
    }

    const exists = db.prepare(`SELECT id FROM users WHERE lower(email) = lower(?)`).get(parsed.data.email);
    if (exists) {
      res.status(409).json({ error: 'User with this email already exists' });
      return;
    }

    const userId = uid('usr');
    const now = new Date().toISOString();
    const hash = bcrypt.hashSync(parsed.data.password, 10);
    const cleanName = sanitizeHtmlText(parsed.data.fullName);

    db.prepare(
      `INSERT INTO users (id, email, passwordHash, fullName, displayName, avatarUrl, jobTitle, department, timezone, role, presence, managerId, isActive, customPermissionsJson, createdAt)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 'ONLINE', ?, ?, ?, ?)`
    ).run(
      userId,
      parsed.data.email.toLowerCase(),
      hash,
      cleanName,
      cleanName,
      sanitizeHtmlText(parsed.data.jobTitle),
      sanitizeHtmlText(parsed.data.department),
      sanitizeHtmlText(parsed.data.timezone),
      parsed.data.role,
      parsed.data.managerId ?? null,
      parsed.data.isActive ? 1 : 0,
      JSON.stringify(parsed.data.customPermissions || {}),
      now
    );

    db.prepare(`INSERT OR IGNORE INTO workspace_members (id, workspaceId, userId, role, joinedAt) VALUES (?, ${PRIMARY_WS_SQL}, ?, ?, ?)`).run(
      uid('wm'),
      userId,
      parsed.data.role,
      now
    );

    const publicChannels = db
      .prepare(`SELECT id FROM channels WHERE workspaceId = ${PRIMARY_WS_SQL} AND type IN ('PUBLIC', 'ANNOUNCEMENT')`)
      .all() as Array<{ id: string }>;
    for (const ch of publicChannels) {
      db.prepare(
        `INSERT OR IGNORE INTO channel_members (id, channelId, userId, isStarred, isMuted, lastReadAt, joinedAt) VALUES (?, ?, ?, 0, 0, ?, ?)`
      ).run(uid('cm'), ch.id, userId, now, now);
    }

    const created = getUserById(userId)!;
    recordAuditLog({
      actor,
      action: 'ADMIN_USER_CREATED',
      category: 'USER',
      severity: 'WARN',
      targetType: 'user',
      targetId: created.id,
      targetLabel: `${created.displayName} (${created.email})`,
      details: { role: created.role, department: created.department },
    });
    getIO()?.emit('directory:updated', { user: created });
    res.status(201).json({ user: created });
  });

  app.patch('/api/users/admin/:userId', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const dbMatrix = getRoleMatrixFromDb();
    if (!canPerformWithMatrix(actor, 'user:manage', 'PUBLIC', dbMatrix) && !canPerformWithMatrix(actor, 'workspace:manage_roles', 'PUBLIC', dbMatrix)) {
      res.status(403).json({ error: 'Only Super Admins can manage user access & account status' });
      return;
    }

    const target = getUserById(req.params.userId);
    if (!target) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const schema = z.object({
      fullName: z.string().min(2).max(80).optional(),
      jobTitle: z.string().min(2).max(80).optional(),
      department: z.string().min(2).max(80).optional(),
      timezone: z.string().min(2).max(60).optional(),
      role: z.enum(['SUPER_ADMIN', 'DEPT_MANAGER', 'MEMBER', 'GUEST']).optional(),
      managerId: z.string().nullable().optional(),
      isActive: z.boolean().optional(),
      customPermissions: z.record(z.string(), z.boolean()).optional(),
      newPassword: z.string().min(8).max(100).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid user update fields' });
      return;
    }

    const allUsers = getAllUsers();
    const nextManagerId = parsed.data.managerId !== undefined ? parsed.data.managerId || null : target.managerId;
    if (wouldCreateOrgCycle(allUsers, target.id, nextManagerId)) {
      res.status(400).json({ error: 'Manager assignment would create a cycle in the reporting chart' });
      return;
    }

    if (target.id === actor.id && parsed.data.isActive === false) {
      res.status(400).json({ error: 'You cannot suspend your own active Super Admin session' });
      return;
    }
    if (
      target.role === 'SUPER_ADMIN' &&
      (parsed.data.isActive === false || (parsed.data.role && parsed.data.role !== 'SUPER_ADMIN')) &&
      activeSuperAdminCount(target.id) === 0
    ) {
      res.status(400).json({ error: 'At least one active Super Admin is required' });
      return;
    }

    const nextName = parsed.data.fullName ? sanitizeHtmlText(parsed.data.fullName) : target.fullName;
    const nextRole = parsed.data.role ?? target.role;
    const nextActive = parsed.data.isActive !== undefined ? (parsed.data.isActive ? 1 : 0) : target.isActive === false ? 0 : 1;
    const nextCustomPerms =
      parsed.data.customPermissions !== undefined ? parsed.data.customPermissions : target.customPermissions || {};

    db.prepare(
      `UPDATE users SET fullName = ?, displayName = ?, jobTitle = ?, department = ?, timezone = ?, role = ?, managerId = ?, isActive = ?, customPermissionsJson = ? WHERE id = ?`
    ).run(
      nextName,
      nextName,
      parsed.data.jobTitle ? sanitizeHtmlText(parsed.data.jobTitle) : target.jobTitle,
      parsed.data.department ? sanitizeHtmlText(parsed.data.department) : target.department,
      parsed.data.timezone ? sanitizeHtmlText(parsed.data.timezone) : target.timezone,
      nextRole,
      nextManagerId,
      nextActive,
      JSON.stringify(nextCustomPerms),
      target.id
    );

    if (parsed.data.newPassword) {
      const hash = bcrypt.hashSync(parsed.data.newPassword, 10);
      db.prepare(`UPDATE users SET passwordHash = ? WHERE id = ?`).run(hash, target.id);
    }
    if (parsed.data.newPassword || parsed.data.isActive === false) revokeAllSessionsForUser(target.id);

    if (parsed.data.role) {
      db.prepare(`UPDATE workspace_members SET role = ? WHERE userId = ?`).run(nextRole, target.id);
    }

    const updated = getUserById(target.id)!;
    recordAuditLog({
      actor,
      action: 'ADMIN_USER_UPDATED',
      category: 'USER',
      severity: parsed.data.isActive === false || parsed.data.role ? 'WARN' : 'INFO',
      targetType: 'user',
      targetId: updated.id,
      targetLabel: updated.displayName,
      details: { role: updated.role, department: updated.department, isActive: updated.isActive },
    });
    getIO()?.emit('directory:updated', { user: updated });
    res.json({ user: updated });
  });

  app.patch('/api/users/me/profile', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const schema = z.object({
      fullName: z.string().min(2).max(80).optional(),
      jobTitle: z.string().min(2).max(80).optional(),
      department: z.string().min(2).max(80).optional(),
      timezone: z.string().min(2).max(60).optional(),
      newPassword: z.string().min(8).max(100).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid profile update' });
      return;
    }

    const nextName = parsed.data.fullName ? sanitizeHtmlText(parsed.data.fullName) : actor.fullName;
    db.prepare(`UPDATE users SET fullName = ?, displayName = ?, jobTitle = ?, department = ?, timezone = ? WHERE id = ?`).run(
      nextName,
      nextName,
      parsed.data.jobTitle ? sanitizeHtmlText(parsed.data.jobTitle) : actor.jobTitle,
      parsed.data.department ? sanitizeHtmlText(parsed.data.department) : actor.department,
      parsed.data.timezone ? sanitizeHtmlText(parsed.data.timezone) : actor.timezone,
      actor.id
    );

    if (parsed.data.newPassword) {
      const hash = bcrypt.hashSync(parsed.data.newPassword, 10);
      db.prepare(`UPDATE users SET passwordHash = ? WHERE id = ?`).run(hash, actor.id);
    }

    const updated = getUserById(actor.id)!;
    recordAuditLog({
      actor,
      action: 'USER_PROFILE_UPDATED',
      category: 'USER',
      severity: 'INFO',
      targetType: 'user',
      targetId: actor.id,
      targetLabel: updated.displayName,
      details: { department: updated.department, jobTitle: updated.jobTitle },
    });
    getIO()?.emit('directory:updated', { user: updated });
    res.json({ user: updated });
  });

  app.post('/api/users/me/avatar', requireAuth, imageUpload.single('avatar'), (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Avatar image file is required' });
      return;
    }
    if (!file.mimetype.startsWith('image/')) {
      const targetPath = path.join(uploadDir, path.basename(file.filename));
      if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
      res.status(400).json({ error: 'Only image files are supported for avatars' });
      return;
    }

    const avatarUrl = `/api/files/download/${encodeURIComponent(file.filename)}`;
    db.prepare(`UPDATE users SET avatarUrl = ? WHERE id = ?`).run(avatarUrl, actor.id);
    const updated = getUserById(actor.id)!;
    recordAuditLog({
      actor,
      action: 'USER_AVATAR_UPDATED',
      category: 'USER',
      severity: 'INFO',
      targetType: 'user',
      targetId: actor.id,
      targetLabel: updated.displayName,
      details: { avatarUrl },
    });
    getIO()?.emit('directory:updated', { user: updated });
    res.json({ user: updated, avatarUrl });
  });

  app.patch('/api/users/me/password', requireAuth, rateLimitAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const schema = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8).max(128),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'New password must be at least 8 characters' });
      return;
    }

    const row = db.prepare(`SELECT passwordHash FROM users WHERE id = ?`).get(actor.id) as
      | { passwordHash: string }
      | undefined;
    if (!row || !bcrypt.compareSync(parsed.data.currentPassword, row.passwordHash)) {
      recordAuditLog({
        actor,
        action: 'AUTH_PASSWORD_CHANGE_FAILED',
        category: 'SECURITY',
        severity: 'WARN',
        targetType: 'user',
        targetId: actor.id,
        targetLabel: actor.email,
      });
      res.status(403).json({ error: 'Current password is incorrect' });
      return;
    }

    const hash = bcrypt.hashSync(parsed.data.newPassword, 10);
    db.prepare(`UPDATE users SET passwordHash = ? WHERE id = ?`).run(hash, actor.id);
    revokeAllSessionsForUser(actor.id);
    const accessToken = signAccessToken({ userId: actor.id, email: actor.email, role: actor.role });
    const refreshToken = signRefreshToken({ userId: actor.id, email: actor.email, role: actor.role });
    recordAuditLog({
      actor,
      action: 'AUTH_PASSWORD_CHANGED',
      category: 'SECURITY',
      severity: 'INFO',
      targetType: 'user',
      targetId: actor.id,
      targetLabel: actor.email,
    });
    res.json({ ok: true, accessToken, refreshToken, user: getUserById(actor.id) });
  });

  // ---------------------------------------------------------------------------
  // APPROVAL WORKFLOWS & DAILY STANDUP CHECK-INS (ENTERPRISE SUITE)
  // ---------------------------------------------------------------------------
  app.get('/api/approvals', requireAuth, (_req, res) => {
    const rows = db
      .prepare(
        `SELECT a.*, reqU.displayName as requesterName, appU.displayName as approverName
         FROM approval_requests a
         JOIN users reqU ON reqU.id = a.requesterId
         LEFT JOIN users appU ON appU.id = a.approverId
         ORDER BY CASE WHEN a.status = 'PENDING' THEN 0 ELSE 1 END, a.createdAt DESC`
      )
      .all();
    res.json({ approvals: rows });
  });

  app.post('/api/approvals', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const schema = z.object({
      category: z.enum(['LEAVE', 'PURCHASE', 'ACCESS', 'EXPENSE']),
      title: z.string().min(2).max(160),
      details: z.string().min(2).max(1000),
      metricLabel: z.string().max(80).optional(),
      approverId: z.string().nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid approval category, title, and details are required' });
      return;
    }

    const approverId = parsed.data.approverId || actor.managerId || defaultApproverId();
    const id = uid('apr');
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO approval_requests (id, requesterId, approverId, category, title, details, metricLabel, status, reviewerNote, createdAt, reviewedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', NULL, ?, NULL)`
    ).run(
      id,
      actor.id,
      approverId,
      parsed.data.category,
      sanitizeHtmlText(parsed.data.title),
      sanitizeHtmlText(parsed.data.details),
      parsed.data.metricLabel ? sanitizeHtmlText(parsed.data.metricLabel) : null,
      now
    );

    if (approverId && approverId !== actor.id) {
      emitUserNotification({
        userId: approverId,
        type: 'SYSTEM',
        title: `درخواست تأیید جدید از ${actor.displayName}`,
        body: sanitizeHtmlText(parsed.data.title),
        channelId: announcementChannelId(),
        messageId: null,
        senderName: actor.displayName,
        avatarUrl: actor.avatarUrl,
      });
    }

    const approval = db
      .prepare(
        `SELECT a.*, reqU.displayName as requesterName, appU.displayName as approverName
         FROM approval_requests a
         JOIN users reqU ON reqU.id = a.requesterId
         LEFT JOIN users appU ON appU.id = a.approverId
         WHERE a.id = ?`
      )
      .get(id);

    recordAuditLog({
      actor,
      action: 'APPROVAL_REQUESTED',
      category: 'WORKFLOW',
      severity: 'INFO',
      targetType: 'approval',
      targetId: id,
      targetLabel: sanitizeHtmlText(parsed.data.title),
      details: { category: parsed.data.category },
    });

    getIO()?.emit('approvals:updated', { approval });
    res.status(201).json({ approval });
  });

  app.patch('/api/approvals/:id/review', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const dbMatrix = getRoleMatrixFromDb();
    const existing = db.prepare(`SELECT * FROM approval_requests WHERE id = ?`).get(req.params.id) as
      | { id: string; requesterId: string; approverId: string | null; title: string }
      | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Approval request not found' });
      return;
    }

    const canReview =
      canPerformWithMatrix(actor, 'approval:review', 'PUBLIC', dbMatrix) || existing.approverId === actor.id;
    if (!canReview) {
      res.status(403).json({ error: 'Insufficient permissions to review approval requests' });
      return;
    }

    const schema = z.object({
      status: z.enum(['APPROVED', 'REJECTED']),
      reviewerNote: z.string().max(400).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid review decision is required' });
      return;
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE approval_requests SET status = ?, reviewerNote = ?, approverId = ?, reviewedAt = ? WHERE id = ?`
    ).run(
      parsed.data.status,
      parsed.data.reviewerNote ? sanitizeHtmlText(parsed.data.reviewerNote) : null,
      actor.id,
      now,
      existing.id
    );

    if (existing.requesterId !== actor.id) {
      emitUserNotification({
        userId: existing.requesterId,
        type: 'SYSTEM',
        title: parsed.data.status === 'APPROVED' ? `درخواست شما تأیید شد` : `درخواست شما رد شد`,
        body: existing.title,
        channelId: announcementChannelId(),
        messageId: null,
        senderName: actor.displayName,
        avatarUrl: actor.avatarUrl,
      });
    }

    const approval = db
      .prepare(
        `SELECT a.*, reqU.displayName as requesterName, appU.displayName as approverName
         FROM approval_requests a
         JOIN users reqU ON reqU.id = a.requesterId
         LEFT JOIN users appU ON appU.id = a.approverId
         WHERE a.id = ?`
      )
      .get(existing.id);

    recordAuditLog({
      actor,
      action: parsed.data.status === 'APPROVED' ? 'APPROVAL_APPROVED' : 'APPROVAL_REJECTED',
      category: 'WORKFLOW',
      severity: 'INFO',
      targetType: 'approval',
      targetId: existing.id,
      targetLabel: existing.title,
    });

    getIO()?.emit('approvals:updated', { approval });
    res.json({ approval });
  });

  app.get('/api/standups', requireAuth, (_req, res) => {
    const rows = db
      .prepare(
        `SELECT s.*, u.displayName as userName, u.avatarUrl as userAvatarUrl, u.department as department
         FROM standup_checkins s
         JOIN users u ON u.id = s.userId
         ORDER BY s.createdAt DESC LIMIT 50`
      )
      .all();
    res.json({ standups: rows });
  });

  app.post('/api/standups', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    const schema = z.object({
      yesterday: z.string().min(2).max(600),
      today: z.string().min(2).max(600),
      blockers: z.string().max(400).nullable().optional(),
      mood: z.enum(['ENERGIZED', 'FOCUSED', 'BLOCKED']).default('FOCUSED'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Yesterday and Today updates are required' });
      return;
    }

    const id = uid('st');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO standup_checkins (id, userId, yesterday, today, blockers, mood, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      actor.id,
      sanitizeHtmlText(parsed.data.yesterday),
      sanitizeHtmlText(parsed.data.today),
      parsed.data.blockers ? sanitizeHtmlText(parsed.data.blockers) : null,
      parsed.data.mood,
      now
    );

    const standup = db
      .prepare(
        `SELECT s.*, u.displayName as userName, u.avatarUrl as userAvatarUrl, u.department as department
         FROM standup_checkins s
         JOIN users u ON u.id = s.userId
         WHERE s.id = ?`
      )
      .get(id);

    getIO()?.emit('standups:updated', { standup });
    res.status(201).json({ standup });
  });

  // ---------------------------------------------------------------------------
  // SUPER ADMIN COMMAND CENTER, COMPLETE AUDIT LOGS & GLOBAL BROADCASTS
  // ---------------------------------------------------------------------------
  app.get('/api/admin/overview', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Super Admin privileges required' });
      return;
    }

    const countOf = (sql: string) => Number((db.prepare(sql).get() as { cnt: number }).cnt ?? 0);
    res.json({
      overview: {
        workspaces: countOf(`SELECT COUNT(*) as cnt FROM workspaces`),
        usersTotal: countOf(`SELECT COUNT(*) as cnt FROM users`),
        usersActive: countOf(`SELECT COUNT(*) as cnt FROM users WHERE COALESCE(isActive, 1) = 1`),
        usersSuspended: countOf(`SELECT COUNT(*) as cnt FROM users WHERE COALESCE(isActive, 1) = 0`),
        channelsTotal: countOf(`SELECT COUNT(*) as cnt FROM channels WHERE COALESCE(isArchived, 0) = 0`),
        messagesTotal: countOf(`SELECT COUNT(*) as cnt FROM messages WHERE deletedAt IS NULL`),
        tasksOpen: countOf(`SELECT COUNT(*) as cnt FROM tasks WHERE status != 'DONE'`),
        approvalsPending: countOf(`SELECT COUNT(*) as cnt FROM approval_requests WHERE status = 'PENDING'`),
        backupSnapshots: countOf(`SELECT COUNT(*) as cnt FROM backup_snapshots`),
        auditLogsTotal: countOf(`SELECT COUNT(*) as cnt FROM audit_logs`),
        activeBroadcasts: countOf(`SELECT COUNT(*) as cnt FROM system_broadcasts WHERE isActive = 1`),
      },
    });
  });

  app.get('/api/admin/audit-logs', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Super Admin privileges required' });
      return;
    }

    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const severity = typeof req.query.severity === 'string' ? req.query.severity : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const limit = Math.min(300, Math.max(20, Number(req.query.limit || 150)));

    let sql = `SELECT * FROM audit_logs WHERE 1=1`;
    const params: Array<string | number> = [];

    if (category && category !== 'ALL') {
      sql += ` AND category = ?`;
      params.push(category);
    }
    if (severity && severity !== 'ALL') {
      sql += ` AND severity = ?`;
      params.push(severity);
    }
    if (q) {
      sql += ` AND (lower(actorName) LIKE ? OR lower(COALESCE(actorEmail, '')) LIKE ? OR lower(action) LIKE ? OR lower(COALESCE(targetLabel, '')) LIKE ? OR lower(COALESCE(detailsJson, '')) LIKE ?)`;
      const term = `%${q}%`;
      params.push(term, term, term, term, term);
    }

    sql += ` ORDER BY createdAt DESC LIMIT ?`;
    params.push(limit);

    const logs = db.prepare(sql).all(...params);
    res.json({ logs });
  });

  app.get('/api/broadcasts/active', requireAuth, (_req, res) => {
    const broadcasts = db
      .prepare(
        `SELECT b.*, u.displayName as createdByName
         FROM system_broadcasts b
         LEFT JOIN users u ON u.id = b.createdById
         WHERE b.isActive = 1
         ORDER BY b.createdAt DESC LIMIT 5`
      )
      .all() as Array<Record<string, unknown>>;

    res.json({
      broadcasts: broadcasts.map((b) => ({
        ...b,
        isActive: Boolean(b.isActive),
      })),
    });
  });

  app.get('/api/admin/broadcasts', requireAuth, (req: AuthenticatedRequest, res) => {
    if (req.authUser!.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Super Admin privileges required' });
      return;
    }
    const broadcasts = db
      .prepare(
        `SELECT b.*, u.displayName as createdByName
         FROM system_broadcasts b
         LEFT JOIN users u ON u.id = b.createdById
         ORDER BY b.createdAt DESC LIMIT 50`
      )
      .all() as Array<Record<string, unknown>>;

    res.json({
      broadcasts: broadcasts.map((b) => ({
        ...b,
        isActive: Boolean(b.isActive),
      })),
    });
  });

  app.post('/api/admin/broadcasts', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Super Admin privileges required' });
      return;
    }

    const schema = z.object({
      title: z.string().min(2).max(120),
      message: z.string().min(2).max(500),
      level: z.enum(['INFO', 'WARN', 'URGENT']).default('INFO') as z.ZodType<BroadcastLevel>,
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Broadcast title and message are required' });
      return;
    }

    const id = uid('brd');
    const now = new Date().toISOString();
    const cleanTitle = sanitizeHtmlText(parsed.data.title);
    const cleanMessage = sanitizeHtmlText(parsed.data.message);

    db.prepare(
      `INSERT INTO system_broadcasts (id, title, message, level, createdById, createdByName, isActive, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(id, cleanTitle, cleanMessage, parsed.data.level, actor.id, actor.displayName, now);

    const broadcast = {
      id,
      title: cleanTitle,
      message: cleanMessage,
      level: parsed.data.level,
      isActive: true,
      createdById: actor.id,
      createdByName: actor.displayName,
      createdAt: now,
    };

    recordAuditLog({
      actor,
      action: 'SYSTEM_BROADCAST_PUBLISHED',
      category: 'SYSTEM',
      severity: parsed.data.level === 'URGENT' ? 'CRITICAL' : parsed.data.level === 'WARN' ? 'WARN' : 'INFO',
      targetType: 'broadcast',
      targetId: id,
      targetLabel: cleanTitle,
      details: { level: parsed.data.level },
    });

    getIO()?.emit('system:broadcast', { broadcast });
    res.status(201).json({ broadcast });
  });

  app.delete('/api/admin/broadcasts/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Super Admin privileges required' });
      return;
    }
    const existing = db.prepare(`SELECT id, title FROM system_broadcasts WHERE id = ?`).get(req.params.id) as
      | { id: string; title: string }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Broadcast not found' });
      return;
    }
    db.prepare(`UPDATE system_broadcasts SET isActive = 0 WHERE id = ?`).run(existing.id);
    recordAuditLog({
      actor,
      action: 'SYSTEM_BROADCAST_REVOKED',
      category: 'SYSTEM',
      severity: 'INFO',
      targetType: 'broadcast',
      targetId: existing.id,
      targetLabel: existing.title,
    });
    getIO()?.emit('system:broadcast', { revokedId: existing.id });
    res.json({ ok: true });
  });
}

