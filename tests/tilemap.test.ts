import { describe, expect, it } from 'vitest';
import { beatPlankSolid, parseMap, pingPong, TILE } from '../src/world/TileMap';

const MAP = [
  '   *    ',
  ' P  aa E',
  '########',
  '###  ===',
];

describe('ASCII tile maps', () => {
  const m = parseMap(MAP);

  it('measures the map', () => {
    expect(m.cols).toBe(8);
    expect(m.rows).toBe(4);
    expect(m.width).toBe(8 * TILE);
  });

  it('merges runs of blocks, also vertically', () => {
    // row 2 is a full run; row 3 has "###" under its left part
    expect(m.solids).toContainEqual({ x: 0, y: 2 * TILE, w: 8 * TILE, h: TILE });
    expect(m.solids).toContainEqual({ x: 0, y: 3 * TILE, w: 3 * TILE, h: TILE });
    expect(m.planks).toEqual([{ x: 5 * TILE, y: 3 * TILE, w: 3 * TILE, h: 14 }]);
    expect(m.beatPlanks).toEqual([{ group: 'a', rect: { x: 4 * TILE, y: TILE, w: 2 * TILE, h: 14 } }]);
  });

  it('lists things in the order Tick reaches them', () => {
    expect(m.things.map((t) => t.ch)).toEqual(['P', '*', 'E']);
  });

  it('beat planks: A on beats 1-2 of each bar, B on 3-4', () => {
    expect([0, 1.5, 2, 3.9, 4].map((b) => beatPlankSolid('a', b))).toEqual([true, true, false, false, true]);
    expect([0, 2.5].map((b) => beatPlankSolid('b', b))).toEqual([false, true]);
  });

  it('movers ease out and back over the period', () => {
    expect(pingPong(0, 8)).toBeCloseTo(0);
    expect(pingPong(4, 8)).toBeCloseTo(1);
    expect(pingPong(8, 8)).toBeCloseTo(0);
  });
});
