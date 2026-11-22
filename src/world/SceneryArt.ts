// The drawings for the chase scenery: one painter per prop or layer, generated
// as textures at boot (3 "boil" variants each, like every other drawing).
//
// The tone is the dark side of the 1930s cartoon: dead trees, a scarecrow with
// a stitched grin, crows, a ghost town, a graveyard of crushed clocks, eyes in
// the bushes, a man in the moon who is watching you.

import { INK, Ink, PAPER } from '../rig/Ink';

type Pt = { x: number; y: number };
type Painter = (ink: Ink, w: number, h: number) => void;

/** How a prop behaves on screen. */
export interface PropInfo {
  /** Base scale on screen. */
  scale: number;
  /** How much it sways to the beat (1 = like a tree, 0 = solid stone). */
  sway: number;
  /** Not darkened at night (eyes that shine in the dark). */
  glow?: boolean;
}

export const PROP_INFO: Record<string, PropInfo> = {
  deadtree: { scale: 0.75, sway: 1 },
  crowtree: { scale: 0.75, sway: 1 },
  pole: { scale: 0.75, sway: 0.4 },
  polecrow: { scale: 0.75, sway: 0.4 },
  scarecrow: { scale: 0.72, sway: 0.7 },
  thorn: { scale: 0.85, sway: 1 },
  fence: { scale: 0.8, sway: 0.15 },
  rock: { scale: 0.8, sway: 0.05 },
  house: { scale: 0.78, sway: 0.2 },
  house2: { scale: 0.78, sway: 0.2 },
  watertower: { scale: 0.85, sway: 0.25 },
  semaphore: { scale: 0.75, sway: 0.3 },
  lamppost: { scale: 0.7, sway: 0.35 },
  stationclock: { scale: 0.75, sway: 0.3 },
  grandclock: { scale: 0.72, sway: 0.35 },
  grandclock2: { scale: 0.72, sway: 0.35 },
  cuckootree: { scale: 0.75, sway: 1 },
  clockstone: { scale: 0.75, sway: 0.1 },
  handcross: { scale: 0.75, sway: 0.3 },
  gravefence: { scale: 0.8, sway: 0.08 },
  watchpile: { scale: 0.8, sway: 0.15 },
  pine: { scale: 0.85, sway: 0.7 },
  pine2: { scale: 0.85, sway: 0.7 },
  owltree: { scale: 0.75, sway: 1, glow: true },
  eyesbush: { scale: 0.85, sway: 0.6, glow: true },
  crag: { scale: 0.8, sway: 0.05 },
  crag2: { scale: 0.8, sway: 0.05 },
  vulture: { scale: 0.78, sway: 0.5 },
  wisp: { scale: 1, sway: 0 },
  wisp2: { scale: 1, sway: 0 },
};

const WOOD = 0x5a4a3c;
const DEADWOOD = 0x5a5048;
const STONE = 0x8a8378;

export const SCENERY_DEFS: Record<string, { w: number; h: number; paint: Painter }> = {
  // sky
  wisp: { w: 330, h: 80, paint: (k, w, h) => blobE(k, w / 2, h / 2, [[-105, 6, 58, 13], [-35, -4, 82, 18], [45, 2, 72, 15], [112, 9, 42, 10]], 0xdcd8cc) },
  wisp2: { w: 270, h: 70, paint: (k, w, h) => blobE(k, w / 2, h / 2, [[-80, 4, 50, 11], [-10, -3, 70, 16], [70, 5, 52, 12]], 0xd4d0c4) },
  sun: { w: 240, h: 240, paint: paintSun },
  moon: { w: 200, h: 200, paint: paintMoon },
  twinkle: { w: 22, h: 22, paint: paintTwinkle },
  // far and middle layers (tileable)
  skyline: { w: 1280, h: 260, paint: paintSkyline },
  mountains: { w: 1280, h: 260, paint: paintMountains },
  pinehills: { w: 1280, h: 220, paint: paintPineHills },
  canyonfar: { w: 1280, h: 260, paint: paintCanyonFar },
  cliffs: { w: 1280, h: 220, paint: paintCliffs },
  // dusk
  deadtree: { w: 210, h: 320, paint: (k, w, h) => deadTree(k, w, h, 0, true) },
  crowtree: { w: 210, h: 320, paint: (k, w, h) => { deadTree(k, w, h, 1, false); crow(k, w / 2 + 52, 104, 1, -1); crow(k, w / 2 - 50, 128, 0.85, 1); } },
  pole: { w: 110, h: 330, paint: (k, w, h) => paintPole(k, w, h, false) },
  polecrow: { w: 110, h: 330, paint: (k, w, h) => paintPole(k, w, h, true) },
  scarecrow: { w: 190, h: 310, paint: paintScarecrow },
  thorn: { w: 150, h: 80, paint: paintThorn },
  fence: { w: 230, h: 110, paint: paintFence },
  rock: { w: 140, h: 80, paint: paintRock },
  // town
  house: { w: 270, h: 300, paint: (k, w, h) => paintHouse(k, w, h, 0) },
  house2: { w: 220, h: 320, paint: (k, w, h) => paintHouse(k, w, h, 1) },
  watertower: { w: 200, h: 340, paint: paintWaterTower },
  semaphore: { w: 110, h: 340, paint: paintSemaphore },
  lamppost: { w: 110, h: 300, paint: paintLamppost },
  stationclock: { w: 120, h: 330, paint: paintStationClock },
  // graveyard
  grandclock: { w: 160, h: 300, paint: (k, w, h) => paintGrandClock(k, w, h, 0) },
  grandclock2: { w: 160, h: 300, paint: (k, w, h) => paintGrandClock(k, w, h, 1) },
  cuckootree: { w: 210, h: 320, paint: paintCuckooTree },
  clockstone: { w: 130, h: 140, paint: paintClockStone },
  handcross: { w: 100, h: 170, paint: paintHandCross },
  gravefence: { w: 240, h: 120, paint: paintGraveFence },
  watchpile: { w: 170, h: 90, paint: paintWatchPile },
  // pines
  pine: { w: 170, h: 340, paint: (k, w, h) => paintPine(k, w, h, 0) },
  pine2: { w: 170, h: 340, paint: (k, w, h) => paintPine(k, w, h, 1) },
  owltree: { w: 210, h: 320, paint: paintOwlTree },
  eyesbush: { w: 170, h: 90, paint: paintEyesBush },
  // gorge
  crag: { w: 170, h: 340, paint: (k, w, h) => paintCrag(k, w, h, 0) },
  crag2: { w: 190, h: 340, paint: (k, w, h) => paintCrag(k, w, h, 1) },
  vulture: { w: 210, h: 300, paint: paintVulture },
  // the tunnel
  tunnelwall: { w: 512, h: 600, paint: paintTunnelWall },
  beam: { w: 160, h: 600, paint: paintBeam },
  lantern: { w: 60, h: 130, paint: paintLantern },
  portal: { w: 520, h: 600, paint: paintPortal },
};

// ───────────────────────── helpers ─────────────────────────

