// Word-anchored events: instead of a fixed `beat`, an event can say
//   "anchor": "BOXCAR", "afterBeats": 5, "snap": 1
// meaning "5 beats after the sung word BOXCAR, rounded to the nearest whole beat".
// When the song is re-synced (tools/song-analysis/sync_song.py) the lyrics move
// and every anchored hazard follows its word automatically.
//
// Anchor syntax: a word as written in the lyrics (case and punctuation are
// ignored) and, if it is sung more than once, "#n" for the n-th time (1-based,
// in song order):  "TOOT#3", "no#2", "ker-rash".

import { expandLyrics, type LyricWord } from './lyrics';
import type { LyricLine } from './types';

/** "KER-RASH!" -> "kerrash", "ain't" -> "aint", "OUT?!" -> "out" */
export function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export interface AnchorSpec {
  anchor: string;
  afterBeats?: number;
  snap?: number;
}

export type AnchorResult = { beat: number; word: LyricWord } | { error: string };

/** All sung words in song order. */
export function songWords(lyrics: LyricLine[]): LyricWord[] {
  return expandLyrics(lyrics)
    .flatMap((l) => l.words)
    .sort((a, b) => a.beat - b.beat);
}

export function resolveAnchor(words: LyricWord[], spec: AnchorSpec): AnchorResult {
  const m = /^(.*?)(?:#(\d+))?$/.exec(spec.anchor.trim());
  const key = normalizeWord(m?.[1] ?? '');
  const nth = m?.[2] ? Number(m[2]) : 1;
  if (!key) return { error: `anchor "${spec.anchor}" has no word in it` };
  const hits = words.filter((w) => normalizeWord(w.text) === key);
  if (hits.length === 0) return { error: `anchor "${spec.anchor}": the word is not in the lyrics` };
  if (nth < 1 || nth > hits.length) {
    return { error: `anchor "${spec.anchor}": the word is only sung ${hits.length} time(s) (use #1…#${hits.length})` };
  }
  const word = hits[nth - 1];
  let beat = word.beat + (spec.afterBeats ?? 0);
  if (spec.snap && spec.snap > 0) beat = Math.round(beat / spec.snap) * spec.snap;
  return { beat: Math.round(beat * 1000) / 1000, word };
}
