// Procedurally drawn textures. Each one is generated in 3 "boil" variants
// (same drawing, different wobble seed) that sprites cycle through at 8 fps.

import Phaser from 'phaser';
import { INK, Ink, PAPER } from '../rig/Ink';

export const BOIL_VARIANTS = 3;

type Painter = (ink: Ink, w: number, h: number) => void;

const DEFS: Record<string, { w: number; h: number; paint: Painter }> = {
  puff: { w: 96, h: 80, paint: (k, w, h) => cloudBlob(k, w / 2, h / 2 + 4, [[-20, 6, 20], [0, -8, 26], [22, 4, 20], [6, 14, 18]]) },
  dust: { w: 70, h: 50, paint: (k, w, h) => cloudBlob(k, w / 2, h / 2 + 4, [[-14, 4, 13], [0, -4, 16], [15, 3, 13]]) },
  boxcar: { w: 236, h: 150, paint: paintBoxcar },
  anvil: { w: 130, h: 92, paint: paintAnvil },
  piano: { w: 230, h: 190, paint: paintPiano },
  trunk: { w: 140, h: 104, paint: paintTrunk },
  coal: { w: 64, h: 60, paint: paintCoal },
  ring: { w: 110, h: 64, paint: paintRing },
  wave: { w: 90, h: 120, paint: paintWave },
  star: { w: 44, h: 44, paint: paintStar },
  ball: { w: 40, h: 40, paint: (k) => { k.circle(20, 20, 14, PAPER, 4); k.g.fillStyle(0xffffff, 1); k.g.fillCircle(15, 15, 4); } },
  tree: { w: 170, h: 290, paint: paintTree },
  pole: { w: 70, h: 320, paint: paintPole },
  bush: { w: 150, h: 76, paint: (k, w, h) => cloudBlob(k, w / 2, h - 30, [[-42, 6, 24], [-12, -6, 30], [22, -2, 28], [48, 8, 20]], 0x5d6e4e) },
  cloud: { w: 250, h: 130, paint: paintCloud },
  hills: { w: 1280, h: 220, paint: paintHills },
  farhills: { w: 1280, h: 260, paint: paintFarHills },
  sign: { w: 280, h: 230, paint: paintSign },
  film: { w: 36, h: 42, paint: paintFilmIcon },
  shadow: {
    w: 124,
    h: 34,
    paint: (k, w, h) => {
      k.g.fillStyle(INK, 0.75);
      k.g.fillEllipse(w / 2, h / 2, w - 8, h - 10);
      k.g.lineStyle(4, PAPER, 1);
      k.g.strokeEllipse(w / 2, h / 2, w - 8, h - 10);
    },
  },
  burst: { w: 120, h: 120, paint: paintBurst },
};

export function generateTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const ink = new Ink(g);
  for (const [name, def] of Object.entries(DEFS)) {
    for (let v = 0; v < BOIL_VARIANTS; v++) {
      const key = `${name}_${v}`;
      if (scene.textures.exists(key)) continue;
      g.clear();
      ink.seed = v * 13.7 + name.length;
      ink.amp = name === 'hills' || name === 'farhills' ? 1.5 : 1.1;
      def.paint(ink, def.w, def.h);
      g.generateTexture(key, def.w, def.h);
    }
  }
  g.destroy();
}

/** Texture key for a boil frame at time t (seconds). */
export function boilKey(name: string, t: number, offset = 0): string {
  return `${name}_${(Math.floor(t * 8) + offset) % BOIL_VARIANTS}`;
}

// ───────────────────────── painters ─────────────────────────

function cloudBlob(k: Ink, cx: number, cy: number, circles: number[][], fill = PAPER): void {
  const g = k.g;
  const pts = circles.map(([x, y, r]) => ({ ...k.j(cx + x, cy + y), r }));
  g.fillStyle(INK, 1);
  for (const p of pts) g.fillCircle(p.x, p.y, p.r + 3);
  g.fillStyle(fill, 1);
  for (const p of pts) g.fillCircle(p.x, p.y, p.r);
  // a little shading crescent
  g.fillStyle(INK, 0.12);
  for (const p of pts) g.fillCircle(p.x + p.r * 0.2, p.y + p.r * 0.25, p.r * 0.7);
  g.fillStyle(fill, 1);
  for (const p of pts) g.fillCircle(p.x - p.r * 0.12, p.y - p.r * 0.12, p.r * 0.72);
}

