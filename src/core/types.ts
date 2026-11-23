// Shared data types. Everything a designer can tweak lives in /public/data/*.json
// and is described by these interfaces (see MAIN.md §11).

import type { SceneryConfig } from '../world/sceneSets';

export type EraPalette = 'bw1928' | 'sepia1930' | 'twoStrip1932' | 'full1935';
export const ERA_PALETTES: EraPalette[] = ['bw1928', 'sepia1930', 'twoStrip1932', 'full1935'];

export interface TempoPoint {
  beat: number;
  bpm: number;
}

export interface SongSpec {
  /** Optional audio file (relative to /public). If missing or it fails to load, the placeholder music is used. */
  file?: string;
  /** Milliseconds into the audio file where beat 0 happens. */
  offsetMs: number;
  beatsPerBar: number;
  tempoMap: TempoPoint[];
  /** The level ends (victory) when this beat is reached. */
  lengthBeats: number;
}

export interface LyricLine {
  beat: number;
  /** Words separated by spaces. Prefix a word with ^ to make it a SHOUTED word. */
  text: string;
  /** Beat offset (relative to `beat`) of every word. If omitted, words are spread evenly over `length`. */
  at?: number[];
  length?: number;
}

export interface LevelEvent {
  type: string;
  beat: number;
  /** Only spawn this event on these difficulties (e.g. ["hard"]). */
  only?: string[];
  [key: string]: unknown;
}

export interface PlaceholderSection {
  name: string;
  bars: number;
  /** Roman-numeral chords, one per bar (repeated to fill the section). E.g. "I", "vi", "II7", "V7". */
  chords: string[];
  mood?: 'normal' | 'dark' | 'bright';
  /** 1 = sparse, 2 = normal, 3 = full band */
  intensity?: number;
  /** Add the train "chugga-chugga" percussion */
  train?: boolean;
}

export interface PlaceholderMusic {
  key: string;
  swing: number;
  sections: PlaceholderSection[];
}

export interface ChaseSpec {
  /** World pixels scrolled per beat (camera speed). */
  pixelsPerBeat: number;
  /** Screen X where the player is expected to be; obstacles are placed relative to it. */
  anchorX: number;
  /** Screen X of the boss's nose when not lunging. */
  bossFrontX: number;
  /** Gaps start this many px after the anchor point, so jumping ON the beat clears them. */
  gapLeadPx: number;
  /** true: the player runs with the camera by default; left/right only speed up / slow down. */
  autoRun: boolean;
}

export interface LevelData {
  id: string;
  title: string;
  subtitle: string;
  boss: string;
  type: 'chase';
  era: EraPalette;
  song: SongSpec;
  chase: ChaseSpec;
  lyrics: LyricLine[];
  events: LevelEvent[];
  placeholderMusic: PlaceholderMusic;
  /** The journey: places along the line and the time of day (see world/sceneSets.ts). */
  scenery?: SceneryConfig;
}

export interface DifficultySpec {
  label: string;
  playerHits: number;
  hitWindowMs: { perfect: number; good: number };
  onBeatJumpMultiplier: number;
  onBeatDashBonusMs: number;
  telegraphBeats: number;
  hazardSpeedMultiplier: number;
  bossLungeMultiplier: number;
  /** Wind-up spring (MAIN.md idea 10); every field optional. */
  spring?: Partial<{ drainPerBeat: number; perfect: number; good: number; hit: number; slowRate: number; slowBeats: number }>;
}

export interface PlayerTuning {
  runSpeed: number;
  acceleration: number;
  airControl: number;
  gravity: number;
  jumpVelocity: number;
  jumpCutMultiplier: number;
  coyoteMs: number;
  jumpBufferMs: number;
  dashSpeed: number;
  dashMs: number;
  dashCooldownMs: number;
  invulnerableMs: number;
}

export interface FilmTuning {
  grain: number;
  scratches: number;
  vignette: number;
  weave: number;
  flicker: number;
}

export interface GameConfig {
  /** Positive = visuals/judgement assume the sound reaches you later. */
  audioOffsetMs: number;
  /** Extra compensation for keyboard/gamepad latency when judging "on beat". */
  inputOffsetMs: number;
  defaultDifficulty: string;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  vintageAudio: boolean;
  film: FilmTuning;
  player: PlayerTuning;
  debug: boolean;
  levels: string[];
  /** Use the hand-drawn pose sheets in public/art/<boss>/ when they exist (`?art=0` in the URL turns it off). */
  bossArt?: boolean;
}

/** public/art/<boss>/manifest.json, written by `npm run art` from a sheet of puppet parts. */
export interface ArtManifest {
  boss: string;
  type: 'parts';
  parts: Record<string, { file: string; w: number; h: number }>;
  /** In pixels of the body picture. */
  anchors: {
    /** Centre and radii of the round front plate where the face goes: [x, y, rx, ry]. */
    face: [number, number, number, number];
    wheels: [number, number, number][];
    frontWheel?: [number, number, number];
    /** [x, top y, base y] of the bare smokestack (the hat sits on top). */
    chimney: [number, number, number];
    /** Front and back shoulder. */
    shoulders: [number, number][];
    ground: number;
    noseX: number;
  };
}

export interface ControlsConfig {
  left: string[];
  right: string[];
  up: string[];
  down: string[];
  jump: string[];
  shoot: string[];
  parry: string[];
  dash: string[];
  pause: string[];
  confirm: string[];
}

// ───────────────────────── Chapter 1 structure (MAIN.md §6) ─────────────────────────

export type PlatformKind = 'newsreel' | 'serial' | 'singalong' | 'memory';

/** A level between bosses, drawn from an ASCII tile map (see MAIN.md §11.6). */
export interface PlatformLevel {
  id: string;
  type: 'platform';
  kind: PlatformKind;
  title: string;
  subtitle: string;
  era: EraPalette;
  music: {
    bpm: number;
    beatsPerBar: number;
    /** The placeholder band sings the lyrics (sing-along). */
    voice?: boolean;
    placeholder: PlaceholderMusic;
  };
  /** Sing-along: lyric lines; the ^SHOUTED words become platforms at the W tiles. */
  lyrics?: LyricLine[];
  /** One string per row of 40 px tiles. Legend in MAIN.md §11.6. */
  map: string[];
  /** Newsreel: the camera scrolls this many px per beat. */
  autoscroll?: number;
  /** Texts shown when Tick passes each T tile (intertitles / headlines), in reading order. */
  texts?: string[];
  /** Cards before the level starts. */
  intro?: string[];
  /** Cards when the level ends ("To be continued…"). */
  outro?: string[];
  /** Found at the O tile and kept on Elias' desk. */
  lostObject?: { id: string; name: string; text: string };
  /** Sing-along: how many beats a word platform stays. */
  wordLifeBeats?: number;
}

export interface StoryChapter {
  id: string;
  /** Level id of the boss (the feature). */
  feature: string;
  framesNeeded: number;
  nowShowing: string;
  comingSoon: string;
  /** Platform level ids, in the order the posters / objects offer them. */
  interludes: string[];
  /** Frames each minigame can give (once per threshold). */
  minigameFrames: number;
  /** Instrument the freed boss gives the organ. */
  organGift: 'train' | 'none';
  endCards: string[];
}

export interface StoryData {
  secondsPerBoss: number;
  intro: string[];
  previously: string[];
  chapters: StoryChapter[];
}
