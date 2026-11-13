// Starts the server on a throwaway data dir, runs the Socket.IO + API suites, stops the server.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = process.env.TEST_PORT || '3111';
const BASE = `http://localhost:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workstream-test-'));

const server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
  env: { ...process.env, NODE_ENV: 'development', PORT, DATA_DIR: dataDir },
  stdio: ['ignore', 'inherit', 'inherit'],
});

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not start');
}

function run(file) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, ['--import', 'tsx', path.join('tests', file)], { env: { ...process.env, BASE }, stdio: 'inherit' });
    p.on('exit', (code) => resolve(code ?? 1));
  });
}

let code = 1;
try {
  await waitForServer();
  const results = [await run('socket.test.mjs'), await run('api.test.mjs')];
  code = results.every((c) => c === 0) ? 0 : 1;
} finally {
  server.kill();
  await new Promise((r) => (server.exitCode !== null ? r() : server.once('exit', r)));
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {} // Windows may still hold the SQLite file briefly; it's a temp dir
}
process.exit(code);
