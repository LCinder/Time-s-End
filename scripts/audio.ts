// `npm run audio -- <boss>`: everything needed to put a boss song into the game.
//
//   1. finds the song in public/audio/<boss>/ (song.mp3, or the only audio file there)
//   2. creates the level public/data/levels/<boss>.json if it doesn't exist yet
//      (and adds it to game.json), or fixes its song.file if the audio was renamed
//   3. finds a Python with librosa + faster-whisper, or creates one the first time
//      (tools/song-analysis/.venv)
//   4. runs tools/song-analysis/sync_song.py: tempo map, beat 0 and every sung word.
//      Without a lyrics.txt it writes a draft from the transcription to start from.
//   5. runs the level checker on the result
//
// Options (after `--`):  --name "Madame Gramola"  --title "SPIN ME ROUND"  --fast
//   --passes 1..3  --bpm N  --phase-ms N  --model NAME  --no-cache  --dry-run  --no-check
// `npm run audio` alone lists the bosses found in public/audio and what each one is missing.

import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const AUDIO_DIR = join(ROOT, 'public', 'audio');
const LEVEL_DIR = join(ROOT, 'public', 'data', 'levels');
const GAME_JSON = join(ROOT, 'public', 'data', 'config', 'game.json');
const TOOLS = join(ROOT, 'tools', 'song-analysis');
const VENV = join(TOOLS, '.venv');
const AUDIO_EXT = ['.mp3', '.ogg', '.wav', '.m4a', '.flac'];
const PY_DEPS = ['librosa', 'faster-whisper', 'soundfile'];
const IS_WIN = process.platform === 'win32';

interface Options {
  boss?: string;
  name?: string;
  title?: string;
  passes?: number;
  bpm?: string;
  phaseMs?: string;
  model?: string;
  noCache: boolean;
  dryRun: boolean;
  noCheck: boolean;
}

const USAGE = `
npm run audio -- <boss> [options]

  Put the song in public/audio/<boss>/ (song.mp3, .ogg, .wav...) and, if you have them,
  the lyrics in public/audio/<boss>/lyrics.txt (one sung line per line, ^ for SHOUTED words).

  --name "Madame Gramola"   boss name shown on the title card (new levels; default from <boss>)
  --title "SPIN ME ROUND"   cartoon title (new levels; default: the boss name in capitals)
  --fast                    whisper listens once instead of three times (quicker, less reliable)
  --passes 1|2|3            how many times whisper listens (default 3)
  --bpm 134                 tempo hint if the detected tempo is double / half
  --phase-ms -25            fixed beat phase instead of the automatic one
  --model medium.en         another whisper model (slower, more accurate)
  --no-cache                transcribe again
  --dry-run                 show the report, write nothing (existing levels only)
  --no-check                skip the level checker at the end
`;

