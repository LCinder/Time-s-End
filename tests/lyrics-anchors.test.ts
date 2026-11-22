import { describe, expect, it } from 'vitest';
import { normalizeWord, resolveAnchor, songWords } from '../src/core/anchors';
import { expandLyrics } from '../src/core/lyrics';
import { miniLevel } from './helpers';

describe('lyrics', () => {
  it('times every word and marks shouted ones', () => {
    const [line] = expandLyrics([{ beat: 4, text: 'If a ^BOXCAR', at: [0, 0.5, 1] }]);
    expect(line.words.map((w) => [w.text, w.beat, w.shout])).toEqual([
      ['If', 4, false],
      ['a', 4.5, false],
      ['BOXCAR', 5, true],
    ]);
  });

  it('spreads words over `length` beats when `at` is missing', () => {
    const [line] = expandLyrics([{ beat: 0, text: 'one two three four', length: 4 }]);
    expect(line.words.map((w) => w.beat)).toEqual([0, 1, 2, 3]);
  });
});

describe('anchors', () => {
  const words = songWords(miniLevel().lyrics);

  it('ignores case and punctuation', () => {
    expect(normalizeWord('KER-RASH!')).toBe('kerrash');
    expect(normalizeWord("ain't")).toBe('aint');
  });

  it('resolves a word plus afterBeats', () => {
    expect(resolveAnchor(words, { anchor: 'boxcar', afterBeats: 4 })).toMatchObject({ beat: 9 });
  });

  it('picks the n-th occurrence with #n', () => {
    expect(resolveAnchor(words, { anchor: 'TOOT#1' })).toMatchObject({ beat: 12 });
    expect(resolveAnchor(words, { anchor: 'TOOT#2', afterBeats: 2 })).toMatchObject({ beat: 15 });
  });

  it('snaps to the grid', () => {
    // tumblin is sung at 7, +0.4 = 7.4 -> nearest whole beat 7, nearest half 7.5
    expect(resolveAnchor(words, { anchor: 'tumblin', afterBeats: 0.4, snap: 1 })).toMatchObject({ beat: 7 });
    expect(resolveAnchor(words, { anchor: 'tumblin', afterBeats: 0.4, snap: 0.5 })).toMatchObject({ beat: 7.5 });
  });

  it('explains unknown words and out-of-range occurrences', () => {
    expect(resolveAnchor(words, { anchor: 'piano' })).toEqual({ error: expect.stringContaining('not in the lyrics') });
    expect(resolveAnchor(words, { anchor: 'TOOT#3' })).toEqual({ error: expect.stringContaining('only sung 2 time(s)') });
  });
});