function paintBoxcar(k: Ink, w: number): void {
  const body = 0x7a5b3e;
  k.rrect(8, 14, w - 16, 104, 6, body, 4);
  k.rrect(2, 6, w - 4, 14, 4, 0x4a3524, 4); // roof
  for (let x = 28; x < w - 16; x += 22) k.line(x, 22, x, 114, 2, 0x3a2a1c);
  // door with an X
  k.rrect(w / 2 - 34, 30, 68, 80, 3, 0x8d6b4a, 3);
  k.line(w / 2 - 30, 34, w / 2 + 30, 106, 3);
  k.line(w / 2 + 30, 34, w / 2 - 30, 106, 3);
  for (const x of [44, w - 44]) {
    k.circle(x - 16, 128, 14, 0x222222, 3);
    k.circle(x + 16, 128, 14, 0x222222, 3);
  }
}

function paintAnvil(k: Ink, w: number): void {
  k.poly(
    [
      { x: 6, y: 14 }, { x: w - 6, y: 14 }, { x: w - 30, y: 34 }, { x: w - 44, y: 38 },
      { x: w - 44, y: 60 }, { x: w - 24, y: 84 }, { x: 24, y: 84 }, { x: 44, y: 60 }, { x: 44, y: 38 }, { x: 18, y: 32 },
    ],
    0x2c2c2c,
    4,
  );
  k.g.fillStyle(PAPER, 0.5);
  k.g.fillRect(20, 18, w - 50, 5);
}

function paintPiano(k: Ink, w: number): void {
  const wood = 0x3b2618;
  k.rrect(10, 8, w - 20, 120, 8, wood, 4);
  k.rrect(18, 20, w - 36, 50, 4, 0x5a3b25, 3);
  // keyboard
  k.rrect(4, 118, w - 8, 26, 3, PAPER, 4);
  for (let x = 16; x < w - 10; x += 14) k.line(x, 120, x, 142, 2);
  k.g.fillStyle(INK, 1);
  for (let x = 12; x < w - 18; x += 14) if ((x / 14) % 7 !== 2 && (x / 14) % 7 !== 6) k.g.fillRect(x + 6, 120, 7, 14);
  k.rrect(12, 142, w - 24, 20, 3, wood, 4);
  k.line(30, 160, 26, 186, 6);
  k.line(w - 30, 160, w - 26, 186, 6);
}

function paintTrunk(k: Ink, w: number): void {
  k.rrect(8, 16, w - 16, 80, 10, 0x6a4a2a, 4);
  k.rrect(8, 16, w - 16, 26, 10, 0x5a3c20, 4);
  for (const x of [30, w - 30]) k.rrect(x - 6, 14, 12, 84, 3, 0x2a2a2a, 3);
  k.rrect(w / 2 - 10, 34, 20, 18, 3, 0xc9a24a, 3);
}

function paintCoal(k: Ink, w: number, h: number): void {
  k.poly(
    [
      { x: 10, y: h - 10 }, { x: 4, y: 30 }, { x: 14, y: 12 }, { x: 30, y: 6 },
      { x: 48, y: 10 }, { x: w - 4, y: 26 }, { x: w - 6, y: h - 12 }, { x: 34, y: h - 4 },
    ],
    0x1d1d1d,
    3,
  );
  k.ellipse(23, 26, 8, 10, PAPER, 2);
  k.ellipse(41, 26, 8, 10, PAPER, 2);
  k.pieEye(25, 27, 4, 6, 0.6, 0.2, false, PAPER);
  k.pieEye(43, 27, 4, 6, 0.6, 0.2, false, PAPER);
  k.line(14, 14, 28, 20, 3, PAPER);
  k.line(50, 14, 36, 20, 3, PAPER);
  k.rrect(22, 40, 22, 9, 2, PAPER, 2);
  k.line(29, 41, 29, 48, 1.5);
  k.line(36, 41, 36, 48, 1.5);
}

function paintRing(k: Ink, w: number, h: number): void {
  const g = k.g;
  const p = k.j(w / 2, h / 2);
  g.lineStyle(22, INK, 1);
  g.strokeEllipse(p.x, p.y, w - 26, h - 22);
  g.lineStyle(14, 0xdedad0, 1);
  g.strokeEllipse(p.x, p.y, w - 26, h - 22);
  g.lineStyle(4, PAPER, 1);
  g.strokeEllipse(p.x - 2, p.y - 3, w - 34, h - 30);
}

function paintWave(k: Ink, w: number, h: number): void {
  const g = k.g;
  for (let i = 0; i < 3; i++) {
    const x = 18 + i * 22;
    const p = k.j(x, h / 2);
    g.lineStyle(12, INK, 1);
    g.beginPath();
    g.arc(p.x - 30, p.y, 40 + i * 6, -0.9, 0.9);
    g.strokePath();
    g.lineStyle(6, PAPER, 1);
    g.beginPath();
    g.arc(p.x - 30, p.y, 40 + i * 6, -0.9, 0.9);
    g.strokePath();
  }
  void w;
}

