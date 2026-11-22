// Roman-numeral chord parsing for the placeholder band.
// Uppercase = major, lowercase = minor, "7" = seventh, "dim" = diminished, "b" prefix = flat degree.

const DEGREES: Record<string, number> = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };
const KEYS: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

export interface Chord {
  /** Root as MIDI note in octave 3 (48..59). */
  root: number;
  /** Intervals from the root in semitones (root included). */
  intervals: number[];
}

export function keyPitchClass(key: string): number {
  const pc = KEYS[key];
  if (pc === undefined) throw new Error(`Unknown key "${key}". Use C, D, Eb, G, Bb...`);
  return pc;
}

export function parseChord(symbol: string, key: string): Chord {
  const m = /^(b?)(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(maj7|7|dim|aug)?$/.exec(symbol.trim());
  if (!m) throw new Error(`Chord "${symbol}" not understood. Use roman numerals like I, ii, IV, V7, vi, bVII`);
  const [, flat, numeral, suffix] = m;
  const minor = numeral === numeral.toLowerCase();
  let semis = DEGREES[numeral.toUpperCase()];
  if (flat) semis -= 1;
  const root = 48 + ((keyPitchClass(key) + semis + 12) % 12);
  let intervals: number[];
  if (suffix === 'dim') intervals = [0, 3, 6];
  else if (suffix === 'aug') intervals = [0, 4, 8];
  else if (suffix === 'maj7') intervals = [0, 4, 7, 11];
  else if (suffix === '7') intervals = minor ? [0, 3, 7, 10] : [0, 4, 7, 10];
  else intervals = minor ? [0, 3, 7] : [0, 4, 7];
  return { root, intervals };
}

/** All chord tones within [lo, hi] (MIDI). */
export function chordTones(c: Chord, lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let base = c.root - 36; base <= hi; base += 12) {
    for (const iv of c.intervals) {
      const n = base + iv;
      if (n >= lo && n <= hi) out.push(n);
    }
  }
  return out.sort((a, b) => a - b);
}