function fail(msg: string): never {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

function parseArgs(argv: string[]): Options {
  const o: Options = { noCache: false, dryRun: false, noCheck: false };
  const value = (i: number, flag: string): string => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) fail(`${flag} needs a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--help': case '-h': console.log(USAGE); process.exit(0); break;
      case '--name': o.name = value(i++, a); break;
      case '--title': o.title = value(i++, a); break;
      case '--fast': o.passes = 1; break;
      case '--passes': o.passes = Number(value(i++, a)); break;
      case '--bpm': o.bpm = value(i++, a); break;
      case '--phase-ms': o.phaseMs = value(i++, a); break;
      case '--model': o.model = value(i++, a); break;
      case '--no-cache': o.noCache = true; break;
      case '--dry-run': o.dryRun = true; break;
      case '--no-check': o.noCheck = true; break;
      default:
        if (a.startsWith('--')) fail(`unknown option ${a}${USAGE}`);
        if (o.boss) fail(`only one boss at a time (got "${o.boss}" and "${a}")`);
        o.boss = a;
    }
  }
  if (o.passes !== undefined && ![1, 2, 3].includes(o.passes)) fail('--passes must be 1, 2 or 3');
  return o;
}

/** "Madame Gramola" -> "madame-gramola" */
const slug = (s: string): string => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/** "madame-gramola" -> "Madame Gramola" */
const nameOf = (id: string): string => id.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

function audioFiles(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).filter((f) => AUDIO_EXT.some((e) => f.toLowerCase().endsWith(e))) : [];
}

function findSong(dir: string): string | null {
  const files = audioFiles(dir);
  const song = files.find((f) => /^song\./i.test(f));
  if (song) return song;
  if (files.length === 1) return files[0];
  if (files.length > 1) fail(`public/audio/${dir.split(/[\\/]/).pop()}/ has several audio files (${files.join(', ')}). Name the right one song.mp3`);
  return null;
}

function listBosses(): void {
  console.log(USAGE);
  const dirs = existsSync(AUDIO_DIR) ? readdirSync(AUDIO_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()) : [];
  if (!dirs.length) return console.log('No boss folders in public/audio yet.');
  console.log('Bosses in public/audio:');
  for (const d of dirs) {
    const dir = join(AUDIO_DIR, d.name);
    const song = audioFiles(dir)[0];
    const parts = [
      song ? `song ✔ (${song})` : 'song ✖',
      existsSync(join(dir, 'lyrics.txt')) ? 'lyrics ✔' : 'lyrics ✖ (a draft will be written)',
      existsSync(join(LEVEL_DIR, `${d.name}.json`)) ? 'level ✔' : 'level ✖ (will be created)',
    ];
    console.log(`  ${d.name.padEnd(20)} ${parts.join('   ')}`);
  }
  console.log('');
}

// ───────────────────────── level JSON ─────────────────────────

function newLevel(id: string, songFile: string, o: Options): object {
  const name = o.name ?? nameOf(id);
  return {
    id,
    title: o.title ?? name.toUpperCase(),
    subtitle: name,
    boss: id,
    type: 'chase',
    era: 'bw1928',
    song: { file: songFile, offsetMs: 0, beatsPerBar: 4, tempoMap: [{ beat: 0, bpm: 120 }], lengthBeats: 64 },
    chase: { pixelsPerBeat: 110, anchorX: 440, bossFrontX: 250, gapLeadPx: 40, autoRun: true },
    lyrics: [],
    events: [],
    placeholderMusic: { key: 'C', swing: 0.5, sections: [{ name: 'song', bars: 16, chords: ['I', 'IV', 'V7', 'I'], intensity: 2 }] },
  };
}

function registerLevel(id: string): void {
  const text = readFileSync(GAME_JSON, 'utf8');
  const levels = (JSON.parse(text) as { levels: string[] }).levels;
  if (levels.includes(id)) return;
  const updated = text.replace(/"levels"\s*:\s*\[[^\]]*\]/, `"levels": ${JSON.stringify([...levels, id]).replace(/,/g, ', ')}`);
  writeFileSync(GAME_JSON, updated);
  console.log(`· added "${id}" to public/data/config/game.json levels`);
}

// ───────────────────────── Python ─────────────────────────

function run(cmd: string, args: string[], opts: SpawnSyncOptions = {}): number {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts, env: { ...process.env, PYTHONUTF8: '1', HF_HUB_DISABLE_SYMLINKS_WARNING: '1', ...opts.env } });
  return r.error ? -1 : (r.status ?? -1);
}

function quiet(cmd: string, args: string[]): boolean {
  const r = spawnSync(cmd, args, { stdio: 'ignore' });
  return !r.error && r.status === 0;
}

type Py = { cmd: string; pre: string[] };

function findPython(): Py {
  const venvPy = IS_WIN ? join(VENV, 'Scripts', 'python.exe') : join(VENV, 'bin', 'python');
  const candidates: Py[] = [
    ...(process.env.SONG_PYTHON ? [{ cmd: process.env.SONG_PYTHON, pre: [] }] : []),
    { cmd: venvPy, pre: [] },
    { cmd: '/opt/song-venv/bin/python', pre: [] }, // cloud sessions (environment setup script)
    ...(IS_WIN ? [{ cmd: 'py', pre: ['-3'] }] : []),
    { cmd: 'python3', pre: [] },
    { cmd: 'python', pre: [] },
  ];
  const check = ['-c', 'import librosa, faster_whisper'];
  for (const c of candidates) if (quiet(c.cmd, [...c.pre, ...check])) return c;

  // first time: build tools/song-analysis/.venv
  const base = candidates.slice(-3).find((c) => quiet(c.cmd, [...c.pre, '-c', 'import sys; assert sys.version_info >= (3, 9)']));
  if (!base) fail('Python 3.9+ was not found. Install it from https://www.python.org/ (tick "Add to PATH") and run this again.');
  console.log('· first run: creating tools/song-analysis/.venv with librosa + faster-whisper (a few minutes, only once)...');
  if (run(base.cmd, [...base.pre, '-m', 'venv', VENV]) !== 0) fail('could not create the Python virtual environment');
  if (run(venvPy, ['-m', 'pip', 'install', '--upgrade', 'pip', '-q']) !== 0) fail('pip upgrade failed');
  if (run(venvPy, ['-m', 'pip', 'install', ...PY_DEPS]) !== 0) fail(`pip could not install ${PY_DEPS.join(', ')}`);
  return { cmd: venvPy, pre: [] };
}

// ───────────────────────── main ─────────────────────────

const o = parseArgs(process.argv.slice(2));
if (!o.boss) {
  listBosses();
  process.exit(0);
}
const id = slug(o.boss);
if (!id) fail(`"${o.boss}" is not a usable boss id`);
const dir = join(AUDIO_DIR, id);
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
  fail(`created public/audio/${id}/ — put the song there (song.mp3, .ogg, .wav...) and, if you have them, the lyrics as lyrics.txt. Then run: npm run audio -- ${id}`);
}
const song = findSong(dir);
if (!song) fail(`no audio file in public/audio/${id}/ — add the song (song.mp3, .ogg, .wav...)`);
const songFile = `audio/${id}/${song}`;

const levelPath = join(LEVEL_DIR, `${id}.json`);
const isNew = !existsSync(levelPath);
if (isNew) {
  if (o.dryRun) fail(`there is no level "${id}" yet; run once without --dry-run to create it`);
  writeFileSync(levelPath, JSON.stringify(newLevel(id, songFile, o), null, 2) + '\n');
  console.log(`· created public/data/levels/${id}.json ("${o.title ?? (o.name ?? nameOf(id)).toUpperCase()}" — ${o.name ?? nameOf(id)})`);
  registerLevel(id);
} else {
  const text = readFileSync(levelPath, 'utf8');
  const current = (JSON.parse(text) as { song?: { file?: string } }).song?.file;
  if (current !== songFile && !(current && existsSync(join(ROOT, 'public', current)))) {
    if (!o.dryRun) writeFileSync(levelPath, text.replace(/("file"\s*:\s*)"[^"]*"/, `$1"${songFile}"`));
    console.log(`· song.file: ${current ?? '(none)'} -> ${songFile}`);
  }
}
if (!existsSync(join(dir, 'lyrics.txt'))) console.log('· no lyrics.txt yet: a draft will be written from what whisper hears');

const py = findPython();
const args = [...py.pre, '-I', join(TOOLS, 'sync_song.py'), id];
if (isNew) args.push('--length', 'auto');
if (o.passes) args.push('--passes', String(o.passes));
if (o.bpm) args.push('--bpm', o.bpm);
if (o.phaseMs) args.push('--phase-ms', o.phaseMs);
if (o.model) args.push('--model', o.model);
if (o.noCache) args.push('--no-cache');
if (o.dryRun) args.push('--dry-run');
console.log('');
if (run(py.cmd, args) !== 0) fail('the song sync failed (see the messages above)');

if (!o.noCheck && !o.dryRun) {
  console.log('\n═══ LEVEL CHECK ═══');
  run(process.execPath, [join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(ROOT, 'scripts', 'check-levels.ts'), '--level', id]);
}

console.log(`
Next:
  · try it:   npm run dev   ->  http://localhost:5173/?level=${id}&debug=1
  · lyrics:   public/audio/${id}/lyrics.txt  (fix words marked ? or ~, pin with word@beat, run again)
  · hazards:  public/data/levels/${id}.json "events" — anchor them to sung words, e.g.
              { "type": "drop", "anchor": "PIANO", "afterBeats": 4, "snap": 1, "object": "piano", "x": "player" }
`);
