import { describe, expect, it } from 'vitest';
import { ACTS, actForLine, fillerAct, FILLER_ACTS, LYRIC_ACTS } from '../src/entities/SmokestackActs';
import { readJson } from './helpers';

describe("Old Smokestack's repertoire", () => {
  it('acts out the lyrics', () => {
    expect(actForLine('Well, howdy there, little ticker', null)).toBe('tipHat');
    expect(actForLine('I ran down a grandfather', null, () => 0)).toBe('twirl');
    expect(actForLine("Tick-tock, little clock, your time is... wait... what's THAT?!", null)).toBe('doubleTake');
    expect(actForLine('The BRIDGE is OUT?! Oh no', null)).toBe('panic');
    expect(actForLine('I flattened forty pocket-watches, sixty cuckoo clocks', null)).toBe('count');
  });

  it('does not repeat itself when it has a choice', () => {
    for (let i = 0; i < 20; i++) {
      expect(actForLine('Now wouldn\'t it be a pity?', 'fakeSob')).not.toBe('fakeSob');
      expect(fillerAct('shimmy')).not.toBe('shimmy');
    }
  });

  it('has a performance for every line of End of the Line', () => {
    const level = readJson('data/levels/smokestack.json');
    const silent = level.lyrics.filter((l: { text: string }) => !actForLine(l.text, null));
    // only short call-outs may go without an act
    expect(silent.map((l: { text: string }) => l.text).filter((t: string) => t.split(' ').length > 3)).toEqual([]);
  });

  it('only names performances that exist, and every pose works from start to end', () => {
    for (const [, names] of LYRIC_ACTS) for (const n of names) expect(ACTS[n]).toBeDefined();
    for (const n of FILLER_ACTS) expect(ACTS[n]).toBeDefined();
    for (const [name, def] of Object.entries(ACTS)) {
      expect(def.beats, name).toBeGreaterThan(0);
      for (const t of [0, 0.25, 0.5, 0.99]) expect(() => def.pose(t, 3.5)).not.toThrow();
    }
  });
});
