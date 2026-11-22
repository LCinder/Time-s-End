import { describe, expect, it } from 'vitest';
import { PROP_INFO, SCENERY_DEFS } from '../src/world/SceneryArt';
import { SCENE_SETS, hourAt, setTextures, skyAt, stageIndexAt } from '../src/world/sceneSets';
import { DataError, validateLevel } from '../src/core/validate';
import { readJson } from './helpers';

const BASE_LAYERS = ['hills', 'farhills']; // still drawn in fx/Textures.ts

describe('scenery sets', () => {
  it('only uses drawings that exist', () => {
    for (const [name, set] of Object.entries(SCENE_SETS)) {
      for (const tex of setTextures(set)) {
        expect(SCENERY_DEFS[tex] || BASE_LAYERS.includes(tex), `${name} uses "${tex}"`).toBeTruthy();
      }
    }
  });

  it('gives every prop its behaviour (scale, sway)', () => {
    for (const set of Object.values(SCENE_SETS)) {
      for (const p of [...set.props, ...set.near, ...set.sky]) if (p) expect(PROP_INFO[p], p).toBeDefined();
    }
  });

  it('far and middle layers are as wide as the screen so they tile', () => {
    for (const set of Object.values(SCENE_SETS)) {
      for (const layer of [set.far, set.mid]) if (SCENERY_DEFS[layer]) expect(SCENERY_DEFS[layer].w, layer).toBe(1280);
    }
  });
});

describe('the journey and the clock', () => {
  const stages = [
    { beat: 0, set: 'dusk' },
    { beat: 96, set: 'town' },
    { beat: 146, set: 'graveyard' },
  ];

  it('finds the place for a beat', () => {
    expect(stageIndexAt(stages, -5)).toBe(0);
    expect(stageIndexAt(stages, 95.9)).toBe(0);
    expect(stageIndexAt(stages, 96)).toBe(1);
    expect(stageIndexAt(stages, 500)).toBe(2);
  });

  it('interpolates the hour and keeps counting past midnight', () => {
    const hours: [number, number][] = [[0, 17], [100, 24], [200, 30]];
    expect(hourAt(hours, -10)).toBe(17);
    expect(hourAt(hours, 50)).toBeCloseTo(20.5);
    expect(hourAt(hours, 150)).toBeCloseTo(27);
    expect(hourAt(hours, 999)).toBe(30);
  });

  it('day, sunset, night and dawn look right', () => {
    const noon = skyAt(13);
    expect(noon.day).toBe(1);
    expect(noon.stars).toBe(0);
    const sunset = skyAt(18.9);
    expect(sunset.glow).toBeGreaterThan(0.8);
    const midnight = skyAt(24);
    expect(midnight.day).toBe(0);
    expect(midnight.stars).toBe(1);
    expect(midnight.moon).toBeGreaterThan(0.5);
    expect(midnight.sun).toBeLessThan(0);
    const dawn = skyAt(30);
    expect(dawn.glow).toBeGreaterThan(0.8);
    expect(skyAt(30).day).toBeCloseTo(skyAt(6).day);
  });
});

describe('the scenery block in a level', () => {
  const level = () => readJson('data/levels/smokestack.json') as Record<string, unknown>;
  const problemsOf = (raw: unknown): string[] => {
    try {
      validateLevel(raw, 'test.json');
      return [];
    } catch (err) {
      if (err instanceof DataError) return err.problems;
      throw err;
    }
  };

  it('the smokestack journey is valid and ends at dawn', () => {
    const L = level();
    expect(problemsOf(L)).toEqual([]);
    const sc = L.scenery as { stages: { set: string }[]; hours: [number, number][] };
    expect(sc.stages.map((s) => s.set)).toEqual(['dusk', 'town', 'graveyard', 'pines', 'gorge']);
    expect(skyAt(hourAt(sc.hours, 0)).day).toBe(1);
    expect(skyAt(hourAt(sc.hours, 200)).day).toBe(0);
    expect(skyAt(hourAt(sc.hours, 341)).glow).toBeGreaterThan(0.5);
  });

  it('explains a wrong place name, stages out of order and bad hours', () => {
    const L = level();
    L.scenery = { stages: [{ beat: 10, set: 'moon base' }, { beat: 0, set: 'dusk' }], hours: [[0, 17], [5]] };
    const p = problemsOf(L).join('\n');
    expect(p).toContain('"moon base" is not valid');
    expect(p).toContain('stages must be in order');
    expect(p).toContain('expected [beat, hour]');
  });
});
