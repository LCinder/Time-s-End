// Automatic fairness check for a level ("hard but fair", MAIN.md §1).
// Runs from the command line (`npm run check`, also in CI) and in the game's
// debug mode. It never changes the level; it only reports.
//
//   error   = the level is broken (impossible jump, event outside the song...)
//   warning = probably unfair or a mistake (too little warning, hazard not sung...)

import { normalizeWord, songWords } from './anchors';
import { Conductor } from './Conductor';
import { spawnBeatOf } from './timing';
import type { DifficultySpec, LevelData, LevelEvent, PlayerTuning } from './types';

export interface CheckIssue {
  level: 'error' | 'warning';
  beat: number;
  type: string;
  message: string;
  /** Difficulty the issue applies to (absent = all). */
  difficulty?: string;
}

export interface CheckRules {
  /** Minimum time between a hazard appearing and hitting (seconds). */
  minWarningSec: number;
  /** Two hazards that each need a reaction closer than this (seconds) are flagged. */
  minReactionGapSec: number;
  /** A drop must be announced by its word within this many beats before landing. */
  announceWithinBeats: number;
  /** A lyricObject's word must be sung within this many beats of the event. */
  lyricWordWithinBeats: number;
  /** Hazards should land on this grid (beats). */
  grid: number;
}

export const DEFAULT_RULES: CheckRules = {
  minWarningSec: 0.6,
  minReactionGapSec: 0.3,
  announceWithinBeats: 8,
  lyricWordWithinBeats: 2,
  grid: 0.5,
};

/** Hazards that hit the player at `beat` unless they react (coal lands far away and
 *  hops over several beats, words are platforms: neither needs a reaction at `beat`). */
const ACTION_TYPES = new Set(['gap', 'drop', 'groundWave', 'smokeRing', 'bossLunge']);
/** Hazards whose arrival should be on the musical grid. */
const ON_GRID_TYPES = new Set(['gap', 'drop', 'groundWave', 'smokeRing', 'bossLunge', 'coal']);
/** Footing the player gets for free at both edges of a gap (half the body, roughly). */
const EDGE_LENIENCY_PX = 28;

