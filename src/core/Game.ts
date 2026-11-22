// Global game state (loaded once in BootScene).

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

  get diff(): DifficultySpec {
    return this.difficulties[this.difficulty] ?? Object.values(this.difficulties)[0];
  }

  difficultyNames(): string[] {
    return Object.keys(this.difficulties);
  }
}

export const Game = new GameState();
