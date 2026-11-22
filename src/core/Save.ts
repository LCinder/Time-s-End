// Saved games ("film cans" A, B, C) and per-computer settings, in localStorage.
// Every access is wrapped: in a private window or with storage blocked the game
// still runs, it just forgets on reload (MAIN.md §6.3).

export type SlotId = 'A' | 'B' | 'C';
export const SLOTS: SlotId[] = ['A', 'B', 'C'];

export interface LevelRecord {
  completed: boolean;
  rank?: string;
  plays: number;
}

export interface SaveData {
  version: 1;
  slot: SlotId;
  created: number;
  updated: number;
  /** Bosses that got their ending (= seats taken, organ instruments, clock seconds). */
  freed: string[];
  /** Collected film frames, as "<levelId>:<index>". */
  frames: string[];
  /** Frames spent splicing reels. */
  framesSpent: number;
  /** Lost objects found (ids from the levels' lostObject). */
  lostObjects: string[];
  levels: Record<string, LevelRecord>;
  flags: {
    introSeen: boolean;
    stairsOpen: boolean;
    rafterLadder: boolean;
    spliced: string[];
    threaded: string[];
    ritualSeen: boolean;
    endingsSeen: string[];
    minigames: Record<string, number>;
  };
  /** Cleared dust cells in the Bijou. */
  dust: number[];
  hub: { x: number; y: number };
  /** Set while inside a level, cleared on leaving it: CONTINUE offers to resume. */
  resume: { levelId: string; cue: number } | null;
}

export interface Settings {
  lastSlot: SlotId | null;
  ghost: boolean;
  reduceFlicker: boolean;
  music: number;
  sfx: number;
  difficulty: string | null;
}

const SAVE_KEY = (s: SlotId): string => `timesend.save.${s}.v1`;
const SETTINGS_KEY = 'timesend.settings.v1';

export function newSave(slot: SlotId): SaveData {
  const now = Date.now();
  return {
    version: 1,
    slot,
    created: now,
    updated: now,
    freed: [],
    frames: [],
    framesSpent: 0,
    lostObjects: [],
    levels: {},
    flags: {
      introSeen: false,
      stairsOpen: false,
      rafterLadder: false,
      spliced: [],
      threaded: [],
      ritualSeen: false,
      endingsSeen: [],
      minigames: {},
    },
    dust: [],
    hub: { x: 300, y: 640 },
    resume: null,
  };
}

/** Fills in any field a save from an older build is missing. */
export function normalizeSave(raw: unknown, slot: SlotId): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<SaveData>;
  if (o.version !== 1) return null;
  const base = newSave(slot);
  return {
    ...base,
    ...o,
    slot,
    flags: { ...base.flags, ...(o.flags ?? {}) },
    hub: { ...base.hub, ...(o.hub ?? {}) },
    levels: { ...(o.levels ?? {}) },
  } as SaveData;
}

export function loadSave(slot: SlotId): SaveData | null {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY(slot));
    return raw ? normalizeSave(JSON.parse(raw), slot) : null;
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData): void {
  data.updated = Date.now();
  try {
    window.localStorage.setItem(SAVE_KEY(data.slot), JSON.stringify(data));
  } catch {
    /* storage blocked: progress lasts until the tab closes */
  }
}

export function deleteSave(slot: SlotId): void {
  try {
    window.localStorage.removeItem(SAVE_KEY(slot));
  } catch {
    /* ignore */
  }
}

const DEFAULT_SETTINGS: Settings = { lastSlot: null, ghost: true, reduceFlicker: false, music: 0.9, sfx: 0.9, difficulty: null };

export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeSettings(s: Settings): void {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

// ───────────────────────── helpers on a save ─────────────────────────

export function framesAvailable(s: SaveData): number {
  return s.frames.length - s.framesSpent;
}

export function addFrame(s: SaveData, id: string): boolean {
  if (s.frames.includes(id)) return false;
  s.frames.push(id);
  return true;
}

export function recordLevel(s: SaveData, levelId: string, completed: boolean, rank?: string): void {
  const r = s.levels[levelId] ?? { completed: false, plays: 0 };
  r.plays++;
  if (completed) {
    r.completed = true;
    const order = ['S', 'A', 'B', 'C'];
    if (rank && (!r.rank || order.indexOf(rank) < order.indexOf(r.rank))) r.rank = rank;
  }
  s.levels[levelId] = r;
}

/** "11:59:07" — the watch advances `secondsPerBoss` for every boss freed. */
export function clockText(s: SaveData, secondsPerBoss: number): string {
  const sec = Math.min(59, s.freed.length * secondsPerBoss);
  return `11:59:${String(sec).padStart(2, '0')}`;
}

/** Days since the save was last written (for "Previously at the Bijou…"). */
export function daysAway(s: SaveData, now = Date.now()): number {
  return (now - s.updated) / 86_400_000;
}