/** Overlapping ellipses with one outline around the whole blob. */
function blobE(k: Ink, cx: number, cy: number, parts: number[][], fill: number, outline = 3): void {
  const g = k.g;
  const pts = parts.map(([x, y, rx, ry]) => ({ ...k.j(cx + x, cy + y), rx, ry }));
  g.fillStyle(INK, 1);
  for (const p of pts) g.fillEllipse(p.x, p.y, (p.rx + outline) * 2, (p.ry + outline) * 2);
  g.fillStyle(fill, 1);
  for (const p of pts) g.fillEllipse(p.x, p.y, p.rx * 2, p.ry * 2);
  g.fillStyle(INK, 0.1);
  for (const p of pts) g.fillEllipse(p.x + p.rx * 0.1, p.y + p.ry * 0.35, p.rx * 1.5, p.ry * 0.9);
  g.fillStyle(fill, 1);
  for (const p of pts) g.fillEllipse(p.x - p.rx * 0.05, p.y - p.ry * 0.2, p.rx * 1.6, p.ry * 1.2);
}

/** A straight plank between two points. */
function plank(k: Ink, x1: number, y1: number, x2: number, y2: number, width: number, fill: number, outline = 3): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (width / 2);
  const ny = (dx / len) * (width / 2);
  k.poly([{ x: x1 + nx, y: y1 + ny }, { x: x2 + nx, y: y2 + ny }, { x: x2 - nx, y: y2 - ny }, { x: x1 - nx, y: y1 - ny }], fill, outline);
}

/** Rotate everything drawn by `fn` around a point (uses the ink warp). */
function tilted(k: Ink, cx: number, cy: number, angle: number, fn: () => void): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const prev = k.warp;
  k.warp = (x, y) => ({ x: cx + (x - cx) * c - (y - cy) * s, y: cy + (x - cx) * s + (y - cy) * c });
  fn();
  k.warp = prev;
}

function mound(k: Ink, cx: number, y: number, rx: number, ry: number): void {
  k.ellipse(cx, y, rx, ry, 0x4e443a, 3);
}

/** A crow: black, hunched, with one beady white eye. dir = 1 faces right. */
function crow(k: Ink, x: number, y: number, s: number, dir: number): void {
  const d = dir;
  k.poly([{ x: x - 14 * s * d, y: y - 2 * s }, { x: x - 30 * s * d, y: y + 8 * s }, { x: x - 12 * s * d, y: y + 6 * s }], INK, 2);
  k.ellipse(x, y, 15 * s, 10 * s, INK, 2, -0.25 * d);
  k.circle(x + 12 * s * d, y - 9 * s, 7.5 * s, INK, 2);
  k.poly([{ x: x + 17 * s * d, y: y - 12 * s }, { x: x + 31 * s * d, y: y - 8 * s }, { x: x + 17 * s * d, y: y - 5 * s }], 0x8c887c, 2);
  k.circle(x + 14 * s * d, y - 11 * s, 2.8 * s, PAPER, 0);
  k.circle(x + 14.8 * s * d, y - 10.6 * s, 1.3 * s, INK, 0);
  k.line(x + 2 * s * d, y + 9 * s, x + 2 * s * d, y + 15 * s, 2);
  k.line(x - 4 * s * d, y + 9 * s, x - 5 * s * d, y + 15 * s, 2);
}

/** Bare, crooked tree. `face` gives it knot eyes and a screaming hollow. */
function deadTree(k: Ink, w: number, h: number, v: number, face: boolean): void {
  const cx = w / 2;
  const top = h * 0.36;
  const xAt = (t: number) => cx + Math.sin(t * Math.PI * 1.3 + v * 2) * 14;
  const yAt = (t: number) => h - 2 - t * (h - 2 - top);
  // branches first, so the trunk covers their roots
  const br = v === 0
    ? [[0.55, -2.4, 70, 12], [0.7, -0.6, 64, 11], [1, -1.9, 66, 10], [1, -1.0, 72, 10], [0.4, -0.3, 46, 9]]
    : [[0.5, -2.6, 64, 12], [0.62, -0.5, 78, 12], [1, -2.0, 56, 10], [1, -1.2, 80, 10], [0.82, -2.8, 40, 8]];
  for (const [t, a, len, wd] of br) {
    const x0 = xAt(t);
    const y0 = yAt(t);
    const x1 = x0 + Math.cos(a) * len;
    const y1 = y0 + Math.sin(a) * len;
    const bend = a < -1.57 ? 18 : -18;
    k.hose(x0, y0, (x0 + x1) / 2 + bend, (y0 + y1) / 2 + 10, x1, y1, wd, DEADWOOD, 3);
    // twigs: crooked fingers
    for (const da of [-0.55, 0.5]) {
      const x2 = x1 + Math.cos(a + da) * len * 0.35;
      const y2 = y1 + Math.sin(a + da) * len * 0.35;
      k.line(x1, y1, x2, y2, 4);
      k.line(x2, y2, x2 + Math.cos(a + da * 2) * 10, y2 + Math.sin(a + da * 2) * 10, 3);
    }
  }
  // trunk: tapered, with a flared root
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const hw = 16 - 9 * t + (t < 0.12 ? (0.12 - t) * 110 : 0);
    left.push({ x: xAt(t) - hw, y: yAt(t) });
    right.unshift({ x: xAt(t) + hw, y: yAt(t) });
  }
  k.poly([...left, ...right], DEADWOOD, 3);
  // bark cracks
  for (let i = 1; i < 5; i++) {
    const t = i / 6;
    k.line(xAt(t) - 4, yAt(t), xAt(t + 0.06) - 2, yAt(t + 0.06), 2);
  }
  if (face) {
    const fy = yAt(0.45);
    const fx = xAt(0.45);
    k.poly([{ x: fx - 13, y: fy - 4 }, { x: fx - 3, y: fy }, { x: fx - 12, y: fy + 3 }], INK, 0);
    k.poly([{ x: fx + 13, y: fy - 4 }, { x: fx + 3, y: fy }, { x: fx + 12, y: fy + 3 }], INK, 0);
    k.ellipse(fx, fy + 22, 7, 13, INK, 0);
  }
}

// ───────────────────────── sky ─────────────────────────

function paintSun(k: Ink, w: number, h: number): void {
  const g = k.g;
  g.lineStyle(3, PAPER, 0.25);
  g.strokeCircle(w / 2, h / 2, 92);
  g.lineStyle(2, PAPER, 0.15);
  g.strokeCircle(w / 2, h / 2, 108);
  k.circle(w / 2, h / 2, 72, 0xf6f0dc, 4);
}

