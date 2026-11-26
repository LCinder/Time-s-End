// `npm run art -- <id>`: turn a character's parts sheet into a game puppet, automatically.
//
//   1. reads art/<id>/art.json (the sheet's file name and the parts in the order they were drawn)
//   2. finds a Python with Pillow + numpy, or creates one the first time (tools/art/.venv)
//   3. runs tools/art/slice_sheet.py: cuts every part out, removes the white background,
//      finds the face plate, the wheels, the top (smokestack/head), the ground and the nose
//      by itself, writes public/art/<id>/ + manifest.json (the game loads it on its own)
//      and draws art/<id>/preview.png to check what it found
//
//   4. if art/<id>/textures.json lists scenery and object sheets, cuts those too
//      (tools/art/slice_textures.py → public/art/textures/): the game uses each one in place
//      of its code-drawn texture of the same name
//
// `npm run art -- new <id> [--desc "..."]` starts a new character: art/<id>/ with the
// prompt for the image AI (PROMPT.txt) and its art.json.
// `npm run art` alone lists the characters in art/ and whether they are built.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
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

// ───────────────────────── npm run art -- new <id> ─────────────────────────

function scaffold(args: string[]): never {
  const id = (args[0] ?? '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
  if (!id) fail('usage: npm run art -- new <id> [--desc "what the character is"] [--no-wheel] [--no-hat] [--no-mustache]');
  const opt = (k: string) => args.includes(k);
  const di = args.indexOf('--desc');
  const desc = di >= 0 && args[di + 1] ? args[di + 1] : 'a sinister cartoon villain';
  const dir = join(ART, id);
  if (existsSync(join(dir, 'art.json'))) fail(`art/${id}/ already exists`);
  mkdirSync(dir, { recursive: true });
  const parts = ['body', ...(opt('--no-hat') ? [] : ['hat']), ...(opt('--no-mustache') ? [] : ['mustache']), 'gloveOpen', 'gloveFist', 'glovePoint', ...(opt('--no-wheel') ? [] : ['wheel'])];
  const what: Record<string, string> = {
    body: 'the body: NO arms, NO hat, and the face area is a big round light-grey plate, completely blank and empty (no eyes, no eyebrows, no nose, no mustache, no mouth)',
    hat: 'its hat (or whatever it wears on top)',
    mustache: 'a big moustache (or another accessory that sits on the face under the nose)',
    gloveOpen: 'a white four-finger cartoon glove, open hand',
    gloveFist: 'the same glove as a clenched fist',
    glovePoint: 'the same glove pointing up with the index finger',
    wheel: 'one of its wheels, seen straight from the side',
  };
  const prompt = `Character parts sheet for a 2D game puppet, original cartoon character, authentic 1930s rubber hose animation style: thick black ink outlines, flat grey tones, black and white, no gradients, simple bold shapes with few details so it is easy to animate.

The character is ${desc}, seen from the side in three-quarter view, facing right.

Draw these parts separately on the same sheet, in this order (left to right, top to bottom), each one alone with lots of empty white space around it, nothing touching, all at the same scale:
${parts.map((p, i) => `${i + 1}. ${what[p]}`).join('\n')}

Plain pure white background, no shadows, no text, no labels. Highest resolution.
`;
  writeFileSync(join(dir, 'PROMPT.txt'), prompt);
  writeFileSync(
    join(dir, 'art.json'),
    JSON.stringify({ comment: `Parts sheet for "${id}" (see PROMPT.txt). Save the AI's picture here as parts.png (or .jpg and change "sheet"), then run: npm run art -- ${id}`, type: 'parts', sheet: 'parts.png', scale: 2, facing: 'right', parts }, null, 2) + '\n',
  );
  console.log(`✓ created art/${id}/
  1. Give art/${id}/PROMPT.txt to your image AI.
  2. Save the picture it makes as art/${id}/parts.png
  3. Run: npm run art -- ${id}
     (it cuts the parts, finds the face, wheels, top, ground and nose by itself, and draws art/${id}/preview.png to check)
  4. See it alive: npm run dev, then open http://localhost:5173/?puppet=${id}`);
  process.exit(0);
}

const boss = process.argv[2];
if (boss === 'new') scaffold(process.argv.slice(3));
if (!boss) {
  const found = existsSync(ART) ? readdirSync(ART).filter((d) => existsSync(join(ART, d, 'art.json')) || existsSync(join(ART, d, 'textures.json'))) : [];
  if (!found.length) console.log('No characters yet. Put a pose sheet in art/<boss>/ with an art.json (see art/smokestack/art.json).');
  for (const d of found) {
    const built = existsSync(join(ROOT, 'public', 'art', d, 'manifest.json')) || existsSync(join(ROOT, 'public', 'art', 'textures', 'index.json'));
    console.log(`  ${d.padEnd(16)} ${built ? 'built' : 'not built yet'}   npm run art -- ${d}`);
  }
  process.exit(0);
}
const hasPuppet = existsSync(join(ART, boss, 'art.json'));
const hasTextures = existsSync(join(ART, boss, 'textures.json'));
if (!hasPuppet && !hasTextures) fail(`art/${boss}/ has no art.json (the character) nor textures.json (scenery and objects)`);
const py = findPython();
// the character's parts sheet, then the scenery and object sheets (whichever are there)
if (hasPuppet) {
  const code = run(py.cmd, [...py.pre, join(ROOT, 'tools', 'art', 'slice_sheet.py'), boss]);
  if (code !== 0) process.exit(code);
}
if (hasTextures) process.exit(run(py.cmd, [...py.pre, join(ROOT, 'tools', 'art', 'slice_textures.py'), boss]));
