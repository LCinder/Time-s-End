// A cartoon face as a set of continuous controls (a "rig"): each brow on its
// own, upper and lower lids that really cover the eye, pupils that shrink and
// dilate, a mouth that smiles, sneers to one side, shows teeth or fangs, and
// cheeks that push up when grinning. Expressions are just targets for these
// controls; the face glides from one to the next, so nothing ever snaps.
//
// Coordinates: face centre at 0,0, radius 104 (the caller maps it onto the
// character with the ink warp). The eyes sit at x = ±34.

import type { Ink } from '../rig/Ink';
import { INK, PAPER } from '../rig/Ink';

export interface FaceParams {
  /** Brow height (-1 low … 1 raised) and anger (-1 worried … 1 angry), left and right. */
  browL: number;
  browR: number;
  angL: number;
  angR: number;
  /** Upper lids (0 open … 1 shut) and lower lids pushed up by the cheeks (0 … 1). */
  lidL: number;
  lidR: number;
  lowL: number;
  lowR: number;
  /** Eye size (1 = normal) and pupil size (1 = normal). */
  eye: number;
  pupil: number;
  /** Where the pupils look (-1 … 1). */
  gazeX: number;
  gazeY: number;
  /** Mouth: opening (0 … 1), width (1 = normal), smile (-1 frown … 1 grin), skew (corner up: -1 left … 1 right). */
  open: number;
  width: number;
  smile: number;
  skew: number;
  /** Teeth showing (0 … 1), fangs (0 … 1), cheeks pushed up (0 … 1). */
  teeth: number;
  fangs: number;
  cheek: number;
  /** Leaning towards the camera (0 … 1): the face comes closer. */
  lean: number;
}

export const NEUTRAL: FaceParams = {
  browL: 0, browR: 0, angL: 0, angR: 0,
  lidL: 0.15, lidR: 0.15, lowL: 0, lowR: 0,
  eye: 1, pupil: 1, gazeX: 0, gazeY: 0,
  open: 0, width: 1, smile: 0, skew: 0,
  teeth: 0, fangs: 0, cheek: 0, lean: 0,
};