function paintMoon(k: Ink, w: number, h: number): void {
  const cx = w / 2;
  const cy = h / 2;
  // a crescent whose inner edge is a profile: brow, nose, a sly mouth, the chin
  const outer: Pt[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = -Math.PI / 2 + (i / 24) * Math.PI;
    outer.push({ x: cx + Math.cos(a) * 82, y: cy + Math.sin(a) * 82 });
  }
  const inner: Pt[] = [];
  for (let i = 24; i >= 0; i--) {
    const t = i / 24; // 0 top, 1 bottom
    const a = -Math.PI / 2 + t * Math.PI;
    let x = cx + Math.cos(a) * 30;
    const y = cy + Math.sin(a) * 82;
    // nose
    x -= Math.max(0, 1 - Math.abs(t - 0.52) / 0.07) * 22;
    // brow ridge and chin
    x -= Math.max(0, 1 - Math.abs(t - 0.36) / 0.06) * 6;
    x -= Math.max(0, 1 - Math.abs(t - 0.8) / 0.08) * 10;
    inner.push({ x, y });
  }
  k.poly([...outer, ...inner], 0xece6cf, 4);
  // half-shut eye looking down at the track
  k.ellipse(cx + 52, cy - 14, 9, 11, PAPER, 2);
  k.circle(cx + 48, cy - 10, 4, INK, 0);
  k.line(cx + 40, cy - 19, cx + 63, cy - 21, 4);
  k.line(cx + 38, cy - 30, cx + 62, cy - 24, 4);
  // smirk
  k.line(cx + 30, cy + 34, cx + 46, cy + 30, 3);
  k.line(cx + 46, cy + 30, cx + 52, cy + 22, 3);
}

function paintTwinkle(k: Ink, w: number, h: number): void {
  const cx = w / 2;
  const cy = h / 2;
  const pts: Pt[] = [];
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? 9 : 2.5;
    const a = (i / 8) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  k.poly(pts, PAPER, 1.5);
}

// ───────────────────────── far and middle layers ─────────────────────────

/** Deterministic noise for tileable layers (index wraps with the period). */
function n01(i: number, salt: number): number {
  const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function contour(k: Ink, pts: Pt[], fill: number, h: number, lineColor = INK, width = 3): void {
  k.shape([{ x: 0, y: h }, ...pts, { x: pts[pts.length - 1].x, y: h }], fill, 0);
  k.g.lineStyle(width, lineColor, 1);
  k.g.beginPath();
  pts.forEach((p, i) => (i === 0 ? k.g.moveTo(p.x, p.y) : k.g.lineTo(p.x, p.y)));
  k.g.strokePath();
}

function paintSkyline(k: Ink, w: number, h: number): void {
  const base = 205;
  const fill = 0x8c8a84;
  const line = 0x4c4c4c;
  k.g.fillStyle(fill, 1);
  k.g.fillRect(0, base, w, h - base);
  let x = 30;
  let i = 0;
  while (x < w - 120) {
    const bw = 70 + n01(i, 1) * 70;
    const bh = 50 + n01(i, 2) * 70;
    const kind = i % 5;
    const top = base - bh;
    if (kind === 3) {
      // church with a steeple and a clock
      k.poly([{ x, y: base }, { x, y: top + 20 }, { x: x + bw, y: top + 20 }, { x: x + bw, y: base }], fill, 3);
      const sx = x + bw / 2;
      k.poly([{ x: sx - 18, y: top + 20 }, { x: sx - 18, y: top - 30 }, { x: sx + 18, y: top - 30 }, { x: sx + 18, y: top + 20 }], fill, 3);
      k.poly([{ x: sx - 22, y: top - 30 }, { x: sx, y: top - 100 }, { x: sx + 22, y: top - 30 }], fill, 3);
      k.circle(sx, top - 6, 9, 0xb0aca2, 2);
      k.line(sx, top - 6, sx - 1, top - 13, 2, line);
    } else if (kind === 1) {
      // flat roof and a crooked chimney
      k.poly([{ x, y: base }, { x, y: top }, { x: x + bw, y: top + 6 }, { x: x + bw, y: base }], fill, 3);
      k.poly([{ x: x + bw * 0.7, y: top + 4 }, { x: x + bw * 0.72, y: top - 22 }, { x: x + bw * 0.86, y: top - 20 }, { x: x + bw * 0.84, y: top + 5 }], fill, 3);
    } else {
      // pitched roof, leaning a little
      const lean = (n01(i, 3) - 0.5) * 14;
      k.poly([{ x, y: base }, { x, y: top + 26 }, { x: x + bw / 2 + lean, y: top - 10 }, { x: x + bw, y: top + 26 }, { x: x + bw, y: base }], fill, 3);
    }
    // a few dark windows (some missing)
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        if (n01(i * 7 + r * 2 + c, 4) < 0.35) continue;
        const wx = x + bw * (0.22 + c * 0.38);
        const wy = base - bh * (0.35 + r * 0.32);
        k.g.fillStyle(0x3a3a3a, 1);
        k.g.fillRect(wx, wy, 10, 13);
      }
    }
    x += bw + 18 + n01(i, 5) * 40;
    i++;
  }
}

function paintMountains(k: Ink, w: number, h: number): void {
  const n = 40;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * w;
    const big = Math.max(0, 1 - Math.abs(x - w * 0.55) / 260) * 110; // the big one with the tunnel
    const y = 150 - Math.sin((x / w) * Math.PI * 4 + 0.6) * 30 - Math.sin((x / w) * Math.PI * 10) * 12 - big - (i % 2 === 0 ? n01(i % n, 7) * 26 : 0);
    pts.push({ x, y });
  }
  contour(k, pts, 0x77756e, h, 0x444444, 3);
  // ridges running down from the peaks
  for (let i = 2; i < n; i += 2) {
    const p = pts[i];
    if (p.y > 140) continue;
    k.line(p.x, p.y + 4, p.x - 12, p.y + 40, 2, 0x5a5a56);
    k.line(p.x + 3, p.y + 10, p.x + 16, p.y + 34, 2, 0x5a5a56);
  }
}

function paintPineHills(k: Ink, w: number, h: number): void {
  const n = 40;
  const step = w / n;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const x = i * step;
    const hill = 112 + Math.sin((x / w) * Math.PI * 4) * 22 + Math.sin((x / w) * Math.PI * 6 + 2) * 8;
    pts.push({ x, y: hill });
    if (i < n) pts.push({ x: x + step / 2, y: hill - 34 - n01(i % n, 9) * 34 });
  }
  contour(k, pts, 0x3d4739, h, INK, 3);
}

function paintCanyonFar(k: Ink, w: number, h: number): void {
  // mesas and buttes of different sizes: flat tops, steep cliffs, talus slopes at the foot
  const floor = 175;
  const pts: Pt[] = [{ x: 0, y: floor }];
  const shapes = [
    [20, 210, 70], [250, 90, 120], [370, 300, 58], [700, 60, 104], [790, 150, 84], [980, 240, 64], [1230, 40, 130],
  ];
  for (const [x0, wid, top] of shapes) {
    const talus = Math.min(26 + wid * 0.08, wid * 0.22);
    const lip = Math.min(14, wid * 0.1);
    pts.push(
      { x: x0, y: floor },
      { x: x0 + talus, y: floor - 34 },
      { x: x0 + talus + lip * 0.6, y: top + 10 },
      { x: x0 + talus + lip, y: top },
      { x: x0 + wid - talus - lip, y: top + 3 },
      { x: x0 + wid - talus - lip * 0.5, y: top + 14 },
      { x: x0 + wid - talus, y: floor - 30 },
      { x: x0 + wid, y: floor },
    );
  }
  pts.push({ x: w, y: floor });
  contour(k, pts, 0xa29d92, h, 0x666660, 3);
  // strata across the cliffs
  for (const [x0, wid, top] of shapes) {
    const talus = Math.min(26 + wid * 0.08, wid * 0.22);
    for (let y = top + 18; y < floor - 36; y += 16) k.line(x0 + talus + 10, y, x0 + wid - talus - 8, y + 1, 1.5, 0x8a857a);
  }
}

