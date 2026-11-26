// Friendly JSON validation: collects every problem with a readable path so the
// designer sees exactly which field is wrong (shown on screen by ErrorScene).

import type {
  ControlsConfig,
  DifficultySpec,
  DuelInfo,
  GameConfig,
  LevelData,
  LevelEvent,
  LyricLine,
  PlatformLevel,
  StoryData,
} from './types';
import { resolveAnchor, songWords } from './anchors';
import { ERA_PALETTES } from './types';
import { SCENE_SETS } from '../world/sceneSets';

export class DataError extends Error {
  constructor(public file: string, public problems: string[]) {
    super(`${file}:\n - ${problems.join('\n - ')}`);
  }
}

type Obj = Record<string, unknown>;

class Checker {
  problems: string[] = [];
  constructor(public file: string) {}

  obj(v: unknown, path: string): Obj | null {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      this.problems.push(`${path}: expected an object`);
      return null;
    }
    return v as Obj;
  }
  num(o: Obj, key: string, path: string, opts: { min?: number; max?: number; optional?: boolean } = {}): void {
    const v = o[key];
    if (v === undefined && opts.optional) return;
    if (typeof v !== 'number' || Number.isNaN(v)) {
      this.problems.push(`${path}.${key}: expected a number, got ${JSON.stringify(v)}`);
      return;
    }
    if (opts.min !== undefined && v < opts.min) this.problems.push(`${path}.${key}: must be >= ${opts.min} (got ${v})`);
    if (opts.max !== undefined && v > opts.max) this.problems.push(`${path}.${key}: must be <= ${opts.max} (got ${v})`);
  }
  str(o: Obj, key: string, path: string, opts: { optional?: boolean; oneOf?: readonly string[] } = {}): void {
    const v = o[key];
    if (v === undefined && opts.optional) return;
    if (typeof v !== 'string') {
      this.problems.push(`${path}.${key}: expected text, got ${JSON.stringify(v)}`);
      return;
    }
    if (opts.oneOf && !opts.oneOf.includes(v)) {
      this.problems.push(`${path}.${key}: "${v}" is not valid. Use one of: ${opts.oneOf.join(', ')}`);
    }
  }
  bool(o: Obj, key: string, path: string, opts: { optional?: boolean } = {}): void {
    if (opts.optional && o[key] === undefined) return;
    if (typeof o[key] !== 'boolean') this.problems.push(`${path}.${key}: expected true or false`);
  }

  arr(o: Obj, key: string, path: string, optional = false): unknown[] | null {
    const v = o[key];
    if (v === undefined && optional) return null;
    if (!Array.isArray(v)) {
      this.problems.push(`${path}.${key}: expected a list [...]`);
      return null;
    }
    return v;
  }
  done(): void {
    if (this.problems.length) throw new DataError(this.file, this.problems);
  }
}

export function validateGameConfig(raw: unknown): GameConfig {
  const c = new Checker('data/config/game.json');
  const o = c.obj(raw, 'game');
  if (o) {
    c.num(o, 'audioOffsetMs', 'game', { min: -500, max: 500 });
    c.num(o, 'inputOffsetMs', 'game', { min: -500, max: 500 });
    c.str(o, 'defaultDifficulty', 'game');
    for (const k of ['masterVolume', 'musicVolume', 'sfxVolume']) c.num(o, k, 'game', { min: 0, max: 1 });
    c.bool(o, 'vintageAudio', 'game');
    c.bool(o, 'debug', 'game');
    c.bool(o, 'bossArt', 'game', { optional: true });
    c.bool(o, 'testStage', 'game', { optional: true });
    c.arr(o, 'levels', 'game');
    const film = c.obj(o.film, 'game.film');
    if (film) for (const k of ['grain', 'scratches', 'vignette', 'weave', 'flicker']) c.num(film, k, 'game.film', { min: 0, max: 3 });
    const p = c.obj(o.player, 'game.player');
    if (p) {
      for (const k of [
        'runSpeed', 'acceleration', 'airControl', 'gravity', 'jumpVelocity', 'jumpCutMultiplier',
        'coyoteMs', 'jumpBufferMs', 'dashSpeed', 'dashMs', 'dashCooldownMs', 'invulnerableMs',
      ]) c.num(p, k, 'game.player', { min: 0 });
    }
  }
  c.done();
  return raw as GameConfig;
}

