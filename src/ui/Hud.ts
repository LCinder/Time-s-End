// Minimal vintage HUD: film frames = hits left, on-beat combo, and the reel progress.

import Phaser from 'phaser';

export class Hud {
  private frames: Phaser.GameObjects.Image[] = [];
  private combo: Phaser.GameObjects.Text;
  private judge: Phaser.GameObjects.Text;
  private bar: Phaser.GameObjects.Graphics;
  private judgeTimer = 0;

  constructor(private scene: Phaser.Scene, maxHits: number) {
    for (let i = 0; i < Math.min(maxHits, 10); i++) {
      this.frames.push(scene.add.image(36 + i * 42, 36, 'film_0').setDepth(95));
    }
    this.combo = scene.add
      .text(1244, 24, '', { fontFamily: 'Rye, Georgia, serif', fontSize: '28px', color: '#f4efe4', stroke: '#141414', strokeThickness: 7 })
      .setOrigin(1, 0)
      .setDepth(95);
    this.judge = scene.add
      .text(0, 0, '', { fontFamily: 'Rye, Georgia, serif', fontSize: '26px', color: '#f4efe4', stroke: '#141414', strokeThickness: 7 })
      .setOrigin(0.5)
      .setDepth(96)
      .setAlpha(0);
    this.bar = scene.add.graphics().setDepth(95);
  }

  update(dt: number, time: number, hitsLeft: number, combo: number, progress: number): void {
    this.frames.forEach((f, i) => {
      f.setTexture(`film_${Math.floor(time * 8 + i) % 3}`);
      const alive = i < hitsLeft;
      f.setAlpha(alive ? 1 : 0.25);
      f.setAngle(alive ? Math.sin(time * 4 + i) * 4 : 20);
    });
    this.combo.setText(combo >= 2 ? `ON BEAT x${combo}` : '');
    this.combo.setScale(1 + Math.max(0, this.judgeTimer) * 0.4);

    // progress: a strip of film with Tick's position
    const g = this.bar;
    g.clear();
    const x0 = 440;
    const x1 = 840;
    g.fillStyle(0x141414, 0.85);
    g.fillRoundedRect(x0 - 6, 22, x1 - x0 + 12, 16, 6);
    g.fillStyle(0xf4efe4, 0.9);
    for (let x = x0; x < x1; x += 14) g.fillRect(x, 26, 6, 3);
    for (let x = x0; x < x1; x += 14) g.fillRect(x, 33, 6, 3);
    const px = x0 + (x1 - x0) * Phaser.Math.Clamp(progress, 0, 1);
    g.fillStyle(0xd8c17a, 1);
    g.fillCircle(px, 30, 9);
    g.lineStyle(3, 0x141414, 1);
    g.strokeCircle(px, 30, 9);

    this.judgeTimer -= dt;
    if (this.judgeTimer <= 0) this.judge.setAlpha(Math.max(0, this.judge.alpha - dt * 4));
  }

  /** Pop a judgement word above the player. */
  showJudge(text: string, x: number, y: number): void {
    this.judge.setText(text).setPosition(x, y).setAlpha(1).setScale(1.3);
    this.scene.tweens.add({ targets: this.judge, scale: 1, y: y - 30, duration: 350, ease: 'Back.Out' });
    this.judgeTimer = 0.35;
  }
}
