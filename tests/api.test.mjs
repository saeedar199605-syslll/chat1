// Full API test. Usage: BASE=http://localhost:3111 node api-test.mjs
const BASE = process.env.BASE || 'http://localhost:3111';
let pass = 0, fail = 0;
const fails = [];
async function call(tok, method, path, body, raw) {
  const headers = {};
  if (tok) headers.Authorization = `Bearer ${tok}`;
  let b;
  if (body !== undefined && !raw) { headers['Content-Type'] = 'application/json'; b = JSON.stringify(body); }
  else if (raw) b = body;
  const r = await fetch(BASE + path, { method, headers, body: b });
  let j = null; const txt = await r.text();
  try { j = JSON.parse(txt); } catch { j = txt; }
  return { s: r.status, j };
}
function ok(name, cond, extra) {
  if (cond) pass++; else { fail++; fails.push(`${name} ${extra ? JSON.stringify(extra).slice(0, 300) : ''}`); }
}
async function expect(name, tok, method, path, body, status) {
  const r = await call(tok, method, path, body);
  ok(`${method} ${path} [${name}] want ${status} got ${r.s}`, Array.isArray(status) ? status.includes(r.s) : r.s === status, r.j);
  return r;
}
const login = async (email, password = 'Workstream!2026') => {
  const r = await call(null, 'POST', '/api/auth/login', { email, password });
  return r.j;
};

const W = 'ws_acme';
const A = await login('elena.rostova@acme.io'); // SUPER_ADMIN
ok('login admin', !!A.accessToken, A);
const M = await login('marcus.vance@acme.io'); // DEPT_MANAGER
const D = await login('dariush.farahani@acme.io'); // MEMBER
const G = await login('lucas.kim@acme.io'); // GUEST
ok('login others', M.accessToken && D.accessToken && G.accessToken);
const a = A.accessToken, m = M.accessToken, d = D.accessToken, g = G.accessToken;

// ---- Auth
await expect('bad pw', null, 'POST', '/api/auth/login', { email: 'elena.rostova@acme.io', password: 'x' }, 401);
await expect('bad body', null, 'POST', '/api/auth/login', { email: 'nope' }, 400);
await expect('no token', null, 'GET', '/api/auth/me', undefined, 401);
await expect('garbage token', 'abc', 'GET', '/api/auth/me', undefined, 401);
await expect('me', a, 'GET', '/api/auth/me', undefined, 200);
const rf = await expect('refresh', null, 'POST', '/api/auth/refresh', { refreshToken: A.refreshToken }, 200);
await expect('refresh bad', null, 'POST', '/api/auth/refresh', { refreshToken: 'zzz' }, 401);
await expect('refresh with access token', null, 'POST', '/api/auth/refresh', { refreshToken: A.accessToken }, 401);
await expect('sessions', a, 'GET', '/api/auth/sessions', undefined, 200);
const reg = await expect('register', null, 'POST', '/api/auth/register', { email: 'new.user@acme.io', password: 'Str0ng!Passw0rd', fullName: 'New User' }, [200, 201]);
await expect('register dup', null, 'POST', '/api/auth/register', { email: 'new.user@acme.io', password: 'Str0ng!Passw0rd', fullName: 'New User' }, [400, 409]);
await expect('register weak', null, 'POST', '/api/auth/register', { email: 'weak@acme.io', password: '1', fullName: 'W' }, 400);
console.log('register response:', JSON.stringify(reg.j).slice(0, 200));