export function validateDifficulties(raw: unknown): Record<string, DifficultySpec> {
  const c = new Checker('data/config/difficulty.json');
  const o = c.obj(raw, 'difficulty');
  if (o) {
    for (const [name, v] of Object.entries(o)) {
      const d = c.obj(v, name);
      if (!d) continue;
      c.str(d, 'label', name);
      c.num(d, 'playerHits', name, { min: 1, max: 20 });
      const w = c.obj(d.hitWindowMs, `${name}.hitWindowMs`);
      if (w) {
        c.num(w, 'perfect', `${name}.hitWindowMs`, { min: 5, max: 300 });
        c.num(w, 'good', `${name}.hitWindowMs`, { min: 5, max: 400 });
      }
      c.num(d, 'onBeatJumpMultiplier', name, { min: 1, max: 3 });
      c.num(d, 'onBeatDashBonusMs', name, { min: 0, max: 2000 });
      c.num(d, 'telegraphBeats', name, { min: 0.5, max: 8 });
      c.num(d, 'hazardSpeedMultiplier', name, { min: 0.25, max: 4 });
      c.num(d, 'bossLungeMultiplier', name, { min: 0, max: 4 });
      if (d.duelLives !== undefined) c.num(d, 'duelLives', name, { min: 1, max: 9 });
    }
  }
  c.done();
  return raw as Record<string, DifficultySpec>;
}

export function validateControls(raw: unknown): ControlsConfig {
  const c = new Checker('data/config/controls.json');
  const o = c.obj(raw, 'controls');
  if (o) {
    for (const k of ['left', 'right', 'up', 'down', 'jump', 'shoot', 'parry', 'dash', 'pause', 'confirm']) {
      const a = c.arr(o, k, 'controls');
      if (a && a.some((x) => typeof x !== 'string')) c.problems.push(`controls.${k}: every key must be text, e.g. "SPACE"`);
    }
  }
  c.done();
  return raw as ControlsConfig;
}

