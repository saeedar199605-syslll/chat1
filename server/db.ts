import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { hashPassword } from './password';
import { putFile, fileExists } from './storage';

/**
 * Runtime-agnostic database facade. Node installs node:sqlite (server/db-node.ts),
 * Cloudflare installs Durable Object SQLite (cloudflare/worker.ts). Both are synchronous.
 */
export interface DbStatement {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): unknown;
}
export interface DbImpl {
  prepare(sql: string): DbStatement;
  exec(sql: string): void;
  transaction<T>(fn: () => T): T;
}

let impl: DbImpl | null = null;
export function setDb(next: DbImpl): void {
  impl = next;
}
const cur = (): DbImpl => {
  if (!impl) throw new Error('Database not initialised');
  return impl;
};
export const db = {
  // Typed loosely on purpose: call sites cast rows to their own shapes.
  prepare: (sql: string) => cur().prepare(sql) as {
    get(...p: any[]): any;
    all(...p: any[]): any[];
    run(...p: any[]): any;
  },
  exec: (sql: string): void => cur().exec(sql),
  transaction: <T>(fn: () => T): T => cur().transaction(fn),
};

export function uid(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      fullName TEXT NOT NULL,
      displayName TEXT NOT NULL,
      avatarUrl TEXT,
      jobTitle TEXT NOT NULL,
      department TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
      role TEXT NOT NULL DEFAULT 'MEMBER',
      presence TEXT NOT NULL DEFAULT 'ONLINE',
      customStatus TEXT,
      customEmoji TEXT,
      dndEnabled INTEGER NOT NULL DEFAULT 0,
      dndStartHour INTEGER NOT NULL DEFAULT 19,
      dndEndHour INTEGER NOT NULL DEFAULT 8,
      managerId TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS file_blobs (
      key TEXT NOT NULL,
      idx INTEGER NOT NULL,
      data BLOB NOT NULL,
      PRIMARY KEY (key, idx)
    );

    CREATE TABLE IF NOT EXISTS file_meta (
      key TEXT PRIMARY KEY,
      size INTEGER NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      userId TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      domain TEXT,
      logoText TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_members (
      id TEXT PRIMARY KEY,
      workspaceId TEXT NOT NULL,
      userId TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'MEMBER',
      joinedAt TEXT NOT NULL,
      UNIQUE(workspaceId, userId)
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      workspaceId TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      topic TEXT,
      type TEXT NOT NULL DEFAULT 'PUBLIC',
      createdById TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      UNIQUE(workspaceId, slug)
    );

    CREATE TABLE IF NOT EXISTS channel_members (
      id TEXT PRIMARY KEY,
      channelId TEXT NOT NULL,
      userId TEXT NOT NULL,
      isStarred INTEGER NOT NULL DEFAULT 0,
      isMuted INTEGER NOT NULL DEFAULT 0,
      lastReadAt TEXT NOT NULL,
      joinedAt TEXT NOT NULL,
      UNIQUE(channelId, userId)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      channelId TEXT NOT NULL,
      authorId TEXT NOT NULL,
      parentId TEXT,
      type TEXT NOT NULL DEFAULT 'TEXT',
      content TEXT NOT NULL,
      isPinned INTEGER NOT NULL DEFAULT 0,
      isEdited INTEGER NOT NULL DEFAULT 0,
      deletedAt TEXT,
      readByJson TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS message_edit_history (
      id TEXT PRIMARY KEY,
      messageId TEXT NOT NULL,
      previousContent TEXT NOT NULL,
      editedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      messageId TEXT,
      channelId TEXT NOT NULL,
      uploaderId TEXT NOT NULL,
      fileName TEXT NOT NULL,
      mimeType TEXT NOT NULL,
      sizeBytes INTEGER NOT NULL,
      storageKey TEXT UNIQUE NOT NULL,
      url TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reactions (
      id TEXT PRIMARY KEY,
      messageId TEXT NOT NULL,
      userId TEXT NOT NULL,
      emoji TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      UNIQUE(messageId, userId, emoji)
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      id TEXT PRIMARY KEY,
      messageId TEXT NOT NULL,
      userId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      UNIQUE(messageId, userId)
    );

    CREATE TABLE IF NOT EXISTS polls (
      id TEXT PRIMARY KEY,
      messageId TEXT UNIQUE NOT NULL,
      question TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS poll_options (
      id TEXT PRIMARY KEY,
      pollId TEXT NOT NULL,
      label TEXT NOT NULL,
      sortOrder INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS poll_votes (
      id TEXT PRIMARY KEY,
      optionId TEXT NOT NULL,
      userId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      UNIQUE(optionId, userId)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      channelId TEXT NOT NULL,
      messageId TEXT UNIQUE,
      creatorId TEXT NOT NULL,
      assigneeId TEXT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'TODO',
      dueDate TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wiki_docs (
      id TEXT PRIMARY KEY,
      channelId TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      updatedById TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      channelId TEXT,
      messageId TEXT,
      isRead INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS custom_emojis (
      id TEXT PRIMARY KEY,
      workspaceId TEXT NOT NULL,
      shortcode TEXT NOT NULL,
      glyph TEXT NOT NULL,
      UNIQUE(workspaceId, shortcode)
    );

    CREATE TABLE IF NOT EXISTS backup_snapshots (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      createdById TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      sizeBytes INTEGER NOT NULL,
      countsJson TEXT NOT NULL,
      fileName TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role TEXT PRIMARY KEY,
      permissionsJson TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS approval_requests (
      id TEXT PRIMARY KEY,
      requesterId TEXT NOT NULL,
      approverId TEXT,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      details TEXT NOT NULL,
      metricLabel TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      reviewerNote TEXT,
      createdAt TEXT NOT NULL,
      reviewedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS standup_checkins (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      yesterday TEXT NOT NULL,
      today TEXT NOT NULL,
      blockers TEXT,
      mood TEXT NOT NULL DEFAULT 'FOCUSED',
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actorId TEXT,
      actorName TEXT NOT NULL,
      actorEmail TEXT,
      action TEXT NOT NULL,
      category TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'INFO',
      targetType TEXT,
      targetId TEXT,
      targetLabel TEXT,
      detailsJson TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_broadcasts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'INFO',
      createdById TEXT NOT NULL,
      createdByName TEXT NOT NULL,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS group_join_requests (
      id TEXT PRIMARY KEY,
      channelId TEXT NOT NULL,
      workspaceId TEXT NOT NULL,
      inviterId TEXT NOT NULL,
      inviteeId TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      createdAt TEXT NOT NULL,
      respondedAt TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON messages(channelId, createdAt);
    CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(messageId);
    CREATE INDEX IF NOT EXISTS idx_attachments_channel ON attachments(channelId, createdAt);
    CREATE INDEX IF NOT EXISTS idx_attachments_storage ON attachments(storageKey);
    CREATE INDEX IF NOT EXISTS idx_reactions_message ON reactions(messageId);
    CREATE INDEX IF NOT EXISTS idx_bookmarks_message_user ON bookmarks(messageId, userId);
    CREATE INDEX IF NOT EXISTS idx_polls_message ON polls(messageId);
    CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON poll_options(pollId);
    CREATE INDEX IF NOT EXISTS idx_poll_votes_option ON poll_votes(optionId);
    CREATE INDEX IF NOT EXISTS idx_edit_history_message ON message_edit_history(messageId);
    CREATE INDEX IF NOT EXISTS idx_tasks_channel ON tasks(channelId);
    CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assigneeId);
    CREATE INDEX IF NOT EXISTS idx_channel_members_user ON channel_members(userId);
    CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(userId);
    CREATE INDEX IF NOT EXISTS idx_wiki_channel ON wiki_docs(channelId);
    CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(userId);
    CREATE INDEX IF NOT EXISTS idx_refresh_token ON refresh_tokens(token);
    CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parentId);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(userId, isRead, createdAt);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON audit_logs(category, severity);
    CREATE INDEX IF NOT EXISTS idx_group_invites_invitee ON group_join_requests(inviteeId, status);
  `);

  const ensureColumn = (table: string, column: string, definition: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };

  ensureColumn('workspaces', 'logoUrl', 'TEXT');
  ensureColumn('channels', 'isArchived', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('channels', 'archivedAt', 'TEXT');
  ensureColumn('messages', 'isArchived', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('messages', 'archivedAt', 'TEXT');
  ensureColumn('tasks', 'priority', "TEXT NOT NULL DEFAULT 'MEDIUM'");
  ensureColumn('users', 'isActive', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('users', 'customPermissionsJson', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn('users', 'groupAddPolicy', "TEXT NOT NULL DEFAULT 'DIRECT'");
  ensureColumn('users', 'tokenRevokedBefore', 'INTEGER NOT NULL DEFAULT 0');

  // Ensure audit_logs table uses the canonical targetLabel / detailsJson schema
  const auditCols = db.prepare(`PRAGMA table_info(audit_logs)`).all() as Array<{ name: string }>;
  if (!auditCols.some((c) => c.name === 'targetLabel')) {
    db.exec(`
      DROP TABLE IF EXISTS audit_logs;
      CREATE TABLE audit_logs (
        id TEXT PRIMARY KEY,
        actorId TEXT,
        actorName TEXT NOT NULL,
        actorEmail TEXT,
        action TEXT NOT NULL,
        category TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'INFO',
        targetType TEXT,
        targetId TEXT,
        targetLabel TEXT,
        detailsJson TEXT,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(createdAt DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON audit_logs(category, severity);
    `);
  }
}

function writeSeedArtifact(storageKey: string, content: string): number {
  putFile(storageKey, Buffer.from(content, 'utf-8'));
  return Buffer.byteLength(content, 'utf-8');
}

function buildValidSamplePdfBuffer(): Buffer {
  const streamLines = [
    'BT',
    '/F1 18 Tf',
    '54 740 Td',
    '(Esfahan Chalak Co. - Q4 Platform Architecture Brief) Tj',
    '/F1 12 Tf',
    '0 -34 Td',
    '(1. Real-Time Messaging & iOS Liquid Glass Collaboration Suite) Tj',
    '0 -22 Td',
    '(   - Socket.io event dispatch p95 latency target: 18ms across nodes.) Tj',
    '0 -22 Td',
    '(   - End-to-end encrypted voice notes, interactive polls & action items.) Tj',
    '0 -32 Td',
    '(2. Document Review & Automated PDF Conversion Pipeline) Tj',
    '0 -22 Td',
    '(   - Preview pages inline, inspect extracted text, and export to PNG or DOCX.) Tj',
    '0 -22 Td',
    '(   - Prepared by Engineering Core for Esfahan Chalak teams.) Tj',
    'ET',
  ].join('\n');

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(streamLines, 'utf-8')} >>\nstream\n${streamLines}\nendstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf-8'));
    pdf += obj;
  }
  const xrefPos = Buffer.byteLength(pdf, 'utf-8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf-8');
}

function ensureSamplePdfArtifact(): void {
  const storageKey = 'seed-chalak-project-brief.pdf';
  const pdfBuf = buildValidSamplePdfBuffer();
  if (!fileExists(storageKey)) {
    putFile(storageKey, pdfBuf);
  }
  const existingAtt = db.prepare(`SELECT id FROM attachments WHERE storageKey = ?`).get(storageKey) as
    | { id: string }
    | undefined;
  if (!existingAtt) {
    const now = new Date(Date.now() - 40 * 60_000).toISOString();
    const msgId = db.prepare(`SELECT id FROM messages WHERE id = 'msg_eng_2'`).get() ? 'msg_eng_2' : null;
    if (msgId) {
      db.prepare(
        `INSERT INTO attachments (id, messageId, channelId, uploaderId, fileName, mimeType, sizeBytes, storageKey, url, createdAt)
         VALUES (?, ?, 'ch_eng_core', 'usr_elena', 'Esfahan-Chalak-Q4-Brief.pdf', 'application/pdf', ?, ?, ?, ?)`
      ).run('att_seed_pdf', msgId, pdfBuf.length, storageKey, `/api/files/download/${storageKey}`, now);
    }
  }
}

export function seedDatabase(): void {
  const existingUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (existingUsers.count > 0) return;

  const now = new Date();
  const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();
  const passwordHash = hashPassword('Workstream!2026');

  // 1. Seed Users with realistic organizational hierarchy
  const users = [
    {
      id: 'usr_elena',
      email: 'elena.rostova@acme.io',
      fullName: 'Elena Rostova',
      displayName: 'Elena Rostova',
      avatarUrl: 'elena.jpg',
      jobTitle: 'VP of Engineering',
      department: 'Executive & Engineering',
      timezone: 'America/Los_Angeles',
      role: 'SUPER_ADMIN',
      presence: 'ONLINE',
      customStatus: 'Q4 architecture reviews',
      customEmoji: '🧭',
      managerId: null,
    },
    {
      id: 'usr_marcus',
      email: 'marcus.vance@acme.io',
      fullName: 'Marcus Vance',
      displayName: 'Marcus Vance',
      avatarUrl: 'marcus.jpg',
      jobTitle: 'Staff Systems Architect',
      department: 'Core Platform',
      timezone: 'America/New_York',
      role: 'DEPT_MANAGER',
      presence: 'ONLINE',
      customStatus: 'WebRTC SFU benchmarks',
      customEmoji: '⚡',
      managerId: 'usr_elena',
    },
    {
      id: 'usr_priya',
      email: 'priya.nair@acme.io',
      fullName: 'Priya Nair',
      displayName: 'Priya Nair',
      avatarUrl: 'priya.jpg',
      jobTitle: 'Principal Product Designer',
      department: 'Design Systems',
      timezone: 'Europe/London',
      role: 'DEPT_MANAGER',
      presence: 'FOCUS_MODE',
      customStatus: 'Design token audit',
      customEmoji: '🎨',
      managerId: 'usr_elena',
    },
    {
      id: 'usr_dariush',
      email: 'dariush.farahani@acme.io',
      fullName: 'Dariush Farahani',
      displayName: 'Dariush Farahani',
      avatarUrl: 'dariush.jpg',
      jobTitle: 'DevOps & SRE Lead',
      department: 'Cloud Infrastructure',
      timezone: 'Asia/Tehran',
      role: 'MEMBER',
      presence: 'ONLINE',
      customStatus: 'Monitoring eu-west clusters',
      customEmoji: '🛡️',
      managerId: 'usr_marcus',
    },
    {
      id: 'usr_claire',
      email: 'claire.dubois@acme.io',
      fullName: 'Claire Dubois',
      displayName: 'Claire Dubois',
      avatarUrl: null,
      jobTitle: 'Senior Security Engineer',
      department: 'Security & Compliance',
      timezone: 'Europe/Paris',
      role: 'MEMBER',
      presence: 'IN_MEETING',
      customStatus: 'SOC2 Type II audit',
      customEmoji: '🔐',
      managerId: 'usr_marcus',
    },
    {
      id: 'usr_lucas',
      email: 'lucas.kim@acme.io',
      fullName: 'Lucas Kim',
      displayName: 'Lucas Kim',
      avatarUrl: null,
      jobTitle: 'External Integration Partner',
      department: 'Partner Ecosystem',
      timezone: 'Asia/Seoul',
      role: 'GUEST',
      presence: 'AWAY',
      customStatus: 'Reviewing API specs',
      customEmoji: '🔌',
      managerId: 'usr_priya',
    },
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (id, email, passwordHash, fullName, displayName, avatarUrl, jobTitle, department, timezone, role, presence, customStatus, customEmoji, managerId, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const u of users) {
    insertUser.run(
      u.id, u.email, passwordHash, u.fullName, u.displayName, u.avatarUrl,
      u.jobTitle, u.department, u.timezone, u.role, u.presence,
      u.customStatus, u.customEmoji, u.managerId, minsAgo(5000)
    );
  }

  // 2. Seed Workspaces
  const insertWs = db.prepare(`INSERT INTO workspaces (id, name, slug, domain, logoText, createdAt) VALUES (?, ?, ?, ?, ?, ?)`);
  insertWs.run('ws_acme', 'Acme Global', 'acme-global', 'acme.io', 'AG', minsAgo(4900));
  insertWs.run('ws_rnd', 'Acme R&D Lab', 'acme-rnd', 'rnd.acme.io', 'RD', minsAgo(4800));

  const insertWsMember = db.prepare(`INSERT INTO workspace_members (id, workspaceId, userId, role, joinedAt) VALUES (?, ?, ?, ?, ?)`);
  for (const u of users) {
    insertWsMember.run(uid('wm'), 'ws_acme', u.id, u.role, minsAgo(4500));
    if (u.role !== 'GUEST') {
      insertWsMember.run(uid('wm'), 'ws_rnd', u.id, u.role, minsAgo(4400));
    }
  }

  // 3. Seed Channels
  const channels = [
    {
      id: 'ch_announcements',
      workspaceId: 'ws_acme',
      name: 'announcements',
      slug: 'announcements',
      description: 'Company-wide executive updates and milestone broadcasts (Admin & Manager posting only).',
      topic: 'Q4 Reliability & Enterprise Rollout Milestones',
      type: 'ANNOUNCEMENT',
      createdById: 'usr_elena',
    },
    {
      id: 'ch_eng_core',
      workspaceId: 'ws_acme',
      name: 'engineering-core',
      slug: 'engineering-core',
      description: 'Core platform architecture, Socket.io scaling, WebRTC mesh, and production incidents.',
      topic: 'Latency target: <40ms p95 event dispatch across EU/US',
      type: 'PUBLIC',
      createdById: 'usr_marcus',
    },
    {
      id: 'ch_design',
      workspaceId: 'ws_acme',
      name: 'product-design',
      slug: 'product-design',
      description: 'Design system governance, accessibility reviews, and RTL typography audits.',
      topic: 'V4 Enterprise UI Kit & Contrast Audits',
      type: 'PUBLIC',
      createdById: 'usr_priya',
    },
    {
      id: 'ch_devops',
      workspaceId: 'ws_acme',
      name: 'devops-infra',
      slug: 'devops-infra',
      description: 'Kubernetes clusters, PostgreSQL failover drills, MinIO S3 buckets, and Terraform.',
      topic: 'Cluster upgrade window: Saturday 02:00 UTC',
      type: 'PUBLIC',
      createdById: 'usr_dariush',
    },
    {
      id: 'ch_sec_private',
      workspaceId: 'ws_acme',
      name: 'security-incident-ops',
      slug: 'security-incident-ops',
      description: 'Restricted security triage, RBAC audit logs, and SOC2 compliance evidence.',
      topic: 'SOC2 Type II evidence collection',
      type: 'PRIVATE',
      createdById: 'usr_claire',
    },
    {
      id: 'ch_dm_marcus',
      workspaceId: 'ws_acme',
      name: 'dm-elena-marcus',
      slug: 'dm-elena-marcus',
      description: 'Direct message',
      topic: null,
      type: 'DM',
      createdById: 'usr_elena',
    },
    {
      id: 'ch_dm_priya',
      workspaceId: 'ws_acme',
      name: 'dm-elena-priya',
      slug: 'dm-elena-priya',
      description: 'Direct message',
      topic: null,
      type: 'DM',
      createdById: 'usr_elena',
    },
    {
      id: 'ch_rnd_proto',
      workspaceId: 'ws_rnd',
      name: 'webrtc-sfu-lab',
      slug: 'webrtc-sfu-lab',
      description: 'Next-gen simulcast & spatial audio pipeline experiments.',
      topic: 'AV1 SVC throughput testing',
      type: 'PUBLIC',
      createdById: 'usr_marcus',
    },
  ];

  const insertCh = db.prepare(`
    INSERT INTO channels (id, workspaceId, name, slug, description, topic, type, createdById, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const c of channels) {
    insertCh.run(c.id, c.workspaceId, c.name, c.slug, c.description, c.topic, c.type, c.createdById, minsAgo(4000));
  }

  const insertChMem = db.prepare(`
    INSERT INTO channel_members (id, channelId, userId, isStarred, isMuted, lastReadAt, joinedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const u of users) {
    for (const c of channels) {
      if (c.type === 'DM') continue;
      if (c.id === 'ch_sec_private' && u.role === 'GUEST') continue;
      if (c.workspaceId === 'ws_rnd' && u.role === 'GUEST') continue;
      const starred = c.id === 'ch_eng_core' || c.id === 'ch_announcements' ? 1 : 0;
      insertChMem.run(uid('cm'), c.id, u.id, starred, 0, minsAgo(15), minsAgo(3900));
    }
  }
  // DM memberships
  insertChMem.run(uid('cm'), 'ch_dm_marcus', 'usr_elena', 0, 0, minsAgo(5), minsAgo(3900));
  insertChMem.run(uid('cm'), 'ch_dm_marcus', 'usr_marcus', 0, 0, minsAgo(5), minsAgo(3900));
  insertChMem.run(uid('cm'), 'ch_dm_priya', 'usr_elena', 0, 0, minsAgo(20), minsAgo(3900));
  insertChMem.run(uid('cm'), 'ch_dm_priya', 'usr_priya', 0, 0, minsAgo(20), minsAgo(3900));

  // 4. Custom company emojis
  const insertEmoji = db.prepare(`INSERT INTO custom_emojis (id, workspaceId, shortcode, glyph) VALUES (?, ?, ?, ?)`);
  const emojis = [
    ['shipit', '🚢'],
    ['lgtm', '✅'],
    ['oncall', '📟'],
    ['highfive', '🙌'],
    ['rocket', '🚀'],
    ['lock', '🔒'],
  ];
  for (const [sc, gl] of emojis) {
    insertEmoji.run(uid('em'), 'ws_acme', sc, gl);
    insertEmoji.run(uid('em'), 'ws_rnd', sc, gl);
  }

  // 5. Seed Realistic Uploaded Files for Previewer
  const archSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="440" viewBox="0 0 800 440">
  <rect width="800" height="440" fill="#0f172a"/>
  <rect x="40" y="40" width="200" height="90" rx="8" fill="#1e293b" stroke="#4f46e5" stroke-width="2"/>
  <text x="140" y="82" fill="#f8fafc" font-family="sans-serif" font-size="15" font-weight="600" text-anchor="middle">Client (React + WebRTC)</text>
  <text x="140" y="106" fill="#94a3b8" font-family="monospace" font-size="12" text-anchor="middle">Socket.io + MediaStream</text>
  <rect x="300" y="40" width="200" height="90" rx="8" fill="#1e293b" stroke="#10b981" stroke-width="2"/>
  <text x="400" y="82" fill="#f8fafc" font-family="sans-serif" font-size="15" font-weight="600" text-anchor="middle">Signaling Gateway</text>
  <text x="400" y="106" fill="#94a3b8" font-family="monospace" font-size="12" text-anchor="middle">Express + Redis Pub/Sub</text>
  <rect x="560" y="40" width="200" height="90" rx="8" fill="#1e293b" stroke="#38bdf8" stroke-width="2"/>
  <text x="660" y="82" fill="#f8fafc" font-family="sans-serif" font-size="15" font-weight="600" text-anchor="middle">Object Store (S3/MinIO)</text>
  <text x="660" y="106" fill="#94a3b8" font-family="monospace" font-size="12" text-anchor="middle">Presigned Chunked PUT</text>
  <line x1="240" y1="85" x2="300" y2="85" stroke="#6366f1" stroke-width="2"/>
  <line x1="500" y1="85" x2="560" y2="85" stroke="#10b981" stroke-width="2"/>
  <rect x="180" y="210" width="440" height="160" rx="10" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>
  <text x="400" y="250" fill="#e2e8f0" font-family="sans-serif" font-size="16" font-weight="600" text-anchor="middle">PostgreSQL + Prisma Normalized Store</text>
  <text x="400" y="282" fill="#94a3b8" font-family="monospace" font-size="12" text-anchor="middle">Workspaces · Channels · RBAC · Threads · Polls · Tasks · Wikis</text>
  <text x="400" y="320" fill="#10b981" font-family="monospace" font-size="13" text-anchor="middle">p95 Event Dispatch: 18ms | WAL Replication Active</text>
  <line x1="400" y1="130" x2="400" y2="210" stroke="#94a3b8" stroke-width="2" stroke-dasharray="5,5"/>
</svg>`;
  const svgSize = writeSeedArtifact('seed-architecture-topology.svg', archSvg);

  const runbookMd = `# Q4 Real-Time Platform Runbook\n\n## 1. WebSocket Scaling\n- Use Redis Adapter for horizontal Socket.io pods.\n- Keep heartbeats at 25s interval / 20s timeout.\n\n## 2. Database Failover\n\`\`\`sql\nSELECT pg_is_in_recovery(), now() - pg_last_xact_replay_timestamp() AS lag;\n\`\`\`\n\n## 3. Escalation Contacts\n- **Core Platform**: @marcus.vance\n- **SRE On-Call**: @dariush.farahani\n`;
  const mdSize = writeSeedArtifact('seed-q4-platform-runbook.md', runbookMd);

  const latencyCsv = `region,p50_ms,p95_ms,p99_ms,active_sockets\nus-west-1,11,19,31,4820\nus-east-1,9,17,28,6310\neu-central-1,14,24,39,3940\nap-northeast-1,18,29,44,2190\n`;
  const csvSize = writeSeedArtifact('seed-webrtc-latency-report.csv', latencyCsv);

  // 6. Seed Messages, Threads, Reactions, Polls, Tasks, WikiDocs
  const insertMsg = db.prepare(`
    INSERT INTO messages (id, channelId, authorId, parentId, type, content, isPinned, isEdited, deletedAt, readByJson, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
  `);

  // #announcements
  insertMsg.run(
    'msg_ann_1', 'ch_announcements', 'usr_elena', null, 'TEXT',
    'Team — Q4 enterprise platform rollout is live across all three regions. Every channel now includes real-time threaded discussions, instant WebRTC huddles with live screen annotation, and collaborative channel wikis.\n\nPlease review our updated SOC2 access controls in `#security-incident-ops` before Friday.',
    1, 0, JSON.stringify(['usr_elena', 'usr_marcus', 'usr_priya', 'usr_dariush']), minsAgo(240), minsAgo(240)
  );

  // #engineering-core
  insertMsg.run(
    'msg_eng_1', 'ch_eng_core', 'usr_marcus', null, 'TEXT',
    'Finished migrating the Socket.io room fan-out to idempotent event handlers. Here is the backoff config we deployed across `us-east` and `eu-central`:\n\n```ts\nexport const socketBackoff = {\n  reconnectionDelay: 500,\n  reconnectionDelayMax: 4000,\n  ackTimeoutMs: 2500,\n};\n```\n\n@dariush can you confirm the Grafana p95 dispatch stays under 25ms?',
    1, 0, JSON.stringify(['usr_elena', 'usr_marcus', 'usr_dariush', 'usr_priya']), minsAgo(180), minsAgo(180)
  );

  // Thread replies to msg_eng_1
  insertMsg.run(
    'msg_eng_1_r1', 'ch_eng_core', 'usr_dariush', 'msg_eng_1', 'TEXT',
    'Confirmed — p95 dropped from 42ms to **19ms** in `us-west-1` and **24ms** in `eu-central-1`. Zero dropped ICE candidates over the last 4 hours.',
    0, 0, JSON.stringify(['usr_elena', 'usr_marcus', 'usr_dariush']), minsAgo(165), minsAgo(165)
  );
  insertMsg.run(
    'msg_eng_1_r2', 'ch_eng_core', 'usr_elena', 'msg_eng_1', 'TEXT',
    'Great turnaround both. Pinning this config for the Q4 architecture baseline.',
    0, 0, JSON.stringify(['usr_elena', 'usr_marcus', 'usr_dariush']), minsAgo(150), minsAgo(150)
  );

  // Message with file attachment
  insertMsg.run(
    'msg_eng_2', 'ch_eng_core', 'usr_dariush', null, 'TEXT',
    'Attached the updated system topology diagram and regional latency telemetry CSV for our upcoming SRE review.',
    0, 0, JSON.stringify(['usr_elena', 'usr_marcus', 'usr_dariush']), minsAgo(95), minsAgo(95)
  );

  const insertAtt = db.prepare(`
    INSERT INTO attachments (id, messageId, channelId, uploaderId, fileName, mimeType, sizeBytes, storageKey, url, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertAtt.run('att_1', 'msg_eng_2', 'ch_eng_core', 'usr_dariush', 'architecture-topology.svg', 'image/svg+xml', svgSize, 'seed-architecture-topology.svg', '/api/files/download/seed-architecture-topology.svg', minsAgo(95));
  insertAtt.run('att_2', 'msg_eng_2', 'ch_eng_core', 'usr_dariush', 'webrtc-latency-report.csv', 'text/csv', csvSize, 'seed-webrtc-latency-report.csv', '/api/files/download/seed-webrtc-latency-report.csv', minsAgo(95));
  insertAtt.run('att_3', null, 'ch_devops', 'usr_dariush', 'q4-platform-runbook.md', 'text/markdown', mdSize, 'seed-q4-platform-runbook.md', '/api/files/download/seed-q4-platform-runbook.md', minsAgo(300));

  // Poll message in #engineering-core
  insertMsg.run(
    'msg_eng_poll', 'ch_eng_core', 'usr_elena', null, 'POLL',
    'Poll: Production Release Window for v4.2 Signaling Upgrade',
    0, 0, JSON.stringify(['usr_elena', 'usr_marcus', 'usr_dariush']), minsAgo(45), minsAgo(45)
  );
  db.prepare(`INSERT INTO polls (id, messageId, question, createdAt) VALUES (?, ?, ?, ?)`).run(
    'poll_1', 'msg_eng_poll', 'Which maintenance window works best for the v4.2 Signaling Upgrade?', minsAgo(45)
  );
  const insOpt = db.prepare(`INSERT INTO poll_options (id, pollId, label, sortOrder) VALUES (?, ?, ?, ?)`);
  insOpt.run('popt_1', 'poll_1', 'Tuesday 06:00 UTC (Low traffic)', 0);
  insOpt.run('popt_2', 'poll_1', 'Thursday 14:00 UTC (Full team online)', 1);
  insOpt.run('popt_3', 'poll_1', 'Saturday 02:00 UTC (Weekend window)', 2);
  const insVote = db.prepare(`INSERT INTO poll_votes (id, optionId, userId, createdAt) VALUES (?, ?, ?, ?)`);
  insVote.run(uid('pv'), 'popt_1', 'usr_marcus', minsAgo(40));
  insVote.run(uid('pv'), 'popt_1', 'usr_dariush', minsAgo(38));
  insVote.run(uid('pv'), 'popt_2', 'usr_elena', minsAgo(35));

  // Task message in #engineering-core
  insertMsg.run(
    'msg_eng_task', 'ch_eng_core', 'usr_marcus', null, 'TASK',
    'Action item created: Benchmark WebRTC screen-share VP9 bitrate under 3G throttling',
    0, 0, JSON.stringify(['usr_elena', 'usr_marcus']), minsAgo(25), minsAgo(25)
  );
  db.prepare(`
    INSERT INTO tasks (id, channelId, messageId, creatorId, assigneeId, title, description, status, dueDate, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'tsk_1', 'ch_eng_core', 'msg_eng_task', 'usr_marcus', 'usr_dariush',
    'Benchmark WebRTC screen-share VP9 bitrate under 3G throttling',
    'Verify adaptive bitrate fallback preserves readable code text during screen sharing.',
    'IN_PROGRESS', '2026-11-20', minsAgo(25)
  );
  db.prepare(`
    INSERT INTO tasks (id, channelId, messageId, creatorId, assigneeId, title, description, status, dueDate, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'tsk_2', 'ch_eng_core', null, 'usr_elena', 'usr_claire',
    'Finalize RBAC audit log retention policy (90-day S3 Glacier)',
    'Confirm compliance sign-off before Q4 audit.',
    'TODO', '2026-11-25', minsAgo(120)
  );

  // #product-design messages
  insertMsg.run(
    'msg_des_1', 'ch_design', 'usr_priya', null, 'TEXT',
    'Updated the dual-theme contrast matrix and RTL layout spacing for Persian (`Vazirmatn`) and English (`DM Sans`) locales. You can test the instant RTL & Dark Mode toggle directly in the left rail!',
    1, 0, JSON.stringify(['usr_priya', 'usr_elena']), minsAgo(110), minsAgo(110)
  );

  // #devops-infra
  insertMsg.run(
    'msg_ops_1', 'ch_devops', 'usr_dariush', null, 'TEXT',
    'MinIO S3 local bucket policy verified. Presigned upload tokens expire in 10 minutes with strict MIME allow-listing.',
    0, 0, JSON.stringify(['usr_dariush', 'usr_marcus']), minsAgo(75), minsAgo(75)
  );

  // #dm-elena-marcus
  insertMsg.run(
    'msg_dm_1', 'ch_dm_marcus', 'usr_marcus', null, 'TEXT',
    'Hey Elena, ready to walk through the WebRTC live annotation canvas whenever you have 5 minutes. Just click Start Huddle at the top right!',
    0, 0, JSON.stringify(['usr_elena', 'usr_marcus']), minsAgo(18), minsAgo(18)
  );

  // Reactions
  const insReact = db.prepare(`INSERT INTO reactions (id, messageId, userId, emoji, createdAt) VALUES (?, ?, ?, ?, ?)`);
  insReact.run(uid('rx'), 'msg_eng_1', 'usr_elena', '🚀', minsAgo(170));
  insReact.run(uid('rx'), 'msg_eng_1', 'usr_dariush', '🚀', minsAgo(168));
  insReact.run(uid('rx'), 'msg_eng_1', 'usr_priya', '✅', minsAgo(160));
  insReact.run(uid('rx'), 'msg_ann_1', 'usr_marcus', '🙌', minsAgo(230));
  insReact.run(uid('rx'), 'msg_ann_1', 'usr_priya', '🙌', minsAgo(220));

  // Bookmark for Elena
  db.prepare(`INSERT INTO bookmarks (id, messageId, userId, createdAt) VALUES (?, ?, ?, ?)`).run(
    uid('bm'), 'msg_eng_1', 'usr_elena', minsAgo(140)
  );

  // Collaborative Wiki Docs per channel
  const insWiki = db.prepare(`
    INSERT INTO wiki_docs (id, channelId, title, content, version, updatedById, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insWiki.run(
    uid('wiki'),
    'ch_eng_core',
    'Engineering Core — Architecture & SOPs',
    `# Engineering Core Knowledge Base\n\n## Real-Time Messaging SLAs\n- Socket.io event fan-out target: < 40ms p95\n- All message mutations are idempotent and persisted before broadcast.\n\n## WebRTC Huddle Standards\n- Acoustic echo cancellation + noise suppression enabled by default.\n- Screen sharing uses 30fps VP9 / H.264 simulcast with live annotation overlay.\n\n## On-Call Rotation\n- Primary: Marcus Vance\n- Secondary: Dariush Farahani`,
    3,
    'usr_marcus',
    minsAgo(60)
  );
  insWiki.run(
    uid('wiki'),
    'ch_design',
    'Design System & Accessibility Guidelines',
    `# V4 Enterprise UI Principles\n\n- Maintain WCAG AA 4.5:1 text contrast in both Light and Dark themes.\n- Tabular numerals enforced on timestamps, file sizes, and poll counters.\n- Full RTL mirroring supported via Vazirmatn typography.`,
    2,
    'usr_priya',
    minsAgo(90)
  );
  insWiki.run(
    uid('wiki'),
    'ch_announcements',
    'Company Handbook & Quarterly OKRs',
    `# Acme Global Q4 Objectives\n\n1. Zero-downtime enterprise rollout across North America, EMEA, and APAC.\n2. Complete SOC2 Type II continuous compliance evidence.\n3. Adopt Workstream Huddles for async-first architecture reviews.`,
    1,
    'usr_elena',
    minsAgo(200)
  );

  // Notifications for Elena
  const insNotif = db.prepare(`
    INSERT INTO notifications (id, userId, type, title, body, channelId, messageId, isRead, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insNotif.run(
    uid('ntf'), 'usr_elena', 'THREAD_REPLY',
    'Dariush Farahani replied in #engineering-core',
    'Confirmed — p95 dropped from 42ms to 19ms in us-west-1...',
    'ch_eng_core', 'msg_eng_1', 0, minsAgo(165)
  );
  insNotif.run(
    uid('ntf'), 'usr_elena', 'MENTION',
    'Marcus Vance sent a direct message',
    'Hey Elena, ready to walk through the WebRTC live annotation canvas...',
    'ch_dm_marcus', 'msg_dm_1', 0, minsAgo(18)
  );
}

/** Demo data (fake users, shared password) only in dev; production starts empty with one admin from env. */
const SEED_DEMO = process.env.SEED_DEMO ? process.env.SEED_DEMO === 'true' : process.env.NODE_ENV !== 'production';

function bootstrapProduction(): void {
  const count = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (count > 0) return;
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) {
    throw new Error('First run in production: set ADMIN_EMAIL and ADMIN_PASSWORD (min 12 chars) to create the Super Admin.');
  }
  const now = new Date().toISOString();
  const orgName = (process.env.ORG_NAME || 'Workstream').trim();
  const userId = uid('usr');
  const wsId = uid('ws');
  db.prepare(
    `INSERT INTO users (id, email, passwordHash, fullName, displayName, avatarUrl, jobTitle, department, timezone, role, presence, managerId, createdAt)
     VALUES (?, ?, ?, ?, ?, NULL, 'Administrator', 'Management', ?, 'SUPER_ADMIN', 'ONLINE', NULL, ?)`
  ).run(userId, email, hashPassword(password), process.env.ADMIN_NAME || 'Administrator', process.env.ADMIN_NAME || 'Administrator', process.env.TZ || 'UTC', now);
  db.prepare(`INSERT INTO workspaces (id, name, slug, domain, logoText, createdAt) VALUES (?, ?, ?, NULL, ?, ?)`).run(
    wsId, orgName, orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'workspace', Array.from(orgName).slice(0, 2).join(''), now
  );
  db.prepare(`INSERT INTO workspace_members (id, workspaceId, userId, role, joinedAt) VALUES (?, ?, ?, 'SUPER_ADMIN', ?)`).run(uid('wm'), wsId, userId, now);
  for (const [name, type, desc] of [['general', 'PUBLIC', 'General discussion'], ['announcements', 'ANNOUNCEMENT', 'Company announcements']] as const) {
    const chId = uid('ch');
    db.prepare(
      `INSERT INTO channels (id, workspaceId, name, slug, description, topic, type, createdById, createdAt) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`
    ).run(chId, wsId, name, name, desc, type, userId, now);
    db.prepare(`INSERT INTO channel_members (id, channelId, userId, isStarred, isMuted, lastReadAt, joinedAt) VALUES (?, ?, ?, 0, 0, ?, ?)`).run(uid('cm'), chId, userId, now, now);
  }
  console.log(`Created initial Super Admin ${email} and workspace "${orgName}".`);
}


// Specialize workspaces, role permission defaults, and enterprise workflow records for شرکت اصفهان چالاک (Esfahan Chalak Co.)
function syncEsfahanChalakEnterpriseDefaults(): void {
  const now = new Date().toISOString();
  const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

  db.prepare(`UPDATE workspaces SET name = ?, slug = ?, domain = ?, logoText = ? WHERE id = 'ws_acme' AND name = 'Acme Global'`).run(
    'شرکت اصفهان چالاک',
    'esfahan-chalak',
    'esfahan-chalak.ir',
    'اچ'
  );
  db.prepare(`UPDATE workspaces SET name = ?, slug = ?, domain = ?, logoText = ? WHERE id = 'ws_rnd' AND name = 'Acme R&D Lab'`).run(
    'واحد تحقیق و توسعه چالاک',
    'chalak-rnd',
    'rnd.esfahan-chalak.ir',
    'تح'
  );

  // Ensure default role_permissions rows exist
  const defaultMatrix: Record<string, Record<string, boolean>> = {
    SUPER_ADMIN: {
      'channel:create': true,
      'channel:delete': true,
      'message:post': true,
      'message:delete_any': true,
      'message:pin': true,
      'file:delete_any': true,
      'call:host': true,
      'task:assign_team': true,
      'approval:review': true,
      'backup:manage': true,
      'user:manage': true,
      'workspace:manage_roles': true,
    },
    DEPT_MANAGER: {
      'channel:create': true,
      'channel:delete': true,
      'message:post': true,
      'message:delete_any': true,
      'message:pin': true,
      'file:delete_any': true,
      'call:host': true,
      'task:assign_team': true,
      'approval:review': true,
      'backup:manage': true,
      'user:manage': false,
      'workspace:manage_roles': false,
    },
    MEMBER: {
      'channel:create': true,
      'channel:delete': false,
      'message:post': true,
      'message:delete_any': false,
      'message:pin': true,
      'file:delete_any': false,
      'call:host': true,
      'task:assign_team': false,
      'approval:review': false,
      'backup:manage': false,
      'user:manage': false,
      'workspace:manage_roles': false,
    },
    GUEST: {
      'channel:create': false,
      'channel:delete': false,
      'message:post': true,
      'message:delete_any': false,
      'message:pin': false,
      'file:delete_any': false,
      'call:host': false,
      'task:assign_team': false,
      'approval:review': false,
      'backup:manage': false,
      'user:manage': false,
      'workspace:manage_roles': false,
    },
  };

  for (const [role, perms] of Object.entries(defaultMatrix)) {
    const existing = db.prepare(`SELECT role FROM role_permissions WHERE role = ?`).get(role);
    if (!existing) {
      db.prepare(`INSERT INTO role_permissions (role, permissionsJson, updatedAt) VALUES (?, ?, ?)`).run(
        role,
        JSON.stringify(perms),
        now
      );
    }
  }

  if (!SEED_DEMO) return;

  // Seed Esfahan Chalak Approval Workflows if empty
  const approvalCount = (db.prepare(`SELECT COUNT(*) as cnt FROM approval_requests`).get() as { cnt: number }).cnt;
  if (approvalCount === 0) {
    const insAppr = db.prepare(`
      INSERT INTO approval_requests (id, requesterId, approverId, category, title, details, metricLabel, status, reviewerNote, createdAt, reviewedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insAppr.run(
      'apr_1',
      'usr_dariush',
      'usr_elena',
      'PURCHASE',
      'تأمین سرور لبه و تجهیزات شبکه مرکز داده اصفهان',
      'ارتقای سوئیچ‌های هسته و ظرفیت کلاستر پشتیبان برای سرویس‌دهی بلادرنگ شعب اصفهان چالاک.',
      '۱۸۵ میلیون تومان',
      'PENDING',
      null,
      minsAgo(140),
      null
    );
    insAppr.run(
      'apr_2',
      'usr_claire',
      'usr_marcus',
      'ACCESS',
      'درخواست دسترسی ممیزی لاگ‌های امنیتی و RBAC',
      'دسترسی موقت خواندن لاگ‌های ممیزی برای بررسی انطباق استانداردهای امنیتی سه ماهه.',
      '۷ روز کاری',
      'APPROVED',
      'تأیید شد — دسترسی ممیزی با محدودیت زمانی فعال گردید.',
      minsAgo(420),
      minsAgo(350)
    );
  }

  // Seed Daily Standup Check-ins if empty
  const standupCount = (db.prepare(`SELECT COUNT(*) as cnt FROM standup_checkins`).get() as { cnt: number }).cnt;
  if (standupCount === 0) {
    const insStandup = db.prepare(`
      INSERT INTO standup_checkins (id, userId, yesterday, today, blockers, mood, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insStandup.run(
      'st_1',
      'usr_dariush',
      'پایش پایداری کلاستر و بهینه‌سازی تاخیر وب‌سوکت زیر ۲۰ میلی‌ثانیه.',
      'تست پشتیبان‌گیری خودکار با هش SHA-256 و بررسی وضعیت نودهای اصفهان.',
      null,
      'ENERGIZED',
      minsAgo(95)
    );
    insStandup.run(
      'st_2',
      'usr_priya',
      'بازطراحی هویت بصری سفید و قرمز اصفهان چالاک و بررسی کنتراست RTL.',
      'تکمیل راهنمای کاربری تعاملی و آزمون انیمیشن‌های سیستم.',
      null,
      'FOCUSED',
      minsAgo(75)
    );
  }

  // Ensure default logoUrl on main workspace if empty
  db.prepare(
    `UPDATE workspaces SET logoUrl = '/assets/esfahan-chalak-logo.png' WHERE id = 'ws_acme' AND (logoUrl IS NULL OR logoUrl = '')`
  ).run();

  // Seed initial enterprise audit logs if empty
  const auditCount = (db.prepare(`SELECT COUNT(*) as cnt FROM audit_logs`).get() as { cnt: number }).cnt;
  if (auditCount === 0) {
    const insAudit = db.prepare(`
      INSERT INTO audit_logs (id, actorId, actorName, actorEmail, action, category, severity, targetType, targetId, targetLabel, detailsJson, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insAudit.run(
      'aud_seed_1',
      'usr_elena',
      'النا روستوا (مدیرعامل)',
      'elena.rostova@acme.io',
      'WORKSPACE_BRANDING_INIT',
      'WORKSPACE',
      'INFO',
      'workspace',
      'ws_acme',
      'شرکت اصفهان چالاک',
      JSON.stringify({ domain: 'esfahan-chalak.ir' }),
      minsAgo(320)
    );
    insAudit.run(
      'aud_seed_2',
      'usr_elena',
      'النا روستوا (مدیرعامل)',
      'elena.rostova@acme.io',
      'RBAC_MATRIX_VERIFIED',
      'RBAC',
      'WARN',
      'rbac',
      'role_permissions',
      'ماتریس دسترسی ۴ سطحی',
      JSON.stringify({ roles: ['SUPER_ADMIN', 'DEPT_MANAGER', 'MEMBER', 'GUEST'] }),
      minsAgo(210)
    );
    insAudit.run(
      'aud_seed_3',
      'usr_dariush',
      'داریوش فراهانی',
      'dariush.farahani@acme.io',
      'TASK_CREATED',
      'TASK',
      'INFO',
      'task',
      'tsk_1',
      'بازبینی پایداری کلاستر اصفهان',
      JSON.stringify({ priority: 'HIGH' }),
      minsAgo(130)
    );
    insAudit.run(
      'aud_seed_4',
      'usr_marcus',
      'مارکوس ونس',
      'marcus.vance@acme.io',
      'USER_PROFILE_UPDATED',
      'USER',
      'INFO',
      'user',
      'usr_marcus',
      'فنی و مهندسی',
      JSON.stringify({ department: 'فنی و مهندسی' }),
      minsAgo(85)
    );
    insAudit.run(
      'aud_seed_5',
      'usr_elena',
      'النا روستوا (مدیرعامل)',
      'elena.rostova@acme.io',
      'AUTH_SESSION_ACTIVE',
      'AUTH',
      'INFO',
      'user',
      'usr_elena',
      'elena.rostova@acme.io',
      JSON.stringify({ method: 'JWT' }),
      minsAgo(25)
    );
  }
}

/** Create tables, then demo data (dev) or the first admin (production). Idempotent. */
export function initDatabase(): void {
  initSchema();
  if (SEED_DEMO) seedDatabase();
  else bootstrapProduction();
  syncEsfahanChalakEnterpriseDefaults();
  if (SEED_DEMO) ensureSamplePdfArtifact();
}
