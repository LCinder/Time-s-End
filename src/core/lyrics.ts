import type { LyricLine } from './types';

export interface LyricWord {
  text: string;
  beat: number;
  /** When the syllable stops sounding (for the placeholder voice / mouth). */
  end: number;
  shout: boolean;
  line: number;
}

export interface ExpandedLine {
  beat: number;
  end: number;
  words: LyricWord[];
}

/** Turns lyric lines into timed words. A word prefixed with ^ is shouted. */
export function expandLyrics(lines: LyricLine[]): ExpandedLine[] {
  const sorted = [...lines].sort((a, b) => a.beat - b.beat);
  return sorted.map((l, li) => {
    const raw = l.text.trim().split(/\s+/);
    const len = l.length ?? 6;
    const at = l.at ?? raw.map((_, i) => (raw.length <= 1 ? 0 : (i * len) / raw.length));
    const words: LyricWord[] = raw.map((w, i) => {
      const shout = w.startsWith('^');
      return { text: shout ? w.slice(1) : w, beat: l.beat + at[i], end: 0, shout, line: li };
    });
    words.forEach((w, i) => {
      const next = words[i + 1];
      w.end = next ? Math.min(next.beat, w.beat + 1.5) : w.beat + (w.shout ? 1.5 : 1);
      if (next && next.beat - w.beat > 0.2) w.end = Math.min(w.end, next.beat - 0.05);
    });
    const end = words.length ? words[words.length - 1].end : l.beat + 1;
    return { beat: l.beat, end, words };
  });
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small deterministic RNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