/** The villain's repertoire of faces (only what differs from neutral). */
export const EXPRESSIONS: Record<string, Partial<FaceParams>> = {
  /** resting: half-lidded, watchful, one corner up and a fang */
  sneer: { angL: 0.7, angR: 0.6, lidL: 0.45, lidR: 0.4, smile: 0.1, skew: 0.6, fangs: 0.7, pupil: 0.8 },
  /** pleased with himself: one brow up, a lopsided smile */
  smirk: { browL: 0.7, angL: -0.2, angR: 0.7, lidL: 0.3, lidR: 0.5, smile: 0.45, skew: 0.8, fangs: 0.6, cheek: 0.3, lowR: 0.25 },
  /** a big wicked grin, eyes squeezed from below by the cheeks */
  grin: { browL: 0.3, browR: 0.3, angL: 0.5, angR: 0.5, lidL: 0.35, lidR: 0.35, lowL: 0.45, lowR: 0.45, smile: 1, width: 1.35, open: 0.25, teeth: 1, fangs: 1, cheek: 1, pupil: 0.7 },
  /** throwing his head back laughing */
  cackle: { browL: 0.6, browR: 0.6, angL: 0.6, angR: 0.6, lidL: 1, lidR: 1, smile: 0.8, width: 1.25, open: 0.85, teeth: 1, fangs: 1, cheek: 1 },
  /** furious: brows crushed down, tiny pupils, gritted teeth */
  rage: { browL: -0.6, browR: -0.6, angL: 1, angR: 1, lidL: 0.35, lidR: 0.35, lowL: 0.2, lowR: 0.2, pupil: 0.45, eye: 1.08, smile: -0.4, width: 1.25, open: 0.12, teeth: 1, fangs: 0.8 },
  /** shocked: everything up, eyes wide, pupils pinpricks, mouth an O */
  shock: { browL: 1, browR: 1, angL: -0.4, angR: -0.4, lidL: 0, lidR: 0, eye: 1.3, pupil: 0.4, open: 0.75, width: 0.6, smile: -0.2 },
  /** scheming: one brow down, side glance, tight smile */
  scheme: { browR: 0.6, angL: 0.9, angR: 0.1, lidL: 0.55, lidR: 0.35, smile: 0.35, skew: -0.5, fangs: 0.5, pupil: 0.75, gazeX: -0.6, gazeY: 0.2 },
  /** the stare: dead still, pupils fixed on you, leaning in */
  menace: { browL: -0.3, browR: -0.3, angL: 0.9, angR: 0.9, lidL: 0.5, lidR: 0.5, lowL: 0.15, lowR: 0.15, pupil: 0.55, smile: 0.2, width: 1.1, teeth: 0.4, fangs: 1, lean: 1 },
  /** crocodile tears */
  mockSad: { browL: 0.7, browR: 0.7, angL: -1, angR: -1, lidL: 0.3, lidR: 0.3, smile: -0.7, skew: 0.2, pupil: 1.15, eye: 1.05 },
  /** smug: eyes closed in self-satisfaction, chin up, a smile */
  smug: { browL: 0.4, browR: 0.4, angL: 0.2, angR: 0.2, lidL: 0.8, lidR: 0.8, smile: 0.55, skew: 0.3, fangs: 0.6, cheek: 0.4 },
  /** winking at you */
  wink: { browL: -0.2, browR: 0.6, angL: 0.6, angR: -0.2, lidL: 1, lidR: 0.25, lowL: 0.4, smile: 0.6, skew: -0.7, fangs: 0.8, cheek: 0.6 },
  /** innocent: brows up, wide eyes, a tiny pursed smile */
  innocent: { browL: 0.8, browR: 0.8, angL: -0.5, angR: -0.5, lidL: 0, lidR: 0, eye: 1.15, pupil: 1.25, smile: 0.25, width: 0.55, gazeY: -0.3 },
  /** worried (the player is doing well) */
  worry: { browL: 0.5, browR: 0.5, angL: -0.8, angR: -0.8, lidL: 0.1, lidR: 0.1, eye: 1.1, pupil: 0.7, smile: -0.5, skew: -0.3, width: 0.9 },
  /** panicking: eyes popping, mouth stretched in a scream */
  panic: { browL: 1, browR: 1, angL: -1, angR: -1, lidL: 0, lidR: 0, eye: 1.4, pupil: 0.35, open: 0.95, width: 1.2, smile: -0.8, teeth: 0.6 },
  /** bored yawn */
  yawn: { browL: 0.3, browR: 0.3, lidL: 0.85, lidR: 0.85, open: 1, width: 0.8, smile: -0.1 },
  /** gleeful: something is about to fall on you */
  glee: { browL: 0.9, browR: 0.9, angL: 0.3, angR: 0.3, lidL: 0.05, lidR: 0.05, eye: 1.12, pupil: 0.65, smile: 0.9, width: 1.2, open: 0.35, teeth: 1, fangs: 1, cheek: 0.7, lowL: 0.2, lowR: 0.2 },
  /** listening hard */
  listen: { browL: 0.8, browR: -0.2, angL: -0.3, angR: 0.7, lidL: 0.2, lidR: 0.45, smile: 0.2, skew: 0.5, gazeX: 0.8 },
  /** gulping water: eyes shut with pleasure, cheeks puffed, lips round */
  gulp: { browL: 0.4, browR: 0.4, lidL: 1, lidR: 1, cheek: 1, open: 0.3, width: 0.5, smile: 0.1 },
  // ── Miss Pirouette (a lady: small painted mouth, lashes, no fangs) ──
  /** haughty: chin up, lids lowered, a superior little smile */
  haughty: { browL: 0.6, browR: 0.6, angL: -0.1, angR: -0.1, lidL: 0.55, lidR: 0.55, smile: 0.3, width: 0.6, gazeY: 0.25, pupil: 0.85 },
  /** coy: a sidelong look and a pursed smile */
  coy: { browL: 0.5, browR: 0.2, angL: -0.2, lidL: 0.35, lidR: 0.45, smile: 0.45, width: 0.5, skew: 0.4, gazeX: 0.7, lowL: 0.15, lowR: 0.15, cheek: 0.3 },
  /** pout: offended */
  pout: { browL: -0.2, browR: 0.5, angL: 0.6, angR: -0.3, lidL: 0.4, lidR: 0.3, smile: -0.5, width: 0.45, open: 0.06, gazeX: -0.4 },
  /** a dainty laugh behind the hand: eyes shut, a little round mouth */
  titter: { browL: 0.6, browR: 0.6, angL: -0.2, angR: -0.2, lidL: 1, lidR: 1, smile: 0.6, width: 0.55, open: 0.35, cheek: 0.8 },
  /** singing out, eyes up to the gallery */
  diva: { browL: 0.9, browR: 0.9, angL: -0.4, angR: -0.4, lidL: 0.3, lidR: 0.3, open: 0.6, width: 0.6, smile: 0.2, gazeY: -0.6 },
  /** tender at last: soft eyes, a real smile */
  tender: { browL: 0.5, browR: 0.5, angL: -0.6, angR: -0.6, lidL: 0.35, lidR: 0.35, lowL: 0.25, lowR: 0.25, smile: 0.5, width: 0.55, pupil: 1.3, cheek: 0.5 },
  /** looking back over his shoulder, suspicious */
  suspicious: { browL: -0.2, browR: 0.5, angL: 0.8, angR: 0.3, lidL: 0.55, lidR: 0.5, pupil: 0.7, smile: -0.2, skew: -0.4, gazeX: -1 },
};

