// Title screen: Tick dances to a little ragtime loop; choose difficulty and start.

import Phaser from 'phaser';
import { sfx } from '../audio/Sfx';
import { PlaceholderSong } from '../audio/Songs';
import { Conductor } from '../core/Conductor';
import { Game } from '../core/Game';
import { Input } from '../core/Input';
import type { PlaceholderMusic } from '../core/types';
import { Player } from '../entities/Player';
import { addFilm } from '../fx/FilmPipeline';
import { Scenery } from '../world/Scenery';

const TITLE_MUSIC: PlaceholderMusic = {
  key: 'C',
  swing: 0.62,
  sections: [
    { name: 'a', bars: 4, chords: ['I', 'VI7', 'II7', 'V7'], intensity: 2 },
    { name: 'b', bars: 8, chords: ['I', 'I7', 'IV', 'iv', 'I', 'VI7', 'II7', 'V7'], intensity: 3 },
  ],
};

export class TitleScene extends Phaser.Scene {
  private conductor!: Conductor;
  private song!: PlaceholderSong;
  private tick!: Player;
  private scenery!: Scenery;
  private input2!: Input;
  private diffText!: Phaser.GameObjects.Text;
  private logo!: Phaser.GameObjects.Text;
  private leaving = false;

  constructor() {
    super('Title');
  }

  create(): void {
    this.leaving = false;
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

    const press = this.add
      .text(640, 360, 'PRESS ENTER', { fontFamily: 'Rye, Georgia, serif', fontSize: '44px', color: '#f4efe4', stroke: '#141414', strokeThickness: 9 })
      .setOrigin(0.5)
      .setDepth(31);
    this.tweens.add({ targets: press, alpha: 0.25, yoyo: true, repeat: -1, duration: 455 });
    this.diffText = this.add
      .text(640, 420, '', { fontFamily: 'Limelight, Georgia, serif', fontSize: '30px', color: '#f4efe4', stroke: '#141414', strokeThickness: 6 })
      .setOrigin(0.5)
      .setDepth(31);
    this.add
      .text(640, 700, 'Arrows / WASD move · Z / Space jump · Shift dash · jump ON THE BEAT for bonus · Esc pause', {
        fontFamily: 'Limelight, Georgia, serif',
        fontSize: '18px',
        color: '#f4efe4',
        stroke: '#141414',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(31);
    this.refreshDiff();

    this.tick = new Player(this, 640, 600, Game.config.player);
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

  private refreshDiff(): void {
    const label = Game.diff.label;
    this.diffText.setText(`<  ${label}  >`);
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

    if (this.leaving) return;
    const names = Game.difficultyNames();
    const i = names.indexOf(Game.difficulty);
    if (this.input2.consume('left') !== null) {
      Game.difficulty = names[(i - 1 + names.length) % names.length];
      sfx('select');
      this.refreshDiff();
    }
    if (this.input2.consume('right') !== null) {
      Game.difficulty = names[(i + 1) % names.length];
      sfx('select');
      this.refreshDiff();
    }
    if (this.input2.consume('confirm') !== null) {
      this.leaving = true;
      sfx('select');
      this.song.stop();
      this.cameras.main.fadeOut(400, 11, 11, 11);
      this.time.delayedCall(420, () => this.scene.start('TitleCard', { levelId: Game.config.levels[0] }));
    }
  }
}