function paintCliffs(k: Ink, w: number, h: number): void {
  const n = 40;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * w;
    const y = 90 + Math.sin((x / w) * Math.PI * 4) * 26 - (i % 2 === 0 ? n01(i % n, 13) * 50 : 0);
    pts.push({ x, y });
  }
  contour(k, pts, 0x7a7268, h, INK, 3);
  for (let i = 1; i < n; i += 2) {
    const p = pts[i];
    k.line(p.x, p.y + 10, p.x + 8, p.y + 60, 2, 0x5a544c);
  }
}

// ───────────────────────── dusk ─────────────────────────

function paintPole(k: Ink, w: number, h: number, crows: boolean): void {
  const lean = 12;
  plank(k, w / 2, h - 2, w / 2 + lean, 22, 14, 0x5a4532, 3);
  plank(k, 8 + lean, 44, w - 8 + lean, 38, 10, 0x5a4532, 3);
  for (const x of [16, w / 2 - 12, w / 2 + 12, w - 16]) k.rrect(x + lean - 4, 26, 8, 12, 3, PAPER, 2);
  // a snapped wire hanging down
  k.g.lineStyle(2, INK, 1);
  k.g.beginPath();
  k.g.moveTo(w - 16 + lean, 34);
  k.g.lineTo(w - 10 + lean, 70);
  k.g.lineTo(w - 18 + lean, 110);
  k.g.strokePath();
  if (crows) {
    crow(k, 26 + lean, 26, 0.75, 1);
    crow(k, w - 26 + lean, 24, 0.7, -1);
  }
}

function paintScarecrow(k: Ink, w: number, h: number): void {
  const cx = w / 2;
  k.rrect(cx - 6, 90, 12, h - 92, 3, WOOD, 3);
  plank(k, 18, 122, w - 18, 118, 10, WOOD, 3);
  // ragged coat with a jagged hem
  const hem: Pt[] = [];
  for (let i = 0; i <= 8; i++) hem.push({ x: cx + 44 - i * 11, y: 214 + (i % 2) * 14 });
  k.poly([{ x: cx - 48, y: 112 }, { x: cx + 48, y: 112 }, ...hem], 0x6b5d4c, 3);
  k.rrect(cx + 8, 150, 20, 22, 2, 0x8a7a66, 2); // patch
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? 26 : cx + 40;
    k.rrect(x0, 108, cx - 66, 24, 4, 0x6b5d4c, 3);
    const ex = s < 0 ? 26 : w - 26;
    for (const a of [-0.5, 0, 0.5]) k.line(ex, 120, ex + s * Math.cos(a) * 18, 120 + Math.sin(a) * 18, 2, 0x9a8a5a);
  }
  // sack head: odd button eyes and a stitched grin
  k.circle(cx, 80, 31, 0xcfc2a2, 3);
  k.line(cx - 16, 106, cx + 16, 106, 3);
  k.circle(cx - 12, 74, 7, INK, 0);
  k.circle(cx + 12, 72, 5, INK, 0);
  k.circle(cx - 14, 72, 2, PAPER, 0);
  k.circle(cx + 11, 70, 1.5, PAPER, 0);
  k.g.lineStyle(3, INK, 1);
  k.g.beginPath();
  k.g.arc(cx, 78, 18, 0.35, Math.PI - 0.35);
  k.g.strokePath();
  for (let i = -3; i <= 3; i++) {
    const a = Math.PI / 2 - i * 0.22;
    const px = cx + Math.cos(a) * 18;
    const py = 78 + Math.sin(a) * 18;
    k.line(px, py - 4, px, py + 4, 2);
  }
  // floppy hat
  k.ellipse(cx + 2, 54, 42, 8, 0x3a332c, 3, -0.08);
  k.poly([{ x: cx - 20, y: 52 }, { x: cx - 16, y: 20 }, { x: cx + 14, y: 16 }, { x: cx + 24, y: 50 }], 0x3a332c, 3);
  crow(k, w - 30, 104, 0.8, -1);
}

function paintThorn(k: Ink, w: number, h: number): void {
  const bx = w / 2;
  const by = h - 6;
  k.ellipse(bx, by, 40, 6, 0x4e443a, 2);
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i - 4) * 0.28;
    const len = 34 + ((i * 37) % 22);
    const mx = bx + Math.cos(a) * len * 0.55 + (i % 2 ? 6 : -6);
    const my = by + Math.sin(a) * len * 0.55;
    const ex = bx + Math.cos(a) * len;
    const ey = by + Math.sin(a) * len;
    k.line(bx, by, mx, my, 3, 0x3a3530);
    k.line(mx, my, ex, ey, 2.5, 0x3a3530);
    k.line(mx, my, mx + (i % 2 ? 7 : -7), my - 5, 2, 0x3a3530);
  }
}

function paintFence(k: Ink, w: number, h: number): void {
  const posts = [[22, 34, -0.05], [84, 22, 0.04], [148, 46, -0.12], [208, 30, 0.08]];
  plank(k, 18, 52, 150, 56, 10, 0x7a6a58, 3);
  plank(k, 22, 82, 104, 84, 10, 0x7a6a58, 3);
  plank(k, 104, 84, 150, 104, 10, 0x7a6a58, 3); // the broken one, hanging
  plank(k, 150, 58, 212, 50, 10, 0x7a6a58, 3);
  for (const [x, top, a] of posts) {
    tilted(k, x, h - 2, a, () => {
      k.poly([{ x: x - 8, y: h - 2 }, { x: x - 8, y: top + 6 }, { x: x - 2, y: top }, { x: x + 3, y: top + 5 }, { x: x + 8, y: top + 2 }, { x: x + 8, y: h - 2 }], 0x6a5a48, 3);
    });
  }
}

function paintRock(k: Ink, w: number, h: number): void {
  k.poly([{ x: 10, y: h - 4 }, { x: 18, y: 36 }, { x: 46, y: 14 }, { x: 88, y: 10 }, { x: 118, y: 28 }, { x: w - 8, y: h - 4 }], 0x7d776c, 3);
  k.line(52, 18, 60, 40, 2);
  k.line(60, 40, 52, 58, 2);
  k.line(92, 24, 104, 46, 2);
  k.g.fillStyle(PAPER, 0.25);
  k.g.fillEllipse(54, 26, 30, 8);
}