/** Expression with any controls overridden, filled in from neutral. */
export function expression(name: string, over: Partial<FaceParams> = {}): FaceParams {
  return { ...NEUTRAL, ...(EXPRESSIONS[name] ?? {}), ...over };
}

/** How fast each control follows its target (per second): lids are quick, brows a bit slower. */
const RATES: Partial<Record<keyof FaceParams, number>> = {
  lidL: 26, lidR: 26, lowL: 18, lowR: 18, gazeX: 22, gazeY: 22, open: 30, width: 22, smile: 16, skew: 14,
  browL: 14, browR: 14, angL: 12, angR: 12, eye: 16, pupil: 12, teeth: 18, fangs: 12, cheek: 12, lean: 6,
};

/** Move `cur` towards `target` (frame-rate independent). */
export function glideFace(cur: FaceParams, target: FaceParams, dt: number): void {
  for (const key of Object.keys(target) as (keyof FaceParams)[]) {
    const rate = RATES[key] ?? 14;
    cur[key] += (target[key] - cur[key]) * Math.min(1, dt * rate);
  }
}

export interface FaceStyle {
  /** Colour of the face plate (the lids are made of it). */
  plate: number;
  /** Eye white. */
  white: number;
  /** Only two burning pinpricks for pupils (in the dark). */
  glow: boolean;
  /** Height of the eyes and of the mouth (defaults -30 and 46); a big moustache wants the mouth lower. */
  eyeY?: number;
  mouthY?: number;
  /** A lady's face: long lashes on the upper lids, painted lips (this colour), a smaller mouth. */
  lashes?: boolean;
  lips?: number;
  /** Eyes closer together (distance from the middle; default 34). */
  eyeX?: number;
}

const MOUTH = 0x2a0a0a;
const TONGUE = 0x9a3a3a;

/** Draw the face at (cx, cy); the ink's warp maps it onto the character. */
export function drawFace(k: Ink, cx: number, cy: number, p: FaceParams, style: FaceStyle): void {
  for (const side of [-1, 1] as const) drawEye(k, cx + side * (style.eyeX ?? 34), cy + (style.eyeY ?? -30), side, p, style);
  drawMouth(k, cx, cy + (style.mouthY ?? 46), p, style.lips);
  // cheeks pushed up by a grin
  if (p.cheek > 0.15) {
    for (const side of [-1, 1]) {
      const x = cx + side * 58;
      const y = cy + 18 - p.cheek * 8;
      k.hose(x - side * 16, y - 4, x, y + 6 * p.cheek, x + side * 12, y - 10, 3 + p.cheek * 2);
    }
  }
}

