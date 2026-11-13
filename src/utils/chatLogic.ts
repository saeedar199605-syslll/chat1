import type { ChannelType, Role, User } from '../types/index';

export type PermissionAction =
  | 'channel:create'
  | 'channel:delete'
  | 'message:post'
  | 'message:delete_any'
  | 'message:pin'
  | 'file:delete_any'
  | 'call:host'
  | 'task:assign_team'
  | 'approval:review'
  | 'backup:manage'
  | 'user:manage'
  | 'workspace:manage_roles';

export const ALL_PERMISSION_ACTIONS: PermissionAction[] = [
  'channel:create',
  'channel:delete',
  'message:post',
  'message:delete_any',
  'message:pin',
  'file:delete_any',
  'call:host',
  'task:assign_team',
  'approval:review',
  'backup:manage',
  'user:manage',
  'workspace:manage_roles',
];

const ROLE_WEIGHT: Record<Role, number> = {
  GUEST: 0,
  MEMBER: 1,
  DEPT_MANAGER: 2,
  SUPER_ADMIN: 3,
};

export type RolePermissionMatrix = Record<Role, Record<PermissionAction, boolean>>;

export function buildDefaultRoleMatrix(): RolePermissionMatrix {
  const roles: Role[] = ['SUPER_ADMIN', 'DEPT_MANAGER', 'MEMBER', 'GUEST'];
  const matrix = {} as RolePermissionMatrix;
  for (const r of roles) {
    matrix[r] = {} as Record<PermissionAction, boolean>;
    for (const a of ALL_PERMISSION_ACTIONS) {
      matrix[r][a] = canPerformAction(r, a, 'PUBLIC');
    }
  }
  return matrix;
}

export function canPerformAction(
  role: Role,
  action: PermissionAction,
  channelType: ChannelType = 'PUBLIC'
): boolean {
  if (channelType === 'ANNOUNCEMENT' && action === 'message:post') {
    return role === 'SUPER_ADMIN' || role === 'DEPT_MANAGER';
  }

  switch (action) {
    case 'message:post':
      return true;
    case 'call:host':
      return ROLE_WEIGHT[role] >= ROLE_WEIGHT.MEMBER;
    case 'channel:create':
    case 'message:pin':
      return ROLE_WEIGHT[role] >= ROLE_WEIGHT.MEMBER;
    case 'message:delete_any':
    case 'file:delete_any':
    case 'channel:delete':
    case 'task:assign_team':
    case 'approval:review':
    case 'backup:manage':
      return ROLE_WEIGHT[role] >= ROLE_WEIGHT.DEPT_MANAGER;
    case 'user:manage':
    case 'workspace:manage_roles':
      return role === 'SUPER_ADMIN';
    default:
      return false;
  }
}

export function canPerformWithMatrix(
  user: Pick<User, 'role' | 'customPermissions'> | null | undefined,
  action: PermissionAction,
  channelType: ChannelType = 'PUBLIC',
  matrix?: Partial<RolePermissionMatrix> | null
): boolean {
  if (!user) return false;
  if (channelType === 'ANNOUNCEMENT' && action === 'message:post') {
    if (user.customPermissions && typeof user.customPermissions[action] === 'boolean') {
      return user.customPermissions[action]!;
    }
    return user.role === 'SUPER_ADMIN' || user.role === 'DEPT_MANAGER';
  }
  if (user.customPermissions && typeof user.customPermissions[action] === 'boolean') {
    return user.customPermissions[action]!;
  }
  const roleRow = matrix?.[user.role];
  if (roleRow && typeof roleRow[action] === 'boolean') {
    return roleRow[action];
  }
  return canPerformAction(user.role, action, channelType);
}

export function getSubordinateIds(users: Pick<User, 'id' | 'managerId'>[], managerId: string): string[] {
  const result = new Set<string>();
  const queue = [managerId];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const u of users) {
      if (u.managerId === curr && !result.has(u.id)) {
        result.add(u.id);
        queue.push(u.id);
      }
    }
  }
  return Array.from(result);
}

export type ParsedSlashCommand =
  | { kind: 'poll'; question: string; options: string[] }
  | { kind: 'task'; title: string; assigneeHandle?: string }
  | { kind: 'meet'; topic: string }
  | { kind: 'status'; emoji: string; text: string }
  | { kind: 'none' };

