// Global game state (loaded once in BootScene).

import { clampOffset, saveCalibration, type CalibrationData } from './Calibration';
import type { ControlsConfig, DifficultySpec, GameConfig, LevelData } from './types';

export interface Results {
  levelId: string;
  victory: boolean;
  hitsTaken: number;
  onBeat: number;
  beatActions: number;
  bestCombo: number;
  rank: string;
}

class GameState {
  config!: GameConfig;
  difficulties!: Record<string, DifficultySpec>;
  controls!: ControlsConfig;
  levels: Record<string, LevelData> = {};
  difficulty = 'normal';
  /** Practice: start the level at this beat (URL ?beat=64). */
  startBeat = 0;
  lastResults: Results | null = null;
  /** This browser's latency tweak, added on top of game.json (see Calibration.ts). */
  calibration: CalibrationData = { audioOffsetMs: 0, inputOffsetMs: 0 };

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

  get diff(): DifficultySpec {
    return this.difficulties[this.difficulty] ?? Object.values(this.difficulties)[0];
  }

  difficultyNames(): string[] {
    return Object.keys(this.difficulties);
  }
}

export const Game = new GameState();
