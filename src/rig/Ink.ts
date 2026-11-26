// "Ink" drawing helpers on top of Phaser Graphics: thick black outlines,
// rubber-hose limbs and a hand-drawn wobble ("line boil") driven by a seed.
// Re-drawing with a new seed every few frames makes lines shimmer like a
// 1930s hand-inked cel.

import type Phaser from 'phaser';

export const INK = 0x141414;
export const PAPER = 0xf4efe4;

type Pt = { x: number; y: number };

export class Ink {
  seed = 0;
  /** Wobble amplitude in px. */
  amp = 1.1;
  /**
   * Optional global deformation applied to every drawn point. This is what makes a
   * character feel like rubber: bend, breathe, lean and wiggle the whole drawing at once.
   */
  warp: ((x: number, y: number) => Pt) | null = null;

  constructor(public g: Phaser.GameObjects.Graphics) {}

  /** Apply the warp (if any). */
  w(p: Pt): Pt {
    return this.warp ? this.warp(p.x, p.y) : p;
  }

  private hash(a: number, b: number): number {
    const s = Math.sin(a * 127.1 + b * 311.7 + this.seed * 74.7) * 43758.5453;
    return s - Math.floor(s);
  }

  /** Jitter a point (deterministic for the current seed). */
  j(x: number, y: number): Pt {
    const kx = Math.round(x * 0.5);
    const ky = Math.round(y * 0.5);
    return { x: x + (this.hash(kx, ky) - 0.5) * 2 * this.amp, y: y + (this.hash(ky + 3.1, kx) - 0.5) * 2 * this.amp };
  }