/** Fields each event type understands. `beat` is always required. */
export const EVENT_SCHEMAS: Record<string, { required: string[]; optional: string[]; help: string }> = {
  drop: { required: ['object'], optional: ['x', 'telegraphBeats'], help: 'Object falls and lands exactly on `beat`. object: boxcar | anvil | piano | trunk. x: "player" or a screen X.' },
  lyricObject: { required: ['word'], optional: ['x', 'height', 'lifeBeats'], help: 'A sung word falls from the sky and becomes a platform at `beat`.' },
  groundWave: { required: [], optional: ['travelBeats'], help: 'Whistle shock-wave along the ground; reaches the anchor X on `beat`. Jump it!' },
  coal: { required: [], optional: ['count', 'spacingBeats', 'landX', 'hopPx'], help: 'Living coal lumps; the first lands on `beat`, then they hop toward you on every beat.' },
  smokeRing: { required: [], optional: ['x', 'travelBeats'], help: 'Smoke ring lobbed from the chimney, lands on `beat`.' },
  bossLunge: { required: [], optional: ['telegraphBeats', 'distance'], help: 'The boss surges forward, peak on `beat`. Stay ahead!' },
  gap: { required: ['lengthBeats'], optional: [], help: 'Hole in the track that the anchor X reaches on `beat`.' },
  tunnel: { required: ['lengthBeats'], optional: [], help: 'Darkness from `beat` for `lengthBeats`: only lamps light the way.' },
  sign: { required: ['text'], optional: ['x'], help: 'Road sign standing at screen X (default 1100) on `beat`.' },
  bossFall: { required: [], optional: ['crashBeat'], help: 'Final gag: the boss runs off the next gap, keeps running on thin air, notices, waves goodbye and crashes on `crashBeat` (default beat + 4).' },
  shake: { required: [], optional: ['intensity', 'durationBeats'], help: 'Camera shake.' },
  cue: { required: [], optional: [], help: 'Cue mark (checkpoint): after losing, the player can rewind to the last one passed.' },
  silence: { required: ['lengthBeats'], optional: [], help: 'Silence solo: the band stops for `lengthBeats`; only the ticking and the hazards keep the beat.' },
  ticketCheck: { required: [], optional: ['count', 'spacingBeats'], help: '"Tickets, please": a ticket appears over Tick; each on-beat jump on `beat`, `beat`+spacing… punches a hole. A valid ticket delays the train.' },
  holePunch: { required: [], optional: ['lengthBeats', 'biteBeats'], help: 'A giant ticket punch bites a hole in the track `biteBeats` (1.5) before the anchor reaches it on `beat`. Jump it like a gap.' },
  crossing: { required: [], optional: ['count', 'spacingBeats'], help: 'Level crossing(s): the barrier arm is down when Tick reaches it on `beat` (and every `spacingBeats`). Jump it.' },
  cuckoos: { required: [], optional: ['count', 'spacingBeats'], help: 'Cuckoo clocks on posts: the bird springs across the track on `beat` (and every `spacingBeats`). Jump it.' },
  pendulum: { required: [], optional: ['count', 'spacingBeats'], help: "A grandfather clock of the graveyard wakes up and swings its pendulum through the track: the bob passes Tick's spot just after `beat`. Jump it." },
  waterStop: { required: ['lengthBeats'], optional: [], help: 'The train stops at a water tower and drinks for `lengthBeats` (it drifts back off the screen and the picture darkens); then it comes back at full steam. Pairs well with a silence solo.' },
  trackSwitch: { required: ['lengthBeats'], optional: [], help: 'A points lever by the track on `beat`: the train is switched onto a far track (small, behind the scenery) for `lengthBeats`, then the tracks join again.' },
  unwindKey: { required: [], optional: ['lengthBeats', 'drainPerBeat'], help: "The conductor sticks a giant key in Tick's crown and unwinds him from `beat` for `lengthBeats` (6): the spring drains `drainPerBeat` (0.07) extra; on-beat jumps wind it back." },
  redSignal: { required: [], optional: ['holdSec'], help: 'A railway signal: as Tick reaches it on `beat` the arm drops and the song grinds to a stop (a fermata) for `holdSec` (2.4) seconds; the train brakes right behind him. Moving during the hold is a hit.' },
  timeStop: { required: [], optional: ['need'], help: 'Reward on the boss charge peaking on `beat`: with a combo of `need` (4) or more, Tick stops time for a bar and the charge is called off.' },
  tunnelListen: { required: ['listen'], optional: ['windowBeats'], help: 'In the dark the train listens: in each beat of `listen` (for `windowBeats`, 0.9) Tick must not jump or dash, or he is heard and hit. The headlamp sweeps like a searchlight.' },
  pianoKeys: { required: ['lengthBeats', 'presses'], optional: [], help: 'A piano keyboard rises out of a gap from `beat` for `lengthBeats`: its keys are the floor, and on each beat in `presses` the key Tick reaches sinks (jump it). Put a gap of the same length under it.' },
  roofRun: { required: [], optional: ['count', 'carBeats', 'couplingBeats', 'speed'], help: 'Runaway boxcars rolling ahead: Tick jumps onto the first on `beat` and over each coupling; car i is under him from `beat` + i·(carBeats 2 + couplingBeats 1). `speed` (0.3) is how fast they roll compared with Tick.' },
  ghostWatches: { required: [], optional: ['count', 'bridgeBeat'], help: 'Ghost pocket-watches rise on `beat` and follow Tick (one leaves at every hit); the ones left at `bridgeBeat` become extra stepping stones between the word stones.' },
};