// ───────────────────────── town ─────────────────────────

function winPane(k: Ink, x: number, y: number, ww: number, wh: number, slant: number): void {
  k.poly([{ x, y: y + slant }, { x: x + ww, y: y - slant }, { x: x + ww, y: y + wh }, { x, y: y + wh }], 0x1c1c1c, 3);
}

function paintHouse(k: Ink, w: number, h: number, v: number): void {
  const wall = 0x9a8f80;
  const roof = 0x4a4038;
  const lean = v === 0 ? 10 : -8;
  const top = v === 0 ? 130 : 110;
  const l = 26;
  const r = w - 26;
  // chimney behind the roof
  plank(k, r - 46 + lean, top - 10, r - 40 + lean, top - 78, 22, 0x6a5a4c, 3);
  // walls
  k.poly([{ x: l, y: h - 2 }, { x: l + lean, y: top }, { x: r + lean, y: top }, { x: r, y: h - 2 }], wall, 4);
  for (let y = top + 22; y < h - 10; y += 20) k.line(l + 4 + lean * (1 - (y - top) / (h - top)), y, r - 4 + lean * (1 - (y - top) / (h - top)), y, 1.5, 0x7a7064);
  // roof with holes
  k.poly([{ x: l - 16 + lean, y: top + 8 }, { x: w / 2 + lean + 12, y: top - (v === 0 ? 96 : 110) }, { x: r + 14 + lean, y: top + 8 }], roof, 4);
  k.ellipse(w / 2 + lean - 20, top - 30, 10, 6, INK, 0);
  k.line(w / 2 + lean + 30, top - 40, w / 2 + lean + 44, top - 20, 2, PAPER);
  if (v === 0) {
    // upstairs windows are angry eyes, one shutter hanging
    winPane(k, l + 30 + lean, top + 22, 44, 40, 8);
    winPane(k, r - 74 + lean, top + 22, 44, 40, -8);
    plank(k, r - 30 + lean, top + 20, r - 16 + lean, top + 66, 12, 0x6a5a4c, 2);
    // boarded window and the door ajar
    winPane(k, l + 26, h - 110, 46, 42, 0);
    plank(k, l + 22, h - 108, l + 76, h - 72, 8, 0x7a6a58, 2);
    plank(k, l + 76, h - 108, l + 22, h - 72, 8, 0x7a6a58, 2);
    k.poly([{ x: r - 80, y: h - 2 }, { x: r - 80, y: h - 96 }, { x: r - 36, y: h - 96 }, { x: r - 36, y: h - 2 }], 0x141414, 3);
    plank(k, r - 80, h - 4, r - 70, h - 94, 10, 0x6a5a4c, 2);
  } else {
    // one round attic eye, a sign hanging by one nail, the porch caving in
    k.circle(w / 2 + lean + 10, top - 34, 14, 0x1c1c1c, 3);
    winPane(k, l + 24 + lean, top + 30, 40, 50, 6);
    winPane(k, r - 64 + lean, top + 30, 40, 50, -6);
    tilted(k, w / 2, top + 106, 0.5, () => k.rrect(w / 2 - 34, top + 96, 68, 22, 3, 0xd6ccb4, 3));
    k.poly([{ x: w / 2 - 30, y: h - 2 }, { x: w / 2 - 30, y: h - 84 }, { x: w / 2 + 8, y: h - 84 }, { x: w / 2 + 8, y: h - 2 }], 0x141414, 3);
    plank(k, l - 6, h - 92, r + 6, h - 74, 10, 0x5a4a3c, 3);
    plank(k, l + 4, h - 84, l + 10, h - 2, 8, 0x5a4a3c, 2);
    plank(k, r - 4, h - 70, r - 18, h - 2, 8, 0x5a4a3c, 2);
  }
}

function paintWaterTower(k: Ink, w: number, h: number): void {
  const legs = [[50, 22], [84, 70], [116, 130], [150, 178]];
  for (const [x0, x1] of legs) plank(k, x0, 168, x1, h - 2, 8, 0x5a4532, 3);
  k.line(36, 210, 164, 290, 3);
  k.line(164, 210, 36, 290, 3);
  k.line(30, 250, 170, 250, 3);
  // tank and cone roof
  k.rrect(30, 70, 140, 102, 6, 0x7a6a58, 4);
  for (let x = 48; x < 165; x += 16) k.line(x, 74, x, 168, 1.5, 0x5a4c40);
  k.line(30, 96, 170, 92, 3);
  k.line(30, 146, 170, 150, 3);
  k.poly([{ x: 18, y: 76 }, { x: 100, y: 18 }, { x: 182, y: 76 }], 0x4a4038, 4);
  // the spout hanging loose
  k.hose(170, 130, 196, 150, 186, 196, 9, 0x5a4532, 2);
}

function paintSemaphore(k: Ink, w: number, h: number): void {
  const px = 40;
  k.rrect(px - 6, 40, 12, h - 42, 3, 0x5a4532, 3);
  for (let y = 70; y < h - 10; y += 22) k.line(px + 8, y, px + 20, y, 2);
  k.line(px + 20, 60, px + 20, h - 4, 2);
  // the arm dropped down: danger
  plank(k, px, 66, w - 6, 104, 16, PAPER, 3);
  k.line(px + 46, 80, px + 46 + 14, 85, 6);
  k.rrect(px - 18, 40, 26, 46, 4, 0x2a2a2a, 3);
  k.circle(px - 5, 52, 7, 0x4a4a4a, 2);
  k.circle(px - 5, 73, 7, 0x4a4a4a, 2);
  k.circle(px, 32, 7, 0x5a4532, 3);
}

function paintLamppost(k: Ink, w: number, h: number): void {
  k.rrect(w / 2 - 16, h - 22, 32, 20, 3, 0x3a3a3a, 3);
  k.hose(w / 2, h - 20, w / 2 - 6, 90, w / 2 + 30, 50, 10, 0x3a3a3a, 3);
  // lamp hanging askew, glass broken
  tilted(k, w / 2 + 30, 56, 0.35, () => {
    k.poly([{ x: w / 2 + 16, y: 58 }, { x: w / 2 + 44, y: 58 }, { x: w / 2 + 38, y: 100 }, { x: w / 2 + 22, y: 100 }], 0x2a2a2a, 3);
    k.poly([{ x: w / 2 + 12, y: 60 }, { x: w / 2 + 30, y: 48 }, { x: w / 2 + 48, y: 60 }], 0x3a3a3a, 3);
    k.line(w / 2 + 24, 66, w / 2 + 34, 80, 2, 0x8a8a8a);
    k.line(w / 2 + 34, 80, w / 2 + 28, 94, 2, 0x8a8a8a);
  });
}

