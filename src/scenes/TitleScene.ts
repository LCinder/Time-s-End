// Title screen: Tick dances to a little ragtime loop.
// CONTINUE puts you back exactly where you were (MAIN.md §6.3); NEW GAME / LOAD GAME
// pick a film can; PROGRAMME is the level select; OPTIONS and CALIBRATE.

import Phaser from 'phaser';
import { PlaceholderSong } from '../audio/Songs';
import { sfx } from '../audio/Sfx';
import { Conductor } from '../core/Conductor';
import { Game } from '../core/Game';
import { Input } from '../core/Input';
import { clockText, daysAway, framesAvailable, loadSave, SLOTS, type SaveData } from '../core/Save';
import type { PlaceholderMusic } from '../core/types';
import { Player } from '../entities/Player';
import { addFilm } from '../fx/FilmPipeline';
import { Menu } from '../ui/Menu';
import { Scenery } from '../world/Scenery';

const TITLE_MUSIC: PlaceholderMusic = {
  key: 'C',
  swing: 0.62,
  sections: [
    { name: 'a', bars: 4, chords: ['I', 'VI7', 'II7', 'V7'], intensity: 2 },
    { name: 'b', bars: 8, chords: ['I', 'I7', 'IV', 'iv', 'I', 'VI7', 'II7', 'V7'], intensity: 3 },
  ],
};

/** "Reel A · 11:59:07 · 5 frames · 1 friend" */
export function saveSummary(s: SaveData): string {
  const friends = s.freed.length;
  return `Reel ${s.slot} · ${clockText(s, Game.story.secondsPerBoss)} · ${framesAvailable(s)} frames · ${friends} friend${friends === 1 ? '' : 's'}`;
}

/** CONTINUE: resume a level left half-way, or go back to the Bijou (with a recap after a long time away). */
export function continueGame(scene: Phaser.Scene, save: SaveData): void {
  Game.save = save;
  Game.settings.lastSlot = save.slot;
  Game.saveSettings();
  if (save.resume && Game.levelInfo(save.resume.levelId)) {
    scene.scene.start('Resume', { levelId: save.resume.levelId, cue: save.resume.cue });
    return;
  }
  if (daysAway(save) > 3) {
    const friends = save.freed.length ? `${save.freed.length} friend${save.freed.length > 1 ? 's' : ''} in the audience.` : 'No one else in the audience... yet.';
    const cards = Game.story.previously.map((t) => t.replace('{frames}', String(save.frames.length)).replace('{friends}', friends));
    scene.scene.start('Intertitle', { cards, next: 'Bijou' });
    return;
  }
  scene.scene.start('Bijou');
}

export class TitleScene extends Phaser.Scene {
  private conductor!: Conductor;
  private song!: PlaceholderSong;
  private tick!: Player;
  private scenery!: Scenery;
  private input2!: Input;
  private menu!: Menu;
  private logo!: Phaser.GameObjects.Text;
  private leaving = false;
  private select = '';

  constructor() {
    super('Title');
  }

  init(data: { select?: string }): void {
    this.select = data?.select ?? '';
  }