function extractQuotedArgs(raw: string): string[] {
  const results: string[] = [];
  const regex = /"([^"]+)"|'([^']+)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    const val = match[1] ?? match[2] ?? match[3];
    if (val) results.push(val.trim());
  }
  return results;
}

export function parseSlashCommand(input: string): ParsedSlashCommand {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return { kind: 'none' };

  const spaceIdx = trimmed.indexOf(' ');
  const cmd = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).toLowerCase();
  const rest = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();

  if (cmd === '/poll') {
    const args = extractQuotedArgs(rest);
    if (args.length >= 3) {
      return {
        kind: 'poll',
        question: args[0],
        options: args.slice(1, 7),
      };
    }
    if (args.length >= 1) {
      return {
        kind: 'poll',
        question: args[0],
        options: ['Approve', 'Needs Discussion', 'Block'],
      };
    }
    return {
      kind: 'poll',
      question: 'Quick Team Check-in',
      options: ['Ready to proceed', 'Need more time'],
    };
  }

  if (cmd === '/task') {
    const mentionMatch = rest.match(/@([a-zA-Z0-9._-]+)/);
    const cleanedTitle = rest.replace(/@[a-zA-Z0-9._-]+/g, '').replace(/^["']|["']$/g, '').trim();
    return {
      kind: 'task',
      title: cleanedTitle || 'Follow-up Action Item',
      assigneeHandle: mentionMatch ? mentionMatch[1] : undefined,
    };
  }

  if (cmd === '/meet' || cmd === '/huddle') {
    return {
      kind: 'meet',
      topic: rest.replace(/^["']|["']$/g, '').trim() || 'Instant Sync Huddle',
    };
  }

  if (cmd === '/status') {
    const parts = rest.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { kind: 'status', emoji: '', text: '' };
    const first = parts[0];
    const hasEmoji = /\p{Extended_Pictographic}/u.test(first);
    if (hasEmoji) {
      return {
        kind: 'status',
        emoji: first,
        text: parts.slice(1).join(' '),
      };
    }
    return {
      kind: 'status',
      emoji: '💬',
      text: rest,
    };
  }

  return { kind: 'none' };
}

export interface ParsedSearchQuery {
  text: string;
  fromUser?: string;
  inChannel?: string;
  hasFile: boolean;
  beforeDate?: string;
}

export function parseSearchQuery(rawQuery: string): ParsedSearchQuery {
  let remaining = rawQuery.trim();
  let fromUser: string | undefined;
  let inChannel: string | undefined;
  let hasFile = false;
  let beforeDate: string | undefined;

  remaining = remaining.replace(/from:@?([a-zA-Z0-9._-]+)/gi, (_, u) => {
    fromUser = u.toLowerCase();
    return '';
  });

  remaining = remaining.replace(/in:#?([a-zA-Z0-9._-]+)/gi, (_, c) => {
    inChannel = c.toLowerCase();
    return '';
  });

  remaining = remaining.replace(/has:file/gi, () => {
    hasFile = true;
    return '';
  });

  remaining = remaining.replace(/before:(\d{4}-\d{2}-\d{2})/gi, (_, d) => {
    beforeDate = d;
    return '';
  });

  return {
    text: remaining.replace(/\s+/g, ' ').trim(),
    fromUser,
    inChannel,
    hasFile,
    beforeDate,
  };
}

export function extractMentions(content: string): {
  handles: string[];
  mentionsChannel: boolean;
  mentionsHere: boolean;
} {
  const handles = new Set<string>();
  let mentionsChannel = false;
  let mentionsHere = false;

  const regex = /@([a-zA-Z0-9._-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    const token = m[1].toLowerCase();
    if (token === 'channel') mentionsChannel = true;
    else if (token === 'here') mentionsHere = true;
    else handles.add(token);
  }

  return {
    handles: Array.from(handles),
    mentionsChannel,
    mentionsHere,
  };
}

export interface OrgTreeNode {
  user: User;
  reports: OrgTreeNode[];
}

export function buildOrgTree(users: User[]): OrgTreeNode[] {
  const nodeMap = new Map<string, OrgTreeNode>();
  for (const user of users) {
    nodeMap.set(user.id, { user, reports: [] });
  }

  const roots: OrgTreeNode[] = [];
  for (const user of users) {
    const node = nodeMap.get(user.id)!;
    if (user.managerId && nodeMap.has(user.managerId) && user.managerId !== user.id) {
      nodeMap.get(user.managerId)!.reports.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export function formatLocalTime(timezone: string, date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return '09:00';
  }
}

export function sanitizeHtmlText(input: string): string {
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
}

export function wouldCreateOrgCycle(
  users: Pick<User, 'id' | 'managerId'>[],
  userId: string,
  candidateManagerId: string | null
): boolean {
  if (!candidateManagerId) return false;
  if (candidateManagerId === userId) return true;

  const managerById = new Map<string, string | null>();
  for (const u of users) {
    managerById.set(u.id, u.managerId);
  }

  const visited = new Set<string>([userId]);
  let curr: string | null = candidateManagerId;
  while (curr) {
    if (visited.has(curr)) return true;
    visited.add(curr);
    curr = managerById.get(curr) ?? null;
  }
  return false;
}

export function shouldShowIosPopup(user: User | null, currentHour = new Date().getHours()): boolean {
  if (!user) return false;
  if (!user.dndEnabled) return true;

  const start = user.dndStartHour;
  const end = user.dndEndHour;
  if (start === end) return false;
  if (start < end) {
    return !(currentHour >= start && currentHour < end);
  }
  // Overnight quiet hours (e.g. 19:00 to 08:00)
  return !(currentHour >= start || currentHour < end);
}

export function validateBackupBundle(payload: unknown): {
  valid: boolean;
  errors: string[];
  counts: Record<string, number>;
} {
  const errors: string[] = [];
  const counts: Record<string, number> = {};
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Backup payload must be a JSON object'], counts };
  }
  const obj = payload as Record<string, unknown>;
  if (typeof obj.schemaVersion !== 'string' || !obj.schemaVersion) {
    errors.push('Missing schemaVersion');
  }
  if (!obj.tables || typeof obj.tables !== 'object') {
    errors.push('Missing tables object');
    return { valid: false, errors, counts };
  }

  const requiredTables = ['users', 'workspaces', 'channels', 'messages', 'tasks'];
  const tables = obj.tables as Record<string, unknown>;
  for (const tbl of requiredTables) {
    if (!Array.isArray(tables[tbl])) {
      errors.push(`Missing or invalid table array: ${tbl}`);
    } else {
      counts[tbl] = (tables[tbl] as unknown[]).length;
    }
  }
  for (const [k, v] of Object.entries(tables)) {
    if (Array.isArray(v)) counts[k] = v.length;
  }

  return { valid: errors.length === 0, errors, counts };
}

export function filterAuditLogs<
  T extends {
    category: string;
    severity: string;
    actorName: string;
    actorEmail?: string | null;
    action: string;
    targetLabel?: string | null;
    detailsJson?: string | null;
  },
>(
  logs: T[],
  filters: { category?: string; severity?: string; q?: string }
): T[] {
  const q = (filters.q || '').trim().toLowerCase();
  return logs.filter((log) => {
    if (filters.category && filters.category !== 'ALL' && log.category !== filters.category) return false;
    if (filters.severity && filters.severity !== 'ALL' && log.severity !== filters.severity) return false;
    if (!q) return true;
    return (
      log.actorName.toLowerCase().includes(q) ||
      (log.actorEmail || '').toLowerCase().includes(q) ||
      log.action.toLowerCase().includes(q) ||
      (log.targetLabel || '').toLowerCase().includes(q) ||
      (log.detailsJson || '').toLowerCase().includes(q)
    );
  });
}

export function formatTimerClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function resolveGroupMemberAdditions(
  candidates: Array<Pick<User, 'id' | 'groupAddPolicy'>>,
  existingMemberIds: string[]
): { directIds: string[]; requestIds: string[]; skippedIds: string[] } {
  const existingSet = new Set(existingMemberIds);
  const directIds: string[] = [];
  const requestIds: string[] = [];
  const skippedIds: string[] = [];
  const seen = new Set<string>();

  for (const user of candidates) {
    if (seen.has(user.id)) continue;
    seen.add(user.id);
    if (existingSet.has(user.id)) {
      skippedIds.push(user.id);
      continue;
    }
    if (user.groupAddPolicy === 'REQUEST') {
      requestIds.push(user.id);
    } else {
      directIds.push(user.id);
    }
  }
  return { directIds, requestIds, skippedIds };
}

export function replaceFileExtension(fileName: string, newExt: string): string {
  const cleanExt = newExt.startsWith('.') ? newExt : `.${newExt}`;
  const dotIdx = fileName.lastIndexOf('.');
  const base = dotIdx > 0 ? fileName.slice(0, dotIdx) : fileName;
  return `${base}${cleanExt}`;
}

export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  labelFa: string;
  labelEn: string;
  checks: {
    minLen: boolean;
    upper: boolean;
    lower: boolean;
    number: boolean;
    symbol: boolean;
  };
}

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const checks = {
    minLen: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
  let raw = 0;
  if (checks.minLen) raw++;
  if (checks.upper && checks.lower) raw++;
  if (checks.number) raw++;
  if (checks.symbol || password.length >= 12) raw++;
  const score = Math.min(4, Math.max(0, password.length === 0 ? 0 : raw)) as 0 | 1 | 2 | 3 | 4;

  const labels: Record<0 | 1 | 2 | 3 | 4, { fa: string; en: string }> = {
    0: { fa: 'وارد نشده', en: 'Empty' },
    1: { fa: 'ضعیف', en: 'Weak' },
    2: { fa: 'متوسط', en: 'Fair' },
    3: { fa: 'قوی', en: 'Strong' },
    4: { fa: 'بسیار ایمن', en: 'Very Strong' },
  };

  return {
    score,
    labelFa: labels[score].fa,
    labelEn: labels[score].en,
    checks,
  };
}

export function computeAvatarCropDrawParams(params: {
  imgWidth: number;
  imgHeight: number;
  canvasSize: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
  fitMode?: 'contain' | 'cover';
}): { drawW: number; drawH: number; centerX: number; centerY: number } {
  const safeW = Math.max(1, params.imgWidth);
  const safeH = Math.max(1, params.imgHeight);
  const size = Math.max(1, params.canvasSize);
  const fitMode = params.fitMode || 'cover';
  const baseScale =
    fitMode === 'contain' ? Math.min(size / safeW, size / safeH) : Math.max(size / safeW, size / safeH);
  const scale = baseScale * Math.max(0.25, Math.min(4, params.zoom));
  const drawW = safeW * scale;
  const drawH = safeH * scale;
  return {
    drawW,
    drawH,
    centerX: size / 2 + params.offsetX,
    centerY: size / 2 + params.offsetY,
  };
}

export type ChatBgPresetId =
  | 'default'
  | 'rose-silk'
  | 'pearl-frost'
  | 'sunset-coral'
  | 'emerald-sage'
  | 'midnight-ruby'
  | 'custom';

export type ChatBgPatternId = 'none' | 'dots' | 'grid' | 'waves';

export interface ChatBgPresetMeta {
  id: ChatBgPresetId;
  nameFa: string;
  nameEn: string;
  swatch: string;
  lightBg: string;
  darkBg: string;
}

export const CHAT_BG_PRESETS: ChatBgPresetMeta[] = [
  {
    id: 'default',
    nameFa: 'شیشه‌ای سفید و قرمز',
    nameEn: 'Liquid Glass White',
    swatch: 'linear-gradient(135deg, #ffffff 0%, #fee2e2 100%)',
    lightBg: 'transparent',
    darkBg: 'transparent',
  },
  {
    id: 'rose-silk',
    nameFa: 'ابریشم گل‌سرخ',
    nameEn: 'Rose Silk',
    swatch: 'linear-gradient(135deg, #fff1f2 0%, #fecdd3 100%)',
    lightBg: 'linear-gradient(155deg, rgba(255,241,242,0.92) 0%, rgba(254,226,226,0.82) 52%, rgba(255,255,255,0.9) 100%)',
    darkBg: 'linear-gradient(155deg, rgba(69,10,20,0.68) 0%, rgba(24,24,27,0.86) 65%)',
  },
  {
    id: 'pearl-frost',
    nameFa: 'مروارید نقره‌ای',
    nameEn: 'Pearl Frost',
    swatch: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
    lightBg: 'linear-gradient(145deg, rgba(248,250,252,0.94) 0%, rgba(241,245,249,0.88) 55%, rgba(254,242,242,0.75) 100%)',
    darkBg: 'linear-gradient(145deg, rgba(15,23,42,0.85) 0%, rgba(24,24,27,0.9) 100%)',
  },
  {
    id: 'sunset-coral',
    nameFa: 'مرجانی ملایم',
    nameEn: 'Warm Coral',
    swatch: 'linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%)',
    lightBg: 'linear-gradient(150deg, rgba(255,247,237,0.92) 0%, rgba(255,237,213,0.8) 50%, rgba(255,241,242,0.85) 100%)',
    darkBg: 'linear-gradient(150deg, rgba(67,20,7,0.58) 0%, rgba(24,24,27,0.9) 70%)',
  },
  {
    id: 'emerald-sage',
    nameFa: 'یشمی آرامش‌بخش',
    nameEn: 'Emerald Sage',
    swatch: 'linear-gradient(135deg, #ecfdf5 0%, #a7f3d0 100%)',
    lightBg: 'linear-gradient(150deg, rgba(236,253,245,0.9) 0%, rgba(209,250,229,0.72) 55%, rgba(255,255,255,0.92) 100%)',
    darkBg: 'linear-gradient(150deg, rgba(6,78,59,0.45) 0%, rgba(24,24,27,0.9) 70%)',
  },
  {
    id: 'midnight-ruby',
    nameFa: 'یاقوت و آسمان',
    nameEn: 'Sky & Ruby',
    swatch: 'linear-gradient(135deg, #eff6ff 0%, #fecaca 100%)',
    lightBg: 'linear-gradient(140deg, rgba(239,246,255,0.92) 0%, rgba(254,242,242,0.86) 55%, rgba(255,255,255,0.92) 100%)',
    darkBg: 'linear-gradient(140deg, rgba(30,41,59,0.85) 0%, rgba(69,10,10,0.55) 100%)',
  },
];

export function buildChatBackgroundStyle(params: {
  preset: ChatBgPresetId;
  customColor: string;
  pattern: ChatBgPatternId;
  opacity: number;
  isDark: boolean;
}): { background?: string; backgroundImage?: string; backgroundSize?: string } {
  const alpha = Math.max(0.15, Math.min(1, params.opacity || 0.85));
  let baseLayer = '';

  if (params.preset === 'custom') {
    const hex = /^#[0-9a-fA-F]{6}$/.test(params.customColor) ? params.customColor : '#fff1f2';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    if (params.isDark) {
      baseLayer = `linear-gradient(155deg, rgba(${Math.round(r * 0.28)}, ${Math.round(g * 0.28)}, ${Math.round(b * 0.28)}, ${alpha}) 0%, rgba(12, 12, 15, 0.92) 85%)`;
    } else {
      baseLayer = `linear-gradient(155deg, rgba(${r}, ${g}, ${b}, ${alpha}) 0%, rgba(255, 255, 255, ${Math.max(0.5, alpha * 0.85)}) 100%)`;
    }
  } else if (params.preset !== 'default') {
    const found = CHAT_BG_PRESETS.find((p) => p.id === params.preset);
    if (found) {
      baseLayer = params.isDark ? found.darkBg : found.lightBg;
    }
  }

  let patternLayer = '';
  let patternSize = '';
  const dotColor = params.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(220,38,38,0.08)';
  const lineColor = params.isDark ? 'rgba(255,255,255,0.045)' : 'rgba(220,38,38,0.055)';

  if (params.pattern === 'dots') {
    patternLayer = `radial-gradient(${dotColor} 1.25px, transparent 1.25px)`;
    patternSize = '18px 18px';
  } else if (params.pattern === 'grid') {
    patternLayer = `linear-gradient(to right, ${lineColor} 1px, transparent 1px), linear-gradient(to bottom, ${lineColor} 1px, transparent 1px)`;
    patternSize = '24px 24px';
  } else if (params.pattern === 'waves') {
    patternLayer = `radial-gradient(circle at 20% 25%, ${dotColor} 0, transparent 42%), radial-gradient(circle at 80% 75%, ${dotColor} 0, transparent 44%)`;
    patternSize = '100% 100%';
  }

  if (!baseLayer && !patternLayer) return {};
  if (patternLayer && baseLayer) {
    return {
      backgroundImage: `${patternLayer}, ${baseLayer}`,
      backgroundSize: `${patternSize}, 100% 100%`,
    };
  }
  if (patternLayer) {
    return {
      backgroundImage: patternLayer,
      backgroundSize: patternSize,
    };
  }
  return { background: baseLayer };
}