function paintStationClock(k: Ink, w: number, h: number): void {
  const cx = w / 2;
  k.rrect(cx - 7, 100, 14, h - 102, 3, 0x3a3a3a, 3);
  k.rrect(cx - 18, h - 24, 36, 22, 3, 0x3a3a3a, 3);
  k.hose(cx - 7, 130, cx - 30, 120, cx - 22, 104, 5, 0x3a3a3a, 2);
  k.hose(cx + 7, 130, cx + 30, 120, cx + 22, 104, 5, 0x3a3a3a, 2);
  k.circle(cx, 64, 44, 0x3a3a3a, 4);
  k.circle(cx, 64, 36, PAPER, 3);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    k.line(cx + Math.cos(a) * 30, 64 + Math.sin(a) * 30, cx + Math.cos(a) * 34, 64 + Math.sin(a) * 34, 2);
  }
  // stopped at a minute to midnight
  k.line(cx, 64, cx - 5, 42, 5);
  k.line(cx, 64, cx - 2, 33, 3);
  k.circle(cx, 64, 3, INK, 0);
  // cracked glass
  k.line(cx + 6, 34, cx + 14, 58, 2);
  k.line(cx + 14, 58, cx + 8, 72, 2);
  k.line(cx + 14, 58, cx + 30, 66, 2);
}

// ───────────────────────── graveyard ─────────────────────────

function clockFace(k: Ink, cx: number, cy: number, r: number, broken: boolean): void {
  k.circle(cx, cy, r, PAPER, 3);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    k.line(cx + Math.cos(a) * r * 0.75, cy + Math.sin(a) * r * 0.75, cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9, 1.5);
  }
  k.line(cx, cy, cx - r * 0.4, cy + r * 0.3, 3);
  k.line(cx, cy, cx + r * 0.1, cy - r * 0.75, 2);
  if (broken) {
    k.poly([{ x: cx + r * 0.1, y: cy - r * 0.95 }, { x: cx + r * 0.85, y: cy - r * 0.4 }, { x: cx + r * 0.3, y: cy - r * 0.1 }], 0x1c1c1c, 0);
  }
  k.line(cx - r * 0.7, cy - r * 0.5, cx + r * 0.2, cy + r * 0.1, 1.5);
  k.line(cx + r * 0.2, cy + r * 0.1, cx + r * 0.4, cy + r * 0.8, 1.5);
}

function paintGrandClock(k: Ink, w: number, h: number, v: number): void {
  const cx = w / 2;
  mound(k, cx, h - 8, 60, 12);
  tilted(k, cx, h - 10, v === 0 ? -0.13 : 0.2, () => {
    const wood = 0x5a4a3a;
    k.rrect(cx - 36, h - 40, 72, 30, 4, wood, 3);
    k.rrect(cx - 28, 120, 56, h - 158, 3, wood, 3);
    k.rrect(cx - 14, 140, 28, 92, 3, 0x1c1c1c, 3);
    k.line(cx, 142, cx + 6, 206, 2, 0x8a8a8a);
    k.circle(cx + 6, 212, 9, 0x8a8a8a, 2);
    k.rrect(cx - 36, 40, 72, 86, 4, wood, 3);
    k.poly([{ x: cx - 40, y: 44 }, { x: cx - 30, y: 22 }, { x: cx, y: 12 }, { x: cx + 30, y: 22 }, { x: cx + 40, y: 44 }], wood, 3);
    clockFace(k, cx, 82, 26, v === 1);
    if (v === 1) {
      // the case door hanging off
      plank(k, cx + 28, 140, cx + 52, 232, 22, 0x6a5a48, 3);
    }
  });
}

function paintCuckooTree(k: Ink, w: number, h: number): void {
  deadTree(k, w, h, 1, false);
  const cx = w / 2 + 4;
  const cy = 170;
  // pine-cone weights on chains
  for (const dx of [-10, 10]) {
    k.line(cx + dx, cy + 26, cx + dx, cy + 70 + dx, 1.5);
    k.ellipse(cx + dx, cy + 80 + dx, 5, 10, 0x4a3828, 2);
  }
  k.rrect(cx - 24, cy - 20, 48, 46, 3, 0x6a5038, 3);
  k.poly([{ x: cx - 32, y: cy - 16 }, { x: cx, y: cy - 44 }, { x: cx + 32, y: cy - 16 }], 0x4a3828, 3);
  k.circle(cx, cy + 8, 11, PAPER, 2);
  k.line(cx, cy + 8, cx - 4, cy + 2, 1.5);
  k.rrect(cx - 8, cy - 26, 16, 14, 2, 0x141414, 2);
  // the bird, dead on its broken spring
  k.g.lineStyle(2, INK, 1);
  k.g.beginPath();
  k.g.moveTo(cx, cy - 20);
  for (let i = 1; i <= 6; i++) k.g.lineTo(cx - 6 - i * 4, cy - 20 + (i % 2 ? -6 : 6) + i * 2);
  k.g.strokePath();
  const bx = cx - 34;
  const by = cy - 4;
  k.ellipse(bx, by, 11, 8, 0xb0a890, 2);
  k.poly([{ x: bx - 10, y: by - 2 }, { x: bx - 20, y: by }, { x: bx - 10, y: by + 3 }], 0x8c887c, 2);
  k.line(bx - 6, by - 6, bx - 2, by - 2, 1.5);
  k.line(bx - 2, by - 6, bx - 6, by - 2, 1.5);
}

function paintClockStone(k: Ink, w: number, h: number): void {
  mound(k, w / 2, h - 8, 54, 10);
  tilted(k, w / 2, h - 12, 0.1, () => {
    const pts: Pt[] = [{ x: 20, y: h - 12 }];
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI + (i / 10) * Math.PI;
      pts.push({ x: w / 2 + Math.cos(a) * 45, y: 58 + Math.sin(a) * 44 });
    }
    pts.push({ x: w - 20, y: h - 12 });
    k.poly(pts, 0x9a9a92, 4);
    k.circle(w / 2, 58, 24, null, 3);
    k.line(w / 2, 58, w / 2, 40, 3);
    k.line(w / 2, 58, w / 2 + 12, 64, 3);
    k.line(w / 2 - 30, 96, w / 2 + 30, 96, 3);
    k.line(w / 2 - 24, 108, w / 2 + 24, 108, 2);
    k.line(w / 2 + 28, 20, w / 2 + 18, 44, 2);
    k.line(w / 2 + 18, 44, w / 2 + 26, 60, 2);
  });
  for (const x of [22, 34, w - 30]) k.line(x, h - 8, x + 3, h - 22, 2, 0x4e443a);
}

function paintHandCross(k: Ink, w: number, h: number): void {
  mound(k, w / 2, h - 6, 40, 8);
  tilted(k, w / 2, h - 8, -0.08, () => {
    const cx = w / 2;
    // the minute hand, planted like a cross
    k.poly([{ x: cx - 4, y: h - 8 }, { x: cx - 4, y: 36 }, { x: cx - 13, y: 34 }, { x: cx, y: 6 }, { x: cx + 13, y: 34 }, { x: cx + 4, y: 36 }, { x: cx + 4, y: h - 8 }], INK, 2);
    // the hour hand across it
    k.poly([{ x: cx - 34, y: 58 }, { x: cx + 22, y: 56 }, { x: cx + 22, y: 50 }, { x: cx + 40, y: 57 }, { x: cx + 22, y: 64 }, { x: cx + 22, y: 62 }, { x: cx - 34, y: 64 }], INK, 2);
    k.circle(cx, 58, 7, 0x9a9a92, 2);
  });
}

