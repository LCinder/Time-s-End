// The railway: ground segments (with gaps from level events) + signs.
// Drawn every frame in screen space without wobble so it scrolls smoothly.

import Phaser from 'phaser';
import type { LevelEvent } from '../core/types';
import { INK, PAPER } from '../rig/Ink';
import type { SolidWorld } from './Solids';

interface Segment {
  x1: number;
  x2: number;
}

interface Sign {
  worldX: number;
  img: Phaser.GameObjects.Image;
  text: Phaser.GameObjects.Text;
}

export class Track {
  private gfx: Phaser.GameObjects.Graphics;
  segments: Segment[] = [];
  gaps: Segment[] = [];
  private signs: Sign[] = [];

  constructor(
    private scene: Phaser.Scene,
    world: SolidWorld,
    events: LevelEvent[],
    opts: { groundY: number; ppb: number; anchorX: number; gapLeadPx: number; endBeat: number },
  ) {
    this.gfx = scene.add.graphics().setDepth(20);
    const { groundY, ppb, anchorX, gapLeadPx, endBeat } = opts;

    this.gaps = events
      .filter((e) => e.type === 'gap')
      .map((e) => {
        const x1 = e.beat * ppb + anchorX + gapLeadPx;
        return { x1, x2: x1 + Number(e.lengthBeats) * ppb };
      })
      .sort((a, b) => a.x1 - b.x1);

    let cursor = -3000;
    const end = (endBeat + 40) * ppb + 2000;
    for (const g of this.gaps) {
      if (g.x1 > cursor) this.segments.push({ x1: cursor, x2: g.x1 });
      cursor = Math.max(cursor, g.x2);
    }
    this.segments.push({ x1: cursor, x2: end });
    for (const s of this.segments) world.add({ x: s.x1, y: groundY, w: s.x2 - s.x1, h: 400, active: true });

    for (const e of events.filter((ev) => ev.type === 'sign')) {
      const sx = typeof e.x === 'number' ? e.x : 1100;
      const worldX = e.beat * ppb + sx;
      const img = scene.add.image(0, groundY + 6, 'sign_0').setOrigin(0.5, 1).setDepth(15).setScale(0.9);
      const text = scene.add
        .text(0, 0, String(e.text), {
          fontFamily: 'Rye, Georgia, serif',
          fontSize: '22px',
          color: '#141414',
          align: 'center',
          wordWrap: { width: 200 },
        })
        .setOrigin(0.5)
        .setDepth(16);
      this.signs.push({ worldX, img, text });
    }
    void this.scene;
  }

  update(camX: number, time: number, groundY: number): void {
    const g = this.gfx;
    g.clear();
    const left = camX - 60;
    const right = camX + 1340;

    // canyon walls behind gaps
    for (const gap of this.gaps) {
      if (gap.x2 < left || gap.x1 > right) continue;
      const x1 = gap.x1 - camX;
      const x2 = gap.x2 - camX;
      g.fillStyle(0x2a2622, 1);
      g.fillRect(x1, groundY + 8, x2 - x1, 140);
      g.fillStyle(0x151312, 1);
      g.fillRect(x1 + 10, groundY + 40, x2 - x1 - 20, 120);
    }

    for (const s of this.segments) {
      if (s.x2 < left || s.x1 > right) continue;
      const x1 = Math.max(s.x1, left) - camX;
      const x2 = Math.min(s.x2, right) - camX;
      // earth
      g.fillStyle(0x5f5246, 1);
      g.fillRect(x1, groundY, x2 - x1, 140);
      g.fillStyle(0x7d6e60, 1);
      g.fillRect(x1, groundY, x2 - x1, 22);
      g.lineStyle(4, INK, 1);
      g.lineBetween(x1, groundY + 22, x2, groundY + 22);
      // pebbles
      g.fillStyle(0x4a4038, 1);
      const p0 = Math.floor(Math.max(s.x1, left) / 47);
      for (let i = p0; i * 47 < Math.min(s.x2, right); i++) {
        const px = i * 47 - camX + ((i * 13) % 20);
        g.fillCircle(px, groundY + 50 + ((i * 29) % 50), 4 + (i % 3));
      }
      // sleepers
      g.fillStyle(0x3b2e22, 1);
      const s0 = Math.ceil((Math.max(s.x1, left) + 6) / 38);
      for (let i = s0; i * 38 + 22 < Math.min(s.x2, right); i++) {
        const sx = i * 38 - camX;
        g.fillRect(sx, groundY - 8, 22, 14);
        g.lineStyle(2, INK, 1);
        g.strokeRect(sx, groundY - 8, 22, 14);
      }
      // rail
      g.fillStyle(0xa8a8a8, 1);
      g.fillRect(x1, groundY - 14, x2 - x1, 8);
      g.lineStyle(3, INK, 1);
      g.strokeRect(x1, groundY - 14, x2 - x1, 8);
      // edges (cliff) next to gaps
      for (const edge of [s.x1, s.x2]) {
        if (edge < left || edge > right) continue;
        const ex = edge - camX;
        g.lineStyle(5, INK, 1);
        g.lineBetween(ex, groundY - 14, ex, groundY + 140);
        // broken rail end sticking out
        const dir = edge === s.x1 ? -1 : 1;
        g.fillStyle(0xa8a8a8, 1);
        g.fillTriangle(ex, groundY - 14, ex + dir * 22, groundY - 4, ex, groundY - 6);
      }
    }

    for (const sgn of this.signs) {
      const sx = sgn.worldX - camX;
      const vis = sx > -200 && sx < 1500;
      sgn.img.setVisible(vis);
      sgn.text.setVisible(vis);
      if (!vis) continue;
      sgn.img.x = sx;
      sgn.img.setTexture(`sign_${Math.floor(time * 8) % 3}`);
      const wob = Math.sin(time * 6) * 0.02;
      sgn.img.setRotation(wob);
      sgn.text.setPosition(sx, groundY + 6 - 230 * 0.9 + 52);
      sgn.text.setRotation(wob);
    }
    void PAPER;
  }
}
