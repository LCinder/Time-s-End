// Loads + validates all JSON data, waits for the fonts and draws the textures.

import Phaser from 'phaser';
import { loadCalibration } from '../core/Calibration';
import { AudioEngine } from '../audio/AudioEngine';
import { Game } from '../core/Game';
import { checkLevel, formatIssue } from '../core/levelCheck';
import { DataError, validateControls, validateDifficulties, validateGameConfig, validateLevel, validatePlatformLevel, validateStory } from '../core/validate';
import { FilmPipeline } from '../fx/FilmPipeline';
import { generateTextures } from '../fx/Textures';
import type { ArtManifest } from '../core/types';

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
    this.load.json('story', `data/story.json${v}`);
    this.add.text(640, 360, 'Threading the projector...', { fontFamily: 'Georgia, serif', fontSize: '28px', color: '#cfc8b8' }).setOrigin(0.5);
  }

  async create(): Promise<void> {
    try {
      Game.config = validateGameConfig(this.cache.json.get('game'));
      Game.difficulties = validateDifficulties(this.cache.json.get('difficulty'));
      Game.controls = validateControls(this.cache.json.get('controls'));
      Game.story = validateStory(this.cache.json.get('story'), 'data/story.json');
      Game.calibration = loadCalibration();
      applySettings();

      const params = new URLSearchParams(window.location.search);
      Game.difficulty = params.get('diff') ?? Game.settings.difficulty ?? Game.config.defaultDifficulty;
      if (!Game.difficulties[Game.difficulty]) Game.difficulty = Object.keys(Game.difficulties)[0];
      Game.startBeat = Number(params.get('beat') ?? 0) || 0;
      if (params.get('debug') === '1') Game.config.debug = true;

      for (const id of Game.config.levels) {
        const file = `data/levels/${id}.json`;
        Game.levels[id] = validateLevel(await fetchJson(file), file);
        if (Game.config.debug) {
          // fairness report (same as `npm run check`) in the browser console
          const issues = checkLevel(Game.levels[id], Game.difficulties, Game.config.player);
          if (issues.length) console.warn(`[check] ${file}:\n` + issues.map(formatIssue).join('\n'));
          else console.info(`[check] ${file}: no problems`);
        }
      }
      for (const id of Game.story.chapters.flatMap((ch) => ch.interludes)) {
        const file = `data/levels/${id}.json`;
        Game.platformLevels[id] = validatePlatformLevel(await fetchJson(file), file);
      }
      for (const ch of Game.story.chapters) {
        if (!Game.levels[ch.feature]) throw new DataError('data/story.json', [`chapter "${ch.id}": feature "${ch.feature}" is not in game.json "levels"`]);
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
    await this.loadArt();

    const params = new URLSearchParams(window.location.search);
    this.scene.start('Splash', { skipTo: params.get('level') ?? undefined });
  }

  /** Hand-drawn pose sheets made with `npm run art` (optional: without them the bosses are drawn by code). */
  private async loadArt(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    if (params.get('art') === '0' || (Game.config.bossArt === false && params.get('art') !== '1')) return;
    const bosses = [...new Set(Object.values(Game.levels).map((l) => l.boss))];
    for (const boss of bosses) {
      try {
        const res = await fetch(`art/${boss}/manifest.json?v=${Date.now()}`);
        if (!res.ok) continue;
        const m = (await res.json()) as ArtManifest;
        if (m.type !== 'parts' || !m.parts?.body || !m.anchors?.face) continue;
        for (const [name, part] of Object.entries(m.parts)) this.load.image(`art:${boss}:${name}`, `art/${boss}/${part.file}`);
        Game.art[boss] = m;
      } catch {
        // no art for this boss (or not JSON): keep the code drawing
      }
    }
    if (!Object.keys(Game.art).length) return;
    await new Promise<void>((done) => {
      this.load.once('complete', () => done());
      this.load.start();
    });
  }
}

async function fetchJson(file: string): Promise<unknown> {
  const res = await fetch(`${file}?v=${Date.now()}`);
  if (!res.ok) throw new DataError(file, [`could not load (HTTP ${res.status})`]);
  try {
    return await res.json();
  } catch (err) {
    throw new DataError(file, [`is not valid JSON: ${(err as Error).message}`]);
  }
}

/** Settings that live per computer (volumes, film flicker...). Called again from Options. */
export function applySettings(): void {
  const s = Game.settings;
  FilmPipeline.tuning = {
    ...Game.config.film,
    flicker: s.reduceFlicker ? 0 : Game.config.film.flicker,
    scratches: s.reduceFlicker ? Math.min(0.4, Game.config.film.scratches) : Game.config.film.scratches,
  };
  if (AudioEngine.ready()) {
    AudioEngine.get().configure({ master: Game.config.masterVolume, music: s.music, sfx: s.sfx, vintage: Game.config.vintageAudio });
  }
}
