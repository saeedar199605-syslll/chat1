import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChatBackgroundStyle,
  buildDefaultRoleMatrix,
  buildOrgTree,
  canPerformAction,
  canPerformWithMatrix,
  computeAvatarCropDrawParams,
  evaluatePasswordStrength,
  extractMentions,
  filterAuditLogs,
  formatBytes,
  formatTimerClock,
  getSubordinateIds,
  parseSearchQuery,
  parseSlashCommand,
  replaceFileExtension,
  resolveGroupMemberAdditions,
  sanitizeHtmlText,
  shouldShowIosPopup,
  validateBackupBundle,
  wouldCreateOrgCycle,
} from './chatLogic';
import { filterEmojis } from './emojis';
import {
  calculateFinancialSuite,
  calculateVatBreakdown,
  diffDaysBetweenDates,
  formatAppDate,
  getJalaliMonthCalendarGrid,
  getJalaliMonthDays,
  gregorianToJalali,
  isJalaliLeapYear,
  jalaliToGregorian,
} from './jalali';
import type { User } from '../types/index';

test('RBAC permission matrix enforces announcement read-only for members and guests', () => {
  assert.equal(canPerformAction('SUPER_ADMIN', 'message:post', 'ANNOUNCEMENT'), true);
  assert.equal(canPerformAction('DEPT_MANAGER', 'message:post', 'ANNOUNCEMENT'), true);
  assert.equal(canPerformAction('MEMBER', 'message:post', 'ANNOUNCEMENT'), false);
  assert.equal(canPerformAction('GUEST', 'message:post', 'ANNOUNCEMENT'), false);
  assert.equal(canPerformAction('MEMBER', 'message:post', 'PUBLIC'), true);
  assert.equal(canPerformAction('GUEST', 'call:host', 'PUBLIC'), false);
  assert.equal(canPerformAction('DEPT_MANAGER', 'message:delete_any', 'PUBLIC'), true);
  assert.equal(canPerformAction('MEMBER', 'workspace:manage_roles', 'PUBLIC'), false);
  assert.equal(canPerformAction('SUPER_ADMIN', 'workspace:manage_roles', 'PUBLIC'), true);
});

test('canPerformWithMatrix evaluates custom role matrices and per-user overrides', () => {
  const matrix = buildDefaultRoleMatrix();
  matrix.MEMBER['task:assign_team'] = true;

  assert.equal(
    canPerformWithMatrix({ role: 'MEMBER', customPermissions: {} }, 'task:assign_team', 'PUBLIC', matrix),
    true
  );
  assert.equal(
    canPerformWithMatrix(
      { role: 'MEMBER', customPermissions: { 'task:assign_team': false } },
      'task:assign_team',
      'PUBLIC',
      matrix
    ),
    false
  );
  assert.equal(
    canPerformWithMatrix(
      { role: 'GUEST', customPermissions: { 'call:host': true } },
      'call:host',
      'PUBLIC',
      matrix
    ),
    true
  );
});

test('getSubordinateIds collects direct and indirect reports under a manager', () => {
  const users = [
    { id: 'mgr', managerId: null },
    { id: 'emp1', managerId: 'mgr' },
    { id: 'emp2', managerId: 'mgr' },
    { id: 'sub1', managerId: 'emp1' },
    { id: 'other', managerId: null },
  ];
  assert.deepEqual(getSubordinateIds(users, 'mgr').sort(), ['emp1', 'emp2', 'sub1']);
});

test('parseSlashCommand parses /poll, /task, /meet, and /status cleanly', () => {
  const poll = parseSlashCommand('/poll "Deploy window?" "Friday 6pm" "Monday 9am"');
  assert.deepEqual(poll, {
    kind: 'poll',
    question: 'Deploy window?',
    options: ['Friday 6pm', 'Monday 9am'],
  });

  const task = parseSlashCommand('/task Audit WebRTC TURN latency @marcus.vance');
  assert.deepEqual(task, {
    kind: 'task',
    title: 'Audit WebRTC TURN latency',
    assigneeHandle: 'marcus.vance',
  });

  const meet = parseSlashCommand('/meet Incident Triage');
  assert.deepEqual(meet, {
    kind: 'meet',
    topic: 'Incident Triage',
  });

  const status = parseSlashCommand('/status 🚀 Shipping v2.4');
  assert.deepEqual(status, {
    kind: 'status',
    emoji: '🚀',
    text: 'Shipping v2.4',
  });

  assert.deepEqual(parseSlashCommand('normal message'), { kind: 'none' });
});

test('parseSearchQuery extracts from:, in:, has:file, before: filters and remaining text', () => {
  const parsed = parseSearchQuery('from:@marcus in:#engineering-core has:file before:2026-12-01 WebRTC mesh');
  assert.equal(parsed.fromUser, 'marcus');
  assert.equal(parsed.inChannel, 'engineering-core');
  assert.equal(parsed.hasFile, true);
  assert.equal(parsed.beforeDate, '2026-12-01');
  assert.equal(parsed.text, 'WebRTC mesh');
});