function paintGraveFence(k: Ink, w: number, h: number): void {
  k.line(6, 42, w - 6, 42, 4);
  k.line(6, 96, w - 6, 96, 4);
  for (let x = 12; x < w - 6; x += 22) {
    const bent = x === 144;
    if (bent) {
      k.line(x, h - 2, x + 2, 60, 4);
      k.line(x + 2, 60, x + 22, 30, 4);
      k.poly([{ x: x + 16, y: 30 }, { x: x + 30, y: 20 }, { x: x + 24, y: 36 }], INK, 2);
      continue;
    }
    k.line(x, h - 2, x, 26, 4);
    k.poly([{ x: x - 6, y: 28 }, { x, y: 10 }, { x: x + 6, y: 28 }], INK, 2);
  }
}

function paintWatchPile(k: Ink, w: number, h: number): void {
  mound(k, w / 2, h - 8, 74, 12);
  const watches = [[30, 62, 15], [62, 52, 18], [100, 58, 16], [136, 64, 14], [48, 36, 13], [86, 30, 16], [118, 40, 12], [70, 70, 12]];
  watches.forEach(([x, y, r], i) => {
    k.rrect(x - 3, y - r - 6, 6, 6, 2, 0x8a8680, 2);
    k.circle(x, y, r, i % 3 === 0 ? 0x8a8680 : 0xb8b4a8, 3);
    k.circle(x, y, r * 0.7, i % 2 ? PAPER : 0xd8d2c2, 2);
    k.line(x, y, x + r * 0.4, y - r * 0.3, 1.5);
    if (i % 3 === 1) k.line(x - r * 0.6, y - r * 0.2, x + r * 0.3, y + r * 0.5, 1.5);
  });
  // springs and chains poking out
  for (const [x, y] of [[40, 22], [110, 18]]) {
    k.g.lineStyle(2, INK, 1);
    k.g.beginPath();
    k.g.moveTo(x, y + 18);
    for (let i = 1; i <= 5; i++) k.g.lineTo(x + (i % 2 ? 6 : -6), y + 18 - i * 5);
    k.g.strokePath();
  }
  for (let i = 0; i < 6; i++) k.circle(140 + i * 4, 30 + i * 6, 2.5, null, 1.5);
}

// ───────────────────────── pines ─────────────────────────

function paintPine(k: Ink, w: number, h: number, v: number): void {
  const cx = w / 2;
  const green = 0x3a4636;
  k.rrect(cx - 9, h - 60, 18, 58, 3, 0x3a2e24, 3);
  const tiers = v === 0 ? 5 : 4;
  for (let t = 0; t < tiers; t++) {
    const yb = h - 50 - t * 52;
    const half = 70 - t * 12;
    const yt = yb - 92;
    const pts: Pt[] = [{ x: cx + (v ? 6 : 0), y: yt }];
    for (let i = 0; i <= 8; i++) pts.push({ x: cx + half - (i * half * 2) / 8, y: yb + (i % 2 ? -10 : 0) });
    if (v === 1 && t === tiers - 1) continue;
    k.poly(pts.slice(1).concat([pts[0]]), green, 3);
  }
  if (v === 1) {
    // a dead, bare top
    const ty = h - 50 - (tiers - 1) * 52;
    k.line(cx, ty, cx + 4, ty - 90, 5);
    k.line(cx + 2, ty - 40, cx - 20, ty - 60, 3);
    k.line(cx + 3, ty - 64, cx + 22, ty - 80, 3);
  }
}

function paintOwlTree(k: Ink, w: number, h: number): void {
  deadTree(k, w, h, 0, false);
  const cx = w / 2 + Math.sin(0.45 * Math.PI * 1.3) * 14;
  const cy = 196;
  k.ellipse(cx, cy, 15, 22, 0x141414, 2);
  // the owl: two big white eyes and angry brows
  k.poly([{ x: cx - 12, y: cy - 16 }, { x: cx - 8, y: cy - 28 }, { x: cx - 3, y: cy - 16 }], INK, 0);
  k.poly([{ x: cx + 12, y: cy - 16 }, { x: cx + 8, y: cy - 28 }, { x: cx + 3, y: cy - 16 }], INK, 0);
  k.circle(cx - 6, cy - 6, 6, 0xf0ead8, 0);
  k.circle(cx + 6, cy - 6, 6, 0xf0ead8, 0);
  k.circle(cx - 5, cy - 5, 2.4, INK, 0);
  k.circle(cx + 5, cy - 5, 2.4, INK, 0);
  k.line(cx - 12, cy - 14, cx - 2, cy - 10, 2);
  k.line(cx + 12, cy - 14, cx + 2, cy - 10, 2);
  k.poly([{ x: cx - 2, y: cy + 1 }, { x: cx + 2, y: cy + 1 }, { x: cx, y: cy + 6 }], 0x8c887c, 1);
}

function paintEyesBush(k: Ink, w: number, h: number): void {
  blobE(k, w / 2, h - 32, [[-50, 6, 30, 22], [-14, -8, 38, 28], [26, -4, 36, 26], [56, 8, 24, 18]], 0x2e3329);
  // pairs of eyes in the dark, slanted and mean
  const pairs = [[w / 2 - 44, h - 40], [w / 2 + 4, h - 58], [w / 2 + 40, h - 32]];
  for (const [x, y] of pairs) {
    for (const s of [-1, 1]) {
      const ex = x + s * 9;
      k.poly([{ x: ex - 7, y: y - s * 2 }, { x: ex + 7, y: y + s * 2 }, { x: ex + 5, y: y + 5 }, { x: ex - 5, y: y + 5 }], 0xf0ead8, 0);
      k.circle(ex, y + 2, 1.8, INK, 0);
    }
  }
}

// ───────────────────────── gorge ─────────────────────────

function paintCrag(k: Ink, w: number, h: number, v: number): void {
  const fill = 0x8a8278;
  if (v === 1) {
    k.poly([{ x: w - 14, y: h - 2 }, { x: w - 30, y: 150 }, { x: w - 50, y: 110 }, { x: w - 76, y: 130 }, { x: w - 90, y: h - 2 }], 0x7a7268, 3);
  }
  const pts: Pt[] = [{ x: 14, y: h - 2 }, { x: 30, y: 230 }, { x: 22, y: 170 }, { x: 46, y: 110 }, { x: 52, y: 60 }, { x: 74, y: 40 }, { x: 96, y: 56 }, { x: 104, y: 120 }, { x: 128, y: 180 }, { x: 120, y: 250 }, { x: 146, y: h - 2 }];
  k.poly(pts, fill, 4);
  for (let y = 80; y < h - 20; y += 34) k.line(40 + (y % 3) * 4, y, 110 - (y % 5) * 2, y + 6, 2, 0x6a6258);
  k.line(76, 60, 70, 120, 2);
  k.line(70, 120, 84, 170, 2);
  // a twisted twig on top
  k.line(74, 42, 70, 14, 3);
  k.line(71, 24, 86, 10, 2);
}

