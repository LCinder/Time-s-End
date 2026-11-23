// `npm run art -- <boss>`: turn a pose sheet into game frames.
//
//   1. reads art/<boss>/art.json (the sheet's file name, the pose names in order,
//      and whether the poses are laid out in rows or columns)
//   2. finds a Python with Pillow + numpy, or creates one the first time (tools/art/.venv)
//   3. runs tools/art/slice_sheet.py: cuts out every pose, removes the white
//      background, lines the poses up on the wheels, adds two "line boil" copies
//      and writes public/art/<boss>/ + manifest.json, which the game loads by itself
//
// `npm run art` alone lists the characters in art/ and whether they are built.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const ART = join(ROOT, 'art');
const VENV = join(ROOT, 'tools', 'art', '.venv');
const SONG_VENV = join(ROOT, 'tools', 'song-analysis', '.venv');
const IS_WIN = process.platform === 'win32';

function fail(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

const quiet = (cmd: string, args: string[]): boolean => {
  const r = spawnSync(cmd, args, { stdio: 'ignore' });
  return !r.error && r.status === 0;
};
const run = (cmd: string, args: string[]): number => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, PYTHONUTF8: '1' } });
  return r.error ? -1 : (r.status ?? -1);
};
const venvPython = (v: string) => (IS_WIN ? join(v, 'Scripts', 'python.exe') : join(v, 'bin', 'python'));

function findPython(): { cmd: string; pre: string[] } {
  const candidates = [
    ...(process.env.ART_PYTHON ? [{ cmd: process.env.ART_PYTHON, pre: [] as string[] }] : []),
    { cmd: venvPython(VENV), pre: [] as string[] },
    { cmd: venvPython(SONG_VENV), pre: [] as string[] },
    ...(IS_WIN ? [{ cmd: 'py', pre: ['-3'] }] : []),
    { cmd: 'python3', pre: [] as string[] },
    { cmd: 'python', pre: [] as string[] },
  ];
  for (const c of candidates) if (quiet(c.cmd, [...c.pre, '-c', 'import PIL, numpy'])) return c;
  const base = candidates.slice(-3).find((c) => quiet(c.cmd, [...c.pre, '-c', 'import sys; assert sys.version_info >= (3, 9)']));
  if (!base) fail('Python 3.9+ was not found. Install it from https://www.python.org/ (tick "Add to PATH") and run this again.');
  console.log('· first run: creating tools/art/.venv with Pillow + numpy (once)...');
  if (run(base.cmd, [...base.pre, '-m', 'venv', VENV]) !== 0) fail('could not create the Python virtual environment');
  if (run(venvPython(VENV), ['-m', 'pip', 'install', '-q', 'pillow', 'numpy']) !== 0) fail('pip could not install Pillow and numpy');
  return { cmd: venvPython(VENV), pre: [] };
}

const boss = process.argv[2];
if (!boss) {
  const found = existsSync(ART) ? readdirSync(ART).filter((d) => existsSync(join(ART, d, 'art.json'))) : [];
  if (!found.length) console.log('No characters yet. Put a pose sheet in art/<boss>/ with an art.json (see art/smokestack/art.json).');
  for (const d of found) {
    const built = existsSync(join(ROOT, 'public', 'art', d, 'manifest.json'));
    console.log(`  ${d.padEnd(16)} ${built ? 'built' : 'not built yet'}   npm run art -- ${d}`);
  }
  process.exit(0);
}
if (!existsSync(join(ART, boss, 'art.json'))) fail(`art/${boss}/art.json not found (copy art/smokestack/art.json as a starting point)`);
const py = findPython();
process.exit(run(py.cmd, [...py.pre, join(ROOT, 'tools', 'art', 'slice_sheet.py'), boss]));