  /** Points around an ellipse, with wobble. */
  ellipsePts(cx: number, cy: number, rx: number, ry: number, n = 28, rot = 0): Pt[] {
    const pts: Pt[] = [];
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const wob = 1 + (this.hash(i, n) - 0.5) * 0.035 * (this.amp > 0 ? 1 : 0);
      const ex = Math.cos(a) * rx * wob;
      const ey = Math.sin(a) * ry * wob;
      pts.push({ x: cx + ex * c - ey * s, y: cy + ex * s + ey * c });
    }
    return pts;
  }

  /** Filled shape with a round-jointed ink outline. */
  shape(pts: Pt[], fill: number | null, outline = 4, outlineColor = INK, alpha = 1): void {
    const g = this.g;
    if (this.warp) pts = pts.map((p) => this.w(p));
    if (fill !== null) {
      g.fillStyle(fill, alpha);
      g.fillPoints(pts as Phaser.Types.Math.Vector2Like[], true);
    }
    if (outline > 0) {
      g.lineStyle(outline, outlineColor, alpha);
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.closePath();
      g.strokePath();
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, fill: number | null, outline = 4, rot = 0): void {
    const p = this.j(cx, cy);
    this.shape(this.ellipsePts(p.x, p.y, rx, ry, Math.max(14, Math.round((rx + ry) / 3)), rot), fill, outline);
  }

  circle(cx: number, cy: number, r: number, fill: number | null, outline = 4): void {
    this.ellipse(cx, cy, r, r, fill, outline);
  }

  /** Polygon from raw points (each jittered). */
  poly(raw: Pt[], fill: number | null, outline = 4): void {
    this.shape(raw.map((p) => this.j(p.x, p.y)), fill, outline);
  }

  /** Rounded rectangle as polygon. */
  rrect(x: number, y: number, w: number, h: number, r: number, fill: number | null, outline = 4, outlineColor = INK, alpha = 1): void {
    const pts: Pt[] = [];
    const corners = [
      [x + w - r, y + r, -Math.PI / 2],
      [x + w - r, y + h - r, 0],
      [x + r, y + h - r, Math.PI / 2],
      [x + r, y + r, Math.PI],
    ];
    for (const [cx, cy, a0] of corners) {
      for (let i = 0; i <= 4; i++) {
        const a = a0 + (i / 4) * (Math.PI / 2);
        pts.push(this.j(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
      }
    }
    this.shape(pts, fill, outline, outlineColor, alpha);
  }

  /** Thick stroke following a quadratic curve (a perfect round "hose"): one stroked polyline
   *  with round caps, ink rim under the colour. (It used to stamp a circle every few pixels:
   *  hundreds of shapes a limb, re-drawn every frame, which brought the game to a crawl.) */
  hose(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, width: number, color = INK, outline = 0): void {
    const g = this.g;
    const a = this.j(x1, y1);
    const b = this.j(x2, y2);
    const len = Math.hypot(x2 - x1, y2 - y1) + Math.hypot(cx - x1, cy - y1);
    const n = Math.max(6, Math.min(24, Math.ceil(len / 9)));
    const pts: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const it = 1 - t;
      pts.push(this.w({ x: it * it * a.x + 2 * it * t * cx + t * t * b.x, y: it * it * a.y + 2 * it * t * cy + t * t * b.y }));
    }
    const first = pts[0];
    const last = pts[pts.length - 1];
    const stroke = (w: number, c: number): void => {
      g.lineStyle(w, c, 1);
      g.strokePoints(pts as Phaser.Types.Math.Vector2Like[], false, false);
      g.fillStyle(c, 1);
      g.fillCircle(first.x, first.y, w / 2);
      g.fillCircle(last.x, last.y, w / 2);
    };
    if (outline > 0) stroke(width + outline * 2, INK);
    stroke(width, color);
  }

  line(x1: number, y1: number, x2: number, y2: number, w = 3, color = INK): void {
    const a = this.w(this.j(x1, y1));
    const b = this.w(this.j(x2, y2));
    this.g.lineStyle(w, color, 1);
    this.g.lineBetween(a.x, a.y, b.x, b.y);
    this.g.fillStyle(color, 1);
    this.g.fillCircle(a.x, a.y, w / 2);
    this.g.fillCircle(b.x, b.y, w / 2);
  }

  /** Classic "pie eye": black oval with a wedge cut out. look = -1..1 */
  pieEye(cx: number, cy: number, rx: number, ry: number, lookX = 0, lookY = 0, blink = false, bg = PAPER): void {
    const g = this.g;
    if (blink) {
      this.line(cx - rx, cy, cx + rx, cy, 3);
      return;
    }
    const x = cx + lookX * rx * 0.25;
    const y = cy + lookY * ry * 0.2;
    this.ellipse(x, y, rx, ry, INK, 0);
    // wedge
    g.fillStyle(bg, 1);
    const wx = x + rx * 0.15;
    const wy = y - ry * 0.25;
    const p1 = this.w({ x: wx, y: wy });
    const p2 = this.w({ x: wx + rx * 0.9, y: wy - ry * 0.55 });
    const p3 = this.w({ x: wx + rx * 0.95, y: wy + ry * 0.05 });
    g.fillTriangle(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
  }

  /** White cartoon glove (a circle with finger lines + cuff). */
  glove(x: number, y: number, r: number, angle = 0, fist = false): void {
    const p = this.j(x, y);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    // cuff
    const cx = p.x - c * r * 0.95;
    const cy = p.y - s * r * 0.95;
    this.shape(this.ellipsePts(cx, cy, r * 0.45, r * 0.7, 12, angle), PAPER, 3);
    this.shape(this.ellipsePts(p.x, p.y, r, r * (fist ? 0.85 : 0.95), 16, angle), PAPER, 3);
    if (!fist) {
      for (const k of [-0.35, 0.05, 0.42]) {
        const ox = p.x + c * r * 0.25 - s * r * k;
        const oy = p.y + s * r * 0.25 + c * r * k;
        this.line(ox, oy, ox + c * r * 0.55, oy + s * r * 0.55, 2);
      }
    } else {
      this.line(p.x - s * r * 0.4, p.y + c * r * 0.4, p.x + s * r * 0.4, p.y - c * r * 0.4, 2);
    }
  }

  /** Big round cartoon shoe. dir = 1 facing right. */
  shoe(x: number, y: number, size: number, dir = 1): void {
    const g = this.g;
    this.ellipse(x + dir * size * 0.3, y - size * 0.35, size * 0.75, size * 0.42, INK, 0);
    g.fillStyle(PAPER, 0.85);
    const h = this.w({ x: x + dir * size * 0.55, y: y - size * 0.55 });
    g.fillEllipse(h.x, h.y, size * 0.35, size * 0.16);
  }

  /** Cartoon cloud (union of circles with one outline), e.g. steam or breath. */
  cloud(cx: number, cy: number, r: number, fill = PAPER): void {
    const g = this.g;
    const blobs = [
      [-0.7, 0.15, 0.6], [0, -0.25, 0.8], [0.7, 0.1, 0.62], [0.15, 0.4, 0.55],
    ].map(([dx, dy, s]) => ({ ...this.w(this.j(cx + dx * r, cy + dy * r)), r: s * r }));
    g.fillStyle(INK, 1);
    for (const b of blobs) g.fillCircle(b.x, b.y, b.r + 3);
    g.fillStyle(fill, 1);
    for (const b of blobs) g.fillCircle(b.x, b.y, b.r);
  }
}
