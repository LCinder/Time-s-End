// Art-deco title card before each cartoon: "A BIJOU CARTOON – OLD SMOKESTACK in FULL STEAM AHEAD".

import Phaser from 'phaser';
import { sfx } from '../audio/Sfx';
import { Game } from '../core/Game';
import { Input } from '../core/Input';
import { addFilm } from '../fx/FilmPipeline';

export class TitleCardScene extends Phaser.Scene {
  private rays!: Phaser.GameObjects.Graphics;
  private levelId = 'smokestack';
  private input2!: Input;
  private done = false;
  private clickTimer = 0;

  constructor() {
    super('TitleCard');
  }

  init(data: { levelId: string }): void {
    this.levelId = data.levelId;
    this.done = false;
  }

  create(): void {
    const L = Game.levels[this.levelId];
    this.cameras.main.setBackgroundColor('#2a2824');
    this.rays = this.add.graphics();
    const frame = this.add.graphics();
    frame.fillStyle(0x141414, 1);
    frame.fillRoundedRect(230, 90, 820, 540, 60);
    frame.lineStyle(8, 0xf4efe4, 1);
    frame.strokeRoundedRect(230, 90, 820, 540, 60);
    frame.lineStyle(3, 0xf4efe4, 1);
    frame.strokeRoundedRect(250, 110, 780, 500, 46);
    // deco corners
    for (const [x, y] of [[250, 110], [1030, 110], [250, 610], [1030, 610]]) {
      frame.fillStyle(0xf4efe4, 1);
      frame.fillCircle(x, y, 14);
      frame.fillStyle(0x141414, 1);
      frame.fillCircle(x, y, 7);
    }

    const txt = (y: number, s: string, size: number, font = 'Limelight', color = '#f4efe4'): Phaser.GameObjects.Text =>
      this.add.text(640, y, s, { fontFamily: `${font}, Georgia, serif`, fontSize: `${size}px`, color, align: 'center' }).setOrigin(0.5);
    txt(170, 'A  BIJOU  CARTOON', 30, 'Limelight', '#cfc8b8');
    const boss = txt(270, L.subtitle.toUpperCase(), 78, 'Rye');
    txt(345, 'in', 34);
    const title = txt(430, `"${L.title}"`, 64, 'Rye');
    txt(540, `Difficulty: ${Game.diff.label}`, 24, 'Limelight', '#cfc8b8');
    txt(578, 'press ENTER', 20, 'Limelight', '#8a857a');
    for (const t of [boss, title]) {
      t.setScale(0.2);
      this.tweens.add({ targets: t, scale: 1, duration: 700, ease: 'Back.Out' });
    }

    addFilm(this, L.era);
    this.input2 = new Input(this, Game.controls);
    this.time.delayedCall(4200, () => this.go());
  }

  private go(): void {
    if (this.done) return;
    this.done = true;
    this.cameras.main.fadeOut(300, 11, 11, 11);
    this.time.delayedCall(320, () => this.scene.start('Chase', { levelId: this.levelId }));
  }

  update(_t: number, delta: number): void {
    const time = this.time.now / 1000;
    this.input2.update();
    if (this.input2.consume('confirm') !== null) this.go();
    // projector clatter
    this.clickTimer -= delta;
    if (this.clickTimer <= 0) {
      this.clickTimer = 42;
      sfx('click');
    }
    const g = this.rays;
    g.clear();
    g.fillStyle(0x3a3732, 1);
    const n = 24;
    for (let i = 0; i < n; i += 2) {
      const a0 = (i / n) * Math.PI * 2 + time * 0.15;
      const a1 = ((i + 1) / n) * Math.PI * 2 + time * 0.15;
      g.fillTriangle(640, 360, 640 + Math.cos(a0) * 1000, 360 + Math.sin(a0) * 1000, 640 + Math.cos(a1) * 1000, 360 + Math.sin(a1) * 1000);
    }
  }
}