export function validateLevel(raw: unknown, file: string): LevelData {
  const c = new Checker(file);
  const o = c.obj(raw, 'level');
  if (o) {
    c.str(o, 'id', 'level');
    c.str(o, 'title', 'level');
    c.str(o, 'subtitle', 'level');
    c.str(o, 'boss', 'level');
    c.str(o, 'type', 'level', { oneOf: ['chase'] });
    c.str(o, 'era', 'level', { oneOf: ERA_PALETTES });

    const s = c.obj(o.song, 'level.song');
    if (s) {
      c.str(s, 'file', 'level.song', { optional: true });
      c.num(s, 'offsetMs', 'level.song');
      c.num(s, 'beatsPerBar', 'level.song', { min: 1, max: 16 });
      c.num(s, 'lengthBeats', 'level.song', { min: 1 });
      const tm = c.arr(s, 'tempoMap', 'level.song');
      if (tm) {
        if (tm.length === 0) c.problems.push('level.song.tempoMap: needs at least one { "beat": 0, "bpm": 120 }');
        tm.forEach((t, i) => {
          const tp = c.obj(t, `level.song.tempoMap[${i}]`);
          if (tp) {
            c.num(tp, 'beat', `level.song.tempoMap[${i}]`, { min: 0 });
            c.num(tp, 'bpm', `level.song.tempoMap[${i}]`, { min: 20, max: 400 });
          }
        });
        const first = tm[0] as Obj | undefined;
        if (first && first.beat !== 0) c.problems.push('level.song.tempoMap[0].beat must be 0');
      }
    }

    const ch = c.obj(o.chase, 'level.chase');
    if (ch) {
      c.num(ch, 'pixelsPerBeat', 'level.chase', { min: 10, max: 2000 });
      c.num(ch, 'anchorX', 'level.chase', { min: 0, max: 1280 });
      c.num(ch, 'bossFrontX', 'level.chase', { min: -400, max: 1280 });
      c.num(ch, 'gapLeadPx', 'level.chase', { min: -400, max: 400 });
      c.bool(ch, 'autoRun', 'level.chase');
    }

    const lyrics = c.arr(o, 'lyrics', 'level');
    lyrics?.forEach((l, i) => {
      const p = `level.lyrics[${i}]`;
      const lo = c.obj(l, p);
      if (!lo) return;
      c.num(lo, 'beat', p);
      c.str(lo, 'text', p);
      c.num(lo, 'length', p, { optional: true, min: 0.25 });
      const at = c.arr(lo, 'at', p, true);
      if (at && typeof lo.text === 'string') {
        const words = lo.text.trim().split(/\s+/).length;
        if (at.length !== words) c.problems.push(`${p}.at: has ${at.length} numbers but the text has ${words} words ("${lo.text}")`);
        if (at.some((x) => typeof x !== 'number')) c.problems.push(`${p}.at: every entry must be a number`);
      }
    });

    const events = c.arr(o, 'events', 'level');
    const words = Array.isArray(lyrics) && lyrics.every((l) => l && typeof l === 'object' && typeof (l as Obj).text === 'string' && typeof (l as Obj).beat === 'number')
      ? songWords(lyrics as LyricLine[])
      : [];
    events?.forEach((e, i) => {
      const p = `level.events[${i}]`;
      const eo = c.obj(e, p);
      if (!eo) return;
      if (eo.anchor !== undefined) {
        // word-anchored event: the beat comes from the lyrics (see anchors.ts)
        if (eo.beat !== undefined) c.problems.push(`${p}: has both "beat" and "anchor"; use only one of them`);
        if (typeof eo.anchor !== 'string') c.problems.push(`${p}.anchor: expected a word from the lyrics, e.g. "BOXCAR" or "TOOT#2"`);
        c.num(eo, 'afterBeats', p, { optional: true });
        c.num(eo, 'snap', p, { optional: true, min: 0 });
        if (typeof eo.anchor === 'string') {
          const r = resolveAnchor(words, {
            anchor: eo.anchor,
            afterBeats: typeof eo.afterBeats === 'number' ? eo.afterBeats : 0,
            snap: typeof eo.snap === 'number' ? eo.snap : 0,
          });
          if ('error' in r) c.problems.push(`${p} (${String(eo.type)}): ${r.error}`);
          else eo.beat = r.beat;
        }
      } else {
        c.num(eo, 'beat', p);
        for (const k of ['afterBeats', 'snap']) if (eo[k] !== undefined) c.problems.push(`${p}: "${k}" only works together with "anchor"`);
      }
      const type = eo.type;
      if (typeof type !== 'string' || !EVENT_SCHEMAS[type]) {
        c.problems.push(`${p}.type: "${String(type)}" is unknown. Valid types: ${Object.keys(EVENT_SCHEMAS).join(', ')}`);
        return;
      }
      const schema = EVENT_SCHEMAS[type];
      for (const r of schema.required) if (eo[r] === undefined) c.problems.push(`${p} (${type} @ beat ${String(eo.beat)}): missing "${r}". ${schema.help}`);
      const known = new Set(['type', 'beat', 'anchor', 'afterBeats', 'snap', 'only', 'comment', ...schema.required, ...schema.optional]);
      for (const k of Object.keys(eo)) if (!known.has(k)) c.problems.push(`${p} (${type}): unknown field "${k}". Allowed: ${[...known].join(', ')}`);
      if (type === 'drop' && !['boxcar', 'anvil', 'piano', 'trunk'].includes(String(eo.object))) {
        c.problems.push(`${p}.object: "${String(eo.object)}" is not valid. Use boxcar, anvil, piano or trunk`);
      }
      if (eo.only !== undefined && !Array.isArray(eo.only)) c.problems.push(`${p}.only: expected a list like ["hard"]`);
    });

    if (o.scenery !== undefined) {
      const sc = c.obj(o.scenery, 'level.scenery');
      if (sc) {
        const stages = c.arr(sc, 'stages', 'level.scenery');
        let prev = -Infinity;
        stages?.forEach((st, i) => {
          const p = `level.scenery.stages[${i}]`;
          const so = c.obj(st, p);
          if (!so) return;
          c.num(so, 'beat', p, { min: 0 });
          c.str(so, 'set', p, { oneOf: Object.keys(SCENE_SETS) });
          c.num(so, 'dissolve', p, { optional: true, min: 0 });
          if (typeof so.beat === 'number') {
            if (so.beat < prev) c.problems.push(`${p}.beat: stages must be in order (${so.beat} comes after ${prev})`);
            prev = so.beat;
          }
        });
        if (stages && stages.length === 0) c.problems.push('level.scenery.stages: needs at least one { "beat": 0, "set": "dusk" }');
        const hours = c.arr(sc, 'hours', 'level.scenery');
        let prevBeat = -Infinity;
        hours?.forEach((hk, i) => {
          const p = `level.scenery.hours[${i}]`;
          if (!Array.isArray(hk) || hk.length !== 2 || hk.some((x) => typeof x !== 'number')) {
            c.problems.push(`${p}: expected [beat, hour], e.g. [96, 18.5] (hours go past 24 after midnight: 30 = 6 am)`);
            return;
          }
          if (hk[0] < prevBeat) c.problems.push(`${p}: the beats must go up (${hk[0]} comes after ${prevBeat})`);
          prevBeat = hk[0];
        });
        c.str(sc, 'tunnel', 'level.scenery', { optional: true, oneOf: ['brick'] });
        c.num(sc, 'nightDark', 'level.scenery', { optional: true, min: 0, max: 0.9 });
      }
    }

    const pm = c.obj(o.placeholderMusic, 'level.placeholderMusic');
    if (pm) {
      c.str(pm, 'key', 'level.placeholderMusic');
      c.num(pm, 'swing', 'level.placeholderMusic', { min: 0.5, max: 0.75 });
      const secs = c.arr(pm, 'sections', 'level.placeholderMusic');
      secs?.forEach((sec, i) => {
        const p = `level.placeholderMusic.sections[${i}]`;
        const so = c.obj(sec, p);
        if (!so) return;
        c.str(so, 'name', p);
        c.num(so, 'bars', p, { min: 1 });
        const chords = c.arr(so, 'chords', p);
        if (chords && chords.length === 0) c.problems.push(`${p}.chords: needs at least one chord`);
      });
    }
  }
  c.done();
  const level = raw as LevelData;
  level.events = [...level.events].sort((a, b) => a.beat - b.beat) as LevelEvent[];
  return level;
}