function paintStar(k: Ink, w: number, h: number): void {
  const cx = w / 2;
  const cy = h / 2;
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? 19 : 6;
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  k.poly(pts, PAPER, 3);
}

function paintBurst(k: Ink, w: number, h: number): void {
  const cx = w / 2;
  const cy = h / 2;
  const pts = [];
  for (let i = 0; i < 20; i++) {
    const r = i % 2 === 0 ? 56 : 30;
    const a = (i / 20) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  k.poly(pts, PAPER, 4);
}

function paintTree(k: Ink, w: number, h: number): void {
  // curvy rubber-hose trunk
  k.hose(w / 2, h - 4, w / 2 - 24, h - 90, w / 2 + 4, h - 150, 22, 0x4a3828, 3);
  // foliage
  cloudBlob(k, w / 2, 90, [[-40, 10, 38], [0, -18, 46], [40, 8, 38], [0, 30, 40]], 0x6f8a5c);
  // sleepy face
  k.line(w / 2 - 22, 88, w / 2 - 8, 88, 3);
  k.line(w / 2 + 8, 88, w / 2 + 22, 88, 3);
  const g = k.g;
  g.lineStyle(3, INK, 1);
  g.beginPath();
  g.arc(w / 2, 102, 12, 0.3, Math.PI - 0.3);
  g.strokePath();
}

function paintPole(k: Ink, w: number, h: number): void {
  k.rrect(w / 2 - 7, 20, 14, h - 22, 4, 0x5a4532, 3);
  k.rrect(4, 30, w - 8, 10, 3, 0x5a4532, 3);
  for (const x of [12, w / 2 - 12, w / 2 + 12, w - 12]) k.rrect(x - 4, 18, 8, 12, 3, PAPER, 2);
}

function paintCloud(k: Ink, w: number, h: number): void {
  cloudBlob(k, w / 2, h / 2 + 8, [[-70, 14, 32], [-30, -10, 42], [20, -14, 44], [66, 10, 34], [0, 20, 36]]);
  // happy closed eyes + smile
  const g = k.g;
  g.lineStyle(3, INK, 1);
  for (const x of [-20, 20]) {
    g.beginPath();
    g.arc(w / 2 + x, h / 2 + 2, 7, Math.PI + 0.3, -0.3);
    g.strokePath();
  }
  g.beginPath();
  g.arc(w / 2, h / 2 + 14, 12, 0.3, Math.PI - 0.3);
  g.strokePath();
}

function paintHills(k: Ink, w: number, h: number): void {
  // tileable: period divides w
  const pts = [{ x: 0, y: h }];
  for (let x = 0; x <= w; x += 16) {
    const y = 90 + Math.sin((x / w) * Math.PI * 4) * 34 + Math.sin((x / w) * Math.PI * 6 + 1) * 14;
    pts.push({ x, y });
  }
  pts.push({ x: w, y: h });
  k.shape(pts, 0x8f9a7c, 0);
  k.g.lineStyle(4, INK, 1);
  k.g.beginPath();
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    if (i === 1) k.g.moveTo(p.x, p.y);
    else k.g.lineTo(p.x, p.y);
  }
  k.g.strokePath();
}

function paintFarHills(k: Ink, w: number, h: number): void {
  const pts = [{ x: 0, y: h }];
  for (let x = 0; x <= w; x += 20) {
    const y = 80 + Math.sin((x / w) * Math.PI * 2 + 0.5) * 50 + Math.sin((x / w) * Math.PI * 8) * 12;
    pts.push({ x, y });
  }
  pts.push({ x: w, y: h });
  k.shape(pts, 0xc4c6b8, 0);
  k.g.lineStyle(3, 0x555555, 1);
  k.g.beginPath();
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    if (i === 1) k.g.moveTo(p.x, p.y);
    else k.g.lineTo(p.x, p.y);
  }
  k.g.strokePath();
}

function paintSign(k: Ink, w: number, h: number): void {
  k.rrect(w / 2 - 10, 90, 20, h - 92, 4, 0x5a4532, 4);
  k.rrect(8, 8, w - 16, 96, 8, 0xe9dfc8, 5);
  k.rrect(16, 16, w - 32, 80, 5, null, 2);
}

function paintFilmIcon(k: Ink, w: number, h: number): void {
  k.rrect(3, 3, w - 6, h - 6, 3, INK, 0);
  k.g.fillStyle(PAPER, 1);
  for (let y = 7; y < h - 6; y += 8) {
    k.g.fillRect(6, y, 4, 4);
    k.g.fillRect(w - 10, y, 4, 4);
  }
  k.rrect(12, 8, w - 24, h - 16, 2, 0xd8d0be, 0);
}
