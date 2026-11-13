import { io } from 'socket.io-client';
const BASE = process.env.BASE || 'http://localhost:3111';
let pass = 0, fail = 0; const fails = [];
const ok = (n, c, x) => { if (c) pass++; else { fail++; fails.push(n + (x ? ' ' + JSON.stringify(x).slice(0, 200) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function login(email, password = 'Workstream!2026') { const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }); return (await r.json()).accessToken; }
const api = (tok, m, p, b) => fetch(BASE + p, { method: m, headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json());
const connect = (token) => new Promise((res) => { const s = io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false }); s.on('connect', () => res({ s, err: null })); s.on('connect_error', (e) => res({ s, err: e.message })); });
function collect(s, evs) { const log = []; for (const e of evs) s.on(e, (d) => log.push([e, d])); return log; }

const aT = await login('elena.rostova@acme.io'), mT = await login('marcus.vance@acme.io'), dT = await login('dariush.farahani@acme.io'), gT = await login('lucas.kim@acme.io');
ok('no-token rejected', (await connect(undefined)).err === 'Unauthorized');
ok('bad token rejected', (await connect('x')).err === 'Invalid token');
const A = (await connect(aT)).s, M = (await connect(mT)).s, D = (await connect(dT)).s, G = (await connect(gT)).s;
const evs = ['message:new', 'typing:update', 'audit:new', 'huddles:snapshot', 'wiki:updated', 'task:updated', 'tasks:changed', 'webrtc:offer', 'huddle:peer-joined', 'huddle:room-state', 'notification:new'];
const la = collect(A, evs), lm = collect(M, evs), ld = collect(D, evs), lg = collect(G, evs);
await sleep(300);

const prv = (await api(mT, 'POST', '/api/workspaces/ws_acme/channels', { name: 'sock-private', type: 'PRIVATE' })).channel.id;
const pub = (await api(mT, 'POST', '/api/workspaces/ws_acme/channels', { name: 'sock-public', type: 'PUBLIC' })).channel.id;
M.emit('channel:join', prv); D.emit('channel:join', prv); D.emit('channel:join', pub); G.emit('channel:join', pub); M.emit('channel:join', pub);
await sleep(300);
await api(mT, 'POST', `/api/channels/${prv}/messages`, { content: 'secret msg' });
await api(mT, 'POST', `/api/channels/${pub}/messages`, { content: 'public msg' });
await sleep(400);
ok('member of private gets message', lm.some(([e, d]) => e === 'message:new' && d.message?.content === 'secret msg'));
ok('non-member does NOT get private message', !ld.some(([e, d]) => e === 'message:new' && d.message?.content === 'secret msg'), ld.map((x) => x[0]));
ok('public channel msg reaches joined members', ld.some(([e, d]) => e === 'message:new' && d.message?.content === 'public msg') && lg.some(([e, d]) => e === 'message:new' && d.message?.content === 'public msg'));

D.emit('typing:start', { channelId: pub }); D.emit('typing:start', { channelId: prv });
await sleep(300);
ok('typing in public seen', lm.some(([e, d]) => e === 'typing:update' && d.channelId === pub));
ok('typing in private by non-member ignored', !lm.some(([e, d]) => e === 'typing:update' && d.channelId === prv));

await api(aT, 'POST', '/api/admin/broadcasts', { title: 'Sock test', message: 'broadcast body', level: 'INFO' });
await sleep(300);
ok('admin receives audit:new', la.some(([e]) => e === 'audit:new'));
ok('member does NOT receive audit:new', !lm.some(([e]) => e === 'audit:new') && !ld.some(([e]) => e === 'audit:new'));

await api(mT, 'POST', `/api/channels/${prv}/tasks`, { title: 'private task' });
await sleep(300);
ok('tasks:changed for private channel not leaked', !ld.some(([e, d]) => e === 'tasks:changed' && d.channelId === prv) && !la.some(([e, d]) => e === 'tasks:changed' && d.channelId === prv));

const before = (await api(mT, 'GET', `/api/channels/${pub}/wiki`)).wiki?.version ?? 0;
G.emit('wiki:edit', { channelId: pub, title: 'g', content: 'guest edit' });
D.emit('wiki:edit', { channelId: prv, title: 'd', content: 'intrusion' });
await sleep(300);
ok('guest wiki edit ignored', ((await api(mT, 'GET', `/api/channels/${pub}/wiki`)).wiki?.version ?? 0) === before);
ok('non-member private wiki edit ignored', !JSON.stringify((await api(mT, 'GET', `/api/channels/${prv}/wiki`)).wiki).includes('intrusion'));
D.emit('wiki:edit', { channelId: pub, title: 'ok', content: 'member edit' });
await sleep(300);
ok('member wiki edit works + broadcast', ((await api(mT, 'GET', `/api/channels/${pub}/wiki`)).wiki?.version ?? 0) === before + 1 && lm.some(([e]) => e === 'wiki:updated'));

M.emit('huddle:join', { channelId: prv, topic: 'secret huddle' });
D.emit('huddle:join', { channelId: prv, topic: 'intrude' });
await sleep(300);
const snapD = ld.filter(([e]) => e === 'huddles:snapshot').at(-1)?.[1] ?? {};
ok('private huddle not visible to non-member', !snapD[prv], snapD);
ok('non-member could not join private huddle', !lm.some(([e]) => e === 'huddle:peer-joined'));
D.emit('webrtc:offer', { channelId: prv, targetUserId: 'usr_marcus', sdp: { x: 1 } });
await sleep(300);
ok('webrtc offer from outsider dropped', !lm.some(([e]) => e === 'webrtc:offer'));
M.emit('huddle:join', { channelId: pub, topic: 'public huddle' }); D.emit('huddle:join', { channelId: pub });
await sleep(300);
D.emit('webrtc:offer', { channelId: pub, targetUserId: 'usr_marcus', sdp: { x: 1 } });
await sleep(300);
ok('webrtc offer between participants relayed', lm.some(([e]) => e === 'webrtc:offer'));
M.disconnect(); D.disconnect();
await sleep(400);
const snapA = la.filter(([e]) => e === 'huddles:snapshot').at(-1)?.[1] ?? {};
ok('huddles cleaned on disconnect', Object.keys(snapA).length === 0, snapA);
const au = await api(aT, 'POST', '/api/users/admin/create', { fullName: 'Sock Suspend', email: 'sock.s@acme.io', password: 'Str0ng!Passw0rd', jobTitle: 'job', department: 'dept', role: 'MEMBER' });
const sT = await login('sock.s@acme.io', 'Str0ng!Passw0rd');
await api(aT, 'PATCH', `/api/users/admin/${au.user.id}`, { isActive: false });
ok('suspended user socket rejected', (await connect(sT)).err !== null);
console.log(`SOCKET PASS ${pass} FAIL ${fail}`); fails.forEach((f) => console.log(' - ' + f));
process.exit(fail ? 1 : 0);