test('extractMentions detects @channel, @here, and user handles without duplicates', () => {
  const res = extractMentions('Hey @elena and @marcus please review @channel and @elena asap');
  assert.deepEqual(res.handles, ['elena', 'marcus']);
  assert.equal(res.mentionsChannel, true);
  assert.equal(res.mentionsHere, false);
});

test('buildOrgTree constructs multi-level reporting hierarchy', () => {
  const base: Omit<User, 'id' | 'fullName' | 'displayName' | 'managerId'> = {
    email: 'a@acme.io',
    avatarUrl: null,
    jobTitle: 'Engineer',
    department: 'Eng',
    timezone: 'UTC',
    role: 'MEMBER',
    presence: 'ONLINE',
    customStatus: null,
    customEmoji: null,
    dndEnabled: false,
    dndStartHour: 19,
    dndEndHour: 8,
  };
  const users: User[] = [
    { ...base, id: 'u1', fullName: 'CEO', displayName: 'CEO', managerId: null },
    { ...base, id: 'u2', fullName: 'VP', displayName: 'VP', managerId: 'u1' },
    { ...base, id: 'u3', fullName: 'IC', displayName: 'IC', managerId: 'u2' },
  ];

  const tree = buildOrgTree(users);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].user.id, 'u1');
  assert.equal(tree[0].reports[0].user.id, 'u2');
  assert.equal(tree[0].reports[0].reports[0].user.id, 'u3');
});

test('formatBytes and sanitizeHtmlText behave deterministically', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(3 * 1024 * 1024), '3.0 MB');
  assert.equal(sanitizeHtmlText('Hello <script>alert(1)</script> world'), 'Hello  world');
});

test('wouldCreateOrgCycle detects self-management and multi-hop reporting loops', () => {
  const users = [
    { id: 'u1', managerId: null },
    { id: 'u2', managerId: 'u1' },
    { id: 'u3', managerId: 'u2' },
  ];
  assert.equal(wouldCreateOrgCycle(users, 'u1', 'u1'), true);
  assert.equal(wouldCreateOrgCycle(users, 'u1', 'u3'), true);
  assert.equal(wouldCreateOrgCycle(users, 'u3', 'u1'), false);
  assert.equal(wouldCreateOrgCycle(users, 'u2', null), false);
});

test('shouldShowIosPopup respects DND overnight quiet hours', () => {
  const user: User = {
    id: 'u1',
    email: 'u1@acme.io',
    fullName: 'Test',
    displayName: 'Test',
    avatarUrl: null,
    jobTitle: 'Eng',
    department: 'Eng',
    timezone: 'UTC',
    role: 'MEMBER',
    presence: 'ONLINE',
    customStatus: null,
    customEmoji: null,
    dndEnabled: true,
    dndStartHour: 19,
    dndEndHour: 8,
    managerId: null,
  };
  assert.equal(shouldShowIosPopup(user, 14), true);
  assert.equal(shouldShowIosPopup(user, 22), false);
  assert.equal(shouldShowIosPopup(user, 3), false);
  assert.equal(shouldShowIosPopup({ ...user, dndEnabled: false }, 22), true);
});

test('validateBackupBundle checks required relational tables and counts', () => {
  const invalid = validateBackupBundle({ schemaVersion: '1.0' });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.length > 0);

  const valid = validateBackupBundle({
    schemaVersion: '1.0.0',
    tables: {
      users: [{ id: 'u1' }],
      workspaces: [{ id: 'w1' }],
      channels: [{ id: 'c1' }],
      messages: [],
      tasks: [{ id: 't1' }, { id: 't2' }],
    },
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.counts.tasks, 2);
});

test('filterAuditLogs filters by category, severity, and search query', () => {
  const logs = [
    {
      category: 'AUTH',
      severity: 'INFO',
      actorName: 'النا روستوا',
      actorEmail: 'elena@acme.io',
      action: 'AUTH_LOGIN',
      targetLabel: 'elena@acme.io',
    },
    {
      category: 'BACKUP',
      severity: 'CRITICAL',
      actorName: 'داریوش فراهانی',
      actorEmail: 'dariush@acme.io',
      action: 'BACKUP_RESTORED',
      targetLabel: 'بازیابی پایگاه داده',
    },
  ];
  assert.equal(filterAuditLogs(logs, { category: 'BACKUP' }).length, 1);
  assert.equal(filterAuditLogs(logs, { severity: 'CRITICAL' }).length, 1);
  assert.equal(filterAuditLogs(logs, { q: 'elena' }).length, 1);
  assert.equal(filterAuditLogs(logs, { category: 'ALL', severity: 'ALL', q: '' }).length, 2);
});

test('formatTimerClock formats countdown seconds into MM:SS', () => {
  assert.equal(formatTimerClock(1500), '25:00');
  assert.equal(formatTimerClock(65), '01:05');
  assert.equal(formatTimerClock(-5), '00:00');
});

test('filterEmojis returns rich categorized and searchable bilingual emojis', () => {
  assert.ok(filterEmojis('', 'all').length >= 150);
  const work = filterEmojis('', 'work');
  assert.ok(work.length >= 20);
  const searchFa = filterEmojis('چالاک', 'all');
  assert.ok(searchFa.some((e) => e.glyph === '⚡'));
  const searchEn = filterEmojis('rocket', 'tech');
  assert.ok(searchEn.some((e) => e.glyph === '🚀'));
});

