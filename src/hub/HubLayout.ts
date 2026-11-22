// The Bijou (MAIN.md §6.1) as a side cross-section, like a doll's house:
//
//   ┌──────────── roof ────────────────────────────────────────────────┐
//   │  BOOTH (cols 1-25)      │   rafters (row 11): beams, beat planks… │
//   │  projector · desk ·     ├──── window                              │
//   │  coat · window ·splicer │        AUDITORIUM                 SCREEN │
//   ├─────────────────────────┤        seats · organ          ┌─STAGE──┤
//   │  LOBBY (cols 1-26)      │doors                          │ ladder │
//   │  posters · popcorn ·    │                               │        │
//   │  tickets · clock · …    │                               │        │
//   └──────────────────────────────────────────────────────────────────┘
//
// Same tile legend as the platform levels (TileMap.ts); the things you can use
// are listed in HUB_OBJECTS.

import { TILE } from '../world/TileMap';

export const HUB_COLS = 72;
export const HUB_ROWS = 34;

/** Surfaces Tick walks on (feet y). */
export const FLOOR = { booth: 16 * TILE, lobby: 31 * TILE, stage: 27 * TILE, rafters: 11 * TILE };

export type HubKind =
  | 'stairsBooth' | 'stairsLobby' | 'hatch' | 'desk' | 'window' | 'coat' | 'splicer' | 'projector'
  | 'screen' | 'ladder' | 'poster' | 'organ' | 'popcorn' | 'tickets' | 'clock' | 'mirror'
  | 'lostfound' | 'darkroom' | 'marquee' | 'seat';

export interface HubObject {
  id: string;
  kind: HubKind;
  /** Tile column; Tick uses it when standing within ~1 tile. */
  col: number;
  /** Feet y of the floor it stands on. */
  floor: number;
  /** Prompt shown above it. */
  label: string;
  /** Level it opens (posters, organ, coat, screen, seats). */
  level?: string;
  /** Minigame it opens. */
  game?: 'popcorn' | 'tickets';
}

export const HUB_OBJECTS: HubObject[] = [
  // booth
  { id: 'stairs-booth', kind: 'stairsBooth', col: 2, floor: FLOOR.booth, label: 'STAIRS' },
  { id: 'hatch', kind: 'hatch', col: 4, floor: FLOOR.booth, label: 'ROOF HATCH' },
  { id: 'desk', kind: 'desk', col: 7, floor: FLOOR.booth, label: "ELIAS' DESK" },
  { id: 'window', kind: 'window', col: 10, floor: FLOOR.booth, label: 'WINDOW' },
  { id: 'coat', kind: 'coat', col: 13, floor: FLOOR.booth, label: "ELIAS' COAT", level: 'memory-1' },
  { id: 'splicer', kind: 'splicer', col: 16, floor: FLOOR.booth, label: 'SPLICER' },
  { id: 'projector', kind: 'projector', col: 19, floor: FLOOR.booth, label: 'PROJECTOR' },
  // lobby
  { id: 'stairs-lobby', kind: 'stairsLobby', col: 2, floor: FLOOR.lobby, label: 'STAIRS' },
  { id: 'darkroom', kind: 'darkroom', col: 5, floor: FLOOR.lobby, label: 'DARKROOM' },
  { id: 'lostfound', kind: 'lostfound', col: 8, floor: FLOOR.lobby, label: 'LOST & FOUND' },
  { id: 'mirror', kind: 'mirror', col: 10, floor: FLOOR.lobby, label: 'MIRROR' },
  { id: 'clock', kind: 'clock', col: 13, floor: FLOOR.lobby, label: 'GRANDFATHER CLOCK' },
  { id: 'poster-news', kind: 'poster', col: 16, floor: FLOOR.lobby, label: 'BIJOU NEWS', level: 'newsreel-1' },
  { id: 'poster-serial', kind: 'poster', col: 19, floor: FLOOR.lobby, label: 'THE RUNAWAY REEL', level: 'serial-1' },
  { id: 'popcorn', kind: 'popcorn', col: 22, floor: FLOOR.lobby, label: 'POPCORN', game: 'popcorn' },
  { id: 'tickets', kind: 'tickets', col: 25, floor: FLOOR.lobby, label: 'TICKETS', game: 'tickets' },
  // auditorium
  { id: 'seat-smokestack', kind: 'seat', col: 41, floor: FLOOR.lobby, label: 'OLD SMOKESTACK', level: 'smokestack' },
  { id: 'organ', kind: 'organ', col: 54, floor: FLOOR.lobby, label: 'THE ORGAN', level: 'singalong-1' },
  { id: 'screen', kind: 'screen', col: 65, floor: FLOOR.stage, label: 'THE SCREEN', level: 'smokestack' },
  { id: 'ladder', kind: 'ladder', col: 69, floor: FLOOR.stage, label: 'ROPE LADDER' },
];

/** Where Tick appears on a new game (in the booth, by Elias' desk). */
export const HUB_SPAWN = { x: 6 * TILE + 20, y: FLOOR.booth };
/** Top of the rope ladder, on the last beam. */
export const LADDER_TOP = { x: 68 * TILE + 20, y: FLOOR.rafters };
/** Reaching this column on the rafters lets the rope ladder down (a shortcut). */
export const RAFTER_END_COL = 64;

export function buildHubMap(): string[] {
  const g: string[][] = Array.from({ length: HUB_ROWS }, () => Array.from({ length: HUB_COLS }, () => ' '));
  const fill = (c1: number, c2: number, r1: number, r2: number, ch = '#'): void => {
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) g[r][c] = ch;
  };
  const put = (ch: string, c: number, r: number): void => {
    g[r][c] = ch;
  };
  fill(0, HUB_COLS - 1, 0, 2); // roof
  fill(0, HUB_COLS - 1, 31, 33); // ground floor + foundations
  fill(0, 0, 0, 33); // outer walls
  fill(HUB_COLS - 1, HUB_COLS - 1, 0, 33);
  // booth: ceiling, floor, the crate steps up to the projection window
  fill(0, 26, 3, 7);
  fill(0, 27, 16, 17);
  fill(26, 27, 11, 15);
  fill(23, 23, 14, 15);
  fill(24, 24, 13, 15);
  fill(25, 25, 12, 15);
  // lobby wall with the auditorium doorway (rows 28-30 open)
  fill(27, 27, 18, 27);
  // rafters (row 11): beams, a gap, beat planks, a moving beam
  fill(28, 33, 11, 11);
  fill(37, 41, 11, 11);
  put('a', 43, 11); put('a', 44, 11);
  put('b', 46, 11); put('b', 47, 11);
  fill(49, 53, 11, 11);
  put('M', 54, 11);
  fill(61, 69, 11, 11);
  put('B', 39, 4);
  put('B', 51, 4);
  put('*', 35, 8);
  put('*', 45, 8);
  put('*', 57, 8);
  // stage and its steps
  fill(60, 70, 27, 30);
  fill(57, 57, 30, 30);
  fill(58, 59, 29, 30);
  return g.map((r) => r.join(''));
}
