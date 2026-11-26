// Makes sure the built game is being served on http://localhost:4173 (vite preview), starting
// it if needed. Returns a function that stops it again (only if this script started it).
const { spawn } = require('node:child_process');
const path = require('node:path');

const URL = 'http://localhost:4173/';

async function up() {
  try {
    const r = await fetch(URL);
    return r.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await up()) return () => {};
  const root = path.resolve(__dirname, '..', '..');
  const child = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { cwd: root, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) {
    if (await up()) return () => { try { process.kill(-child.pid); } catch { /* gone */ } };
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite preview did not start on :4173 (run `npm run build` first?)');
}

module.exports = { ensureServer, URL };
