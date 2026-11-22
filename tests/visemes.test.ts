import { describe, expect, it } from 'vitest';
import { visemeAt, visemesOf } from '../src/core/visemes';

describe('lip sync by phoneme', () => {
  it('turns words into mouth shapes', () => {
    expect(visemesOf('piano').map((s) => s.v)).toEqual(['closed', 'wide', 'open', 'round']);
    expect(visemesOf('BOXCAR').map((s) => s.v)[0]).toBe('closed');
    expect(visemesOf('choo!').map((s) => s.v)).toEqual(['small']);
    expect(visemesOf('furnace').map((s) => s.v)[0]).toBe('teeth');
  });

  it('ignores a silent final e', () => {
    expect(visemesOf('time').map((s) => s.v)).toEqual(['open', 'wide', 'closed']);
  });

  it('walks through the shapes as the word is sung, vowels lasting longer', () => {
    expect(visemeAt('piano', 0)).toBe('closed');
    expect(visemeAt('piano', 0.3)).toBe('wide');
    expect(visemeAt('piano', 0.99)).toBe('round');
    expect(visemeAt('!!', 0.5)).toBe('open'); // no letters: just an open mouth
  });
});
