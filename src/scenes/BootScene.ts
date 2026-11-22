// Loads + validates all JSON data, waits for the fonts and draws the textures.

import Phaser from 'phaser';
import { Game } from '../core/Game';
import { DataError, validateControls, validateDifficulties, validateGameConfig, validateLevel } from '../core/validate';
import { FilmPipeline } from '../fx/FilmPipeline';
import { generateTextures } from '../fx/Textures';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // bust the cache so edits to the JSON are picked up on reload
    const v = `?v=${Date.now()}`;
    this.load.json('game', `data/config/game.json${v}`);
    this.load.json('difficulty', `data/config/difficulty.json${v}`);
    this.load.json('controls', `data/config/controls.json${v}`);
    this.add.text(640, 360, 'Threading the projector...', { fontFamily: 'Georgia, serif', fontSize: '28px', color: '#cfc8b8' }).setOrigin(0.5);
  }

  async create(): Promise<void> {
    try {
      Game.config = validateGameConfig(this.cache.json.get('game'));
      Game.difficulties = validateDifficulties(this.cache.json.get('difficulty'));
      Game.controls = validateControls(this.cache.json.get('controls'));
      FilmPipeline.tuning = Game.config.film;

      const params = new URLSearchParams(window.location.search);
      Game.difficulty = params.get('diff') ?? Game.config.defaultDifficulty;
      if (!Game.difficulties[Game.difficulty]) Game.difficulty = Object.keys(Game.difficulties)[0];
      Game.startBeat = Number(params.get('beat') ?? 0) || 0;
      if (params.get('debug') === '1') Game.config.debug = true;

      for (const id of Game.config.levels) {
        const file = `data/levels/${id}.json`;
        const res = await fetch(`${file}?v=${Date.now()}`);
        if (!res.ok) throw new DataError(file, [`could not load (HTTP ${res.status})`]);
        let raw: unknown;
        try {
          raw = await res.json();
        } catch (err) {
          throw new DataError(file, [`is not valid JSON: ${(err as Error).message}`]);
        }
        Game.levels[id] = validateLevel(raw, file);
      }
    } catch (err) {
      if (err instanceof DataError) {
        this.scene.start('Error', { file: err.file, problems: err.problems });
      } else {
        this.scene.start('Error', { file: 'data', problems: [String((err as Error).message ?? err)] });
      }
      return;
    }

    await Promise.race([
      Promise.all([document.fonts.load('40px Rye'), document.fonts.load('40px Limelight')]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
    generateTextures(this);

    const params = new URLSearchParams(window.location.search);
    this.scene.start('Splash', { skipTo: params.get('level') ?? undefined });
  }
}