function drawEye(k: Ink, ex: number, ey: number, side: -1 | 1, p: FaceParams, style: FaceStyle): void {
  const left = side < 0;
  const lid = Math.min(1, left ? p.lidL : p.lidR);
  const low = left ? p.lowL : p.lowR;
  const ang = left ? p.angL : p.angR;
  const brow = left ? p.browL : p.browR;
  const rx = 24 * p.eye;
  const ry = 33 * p.eye;
  const top = ey - ry;
  const bottom = ey + ry;
  // the lid edge tilts with the brow: angry = inner corner lower
  const inner = -side; // direction of the nose
  const upper = (x: number) => top + (bottom - top) * lid * 0.98 + ((x - ex) * inner / rx) * ang * 7 * Math.min(1, lid * 3);
  const lower = (x: number) => bottom - (bottom - top) * low * 0.55 - Math.abs(x - ex) * 0.1 * low;

  // brow first (behind nothing, above the eye)
  const by = top - 14 - brow * 16 - (1 - lid) * 2;
  const outerX = ex - inner * 28;
  const innerX = ex + inner * 24;
  k.hose(outerX, by - ang * 7, ex, by - 10 - Math.max(0, brow) * 4, innerX, by + ang * 13, 10);

  // fully shut: a curved line (smug / laughing / blink)
  const shutAt = Math.min(upper(ex), lower(ex));
  if (lid > 0.93 || shutAt >= lower(ex) - 2) {
    const y = Math.min(lower(ex), top + (bottom - top) * 0.6);
    const curve = p.smile > 0.3 || p.cheek > 0.4 ? -8 : 6; // happy ^ when grinning, flat-ish otherwise
    k.hose(ex - rx, y, ex, y + curve, ex + rx, y, 6);
    return;
  }

  // the visible part of the eye: the ellipse squashed between the two lids
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    const x = ex + Math.cos(a) * rx;
    const y = ey + Math.sin(a) * ry;
    pts.push({ x, y: Math.min(Math.max(y, upper(x)), lower(x)) });
  }
  k.shape(pts, style.glow ? INK : style.white, 4);

  // pupil, kept inside the opening
  const px = ex + p.gazeX * rx * 0.42;
  const py = ey + p.gazeY * ry * 0.38;
  const prx = 9.5 * p.pupil;
  const pry = 15 * p.pupil;
  const pupil: { x: number; y: number }[] = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const x = Math.min(Math.max(px + Math.cos(a) * prx, ex - rx + 3), ex + rx - 3);
    const y = py + Math.sin(a) * pry;
    pupil.push({ x, y: Math.min(Math.max(y, upper(x) + 2), lower(x) - 2) });
  }
  if (style.glow) {
    k.shape(pupil.map((q) => ({ x: px + (q.x - px) * 0.6, y: py + (q.y - py) * 0.6 })), 0xfff2b0, 0);
  } else {
    k.shape(pupil, INK, 0);
    // the pie-cut highlight
    const hx = px - prx * 0.35 + p.gazeX * 2;
    const hy = py - pry * 0.45;
    if (hy > upper(hx) + 2) k.ellipse(hx, hy, prx * 0.28, pry * 0.2, PAPER, 0);
  }

  // heavy lid line along the top of the opening, and the lower lid when the cheeks push up
  if (lid > 0.08 || style.lashes) k.hose(ex - rx - 2, upper(ex - rx), ex, upper(ex) - 1, ex + rx + 2, upper(ex + rx), 5 + lid * 4);
  if (style.lashes) drawLashes(k, ex, rx, side, upper);
  if (low > 0.12) k.hose(ex - rx * 0.9, lower(ex - rx * 0.9), ex, lower(ex) + 2, ex + rx * 0.9, lower(ex + rx * 0.9), 3 + low * 3);
}

/** Three long curled lashes at the outer end of the upper lid. */
function drawLashes(k: Ink, ex: number, rx: number, side: -1 | 1, upper: (x: number) => number): void {
  for (let i = 0; i < 3; i++) {
    const x = ex + side * rx * (0.35 + i * 0.3);
    const y = upper(x) - 1;
    const len = 9 + i * 3;
    k.hose(x, y, x + side * len * 0.4, y - len * 0.8, x + side * len, y - len * 0.9, 3);
  }
}