export function checkLevel(
  level: LevelData,
  difficulties: Record<string, DifficultySpec>,
  player: PlayerTuning,
  rules: CheckRules = DEFAULT_RULES,
): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const add = (lvl: CheckIssue['level'], e: LevelEvent, message: string, difficulty?: string): void => {
    issues.push({ level: lvl, beat: e.beat, type: e.type, message, difficulty });
  };
  const conductor = new Conductor(level.song.tempoMap, level.song.beatsPerBar);
  const secBetween = (a: number, b: number): number => conductor.beatToSec(b) - conductor.beatToSec(a);
  const words = songWords(level.lyrics);
  const len = level.song.lengthBeats;
  const ppb = level.chase.pixelsPerBeat;
  const fall = level.events.find((e) => e.type === 'bossFall');

  // ── per event, independent of difficulty
  for (const e of level.events) {
    if (e.beat < 0 || e.beat > len) add('error', e, `happens at beat ${fmt(e.beat)}, outside the song (0–${len})`);
    if (ON_GRID_TYPES.has(e.type) && !onGrid(e.beat, rules.grid)) {
      add('warning', e, `lands at beat ${fmt(e.beat)}, off the ${rules.grid}-beat grid: it won't feel on the beat`);
    }

    if (e.type === 'lyricObject') {
      const key = normalizeWord(String(e.word ?? ''));
      const near = words.some((w) => normalizeWord(w.text) === key && Math.abs(w.beat - e.beat) <= rules.lyricWordWithinBeats);
      if (!near) add('warning', e, `the word "${String(e.word)}" is not sung within ${rules.lyricWordWithinBeats} beats of beat ${fmt(e.beat)}`);
    }

    if (e.type === 'drop') {
      const key = normalizeWord(String(e.object ?? ''));
      const sung = words.some((w) => normalizeWord(w.text) === key && w.beat <= e.beat && w.beat >= e.beat - rules.announceWithinBeats);
      if (!sung) add('warning', e, `the ${String(e.object)} is not announced: "${String(e.object).toUpperCase()}" is not sung in the ${rules.announceWithinBeats} beats before it lands`);
    }

    if (e.type === 'gap') {
      const lengthBeats = Number(e.lengthBeats);
      const gapPx = lengthBeats * ppb - EDGE_LENIENCY_PX;
      const platforms = level.events.some(
        (o) => o.type === 'lyricObject' && o.beat >= e.beat - 2 && o.beat <= e.beat + lengthBeats,
      );
      if (platforms) continue; // stepping stones (the final chasm): not a plain jump
      const air = (2 * player.jumpVelocity) / player.gravity;
      const camSpeed = ppb / conductor.secondsPerBeat(e.beat);
      const relaxed = camSpeed * air; // just jumping, no → held
      const pushed = (camSpeed + player.runSpeed) * air; // holding → the whole jump
      if (gapPx > pushed) add('error', e, `${fmt(lengthBeats)}-beat gap (${Math.round(lengthBeats * ppb)} px) can't be jumped even holding → (max ~${Math.round(pushed)} px)`);
      else if (gapPx > relaxed) add('warning', e, `${fmt(lengthBeats)}-beat gap (${Math.round(lengthBeats * ppb)} px) needs → held while jumping (a plain jump covers ~${Math.round(relaxed)} px)`);
    }

    if (fall && e.beat > (typeof fall.crashBeat === 'number' ? fall.crashBeat : fall.beat + 4) && (ACTION_TYPES.has(e.type) || e.type === 'coal') && e.type !== 'gap') {
      add('warning', e, 'happens after the boss has crashed (bossFall)');
    }
  }

  // ── per difficulty: warning time and crowding
  for (const [name, diff] of Object.entries(difficulties)) {
    const events = level.events.filter((e) => !e.only || e.only.includes(name));
    for (const e of events) {
      if (!ACTION_TYPES.has(e.type) || e.type === 'gap') continue; // gaps are visible from far away
      const spawn = spawnBeatOf(e, diff);
      if (spawn < e.beat) {
        const warn = secBetween(spawn, e.beat);
        if (warn < rules.minWarningSec) {
          add('warning', e, `only ${Math.round(warn * 1000)} ms of warning (minimum ${Math.round(rules.minWarningSec * 1000)} ms)`, name);
        }
        if (spawn < 0) add('warning', e, `starts warning at beat ${fmt(spawn)}, before the song begins`, name);
      }
    }
    const actions = events.filter((e) => ACTION_TYPES.has(e.type)).sort((a, b) => a.beat - b.beat);
    for (let i = 1; i < actions.length; i++) {
      const a = actions[i - 1];
      const b = actions[i];
      if (a.type === b.type && a.type === 'gap') continue; // gap runs are designed as sequences
      const gap = secBetween(a.beat, b.beat);
      if (gap < rules.minReactionGapSec) {
        add('warning', b, `only ${Math.round(gap * 1000)} ms after the ${a.type} at beat ${fmt(a.beat)}: two reactions almost at once`, name);
      }
    }
  }

  // same issue reported for every difficulty -> report once
  const seen = new Map<string, CheckIssue>();
  for (const i of issues) {
    const k = `${i.level}|${i.beat}|${i.type}|${i.message}`;
    const prev = seen.get(k);
    if (!prev) seen.set(k, i);
    else if (prev.difficulty !== i.difficulty) prev.difficulty = undefined;
  }
  return [...seen.values()].sort((a, b) => a.beat - b.beat || (a.level === 'error' ? -1 : 1));
}

export function formatIssue(i: CheckIssue): string {
  const where = `beat ${fmt(i.beat).padStart(6)}  ${i.type.padEnd(11)}`;
  const diff = i.difficulty ? ` [${i.difficulty}]` : '';
  return `${i.level === 'error' ? 'ERROR  ' : 'warning'}  ${where} ${i.message}${diff}`;
}

function onGrid(beat: number, grid: number): boolean {
  const r = beat / grid;
  return Math.abs(r - Math.round(r)) < 1e-6;
}

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}
