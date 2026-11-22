// ASCII tile maps for the platform levels (MAIN.md §11.6). Pure logic, no Phaser:
// turns rows of characters into merged solid rectangles and a list of things.

export const TILE = 40;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapThing {
  ch: string;
  /** Tile column / row. */
  col: number;
  row: number;
  /** World position of the tile's top-left corner. */
  x: number;
  y: number;
  /** Index among things with the same character, in reading order (left→right, then top→bottom by column). */
  index: number;
}

export interface ParsedMap {
  cols: number;
  rows: number;
  width: number;
  height: number;
  /** '#' merged into horizontal runs. */
  solids: Rect[];
  /** '=' runs (one-way planks). */
  planks: Rect[];
  /** 'a' / 'b' runs (beat planks). */
  beatPlanks: { group: 'a' | 'b'; rect: Rect }[];
  things: MapThing[];
}

const RUN_CHARS = new Set(['#', '=', 'a', 'b']);
const EMPTY = new Set([' ', '.']);

export function parseMap(map: string[]): ParsedMap {
  const rows = map.length;
  const cols = map[0]?.length ?? 0;
  const solids: Rect[] = [];
  const planks: Rect[] = [];
  const beatPlanks: ParsedMap['beatPlanks'] = [];
  const things: MapThing[] = [];

  for (let r = 0; r < rows; r++) {
    const line = map[r];
    let c = 0;
    while (c < cols) {
      const ch = line[c];
      if (RUN_CHARS.has(ch)) {
        let end = c;
        while (end + 1 < cols && line[end + 1] === ch) end++;
        const rect = { x: c * TILE, y: r * TILE, w: (end - c + 1) * TILE, h: TILE };
        if (ch === '#') solids.push(rect);
        else if (ch === '=') planks.push({ ...rect, h: 14 });
        else beatPlanks.push({ group: ch as 'a' | 'b', rect: { ...rect, h: 14 } });
        c = end + 1;
        continue;
      }
      c++;
    }
  }

  // things in reading order by column (left to right), so "the next T" means "the next one you reach"
  const counters: Record<string, number> = {};
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const ch = map[r][c];
      if (EMPTY.has(ch) || RUN_CHARS.has(ch)) continue;
      const index = counters[ch] ?? 0;
      counters[ch] = index + 1;
      things.push({ ch, col: c, row: r, x: c * TILE, y: r * TILE, index });
    }
  }

  // merge vertically stacked identical solid runs into taller blocks (fewer collision boxes)
  const merged: Rect[] = [];
  for (const s of solids.sort((a, b) => a.x - b.x || a.y - b.y)) {
    const above = merged.find((m) => m.x === s.x && m.w === s.w && m.y + m.h === s.y);
    if (above) above.h += s.h;
    else merged.push({ ...s });
  }

  return { cols, rows, width: cols * TILE, height: rows * TILE, solids: merged, planks, beatPlanks, things };
}

/** Beat planks: group A is solid on beats 1-2 of each 4-beat cycle, group B on 3-4. */
export function beatPlankSolid(group: 'a' | 'b', beat: number): boolean {
  const half = Math.floor(((beat % 4) + 4) % 4 / 2);
  return group === 'a' ? half === 0 : half === 1;
}

/** 0→1→0 over `period` beats, easing at both ends (movers). */
export function pingPong(beat: number, period = 8): number {
  const p = (((beat % period) + period) % period) / period;
  return 0.5 - 0.5 * Math.cos(p * Math.PI * 2);
}
