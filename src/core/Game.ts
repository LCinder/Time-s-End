// Global game state (loaded once in BootScene).

import { clampOffset, saveCalibration, type CalibrationData } from './Calibration';
import { loadSettings, writeSave, writeSettings, type SaveData, type Settings } from './Save';
import type { ArtManifest, ControlsConfig, DifficultySpec, DuelInfo, GameConfig, LevelData, PlatformLevel, StoryData } from './types';

export interface Results {
  levelId: string;
  victory: boolean;
  hitsTaken: number;
  onBeat: number;
  beatActions: number;
  bestCombo: number;
  rank: string;
}

/** Where to go when a level ends. */
export type ReturnTo = 'hub' | 'programme' | 'title' | 'test';

export interface GhostSample {
  b: number; // beat
  x: number; // screen x
  y: number;
  g: boolean; // on ground
  f: number; // facing
}

class GameState {
  config!: GameConfig;
  difficulties!: Record<string, DifficultySpec>;
  controls!: ControlsConfig;
  levels: Record<string, LevelData> = {};
  /** Hand-drawn pose sheets that were found and loaded, by boss id. */
  art: Record<string, ArtManifest> = {};
  platformLevels: Record<string, PlatformLevel> = {};
  /** Duel levels (Miss Pirouette…), loaded for the chapters whose feature is a duel. */
  duels: Record<string, DuelInfo> = {};
  story!: StoryData;
  difficulty = 'normal';
  /** Practice: start the level at this beat (URL ?beat=64). */
  startBeat = 0;
  /** Testing: hits and falls cost nothing, so a whole level can be played through (`?god=1`, or F2 with debug on). */
  invincible = false;
  lastResults: Results | null = null;
  /** This browser's latency tweak, added on top of game.json (see Calibration.ts). */
  calibration: CalibrationData = { audioOffsetMs: 0, inputOffsetMs: 0 };
  settings: Settings = loadSettings();
  /** The film can being played (null on the title screen before choosing). */
  save: SaveData | null = null;
  returnTo: ReturnTo = 'title';
  /** The previous attempt of each level, drawn as a ghost on the next one (idea 11). */
  ghosts: Record<string, GhostSample[]> = {};

  /** Any level the game can start (chase, duel or interlude), by id. */
  levelInfo(id: string): { title: string; subtitle: string } | undefined {
    return this.levels[id] ?? this.duels[id] ?? this.platformLevels[id];
  }

  get diff(): DifficultySpec {
    return this.difficulties[this.difficulty] ?? Object.values(this.difficulties)[0];
  }

  difficultyNames(): string[] {
    return Object.keys(this.difficulties);
  }

  /** Effective audio offset = game.json + calibration. */
  get audioOffsetMs(): number {
    return clampOffset(this.config.audioOffsetMs + this.calibration.audioOffsetMs);
  }

  /** Effective input offset = game.json + calibration. */
  get inputOffsetMs(): number {
    return clampOffset(this.config.inputOffsetMs + this.calibration.inputOffsetMs);
  }

  /** Store new *effective* offsets (the part beyond game.json goes to the browser). */
  setOffsets(audioMs: number, inputMs: number): void {
    this.calibration = {
      audioOffsetMs: clampOffset(audioMs) - this.config.audioOffsetMs,
      inputOffsetMs: clampOffset(inputMs) - this.config.inputOffsetMs,
    };
    saveCalibration(this.calibration);
  }

  persist(): void {
    if (this.save) writeSave(this.save);
  }

  saveSettings(): void {
    writeSettings(this.settings);
  }

  /** The chapter whose feature hasn't been freed yet (or the last one). */
  get chapter(): StoryData['chapters'][number] {
    const ch = this.story.chapters;
    return ch.find((c) => !this.save?.freed.includes(c.feature)) ?? ch[ch.length - 1];
  }
}

export const Game = new GameState();
