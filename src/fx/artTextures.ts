// Hand-drawn textures from the image AI (`npm run art -- <boss>` cuts them into
// public/art/textures/). Each one takes the place of the code-drawn texture of the same
// name: it is fitted to the room that texture has in the game, and gets the same three
// "line boil" frames (a tiny wobble, redrawn 8 times a second) so it moves like the rest.
// Names with no code-drawn twin (event props) are kept as `art:tex:<name>` for the code
// that wants them.

import Phaser from 'phaser';
import { PROP_INFO } from '../world/SceneryArt';
import { BOIL_VARIANTS, textureSize } from './Textures';

interface Entry {
  file: string;
  w: number;
  h: number;
  strip?: boolean;
  /** points the game needs on the picture, in its own pixels */
  anchors?: Record<string, [number, number]>;
}

/** Those points moved onto the fitted texture, from its bottom centre (the origin props use). */
const ANCHORS: Record<string, Record<string, { x: number; y: number }>> = {};

/** Every hand-drawn picture's own size and marked points (in its own pixels). */
const PIECES: Record<string, { w: number; h: number; anchors: Record<string, [number, number]> }> = {};

/**
 * A hand-drawn event piece (`art:tex:<name>`, e.g. the crossing's barrier arm): its size and
 * marked points (pivot, tip...) in its own pixels, or undefined if there is no picture.
 */
export function pieceInfo(name: string): { w: number; h: number; anchors: Record<string, [number, number]> } | undefined {
  return PIECES[name];
}

/** Where a marked point of a hand-drawn texture is, from its bottom centre (undefined: not hand-drawn). */
export function artAnchor(name: string, key: string): { x: number; y: number } | undefined {
  return ANCHORS[name]?.[key];
}

/** Things in the sky keep their centre; everything else stands on its bottom edge. */
const CENTRED = new Set(['wisp', 'wisp2', 'sun', 'moon', 'twinkle']);
/** Fitted by height only (decoration: the width follows the drawing). */
const BY_HEIGHT = new Set(['lantern']);

export async function loadArtTextures(scene: Phaser.Scene): Promise<string[]> {
  let list: Record<string, Entry> = {};
  try {
    const res = await fetch(`art/textures/index.json?v=${Date.now()}`);
    if (!res.ok) return [];
    list = ((await res.json()) as { textures?: Record<string, Entry> }).textures ?? {};
  } catch {
    return [];
  }
  const names = Object.keys(list);
  if (!names.length) return [];
  const stamp = Date.now();
  for (const n of names) scene.load.image(`art:tex:${n}`, `art/textures/${list[n].file}?v=${stamp}`);
  await new Promise<void>((resolve) => {
    scene.load.once('complete', () => resolve());
    scene.load.start();
  });
  const done: string[] = [];
  for (const n of names) {
    const key = `art:tex:${n}`;
    if (!scene.textures.exists(key)) continue;
    const img0 = scene.textures.get(key).getSourceImage() as HTMLImageElement;
    PIECES[n] = { w: img0.width, h: img0.height, anchors: list[n].anchors ?? {} };
    const size = textureSize(n);
    if (!size) continue; // an event prop: used as it is
    const src = scene.textures.get(key).getSourceImage() as HTMLImageElement;
    const fit = fitTo(n, size, src.width, src.height, !!list[n].strip);
    for (const [k, [ax, ay]] of Object.entries(list[n].anchors ?? {})) {
      (ANCHORS[n] ??= {})[k] = { x: fit.dx + (ax * fit.dw) / src.width - fit.w / 2, y: fit.dy + (ay * fit.dh) / src.height - fit.h };
    }
    for (let v = 0; v < BOIL_VARIANTS; v++) {
      const k = `${n}_${v}`;
      if (scene.textures.exists(k)) scene.textures.remove(k);
      scene.textures.addCanvas(k, boiled(src, fit, v, fit.w >= 1000 ? 1.3 : 0.9, fit.w >= 1000 || n === 'tunnelwall'));
    }
    done.push(n);
  }
  return done;
}

interface Fit {
  /** canvas size */
  w: number;
  h: number;
  /** where the picture goes in it */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  /** side-by-side copies (a background band repeated across the screen width) */
  repeat?: number;
  /** copies one under the other (a wall tile) */
  repeatY?: number;
}

