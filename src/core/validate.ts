// Friendly JSON validation: collects every problem with a readable path so the
// designer sees exactly which field is wrong (shown on screen by ErrorScene).

import type {
  ControlsConfig,
  DifficultySpec,
  GameConfig,
  LevelData,
  LevelEvent,
} from './types';
import { ERA_PALETTES } from './types';

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
  bool(o: Obj, key: string, path: string): void {
    if (typeof o[key] !== 'boolean') this.problems.push(`${path}.${key}: expected true/false`);
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
    events?.forEach((e, i) => {
      const p = `level.events[${i}]`;
      const eo = c.obj(e, p);
      if (!eo) return;
      c.num(eo, 'beat', p);
      const type = eo.type;
      if (typeof type !== 'string' || !EVENT_SCHEMAS[type]) {
        c.problems.push(`${p}.type: "${String(type)}" is unknown. Valid types: ${Object.keys(EVENT_SCHEMAS).join(', ')}`);
        return;
      }
      const schema = EVENT_SCHEMAS[type];
      for (const r of schema.required) if (eo[r] === undefined) c.problems.push(`${p} (${type} @ beat ${String(eo.beat)}): missing "${r}". ${schema.help}`);
      const known = new Set(['type', 'beat', 'only', 'comment', ...schema.required, ...schema.optional]);
      for (const k of Object.keys(eo)) if (!known.has(k)) c.problems.push(`${p} (${type}): unknown field "${k}". Allowed: ${[...known].join(', ')}`);
      if (type === 'drop' && !['boxcar', 'anvil', 'piano', 'trunk'].includes(String(eo.object))) {
        c.problems.push(`${p}.object: "${String(eo.object)}" is not valid. Use boxcar, anvil, piano or trunk`);
      }
      if (eo.only !== undefined && !Array.isArray(eo.only)) c.problems.push(`${p}.only: expected a list like ["hard"]`);
    });

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