// ───────────────────────── platform levels (MAIN.md §11.6) ─────────────────────────

/** Tile legend of the ASCII maps. */
export const TILE_LEGEND: Record<string, string> = {
  ' ': 'empty',
  '.': 'empty',
  '#': 'solid block',
  '=': 'plank (jump up through it)',
  a: 'beat plank, group A (there on beats 1-2 of every bar, gone on 3-4)',
  b: 'beat plank, group B (the opposite of A)',
  M: 'platform moving left-right (3 tiles wide)',
  V: 'platform moving up-down (3 tiles wide)',
  '^': 'spikes',
  S: 'stomper: slams down on every other beat',
  B: 'sandbag: drops on the first beat of every bar',
  '*': 'film frame (collectible)',
  C: 'cue mark (checkpoint)',
  E: 'exit',
  O: 'lost object',
  T: 'text trigger (next entry of "texts")',
  W: 'word platform (next SHOUTED word of the lyrics)',
  P: 'player start',
  R: 'runaway reel start (serial)',
};

export function validatePlatformLevel(raw: unknown, file: string): PlatformLevel {
  const c = new Checker(file);
  const o = c.obj(raw, 'level');
  if (o) {
    c.str(o, 'id', 'level');
    c.str(o, 'type', 'level', { oneOf: ['platform'] });
    c.str(o, 'kind', 'level', { oneOf: ['newsreel', 'serial', 'singalong', 'memory'] });
    c.str(o, 'title', 'level');
    c.str(o, 'subtitle', 'level');
    c.str(o, 'era', 'level', { oneOf: ERA_PALETTES });
    c.num(o, 'autoscroll', 'level', { optional: true, min: 0, max: 600 });
    c.num(o, 'wordLifeBeats', 'level', { optional: true, min: 1, max: 32 });
    const m = c.obj(o.music, 'level.music');
    if (m) {
      c.num(m, 'bpm', 'level.music', { min: 40, max: 240 });
      c.num(m, 'beatsPerBar', 'level.music', { min: 2, max: 8 });
      c.bool(m, 'voice', 'level.music', { optional: true });
      const pm = c.obj(m.placeholder, 'level.music.placeholder');
      if (pm) {
        c.str(pm, 'key', 'level.music.placeholder');
        c.num(pm, 'swing', 'level.music.placeholder', { min: 0.5, max: 0.75 });
        const secs = c.arr(pm, 'sections', 'level.music.placeholder');
        if (secs && !secs.length) c.problems.push('level.music.placeholder.sections: needs at least one section');
      }
    }
    for (const k of ['texts', 'intro', 'outro']) {
      const a = c.arr(o, k, 'level', true);
      if (a && a.some((x) => typeof x !== 'string')) c.problems.push(`level.${k}: every entry must be text`);
    }
    const map = c.arr(o, 'map', 'level');
    if (map) {
      const rows = map as unknown[];
      if (rows.some((r) => typeof r !== 'string')) c.problems.push('level.map: every row must be text');
      else {
        const lines = rows as string[];
        if (lines.length < 18) c.problems.push(`level.map: needs at least 18 rows (one screen), has ${lines.length}`);
        const w = lines[0]?.length ?? 0;
        lines.forEach((r, i) => {
          if (r.length !== w) c.problems.push(`level.map[${i}]: is ${r.length} tiles wide, the first row is ${w} (all rows must be the same width)`);
          for (const ch of r) if (!(ch in TILE_LEGEND)) c.problems.push(`level.map[${i}]: unknown tile "${ch}". Known: ${Object.keys(TILE_LEGEND).join(' ')}`);
        });
        const count = (ch: string): number => lines.reduce((n, r) => n + r.split(ch).length - 1, 0);
        if (count('P') !== 1) c.problems.push(`level.map: needs exactly one P (player start), has ${count('P')}`);
        if (count('E') < 1) c.problems.push('level.map: needs an E (exit)');
        const texts = Array.isArray(o.texts) ? o.texts.length : 0;
        if (count('T') > texts) c.problems.push(`level.map: has ${count('T')} T tiles but only ${texts} "texts"`);
        if (count('O') > 0 && !o.lostObject) c.problems.push('level.map: has an O tile but no "lostObject"');
        if (o.kind === 'serial' && count('R') !== 1) c.problems.push('level.map: a serial needs exactly one R (the runaway reel)');
        if (o.kind === 'singalong') {
          const lyrics = Array.isArray(o.lyrics) ? (o.lyrics as LyricLine[]) : [];
          const shouted = lyrics.reduce((n, l) => n + (typeof l.text === 'string' ? l.text.split(/\s+/).filter((w) => w.startsWith('^')).length : 0), 0);
          if (!lyrics.length) c.problems.push('level.lyrics: a sing-along needs lyrics');
          if (count('W') !== shouted) c.problems.push(`level.map: has ${count('W')} W tiles but the lyrics have ${shouted} ^SHOUTED words (one W per shouted word)`);
        }
      }
    }
    if (o.lostObject !== undefined) {
      const lo = c.obj(o.lostObject, 'level.lostObject');
      if (lo) for (const k of ['id', 'name', 'text']) c.str(lo, k, 'level.lostObject');
    }
  }
  c.done();
  return raw as PlatformLevel;
}