function paintVulture(k: Ink, w: number, h: number): void {
  // a dead snag with one branch
  k.poly([{ x: 64, y: h - 2 }, { x: 74, y: 140 }, { x: 70, y: 96 }, { x: 86, y: 92 }, { x: 92, y: 140 }, { x: 96, y: h - 2 }], DEADWOOD, 3);
  plank(k, 86, 132, w - 12, 118, 12, DEADWOOD, 3);
  const bx = 140;
  const by = 84;
  // hunched body with drooping wings
  k.poly([{ x: bx - 30, y: by - 20 }, { x: bx + 26, y: by - 26 }, { x: bx + 34, y: by + 10 }, { x: bx + 20, y: by + 44 }, { x: bx - 22, y: by + 40 }, { x: bx - 36, y: by + 6 }], 0x2e2a26, 3);
  k.line(bx - 10, by - 10, bx - 4, by + 30, 2, 0x4a443e);
  k.line(bx + 10, by - 12, bx + 12, by + 30, 2, 0x4a443e);
  // ruff, bare neck and a hooked beak, looking back at the track
  k.ellipse(bx - 14, by - 22, 18, 9, 0xd6cfbf, 3);
  k.hose(bx - 16, by - 26, bx - 30, by - 50, bx - 46, by - 44, 9, 0xb0a898, 2);
  k.circle(bx - 50, by - 46, 10, 0xb0a898, 3);
  k.poly([{ x: bx - 58, y: by - 50 }, { x: bx - 74, y: by - 44 }, { x: bx - 70, y: by - 36 }, { x: bx - 58, y: by - 40 }], 0x5a544c, 2);
  k.circle(bx - 52, by - 49, 3, PAPER, 0);
  k.circle(bx - 53, by - 49, 1.5, INK, 0);
  k.line(bx - 60, by - 54, bx - 46, by - 56, 2);
  for (const dx of [-8, 8]) k.line(bx + dx, by + 42, bx + dx, by + 48, 3);
}

// ───────────────────────── the tunnel ─────────────────────────

function paintTunnelWall(k: Ink, w: number, h: number): void {
  const g = k.g;
  g.fillStyle(0x4a443c, 1);
  g.fillRect(0, 0, w, h);
  // the vault at the top
  g.fillStyle(0x2e2a25, 1);
  g.fillRect(0, 0, w, 74);
  for (let x = 0; x < w; x += 32) k.line(x, 0, x + 4, 74, 2, 0x1e1b18);
  k.line(0, 74, w, 74, 4);
  // brick courses
  for (let r = 0; r * 30 + 74 < h; r++) {
    const y = 74 + r * 30;
    k.line(0, y, w, y, 2, 0x2e2a25);
    for (let x = (r % 2) * 32; x < w; x += 64) k.line(x, y, x, y + 30, 2, 0x2e2a25);
  }
  // damp streaks
  g.fillStyle(0x2e2a25, 0.35);
  for (const x of [70, 200, 330, 450]) g.fillRect(x, 74, 10, 120 + (x % 90));
  // a refuge niche
  k.poly([{ x: 222, y: h - 30 }, { x: 222, y: h - 170 }, { x: 256, y: h - 210 }, { x: 290, y: h - 170 }, { x: 290, y: h - 30 }], 0x1e1b18, 4);
}

function paintBeam(k: Ink, w: number, h: number): void {
  const wood = 0x5a4532;
  plank(k, 60, h, 60, 46, 26, wood, 4);
  for (let y = 80; y < h - 20; y += 60) k.line(56, y, 58, y + 34, 1.5, 0x3a2c20);
  plank(k, 0, 40, w, 40, 26, wood, 4);
  plank(k, 60, 140, 12, 46, 14, wood, 3);
  plank(k, 60, 140, 128, 46, 14, wood, 3);
  for (const [x, y] of [[60, 40], [60, 140], [20, 40], [118, 40]]) k.circle(x, y, 4, 0x8a8a8a, 2);
}

function paintLantern(k: Ink, w: number, h: number): void {
  const cx = w / 2;
  for (let y = 4; y < 54; y += 10) k.ellipse(cx, y, 3, 5, null, 2);
  k.poly([{ x: cx - 10, y: 60 }, { x: cx + 10, y: 60 }, { x: cx + 18, y: 72 }, { x: cx - 18, y: 72 }], 0x3a3a3a, 3);
  k.rrect(cx - 15, 72, 30, 40, 3, 0x2a2a2a, 3);
  k.line(cx, 72, cx, 112, 2);
  k.line(cx - 6, 80, cx + 4, 96, 1.5, 0x8a8a8a);
  k.rrect(cx - 18, 110, 36, 10, 3, 0x3a3a3a, 3);
}

function paintPortal(k: Ink, w: number, h: number): void {
  const cx = 320;
  const cy = 300;
  const r = 150;
  // the rock face with the opening cut out (from the ground up and over the arch)
  const arc: Pt[] = [];
  for (let i = 0; i <= 20; i++) {
    const a = (i / 20) * Math.PI; // right to left over the top
    arc.push({ x: cx + Math.cos(a) * r, y: cy - Math.sin(a) * r });
  }
  const rock: Pt[] = [
    { x: 60, y: h }, { x: 92, y: 520 }, { x: 112, y: 430 }, { x: 152, y: 362 }, { x: 140, y: 282 }, { x: 192, y: 200 },
    { x: 204, y: 120 }, { x: 250, y: 62 }, { x: 272, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: cx + r, y: h },
    ...arc,
    { x: cx - r, y: h },
  ];
  k.shape(rock, 0x6a645a, 4);
  for (const [x1, y1, x2, y2] of [[300, 40, 340, 90], [420, 30, 400, 110], [180, 300, 168, 360], [480, 120, 500, 170], [230, 150, 260, 140]]) k.line(x1, y1, x2, y2, 2);
  // stone ring of voussoirs and the keystone
  const n = 13;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI;
    const a1 = ((i + 1) / n) * Math.PI;
    const r2 = r + 38;
    k.poly(
      [
        { x: cx + Math.cos(a0) * r, y: cy - Math.sin(a0) * r },
        { x: cx + Math.cos(a0) * r2, y: cy - Math.sin(a0) * r2 },
        { x: cx + Math.cos(a1) * r2, y: cy - Math.sin(a1) * r2 },
        { x: cx + Math.cos(a1) * r, y: cy - Math.sin(a1) * r },
      ],
      i === 6 ? 0xa39b8e : STONE,
      3,
    );
  }
  // pillars down to the track
  for (const x of [cx - r - 38, cx + r]) {
    for (let y = cy; y < h; y += 50) k.rrect(x, y, 38, 50, 2, STONE, 3);
  }
}