function drawMouth(k: Ink, mx: number, my: number, p: FaceParams, lips?: number): void {
  const w = 34 * p.width;
  const lift = p.smile * 13;
  const lc = { x: mx - w, y: my - lift + p.skew * 9 };
  const rc = { x: mx + w, y: my - lift - p.skew * 9 };
  const openH = p.open * 46;
  // upper lip dips a little in the middle; lower lip drops with the opening (and curves with the smile)
  const upperMid = { x: mx, y: my + 2 + p.smile * 4 - openH * 0.12 };
  const lowerMid = { x: mx, y: my + 4 + openH + Math.max(0, p.smile) * 10 };
  const quad = (a: { x: number; y: number }, c: { x: number; y: number }, b: { x: number; y: number }, n: number) => {
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const it = 1 - t;
      out.push({ x: it * it * a.x + 2 * it * t * c.x + t * t * b.x, y: it * it * a.y + 2 * it * t * c.y + t * t * b.y });
    }
    return out;
  };
  const top = quad(lc, upperMid, rc, 14);
  const bot = quad(rc, lowerMid, lc, 14);
  const opening = p.open > 0.04 || p.teeth > 0.3;
  if (opening) {
    const mouth = [...top, ...bot];
    k.shape(mouth, MOUTH, 0);
    // painted lips: a dark rim round the open mouth
    if (lips !== undefined) k.shape(mouth, null, 9, lips);
    // tongue at the bottom of a wide-open mouth
    if (p.open > 0.35) k.ellipse(mx, lowerMid.y - openH * 0.2, w * 0.45, openH * 0.22, TONGUE, 0);
    // teeth: a white band under the upper lip (gritted when the mouth is nearly shut)
    if (p.teeth > 0.05) {
      const depth = Math.min(openH * 0.55 + 8, 4 + 12 * p.teeth);
      const band = [...top.map((q) => ({ x: q.x, y: q.y })), ...top.slice().reverse().map((q) => ({ x: q.x, y: q.y + depth }))];
      k.shape(band.map((q, i) => (i >= top.length ? { x: q.x, y: Math.min(q.y, bot[bot.length - 1 - (i - top.length)].y) } : q)), PAPER, 0);
      if (p.open < 0.2) {
        // gritted: lower teeth too, with the gaps between them
        const low = bot.map((q) => ({ x: q.x, y: q.y - depth * 0.8 }));
        k.shape([...bot, ...low.reverse()], PAPER, 0);
        for (let i = 2; i < top.length - 2; i += 2) k.line(top[i].x, top[i].y, bot[bot.length - 1 - i].x, bot[bot.length - 1 - i].y, 2);
      }
    }
    k.shape(mouth, null, 4);
  } else {
    // closed: the lip line (a sneer when skewed); painted lips are a little cupid's bow
    if (lips !== undefined) {
      const mid = upperMid.y + 4 - p.smile * 2;
      k.shape(
        [lc, { x: mx - w * 0.45, y: mid - 7 }, { x: mx, y: mid - 2 }, { x: mx + w * 0.45, y: mid - 7 }, rc, { x: mx + w * 0.3, y: mid + 8 }, { x: mx - w * 0.3, y: mid + 8 }],
        lips,
        3,
      );
    } else k.hose(lc.x, lc.y, upperMid.x, upperMid.y + 4 - p.smile * 2, rc.x, rc.y, 7);
  }
  // fangs hang from the upper lip near the corners
  if (p.fangs > 0.15) {
    for (const t of [0.22, 0.78]) {
      const i = Math.round(t * (top.length - 1));
      const q = top[i];
      const len = 11 * p.fangs;
      if (!opening && t < 0.5 && p.skew > 0.3) continue; // a sneer shows only one fang
      k.poly([{ x: q.x - 5, y: q.y }, { x: q.x + 5, y: q.y }, { x: q.x, y: q.y + len }], PAPER, 2);
    }
  }
}
