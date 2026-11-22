// A vertical menu in the style of the title screen: ↑/↓ choose, ←/→ change a
// value, ENTER (or JUMP) confirms. The chosen item pulses on the beat.

import Phaser from 'phaser';
import { sfx } from '../audio/Sfx';
import type { Input } from '../core/Input';

export interface MenuItem {
  label: string | (() => string);
  sub?: () => string;
  enabled?: () => boolean;
  select?: () => void;
  change?: (dir: -1 | 1) => void;
}

export class Menu {
  private texts: Phaser.GameObjects.Text[] = [];
  private subs: (Phaser.GameObjects.Text | null)[] = [];
  sel = 0;

  constructor(
    scene: Phaser.Scene,
    private items: MenuItem[],
    opts: { x?: number; y: number; spacing?: number; size?: number; depth?: number },
  ) {
    const x = opts.x ?? 640;
    const spacing = opts.spacing ?? 52;
    items.forEach((it, i) => {
      const y = opts.y + i * spacing;
      this.texts.push(
        scene.add
          .text(x, y, '', { fontFamily: 'Rye, Georgia, serif', fontSize: `${opts.size ?? 36}px`, color: '#f4efe4', stroke: '#141414', strokeThickness: 8 })
          .setOrigin(0.5)
          .setDepth(opts.depth ?? 31),
      );
      this.subs.push(
        it.sub
          ? scene.add
            .text(x, y + (opts.size ?? 36) * 0.82, '', { fontFamily: 'Limelight, Georgia, serif', fontSize: '17px', color: '#cfc8b8', stroke: '#141414', strokeThickness: 4 })
            .setOrigin(0.5)
            .setDepth(opts.depth ?? 31)
          : null,
      );
    });
    while (this.sel < items.length - 1 && !this.enabled(this.sel)) this.sel++;
    this.refresh(0);
  }

  private enabled(i: number): boolean {
    return this.items[i].enabled ? this.items[i].enabled!() : true;
  }

  /** Call every frame. `ph` = phase inside the current beat (for the pulse). */
  update(input: Input, ph = 0): void {
    const n = this.items.length;
    const move = (d: number): void => {
      let k = this.sel;
      for (let tries = 0; tries < n; tries++) {
        k = (k + d + n) % n;
        if (this.enabled(k)) break;
      }
      if (k !== this.sel) {
        this.sel = k;
        sfx('select');
      }
    };
    if (input.consume('up') !== null) move(-1);
    if (input.consume('down') !== null) move(1);
    input.consume('jump'); // ▲/W double as jump keys
    const it = this.items[this.sel];
    if (it.change) {
      if (input.consume('left') !== null) { it.change(-1); sfx('select'); }
      if (input.consume('right') !== null) { it.change(1); sfx('select'); }
    } else {
      input.consume('left');
      input.consume('right');
    }
    if (input.consume('confirm') !== null && it.select && this.enabled(this.sel)) {
      sfx('select');
      it.select();
    }
    this.refresh(ph);
  }

  refresh(ph: number): void {
    this.items.forEach((it, i) => {
      const t = this.texts[i];
      const label = typeof it.label === 'function' ? it.label() : it.label;
      const on = i === this.sel;
      t.setText(label);
      t.setAlpha(!this.enabled(i) ? 0.22 : on ? 1 : 0.45);
      t.setScale(on ? 1 + Math.pow(1 - ph, 3) * 0.06 : 0.86);
      const s = this.subs[i];
      if (s && it.sub) s.setText(it.sub()).setAlpha(on ? 1 : 0.5);
    });
  }

  destroy(): void {
    [...this.texts, ...this.subs].forEach((t) => t?.destroy());
  }
}
