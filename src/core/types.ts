// Shared data types. Everything a designer can tweak lives in /public/data/*.json
// and is described by these interfaces (see MAIN.md §11).

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
