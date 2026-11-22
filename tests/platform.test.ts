import { describe, expect, it } from 'vitest';
import { checkPlatformMap } from '../src/core/mapCheck';
import { DataError, validatePlatformLevel, validateStory } from '../src/core/validate';
import { gameConfig, readJson } from './helpers';

const level = (map: string[], extra: object = {}): any => ({
  id: 't', type: 'platform', kind: 'newsreel', title: 'T', subtitle: 'S', era: 'bw1928',
  music: { bpm: 120, beatsPerBar: 4, placeholder: { key: 'C', swing: 0.5, sections: [{ name: 'a', bars: 4, chords: ['I'] }] } },
  map, ...extra,
});
const screen = (rows: string[]): string[] => [...Array(18 - rows.length).fill(' '.repeat(rows[0].length)), ...rows];
const problems = (raw: unknown): string[] => {
  try {
    validatePlatformLevel(raw, 't.json');
    return [];
  } catch (e) {
    if (e instanceof DataError) return e.problems;
    throw e;
  }
};

describe('platform levels', () => {
  it('accept the shipped levels and the story', () => {
    const story = validateStory(readJson('data/story.json'), 'story');
    for (const id of story.chapters.flatMap((c) => c.interludes)) {
      expect(() => validatePlatformLevel(readJson(`data/levels/${id}.json`), id)).not.toThrow();
    }
  });

  it('explain broken maps', () => {
    const p = problems(level(screen(['  P  E ', '###### ', '####'])));
    expect(p.join('\n')).toContain('the first row is 7');
    expect(problems(level(screen(['  P  Q ', '#######']))).join()).toContain('unknown tile "Q"');
    expect(problems(level(screen(['  P  T ', '#######']))).join()).toContain('1 T tiles but only 0 "texts"');
    expect(problems(level(screen(['     E ', '#######']))).join()).toContain('exactly one P');
  });

  it('need one W tile per shouted word in a sing-along', () => {
    const lyrics = [{ beat: 0, text: 'a ^BIG ^SONG', at: [0, 1, 2] }];
    expect(problems(level(screen(['P  W  E', '#######']), { kind: 'singalong', lyrics })).join()).toContain('1 W tiles but the lyrics have 2');
  });
});

describe('reachability check', () => {
  const player = gameConfig().player;

  it('passes the shipped levels', () => {
    for (const id of ['newsreel-1', 'serial-1', 'singalong-1', 'memory-1']) {
      expect(checkPlatformMap(readJson(`data/levels/${id}.json`), player).filter((i) => i.level === 'error')).toEqual([]);
    }
  });

  it('finds an exit behind a gap too wide to jump', () => {
    const map = screen(['P' + ' '.repeat(28) + 'E', '####' + ' '.repeat(22) + '####']);
    expect(checkPlatformMap(level(map), player).map((i) => i.message).join()).toContain("exit can't be reached");
  });

  it('finds a frame floating too high', () => {
    const rows = screen(['P     E', '#######']);
    rows[2] = '   *   ';
    expect(checkPlatformMap(level(rows), player).map((i) => i.message).join()).toContain('frame looks out of reach');
  });

  it('counts moving platforms as a way across', () => {
    const map = screen(['P' + ' '.repeat(14) + 'E', '###M' + ' '.repeat(9) + '###']);
    expect(checkPlatformMap(level(map), player).filter((i) => i.level === 'error')).toEqual([]);
  });
});