// ---- Workspaces
await expect('ws list', a, 'GET', '/api/workspaces', undefined, 200);
const nw = await expect('ws create admin', a, 'POST', '/api/workspaces', { name: 'Test WS', domain: 'test.io' }, [200, 201]);
await expect('ws create guest', g, 'POST', '/api/workspaces', { name: 'Bad WS' }, 403);
await expect('ws patch admin', a, 'PATCH', `/api/workspaces/${W}`, { logoText: 'AC' }, 200);
await expect('ws patch member', d, 'PATCH', `/api/workspaces/${W}`, { name: 'Hacked' }, 403);
await expect('role change member->forbidden', d, 'PATCH', `/api/workspaces/${W}/members/usr_dariush/role`, { role: 'SUPER_ADMIN' }, 403);
await expect('role change admin', a, 'PATCH', `/api/workspaces/${W}/members/usr_claire/role`, { role: 'MEMBER' }, 200);
await expect('role invalid', a, 'PATCH', `/api/workspaces/${W}/members/usr_claire/role`, { role: 'GOD' }, 400);
{ // logo upload
  const fd = new FormData(); fd.append('logo', new Blob([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')], { type: 'image/png' }), 'l.png');
  const r = await call(a, 'POST', `/api/workspaces/${W}/logo`, fd, true); ok(`logo upload want 200 got ${r.s}`, r.s === 200, r.j);
  const fd2 = new FormData(); fd2.append('logo', new Blob(['<script>alert(1)</script>'], { type: 'text/html' }), 'x.html');
  const r2 = await call(a, 'POST', `/api/workspaces/${W}/logo`, fd2, true); ok(`logo html rejected want 4xx got ${r2.s}`, r2.s >= 400 && r2.s < 500, r2.j);
}

// ---- Channels
const ch = await expect('channels list', a, 'GET', `/api/workspaces/${W}/channels`, undefined, 200);
const chans = ch.j.channels || [];
console.log('channels:', chans.map((c) => `${c.id}:${c.type}`).join(' '));
const pub = await expect('create channel', m, 'POST', `/api/workspaces/${W}/channels`, { name: 'test-chan', description: 'x', type: 'PUBLIC' }, [200, 201]);
const CH = pub.j.channel?.id;
await expect('create channel dup', m, 'POST', `/api/workspaces/${W}/channels`, { name: 'test-chan', type: 'PUBLIC' }, [201]);
await expect('create channel guest', g, 'POST', `/api/workspaces/${W}/channels`, { name: 'g-chan', type: 'PUBLIC' }, 403);
await expect('create channel bad type', a, 'POST', `/api/workspaces/${W}/channels`, { name: 'zz', type: 'X' }, 400);
const prv = await expect('create private', m, 'POST', `/api/workspaces/${W}/channels`, { name: 'secret-chan', type: 'PRIVATE' }, [200, 201]);
const PRV = prv.j.channel?.id;
await expect('private channel hidden msgs from non-member', d, 'GET', `/api/channels/${PRV}/messages`, undefined, [403, 404]);
await expect('private channel hidden members from non-member', d, 'GET', `/api/channels/${PRV}/members`, undefined, [403, 404]);
await expect('post to private non-member', d, 'POST', `/api/channels/${PRV}/messages`, { content: 'hi' }, [403, 404]);
const lst = await call(d, 'GET', `/api/workspaces/${W}/channels`); ok('private not listed for non-member', !(lst.j.channels || []).some((c) => c.id === PRV), PRV);
const dm = await expect('open dm', d, 'POST', `/api/workspaces/${W}/dm`, { targetUserId: 'usr_claire' }, [200, 201]);
await expect('open dm self/invalid', d, 'POST', `/api/workspaces/${W}/dm`, { targetUserId: 'nope' }, [400, 404]);
const grp = await expect('create group', m, 'POST', `/api/workspaces/${W}/groups`, { name: 'grp1', description: 'd', memberIds: ['usr_dariush', 'usr_priya'] }, [200, 201]);
const GR = grp.j.channel?.id;
await expect('add members', m, 'POST', `/api/channels/${GR}/members`, { userIds: ['usr_claire'] }, [200, 201]);
await expect('add members non-member', g, 'POST', `/api/channels/${GR}/members`, { userIds: ['usr_lucas'] }, 403);
const inv = await expect('group invites (member)', d, 'GET', '/api/group-invites', undefined, 200);
for (const i of inv.j.invites || []) await expect('respond invite', d, 'POST', `/api/group-invites/${i.id}/respond`, { action: 'ACCEPT' }, 200);
await expect('respond invite bad', d, 'POST', '/api/group-invites/nope/respond', { action: 'ACCEPT' }, 404);
await expect('star', d, 'PATCH', `/api/channels/${CH}/star`, { isStarred: true }, 200);
await expect('mute', d, 'PATCH', `/api/channels/${CH}/mute`, { isMuted: true }, 200);
await expect('read', d, 'POST', `/api/channels/${CH}/read`, undefined, 200);
await expect('members list', d, 'GET', `/api/channels/${CH}/members`, undefined, 200);
await expect('topic', m, 'PATCH', `/api/channels/${CH}/topic`, { topic: 'new topic' }, 200);
await expect('topic guest', g, 'PATCH', `/api/channels/${CH}/topic`, { topic: 'x' }, 403);

// ---- Messages
const msg = await expect('post msg', m, 'POST', `/api/channels/${CH}/messages`, { content: 'hello **world** @dariush' }, [200, 201]);
const MID = msg.j.message?.id;
await expect('post empty', m, 'POST', `/api/channels/${CH}/messages`, { content: '' }, 400);
await expect('post huge', m, 'POST', `/api/channels/${CH}/messages`, { content: 'x'.repeat(200000) }, [400, 413]);
await expect('post nonexistent channel', m, 'POST', `/api/channels/nope/messages`, { content: 'x' }, [403, 404]);
const rep = await expect('reply', d, 'POST', `/api/channels/${CH}/messages`, { content: 'reply', parentId: MID }, [200, 201]);
await expect('thread', d, 'GET', `/api/messages/${MID}/thread`, undefined, 200);
await expect('get msgs', d, 'GET', `/api/channels/${CH}/messages`, undefined, 200);
await expect('edit own', m, 'PATCH', `/api/messages/${MID}`, { content: 'edited' }, 200);
await expect('edit others', d, 'PATCH', `/api/messages/${MID}`, { content: 'hax' }, 403);
await expect('react', d, 'POST', `/api/messages/${MID}/reactions`, { emoji: '👍' }, 200);
await expect('react toggle off', d, 'POST', `/api/messages/${MID}/reactions`, { emoji: '👍' }, 200);
await expect('pin', m, 'POST', `/api/messages/${MID}/pin`, undefined, 200);
await expect('pin member', d, 'POST', `/api/messages/${MID}/pin`, undefined, [200, 403]);
await expect('bookmark', d, 'POST', `/api/messages/${MID}/bookmark`, undefined, 200);
await expect('bookmarks', d, 'GET', '/api/bookmarks', undefined, 200);
await expect('forward', d, 'POST', `/api/messages/${MID}/forward`, { targetChannelId: GR }, [200, 201]);
await expect('forward to private non-member', d, 'POST', `/api/messages/${MID}/forward`, { targetChannelId: PRV }, [403, 404]);
const poll = await expect('post poll', m, 'POST', `/api/channels/${CH}/messages`, { content: 'poll', poll: { question: 'Q?', options: ['a', 'b'] } }, [200, 201]);
const pl = poll.j.message?.poll;
if (pl) {
  await expect('vote', d, 'POST', `/api/polls/${pl.id}/vote`, { optionId: pl.options[0].id }, 200);
  await expect('vote bad option', d, 'POST', `/api/polls/${pl.id}/vote`, { optionId: 'nope' }, [400, 404]);
} else ok('poll present', false, poll.j);
const tmsg = await expect('post msg with task', m, 'POST', `/api/channels/${CH}/messages`, { content: 'task msg', task: { title: 'T from msg', assigneeHandle: 'dariush' } }, [200, 201]);
await expect('archive msg', m, 'POST', `/api/messages/${MID}/archive`, undefined, 200);
await expect('unarchive msg', m, 'POST', `/api/messages/${MID}/unarchive`, undefined, 200);
await expect('delete others', d, 'DELETE', `/api/messages/${MID}`, undefined, 403);
await expect('delete own', d, 'DELETE', `/api/messages/${rep.j.message?.id}`, undefined, 200);
await expect('delete again', d, 'DELETE', `/api/messages/${rep.j.message?.id}`, undefined, [200, 404]);

// ---- Tasks
const tk = await expect('create task', m, 'POST', `/api/channels/${CH}/tasks`, { title: 'Task1', priority: 'HIGH', assigneeId: 'usr_dariush', dueDate: '2026-12-01' }, [200, 201]);
const TID = tk.j.task?.id;
await expect('task no title', m, 'POST', `/api/channels/${CH}/tasks`, { title: '' }, 400);
await expect('task bad prio', m, 'POST', `/api/channels/${CH}/tasks`, { title: 'x', priority: 'ZZ' }, 400);
await expect('tasks list', d, 'GET', '/api/tasks', undefined, 200);
await expect('tasks filter', d, 'GET', `/api/tasks?workspaceId=${W}&status=TODO&priority=HIGH`, undefined, 200);
await expect('chan tasks', d, 'GET', `/api/channels/${CH}/tasks`, undefined, 200);
await expect('task patch', d, 'PATCH', `/api/tasks/${TID}`, { status: 'DONE' }, 200);
await expect('task patch bad status', d, 'PATCH', `/api/tasks/${TID}`, { status: 'NOPE' }, 400);
await expect('task delete', m, 'DELETE', `/api/tasks/${TID}`, undefined, 200);
await expect('task delete 404', m, 'DELETE', `/api/tasks/${TID}`, undefined, 404);

// ---- Wiki
await expect('wiki get', d, 'GET', `/api/channels/${CH}/wiki`, undefined, 200);
await expect('wiki save', m, 'PUT', `/api/channels/${CH}/wiki`, { title: 'W', content: '# hi' }, 200);
await expect('wiki save guest', g, 'PUT', `/api/channels/${CH}/wiki`, { title: 'W', content: 'x' }, 403);

// ---- Files
let upl;
{
  const ps = await expect('presign', d, 'POST', '/api/uploads/presign', { channelId: CH, fileName: 'a.txt', mimeType: 'text/plain', sizeBytes: 5 }, [200, 201]);
  const url = ps.j.uploadUrl;
  if (url) {
    const r = await fetch(url.startsWith('http') ? url : BASE + url, { method: 'PUT', headers: { Authorization: `Bearer ${d}`, 'Content-Type': 'text/plain' }, body: 'hello' });
    const j = await r.json().catch(() => null); ok(`presigned PUT got ${r.status}`, r.status === 200 || r.status === 201, j); upl = j?.attachment;
  }
  await expect('presign bad channel', d, 'POST', '/api/uploads/presign', { channelId: 'nope', fileName: 'a.txt', mimeType: 'text/plain', sizeBytes: 5 }, [403, 404]);
  await expect('presign guest in non member chan', g, 'POST', '/api/uploads/presign', { channelId: PRV, fileName: 'a.txt', mimeType: 'text/plain', sizeBytes: 5 }, [403, 404]);
  const fd = new FormData(); fd.append('file', new Blob(['data'], { type: 'text/plain' }), 'b.txt'); fd.append('channelId', CH);
  const r = await call(d, 'POST', '/api/uploads', fd, true); ok(`direct upload got ${r.s}`, r.s === 200 || r.s === 201, r.j);
  const fdh = new FormData(); fdh.append('file', new Blob(['<script>1</script>'], { type: 'text/html' }), 'evil.html'); fdh.append('channelId', CH);
  const rh = await call(d, 'POST', '/api/uploads', fdh, true); console.log('html upload ->', rh.s, JSON.stringify(rh.j).slice(0, 150));
  if (rh.j?.attachment?.url) { const dr = await fetch(BASE + rh.j.attachment.url + (rh.j.attachment.url.includes('?') ? '&' : '?') + 'token=' + d); console.log('html download content-type:', dr.headers.get('content-type'), dr.headers.get('content-disposition'), dr.status); }
}
await expect('files list', d, 'GET', `/api/files?workspaceId=${W}`, undefined, 200);
await expect('files filter', d, 'GET', `/api/files?workspaceId=${W}&type=image`, undefined, 200);
if (upl) {
  await expect('download with token', d, 'GET', `/api/files/download/${upl.storageKey || upl.url.split('/').pop()}`, undefined, 200);
  await expect('delete file others', g, 'DELETE', `/api/files/${upl.id}`, undefined, [403, 404]);
  await expect('delete file own', d, 'DELETE', `/api/files/${upl.id}`, undefined, 200);
}
await expect('download traversal', d, 'GET', '/api/files/download/..%2f..%2fworkstream.db', undefined, [400, 404]);
await expect('download traversal2', d, 'GET', '/api/files/download/%2e%2e%2fworkstream.db', undefined, [400, 404]);

// ---- Search/Directory/Users
await expect('search', d, 'GET', `/api/search?q=hello&workspaceId=${W}`, undefined, 200);
await expect('search sqli', d, 'GET', `/api/search?q=${encodeURIComponent("%' OR 1=1 --")}&workspaceId=${W}`, undefined, 200);
await expect('search empty', d, 'GET', `/api/search?q=&workspaceId=${W}`, undefined, [200, 400]);
await expect('directory', d, 'GET', '/api/directory', undefined, 200);
const dr = await call(d, 'GET', '/api/directory'); ok('directory leaks passwordHash', !JSON.stringify(dr.j).includes('passwordHash') && !JSON.stringify(dr.j).includes('$2'), 'leak');
const cm = await expect('dir create (admin)', a, 'POST', '/api/directory', { fullName: 'Dir Person', email: 'dir.person@acme.io', jobTitle: 'Eng', department: 'Plat' }, [200, 201]);
await expect('dir create (member)', d, 'POST', '/api/directory', { fullName: 'Dir P2', email: 'dir2@acme.io', jobTitle: 'Eng', department: 'Plat' }, 403);
await expect('dir patch', a, 'PATCH', `/api/directory/${cm.j.user?.id}`, { jobTitle: 'Zed' }, 200);
await expect('dir patch member', d, 'PATCH', `/api/directory/usr_elena`, { jobTitle: 'Z' }, 403);
await expect('status', d, 'PATCH', '/api/users/me/status', { presence: 'AWAY', customStatus: 'brb', customEmoji: '☕' }, 200);
await expect('status bad', d, 'PATCH', '/api/users/me/status', { presence: 'WAT' }, 400);
await expect('dnd', d, 'PATCH', '/api/users/me/dnd', { dndEnabled: true, dndStartHour: 22, dndEndHour: 7 }, 200);
await expect('dnd bad', d, 'PATCH', '/api/users/me/dnd', { dndEnabled: true, dndStartHour: 99 }, 400);
await expect('group policy', d, 'PATCH', '/api/users/me/group-policy', { groupAddPolicy: 'REQUEST' }, 200);
await expect('group policy bad', d, 'PATCH', '/api/users/me/group-policy', { groupAddPolicy: 'X' }, 400);
await expect('profile', d, 'PATCH', '/api/users/me/profile', { jobTitle: 'Senior' }, 200);
{
  const fd = new FormData(); fd.append('avatar', new Blob([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')], { type: 'image/png' }), 'a.png');
  const r = await call(d, 'POST', '/api/users/me/avatar', fd, true); ok(`avatar got ${r.s}`, r.s === 200, r.j);
  const fd2 = new FormData(); fd2.append('avatar', new Blob(['<svg onload=alert(1)>'], { type: 'image/svg+xml' }), 'a.svg');
  const r2 = await call(d, 'POST', '/api/users/me/avatar', fd2, true); console.log('svg avatar ->', r2.s);
}

// ---- Notifications / emojis / archive
await expect('notifs', d, 'GET', '/api/notifications', undefined, 200);
const tn = await expect('notif test', d, 'POST', '/api/notifications/test', {}, [200, 201, 403]);
await expect('notif read-all', d, 'POST', '/api/notifications/read-all', undefined, 200);
await expect('notif read 404', d, 'POST', '/api/notifications/nope/read', undefined, [200, 404]);
await expect('emojis', d, 'GET', `/api/custom-emojis?workspaceId=${W}`, undefined, 200);
await expect('archive view', m, 'GET', `/api/archive?workspaceId=${W}`, undefined, 200);
await expect('archive chan', m, 'POST', `/api/channels/${CH}/archive`, undefined, 200);
await expect('post in archived chan', m, 'POST', `/api/channels/${CH}/messages`, { content: 'x' }, [400, 403, 409]);
await expect('unarchive chan', m, 'POST', `/api/channels/${CH}/unarchive`, undefined, 200);

// ---- Backup
const snap = await expect('snapshot create', a, 'POST', '/api/backup/snapshots', { label: 't' }, [200, 201]);
await expect('snapshot create member', d, 'POST', '/api/backup/snapshots', { label: 't' }, 403);
await expect('snapshots list', a, 'GET', '/api/backup/snapshots', undefined, 200);
await expect('snapshots list member', d, 'GET', '/api/backup/snapshots', undefined, 403);
const sid = snap.j.snapshot?.id;
await expect('snapshot download', a, 'GET', `/api/backup/snapshots/${sid}/download`, undefined, 200);
await expect('snapshot download member', d, 'GET', `/api/backup/snapshots/${sid}/download`, undefined, 403);
await expect('export', a, 'GET', '/api/backup/export', undefined, 200);
await expect('export member', d, 'GET', '/api/backup/export', undefined, 403);
await expect('verify', a, 'POST', '/api/backup/verify', { snapshotId: sid }, 200);
await expect('verify garbage', a, 'POST', '/api/backup/verify', { bundle: { x: 1 } }, [200, 400]);
await expect('restore garbage', a, 'POST', '/api/backup/restore', { bundle: { x: 1 } }, [400, 422]);
await expect('restore member', d, 'POST', '/api/backup/restore', { snapshotId: sid }, 403);

// ---- RBAC & admin users
const mx = await expect('rbac get', a, 'GET', '/api/rbac/matrix', undefined, 200);
await expect('rbac get member', d, 'GET', '/api/rbac/matrix', undefined, [200, 403]);
await expect('rbac put member', d, 'PUT', '/api/rbac/matrix', { matrix: mx.j.matrix }, 403);
await expect('rbac put admin', a, 'PUT', '/api/rbac/matrix', { matrix: mx.j.matrix }, 200);
const au = await expect('admin create user', a, 'POST', '/api/users/admin/create', { fullName: 'Adm Made', email: 'adm.made@acme.io', password: 'Str0ng!Passw0rd', jobTitle: 'job', department: 'dept', role: 'MEMBER' }, [200, 201]);
await expect('admin create weak pw', a, 'POST', '/api/users/admin/create', { fullName: 'Adm', email: 'adm2@acme.io', password: '1', jobTitle: 'job', department: 'dept', role: 'MEMBER' }, 400);
await expect('admin create member', d, 'POST', '/api/users/admin/create', { fullName: 'Adm', email: 'adm3@acme.io', password: 'Str0ng!Passw0rd', jobTitle: 'job', department: 'dept', role: 'SUPER_ADMIN' }, 403);
await expect('admin create dup email', a, 'POST', '/api/users/admin/create', { fullName: 'Adm', email: 'adm.made@acme.io', password: 'Str0ng!Passw0rd', jobTitle: 'job', department: 'dept', role: 'MEMBER' }, [400, 409]);
const nl = await login('adm.made@acme.io', 'Str0ng!Passw0rd'); ok('new admin-created user can login', !!nl.accessToken, nl);
await expect('admin update user', a, 'PATCH', `/api/users/admin/${au.j.user?.id}`, { jobTitle: 'kay', newPassword: 'An0ther!Passw0rd' }, 200);
const nl2 = await login('adm.made@acme.io', 'An0ther!Passw0rd'); ok('password reset works', !!nl2.accessToken);
await expect('admin update member', d, 'PATCH', `/api/users/admin/usr_elena`, { isActive: false }, 403);
await expect('manager escalates to superadmin', m, 'PATCH', `/api/directory/usr_marcus`, { role: 'SUPER_ADMIN' }, [400, 403]);
// suspend
await expect('suspend', a, 'PATCH', `/api/users/admin/${au.j.user?.id}`, { isActive: false }, 200);
await expect('suspended token rejected', nl2.accessToken, 'GET', '/api/auth/me', undefined, [401, 403]);
const nl3 = await call(null, 'POST', '/api/auth/login', { email: 'adm.made@acme.io', password: 'An0ther!Passw0rd' }); ok('suspended cannot login', nl3.s === 403, nl3.j);
const rfs = await call(null, 'POST', '/api/auth/refresh', { refreshToken: nl2.refreshToken }); ok(`suspended cannot refresh (got ${rfs.s})`, rfs.s >= 400, rfs.j);
await expect('last superadmin self-demote', a, 'PATCH', `/api/users/admin/usr_elena`, { role: 'MEMBER' }, [400, 403]);
await expect('last superadmin self-suspend', a, 'PATCH', `/api/users/admin/usr_elena`, { isActive: false }, [400, 403]);

// ---- Password change & session revoke (on the self-registered user)
const RU = reg.j; const ru = RU.accessToken;
await expect('pw change wrong current', ru, 'PATCH', '/api/users/me/password', { currentPassword: 'bad', newPassword: 'Str0ng!Passw0rd2' }, [400, 401, 403]);
await expect('pw change weak', ru, 'PATCH', '/api/users/me/password', { currentPassword: 'Str0ng!Passw0rd', newPassword: '1' }, 400);
const pc2 = await expect('pw change', ru, 'PATCH', '/api/users/me/password', { currentPassword: 'Str0ng!Passw0rd', newPassword: 'Str0ng!Passw0rd2' }, 200);
await expect('old refresh after pw change', null, 'POST', '/api/auth/refresh', { refreshToken: RU.refreshToken }, [401]);
const nl4 = await login('new.user@acme.io', 'Str0ng!Passw0rd2'); ok('login with new pw', !!nl4.accessToken, nl4);
await new Promise((r) => setTimeout(r, 2100));
await expect('revoke sessions', nl4.accessToken, 'POST', '/api/auth/revoke-sessions', undefined, 200);
await expect('revoked token dead', nl4.accessToken, 'GET', '/api/auth/me', undefined, 401);

// ---- Approvals / standups
const ap = await expect('approval create', d, 'POST', '/api/approvals', { category: 'LEAVE', title: 'Leave', details: 'trip' }, [200, 201]);
await expect('approval create bad cat', d, 'POST', '/api/approvals', { category: 'ZZ', title: 'x', details: 'y' }, 400);
await expect('approvals list', d, 'GET', '/api/approvals', undefined, 200);
await expect('approval self-review', d, 'PATCH', `/api/approvals/${ap.j.approval?.id}/review`, { status: 'APPROVED' }, 403);
await expect('approval review mgr', m, 'PATCH', `/api/approvals/${ap.j.approval?.id}/review`, { status: 'APPROVED', reviewerNote: 'ok' }, [200, 403]);
await expect('approval review bad status', a, 'PATCH', `/api/approvals/${ap.j.approval?.id}/review`, { status: 'PENDING' }, 400);
await expect('standup create', m, 'POST', '/api/standups', { yesterday: 'aaa', today: 'bbb', blockers: null, mood: 'ENERGIZED' }, [200, 201]);
await expect('standup bad mood', m, 'POST', '/api/standups', { yesterday: 'aaa', today: 'bbb', mood: 'ZZ' }, 400);
await expect('standups', m, 'GET', '/api/standups', undefined, 200);

// ---- Admin
await expect('overview', a, 'GET', '/api/admin/overview', undefined, 200);
await expect('overview member', d, 'GET', '/api/admin/overview', undefined, 403);
await expect('audit', a, 'GET', '/api/admin/audit-logs?category=AUTH&severity=INFO&q=login&limit=5', undefined, 200);
await expect('audit member', d, 'GET', '/api/admin/audit-logs', undefined, 403);
const bc = await expect('broadcast create', a, 'POST', '/api/admin/broadcasts', { title: 'Title', message: 'Message body', level: 'INFO' }, [200, 201]);
await expect('broadcast create member', d, 'POST', '/api/admin/broadcasts', { title: 'Title', message: 'Message body', level: 'INFO' }, 403);
await expect('broadcast bad level', a, 'POST', '/api/admin/broadcasts', { title: 'Title', message: 'Message body', level: 'ZZ' }, 400);
await expect('broadcasts active', d, 'GET', '/api/broadcasts/active', undefined, 200);
await expect('broadcasts admin', a, 'GET', '/api/admin/broadcasts', undefined, 200);
await expect('broadcast delete', a, 'DELETE', `/api/admin/broadcasts/${bc.j.broadcast?.id}`, undefined, 200);

// ---- Misc
await expect('health', null, 'GET', '/api/health', undefined, 200);
await expect('docs', null, 'GET', '/api/docs/', undefined, 200);
await expect('unknown api', a, 'GET', '/api/nope', undefined, [404]);
const bad = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad json' }); ok(`malformed json -> 400 got ${bad.status}`, bad.status === 400);
// token in query allowed on every route? check it isn't logged -- informational
// rate limit
let limited = 0; for (let i = 0; i < 40; i++) { const r = await call(null, 'POST', '/api/auth/login', { email: 'elena.rostova@acme.io', password: 'wrong' }); if (r.s === 429) limited++; }
ok('login rate limiting kicks in', limited > 0, limited);

console.log(`\nPASS ${pass}  FAIL ${fail}`);
for (const f of fails) console.log(' - ' + f);
process.exit(fail ? 1 : 0);