test('resolveGroupMemberAdditions separates DIRECT adds from REQUEST invites and skips existing members', () => {
  const candidates = [
    { id: 'u1', groupAddPolicy: 'DIRECT' as const },
    { id: 'u2', groupAddPolicy: 'REQUEST' as const },
    { id: 'u3', groupAddPolicy: undefined },
    { id: 'u4', groupAddPolicy: 'REQUEST' as const },
  ];
  const res = resolveGroupMemberAdditions(candidates, ['u3']);
  assert.deepEqual(res.directIds, ['u1']);
  assert.deepEqual(res.requestIds, ['u2', 'u4']);
  assert.deepEqual(res.skippedIds, ['u3']);
});

test('replaceFileExtension replaces extensions cleanly for PDF export outputs', () => {
  assert.equal(replaceFileExtension('Esfahan-Chalak-Q4-Brief.pdf', '.docx'), 'Esfahan-Chalak-Q4-Brief.docx');
  assert.equal(replaceFileExtension('report.v2.pdf', 'png'), 'report.v2.png');
  assert.equal(replaceFileExtension('document', '.docx'), 'document.docx');
});

test('Jalali <-> Gregorian calendar conversion is accurate and round-trips cleanly', () => {
  // Nowruz 1404 = March 21, 2025
  const j = gregorianToJalali(2025, 3, 21);
  assert.deepEqual(j, { jy: 1404, jm: 1, jd: 1 });
  const g = jalaliToGregorian(1404, 1, 1);
  assert.deepEqual(g, { gy: 2025, gm: 3, gd: 21 });

  const j2 = gregorianToJalali(2026, 11, 13);
  const back = jalaliToGregorian(j2.jy, j2.jm, j2.jd);
  assert.deepEqual(back, { gy: 2026, gm: 11, gd: 13 });
});

test('calculateVatBreakdown computes subtotal, 10% VAT, and total accurately', () => {
  const calc = calculateVatBreakdown(1500000, 2, 10);
  assert.equal(calc.subtotal, 3000000);
  assert.equal(calc.vatAmount, 300000);
  assert.equal(calc.total, 3300000);
});

test('Jalali monthly grid, leap year, and date formatting work accurately', () => {
  assert.equal(isJalaliLeapYear(1403), true);
  assert.equal(isJalaliLeapYear(1404), false);
  assert.equal(getJalaliMonthDays(1403, 12), 30);
  assert.equal(getJalaliMonthDays(1404, 12), 29);

  const grid = getJalaliMonthCalendarGrid(1404, 1);
  assert.equal(grid.daysInMonth, 31);
  assert.equal(grid.monthName, 'فروردین');
  assert.equal(grid.cells.length % 7, 0);

  assert.equal(diffDaysBetweenDates('2026-11-01', '2026-11-11'), 10);
  assert.equal(formatAppDate('2025-03-21T10:30:00', { calendarSystem: 'jalali' }), '1404/01/01');
});

test('calculateFinancialSuite handles discount, VAT, and Rial conversion', () => {
  const res = calculateFinancialSuite({ unitPrice: 100000, quantity: 2, discountPct: 10, vatRatePct: 10 });
  assert.equal(res.gross, 200000);
  assert.equal(res.discountAmount, 20000);
  assert.equal(res.subtotal, 180000);
  assert.equal(res.vatAmount, 18000);
  assert.equal(res.total, 198000);
  assert.equal(res.totalRial, 1980000);
});

test('evaluatePasswordStrength scores weak and strong passwords deterministically', () => {
  assert.equal(evaluatePasswordStrength('').score, 0);
  assert.equal(evaluatePasswordStrength('abc').score, 0);
  assert.equal(evaluatePasswordStrength('password1').score, 2);
  assert.equal(evaluatePasswordStrength('Chalak!2026#Secure').score, 4);
});

test('computeAvatarCropDrawParams scales contain vs cover properly and buildChatBackgroundStyle produces valid CSS', () => {
  const contain = computeAvatarCropDrawParams({
    imgWidth: 1600,
    imgHeight: 800,
    canvasSize: 512,
    zoom: 1,
    offsetX: 10,
    offsetY: -5,
    fitMode: 'contain',
  });
  assert.equal(contain.drawW, 512);
  assert.equal(contain.drawH, 256);
  assert.equal(contain.centerX, 266);

  const cover = computeAvatarCropDrawParams({
    imgWidth: 1600,
    imgHeight: 800,
    canvasSize: 512,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    fitMode: 'cover',
  });
  assert.equal(cover.drawW, 1024);
  assert.equal(cover.drawH, 512);

  const bg = buildChatBackgroundStyle({
    preset: 'custom',
    customColor: '#fecaca',
    pattern: 'dots',
    opacity: 0.9,
    isDark: false,
  });
  assert.ok(bg.backgroundImage?.includes('radial-gradient'));
});


