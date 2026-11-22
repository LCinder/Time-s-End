// Can the platform levels actually be finished? A coarse reachability search over
// the tile map using Tick's real jump (game.json "player"): from P, which surfaces
// can he stand on? The exit must be reachable; frames and cue marks should be.
// Coarse on purpose (no head bumps, timing of beat planks ignored): it catches
// impossible gaps and forgotten floors, not subtle timing.

import type { CheckIssue } from './levelCheck';
import type { PlatformLevel, PlayerTuning } from './types';
import { TILE } from '../world/TileMap';

type Cell = `${number},${number}`;

export function checkPlatformMap(level: PlatformLevel, player: PlayerTuning): CheckIssue[] {
  const map = level.map;
  const rows = map.length;
  const cols = map[0].length;
  const at = (c: number, r: number): string => (r < 0 || r >= rows || c < 0 || c >= cols ? ' ' : map[r][c]);
  const solid = (c: number, r: number): boolean => at(c, r) === '#';
  const support = (ch: string): boolean => '#=abMVW'.includes(ch);

  // jump reach in tiles
  const air = (2 * player.jumpVelocity) / player.gravity;
  const upTiles = Math.floor((player.jumpVelocity ** 2 / (2 * player.gravity)) / TILE);
  const across = (player.runSpeed * air) / TILE;
  const headroom = Math.ceil(100 / TILE); // Tick is 100 px tall

  // standable cells: (c, r) = Tick's feet on top of row r+1... we store the support row
  const stand = new Set<Cell>();
  const addStand = (c: number, r: number): void => {
    if (c < 0 || c >= cols || r < 1) return;
    for (let h = 1; h <= headroom; h++) if (solid(c, r - h)) return;
    stand.add(`${c},${r}`);
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = at(c, r);
      if (!support(ch) || (ch === '#' && solid(c, r - 1))) continue;
      if (ch === 'M') for (let dx = 0; dx <= 6; dx++) addStand(c + dx, r);
      else if (ch === 'V') for (let dy = 0; dy <= 4; dy++) for (let dx = 0; dx < 3; dx++) addStand(c + dx, r - dy);
      else if (ch === 'W') for (let dx = -1; dx <= 1; dx++) addStand(c + dx, r);
      else addStand(c, r);
    }
  }

  // things are on the tile above their support: find the support row under them
  const find = (ch: string): { c: number; r: number }[] => {
    const out: { c: number; r: number }[] = [];
    map.forEach((line, r) => [...line].forEach((x, c) => x === ch && out.push({ c, r })));
    return out;
  };
  const start = find('P')[0];
  const feetRow = (c: number, r: number): number => {
    for (let rr = r + 1; rr < rows; rr++) if (stand.has(`${c},${rr}`)) return rr;
    return -1;
  };

  // BFS over standable cells
  const seen = new Set<Cell>();
  const queue: Cell[] = [];
  const s0 = feetRow(start.c, start.r);
  if (s0 >= 0) {
    seen.add(`${start.c},${s0}`);
    queue.push(`${start.c},${s0}`);
  }
  const standList = [...stand].map((k) => k.split(',').map(Number) as [number, number]);
  while (queue.length) {
    const [c, r] = queue.shift()!.split(',').map(Number);
    for (const [c2, r2] of standList) {
      const key: Cell = `${c2},${r2}`;
      if (seen.has(key)) continue;
      const dx = Math.abs(c2 - c);
      const up = r - r2; // positive = higher
      const drop = Math.max(0, -up);
      const reach = across + drop * 0.6; // falling further carries Tick further
      if (up > upTiles || dx > reach) continue;
      if (dx > 1.5 && up > 0 && dx > across * (1 - up / (upTiles + 1)) + 1) continue; // high AND far is harder
      seen.add(key);
      queue.push(key);
    }
  }

  const issues: CheckIssue[] = [];
  const reachable = (c: number, r: number, slack = 0): boolean => {
    for (const k of seen) {
      const [sc, sr] = k.split(',').map(Number);
      // a thing at (c, r) can be touched from a stand spot below or level with it, within a jump
      if (Math.abs(sc - c) <= 1 + slack && r <= sr && sr - r <= upTiles + headroom) return true;
    }
    return false;
  };
  const issue = (lvl: CheckIssue['level'], c: number, type: string, message: string): void => {
    issues.push({ level: lvl, beat: c, type, message: `${message} (column ${c})` });
  };
  for (const e of find('E')) if (!reachable(e.c, e.r)) issue('error', e.c, 'exit', "the exit can't be reached from the start");
  for (const f of find('*')) if (!reachable(f.c, f.r, 2)) issue('warning', f.c, 'frame', 'this film frame looks out of reach');
  for (const q of find('C')) if (!reachable(q.c, q.r)) issue('warning', q.c, 'cue', 'this cue mark looks out of reach');
  for (const o of find('O')) if (!reachable(o.c, o.r)) issue('error', o.c, 'lostObject', "the lost object can't be reached");
  return issues;
}