/** A duel level: just what the menus and the Bijou rely on (the duel checks its own events). */
export function validateDuel(raw: unknown, file: string): DuelInfo {
  const c = new Checker(file);
  const o = c.obj(raw, 'level');
  if (o) {
    for (const k of ['id', 'title', 'subtitle']) c.str(o, k, 'level');
    c.str(o, 'type', 'level', { oneOf: ['duel'] });
    const ph = c.arr(o, 'phases', 'level');
    if (ph && !ph.length) c.problems.push('level.phases: needs at least one phase');
  }
  c.done();
  return raw as DuelInfo;
}

export function validateStory(raw: unknown, file: string): StoryData {
  const c = new Checker(file);
  const o = c.obj(raw, 'story');
  if (o) {
    c.num(o, 'secondsPerBoss', 'story', { min: 1, max: 59 });
    for (const k of ['intro', 'previously']) c.arr(o, k, 'story');
    const chs = c.arr(o, 'chapters', 'story');
    if (chs && !chs.length) c.problems.push('story.chapters: needs at least one chapter');
    chs?.forEach((ch, i) => {
      const p = `story.chapters[${i}]`;
      const co = c.obj(ch, p);
      if (!co) return;
      for (const k of ['id', 'feature', 'nowShowing', 'comingSoon']) c.str(co, k, p);
      c.num(co, 'framesNeeded', p, { min: 0 });
      c.num(co, 'minigameFrames', p, { min: 0, max: 5 });
      c.str(co, 'organGift', p, { oneOf: ['train', 'none'] });
      if (co.entry !== undefined) c.str(co, 'entry', p, { oneOf: ['screen', 'lostfound'] });
      c.arr(co, 'interludes', p);
      c.arr(co, 'endCards', p);
    });
  }
  c.done();
  return raw as StoryData;
}