function fitTo(name: string, size: { w: number; h: number }, iw: number, ih: number, strip: boolean): Fit {
  if (strip || size.w >= 1000) {
    // a background band: exactly as wide as the screen (it repeats), a bit lower than the
    // drawn one (that one has sky in it; these are solid all the way up), so it may go 1, 2
    // or 3 times across, squeezed or stretched by 15% at most
    const target = size.h * 0.8;
    let best = { n: 1, sy: 1, err: Infinity };
    for (let n = 1; n <= 4; n++) {
      const sx = size.w / (n * iw);
      const sy = Math.min(Math.max(target / ih, sx * 0.85), sx * 1.15);
      const err = Math.abs(ih * sy - target);
      if (err < best.err) best = { n, sy, err };
    }
    const dh = Math.round(ih * best.sy);
    return { w: size.w, h: dh, dx: 0, dy: 0, dw: size.w / best.n, dh, repeat: best.n };
  }
  if (name === 'tunnelwall') {
    // a wall tile: its bricks at a natural size, a whole number of tiles across (the walls
    // stand side by side) and as many down as it takes
    const n = Math.max(1, Math.round(size.w / (iw * 1.3)));
    const dw = size.w / n;
    const dh = (ih * dw) / iw;
    return { w: size.w, h: size.h, dx: 0, dy: 0, dw, dh, repeat: n, repeatY: Math.ceil(size.h / dh) };
  }
  if (name === 'beam') {
    // a support frame: from the roof right down to the rails, however wide it was drawn
    const w = Math.min(Math.round((iw * size.h) / ih), 300);
    return { w, h: size.h, dx: 0, dy: 0, dw: w, dh: size.h };
  }
  if (BY_HEIGHT.has(name) || (PROP_INFO[name] && !CENTRED.has(name))) {
    // decoration by the track: as tall as the drawn one, the width follows the drawing
    const dw = Math.round((iw * size.h) / ih);
    const w = Math.min(dw, Math.round(size.w * 2.4));
    const h = Math.round((ih * w) / iw);
    return { w, h, dx: 0, dy: 0, dw: w, dh: h };
  }
  // the rest (falling things, the sign, the portal, the sky) fits inside its box, standing
  // on the bottom edge (or centred, for the sky)
  const s = Math.min(size.w / iw, size.h / ih);
  const dw = Math.round(iw * s);
  const dh = Math.round(ih * s);
  const dy = CENTRED.has(name) ? Math.round((size.h - dh) / 2) : size.h - dh;
  return { w: size.w, h: size.h, dx: Math.round((size.w - dw) / 2), dy, dw, dh };
}

/**
 * The picture redrawn with a soft wavy displacement: rows slide sideways, then columns move
 * down a little. `wrap`: it repeats side by side, so what slides off one edge comes in the other.
 */
function boiled(src: HTMLImageElement, f: Fit, v: number, amp: number, wrap: boolean): HTMLCanvasElement {
  const make = (): [HTMLCanvasElement, CanvasRenderingContext2D] => {
    const c = document.createElement('canvas');
    c.width = f.w;
    c.height = f.h;
    return [c, c.getContext('2d')!];
  };
  const [base, b] = make();
  b.imageSmoothingQuality = 'high';
  for (let j = 0; j < (f.repeatY ?? 1); j++) {
    for (let i = 0; i < (f.repeat ?? 1); i++) b.drawImage(src, f.dx + i * f.dw, f.dy + j * f.dh, f.dw, f.dh);
  }
  const ph = v * 2.1 + 0.7;
  const [rows, r] = make();
  const band = 3;
  for (let y = 0; y < f.h; y += band) {
    const dx = amp * (Math.sin(y * 0.043 + ph) * 0.7 + Math.sin(y * 0.117 + ph * 2.3) * 0.3);
    r.drawImage(base, 0, y, f.w, band, dx, y, f.w, band);
    if (wrap) r.drawImage(base, 0, y, f.w, band, dx + (dx > 0 ? -f.w : f.w), y, f.w, band);
  }
  const [out, o] = make();
  for (let x = 0; x < f.w; x += band) {
    // only ever down, so the bottom edge never lifts off the ground
    const dy = amp * (1 + Math.sin(x * 0.037 + ph * 1.7) * 0.7 + Math.sin(x * 0.101 + ph * 0.6) * 0.3) * 0.5;
    o.drawImage(rows, x, 0, band, f.h, x, dy, band, f.h);
  }
  return out;
}
