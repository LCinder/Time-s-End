import { describe, expect, it } from 'vitest';
import { DataError, validateControls, validateDifficulties, validateGameConfig, validateLevel } from '../src/core/validate';
import { gameConfig, miniLevel, readJson } from './helpers';

const problemsOf = (raw: unknown): string[] => {
  try {
    validateLevel(raw, 'test.json');
    return [];
  } catch (err) {
    if (err instanceof DataError) return err.problems;
    throw err;
  }
};

describe('validation of the shipped data', () => {
  it('accepts the config files', () => {
    expect(() => validateGameConfig(gameConfig())).not.toThrow();
    expect(() => validateDifficulties(readJson('data/config/difficulty.json'))).not.toThrow();
    expect(() => validateControls(readJson('data/config/controls.json'))).not.toThrow();
  });

  it('accepts every level and resolves its anchors to numbers', () => {
    for (const id of gameConfig().levels) {
      const level = validateLevel(readJson(`data/levels/${id}.json`), id);
      for (const e of level.events) expect(typeof e.beat).toBe('number');
    }
  });

  it('keeps the smokestack hazards on their designed beats', () => {
    const level = validateLevel(readJson('data/levels/smokestack.json'), 'smokestack');
    const at = (type: string, anchor: string): number[] =>
      level.events.filter((e) => e.type === type && e.anchor === anchor).map((e) => e.beat);
    expect(at('drop', 'BOXCAR')).toEqual([80]);
    expect(at('drop', 'PIANO')).toEqual([192]);
    expect(at('drop', 'TRUNK')).toEqual([176, 178]);
    expect(level.events.filter((e) => e.type === 'groundWave').map((e) => e.beat)).toEqual([69, 131, 132, 243, 244]);
  });
});

describe('validation of anchored events', () => {
  it('resolves the beat from the lyrics', () => {
    const level = validateLevel(miniLevel({ events: [{ type: 'drop', anchor: 'BOXCAR', afterBeats: 4, object: 'boxcar' } as any] }), 't');
    expect(level.events[0].beat).toBe(9);
  });

  it('rejects beat and anchor together', () => {
    const p = problemsOf(miniLevel({ events: [{ type: 'drop', beat: 9, anchor: 'BOXCAR', object: 'boxcar' } as any] }));
    expect(p.join()).toContain('both "beat" and "anchor"');
  });

  it('rejects anchors to words that are not sung', () => {
    const p = problemsOf(miniLevel({ events: [{ type: 'drop', anchor: 'PIANO', object: 'piano' } as any] }));
    expect(p.join()).toContain('not in the lyrics');
  });

  it('rejects afterBeats without an anchor', () => {
    const p = problemsOf(miniLevel({ events: [{ type: 'gap', beat: 8, lengthBeats: 1, afterBeats: 2 } as any] }));
    expect(p.join()).toContain('only works together with "anchor"');
  });
});
