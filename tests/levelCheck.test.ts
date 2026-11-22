import { describe, expect, it } from 'vitest';
import { checkLevel } from '../src/core/levelCheck';
import { validateLevel } from '../src/core/validate';
import { difficulties, gameConfig, miniLevel, readJson } from './helpers';

const check = (events: object[]) =>
  checkLevel(validateLevel(miniLevel({ events: events as any }), 't'), difficulties(), gameConfig().player);
const messages = (events: object[]) => check(events).map((i) => `${i.level}: ${i.message}`);

describe('level checker', () => {
  it('finds no errors in the shipped levels', () => {
    for (const id of gameConfig().levels) {
      const level = validateLevel(readJson(`data/levels/${id}.json`), id);
      const errors = checkLevel(level, difficulties(), gameConfig().player).filter((i) => i.level === 'error');
      expect(errors).toEqual([]);
    }
  });

  it('accepts a normal one-beat gap', () => {
    expect(check([{ type: 'gap', beat: 8, lengthBeats: 1 }])).toEqual([]);
  });

  it('flags gaps that need → held, and impossible ones', () => {
    expect(messages([{ type: 'gap', beat: 8, lengthBeats: 2.5 }]).join()).toContain('needs → held');
    expect(messages([{ type: 'gap', beat: 8, lengthBeats: 6 }]).join()).toContain("error: 6-beat gap");
  });

  it('does not judge gaps crossed on word platforms', () => {
    expect(check([{ type: 'gap', beat: 20, lengthBeats: 6 }, { type: 'lyricObject', beat: 21, word: 'no', x: 560 }]).filter((i) => i.type === 'gap')).toEqual([]);
  });

  it('flags hazards with too little warning', () => {
    const m = messages([{ type: 'drop', beat: 9, object: 'boxcar', x: 'player', telegraphBeats: 1 }]);
    expect(m.join()).toContain('ms of warning');
  });

  it('flags drops that the lyrics never announce', () => {
    expect(messages([{ type: 'drop', beat: 30, object: 'piano', x: 'player' }]).join()).toContain('piano is not announced');
    expect(messages([{ type: 'drop', beat: 9, object: 'boxcar', x: 'player' }])).toEqual([]);
  });

  it('flags falling words that are not sung nearby', () => {
    expect(messages([{ type: 'lyricObject', beat: 40, word: 'BOXCAR' }]).join()).toContain('not sung within');
  });

  it('flags hazards off the beat grid and outside the song', () => {
    expect(messages([{ type: 'groundWave', beat: 20.3 }]).join()).toContain('off the 0.5-beat grid');
    expect(messages([{ type: 'smokeRing', beat: 80 }]).join()).toContain('outside the song');
  });

  it('flags two reactions at almost the same moment, per difficulty', () => {
    const issues = check([
      { type: 'smokeRing', beat: 20 },
      { type: 'groundWave', beat: 20, only: ['hard'] },
    ]);
    const crowd = issues.find((i) => i.message.includes('two reactions'));
    expect(crowd?.difficulty).toBe('hard');
  });
});