  create(): void {
    this.leaving = false;
    // a test-stage start point does not carry over into a real game
    Game.startBeat = 0;
    this.scenery = new Scenery(this, 600);
    const ground = this.add.graphics().setDepth(20);
    ground.fillStyle(0x5f5246, 1);
    ground.fillRect(0, 600, 1280, 120);
    ground.fillStyle(0x7d6e60, 1);
    ground.fillRect(0, 600, 1280, 22);
    ground.lineStyle(4, 0x141414, 1);
    ground.lineBetween(0, 622, 1280, 622);
    ground.lineBetween(0, 600, 1280, 600);

    // logo card
    const card = this.add.graphics().setDepth(30);
    card.fillStyle(0x141414, 0.9);
    card.fillRoundedRect(300, 60, 680, 230, 30);
    card.lineStyle(6, 0xf4efe4, 1);
    card.strokeRoundedRect(300, 60, 680, 230, 30);
    card.lineStyle(2, 0xf4efe4, 1);
    card.strokeRoundedRect(316, 76, 648, 198, 22);
    this.add.text(640, 104, 'A BIJOU CARTOON', { fontFamily: 'Limelight, Georgia, serif', fontSize: '26px', color: '#cfc8b8' }).setOrigin(0.5).setDepth(31);
    this.logo = this.add
      .text(640, 185, "TIME'S END", { fontFamily: 'Rye, Georgia, serif', fontSize: '104px', color: '#f4efe4', stroke: '#141414', strokeThickness: 12 })
      .setOrigin(0.5)
      .setDepth(31);
    this.add.text(640, 258, 'a rhythm chase in glorious black & white', { fontFamily: 'Limelight, Georgia, serif', fontSize: '22px', color: '#cfc8b8' }).setOrigin(0.5).setDepth(31);

    const last = Game.settings.lastSlot ? loadSave(Game.settings.lastSlot) : null;
    const anySave = SLOTS.some((sl) => loadSave(sl));
    const o = (ms: number): string => `${ms > 0 ? '+' : ''}${ms} ms`;
    this.menu = new Menu(this, [
      { label: 'CONTINUE', enabled: () => !!last, sub: () => (last ? saveSummary(last) : ''), select: () => this.leave(() => continueGame(this, last!)) },
      { label: 'NEW GAME', select: () => this.leave(() => this.scene.start('Slot', { mode: 'new' })) },
      { label: 'LOAD GAME', enabled: () => anySave, select: () => this.leave(() => this.scene.start('Slot', { mode: 'load' })) },
      {
        label: 'PROGRAMME',
        enabled: () => !!last,
        select: () => this.leave(() => {
          Game.save = last;
          this.scene.start('Programme', { back: 'Title' });
        }),
      },
      { label: 'OPTIONS', select: () => this.leave(() => this.scene.start('Options', { back: 'Title' })) },
      { label: 'CALIBRATE', sub: () => `picture ${o(Game.audioOffsetMs)}  ·  keys ${o(Game.inputOffsetMs)}`, select: () => this.leave(() => this.scene.start('Calibrate')) },
    ], { y: 322, spacing: 56, size: 34 });
    if (this.select === 'calibrate') this.menu.sel = 5;
    if (this.select === 'options') this.menu.sel = 4;
    this.add
      .text(640, 700, '↑/↓ choose · Enter select   |   Arrows / WASD move · Z / Space jump · Shift dash · Esc pause', {
        fontFamily: 'Limelight, Georgia, serif',
        fontSize: '18px',
        color: '#f4efe4',
        stroke: '#141414',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(31);

    // the test stage, in plain sight for whoever is building the game (game.json "testStage")
    if (Game.config.testStage !== false) {
      const btn = this.add
        .text(28, 22, '▶ TEST STAGE  (T)', { fontFamily: 'Rye, Georgia, serif', fontSize: '22px', color: '#f4efe4', backgroundColor: '#141414', padding: { x: 12, y: 6 } })
        .setDepth(40)
        .setInteractive({ useHandCursor: true });
      const open = (): void => {
        if (this.leaving) return;
        sfx('select');
        this.leave(() => this.scene.start('Test'));
      };
      btn.on('pointerdown', open);
      btn.on('pointerover', () => btn.setColor('#ffe9a8'));
      btn.on('pointerout', () => btn.setColor('#f4efe4'));
      this.input.keyboard?.on('keydown-T', open);
    }

    this.tick = new Player(this, 1090, 600, Game.config.player);
    addFilm(this, 'bw1928');
    this.input2 = new Input(this, Game.controls);

    this.conductor = new Conductor([{ beat: 0, bpm: 120 }], 4);
    this.startMusic();
    this.events.once('shutdown', () => this.song?.stop());
  }

  private startMusic(): void {
    this.song?.stop();
    this.song = new PlaceholderSong(this.conductor, TITLE_MUSIC, [], 4, { voice: false });
    this.conductor.start(0, 0.1);
    this.song.start(0);
  }

  private leave(go: () => void): void {
    if (this.leaving) return;
    this.leaving = true;
    this.song.stop();
    this.cameras.main.fadeOut(400, 11, 11, 11);
    this.time.delayedCall(420, go);
  }

  update(_t: number, delta: number): void {
    const dt = Math.min(delta / 1000, 1 / 30);
    const time = this.time.now / 1000;
    this.input2.update();
    const beat = this.conductor.beat;
    if (beat >= this.song.lengthBeats) this.startMusic();

    this.scenery.update(time * 60, beat, time, 0);
    this.tick.dance(beat);
    this.tick.draw(dt, time, beat, 0);
    const ph = beat - Math.floor(beat);
    this.logo.setScale(1 + Math.pow(1 - ph, 4) * 0.04);
    this.logo.setAngle(Math.sin(beat * Math.PI) * 1.5);

    if (!this.leaving) this.menu.update(this.input2, ph);
  }
}
