// Silent-film intertitle cards ("Spring, 1912…"), drawn over whatever is on screen.
// Tap JUMP / ENTER to go to the next card, HOLD it to skip them all (so a card
// already seen is never forced on the player, MAIN.md §6.3).

import Phaser from 'phaser';
import { sfx } from '../audio/Sfx';
import type { Input } from '../core/Input';

export interface CardsOptions {
  /** Seconds each card stays before moving on by itself (0 = wait for a press). */
  autoSec?: number;
  /** Small text under the card (e.g. the lost object's name). */
  caption?: string;
  /** Opaque black background (true) or a dark veil over the game (false). */
  opaque?: boolean;
  depth?: number;
}

const HOLD_TO_SKIP_MS = 650;

export class Cards {
  private c: Phaser.GameObjects.Container;
  private text: Phaser.GameObjects.Text;
  private hint: Phaser.GameObjects.Text;
  private holdBar: Phaser.GameObjects.Graphics;
  private i = -1;
  private shownAt = 0;
  private heldMs = 0;
  private holdStart = 0;
  private finished = false;

  constructor(
    private scene: Phaser.Scene,
    private input: Input,
    private texts: string[],
    private onDone: () => void,
    private opts: CardsOptions = {},
  ) {
    const depth = opts.depth ?? 300;
    this.c = scene.add.container(0, 0).setDepth(depth).setScrollFactor(0, 0, true);
    const bg = scene.add.graphics();
    bg.fillStyle(0x0b0b0b, opts.opaque === false ? 0.82 : 1);
    bg.fillRect(0, 0, 1280, 720);
    // ornate silent-film border
    bg.lineStyle(5, 0xf4efe4, 1);
    bg.strokeRoundedRect(150, 110, 980, 500, 26);
    bg.lineStyle(2, 0xf4efe4, 1);
    bg.strokeRoundedRect(166, 126, 948, 468, 18);
    for (const [x, y] of [[166, 126], [1114, 126], [166, 594], [1114, 594]]) {
      bg.fillStyle(0xf4efe4, 1);
      bg.fillCircle(x, y, 9);
    }
    bg.lineStyle(2, 0xf4efe4, 0.8);
    bg.lineBetween(520, 560, 760, 560);
    bg.lineBetween(520, 160, 760, 160);
    this.c.add(bg);
    this.text = scene.add
      .text(640, 360, '', { fontFamily: 'Limelight, Georgia, serif', fontSize: '42px', color: '#f4efe4', align: 'center', wordWrap: { width: 860 }, lineSpacing: 10 })
      .setOrigin(0.5);
    this.c.add(this.text);
    this.hint = scene.add
      .text(640, 652, 'JUMP / ENTER  next   ·   hold to skip', { fontFamily: 'Limelight, Georgia, serif', fontSize: '18px', color: '#8a857a' })
      .setOrigin(0.5);
    this.c.add(this.hint);
    if (opts.caption) {
      this.c.add(scene.add.text(640, 528, opts.caption, { fontFamily: 'Rye, Georgia, serif', fontSize: '24px', color: '#cfc8b8' }).setOrigin(0.5));
    }
    this.holdBar = scene.add.graphics();
    this.c.add(this.holdBar);
    input.clear();
    this.next();
  }

  get done(): boolean {
    return this.finished;
  }

  private next(): void {
    this.i++;
    if (this.i >= this.texts.length) {
      this.finish();
      return;
    }
    const t = this.texts[this.i];
    this.text.setText(t);
    // a lone time stamp ("11:59") gets the big treatment
    const big = t.length <= 8;
    this.text.setFontFamily(big ? 'Rye, Georgia, serif' : 'Limelight, Georgia, serif').setFontSize(big ? 120 : 42);
    this.text.setAlpha(0);
    this.scene.tweens.add({ targets: this.text, alpha: 1, duration: 350 });
    this.shownAt = this.scene.time.now;
    sfx('click');
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.scene.tweens.add({
      targets: this.c,
      alpha: 0,
      duration: 300,
      onComplete: () => {
        this.c.destroy();
        this.onDone();
      },
    });
  }

  /** Call every frame (after input.update()). */
  update(_delta = 0): void {
    if (this.finished) return;
    const holding = this.input.isDown('jump') || this.input.isDown('confirm');
    // real time, not the frame delta (Phaser smooths it, which breaks on slow machines)
    const now = performance.now();
    if (holding && !this.holdStart) this.holdStart = now;
    if (!holding) this.holdStart = 0;
    this.heldMs = this.holdStart ? now - this.holdStart : 0;
    const g = this.holdBar;
    g.clear();
    if (this.heldMs > 120) {
      const f = Math.min(1, this.heldMs / HOLD_TO_SKIP_MS);
      g.fillStyle(0xf4efe4, 0.8);
      g.fillRect(540, 672, 200 * f, 4);
    }
    if (this.heldMs >= HOLD_TO_SKIP_MS) {
      this.finish();
      return;
    }
    const pressed = this.input.consume('jump') !== null || this.input.consume('confirm') !== null;
    const age = this.scene.time.now - this.shownAt;
    if ((pressed && age > 250) || (this.opts.autoSec && age > this.opts.autoSec * 1000)) this.next();
  }
}
