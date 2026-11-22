// The parallax background of a chase: a journey through several places
// (stages) while the clock turns from afternoon to night to dawn.
//
// - Far and middle layers lap-dissolve from one place to the next.
// - Props (trees, houses, gravestones...) are placed by a deterministic hash
//   along each layer: every prop belongs to the place the train is passing
//   when that prop reaches the middle of the screen, so new places really
//   "arrive" from the right instead of popping in.
// - The sky, sun, moon and stars follow the hour; `night` tells the scene how
//   dark to make the picture.
// - `tunnel` events become a real tunnel: a stone portal, brick walls, timber
//   supports and dead lanterns, and a portal out at the other end.
//
// Everything still dances: props sway on alternate beats, layers breathe.

import Phaser from 'phaser';
import { boilKey } from '../fx/Textures';
import { PROP_INFO } from './SceneryArt';
import {
  DEFAULT_SCENERY,
  SCENE_SETS,
  hourAt,
  lerpColor,
  skyAt,
  stageIndexAt,
  type SceneSet,
  type SceneryConfig,
} from './sceneSets';

export interface TunnelSpan {
  /** World x where the player enters and leaves. */
  x1: number;
  x2: number;
}

export interface SceneryOptions {
  config?: SceneryConfig;
  /** World pixels per beat (to know which place a prop belongs to). */
  ppb?: number;
  tunnels?: TunnelSpan[];
}

interface Layer {
  imgs: Phaser.GameObjects.Image[];
  key: string;
  /** Stage index where this run of the same texture starts. */
  from: number;
  /** Stage index of the next different texture (or -1). */
  next: number;
}

interface PropLayer {
  pick: (s: SceneSet) => (string | null)[];
  factor: number;
  spacing: number;
  depth: number;
  salt: number;
  pool: Phaser.GameObjects.Image[];
}

interface TunnelArt {
  span: TunnelSpan;
  walls: { img: Phaser.GameObjects.Image; wx: number; cropW: number }[];
  beams: { img: Phaser.GameObjects.Image; wx: number }[];
  lamps: { img: Phaser.GameObjects.Image; wx: number }[];
  enter: Phaser.GameObjects.Image;
  exit: Phaser.GameObjects.Image;
}

const W = 1280;
const DISSOLVE_BEATS = 8;
/** What things look like at full night: the far hills become silhouettes. */
const NIGHT_TINT = { far: 0x55555f, mid: 0x6a6a76, props: 0x8e8e9c };

const hash = (n: number, salt: number): number => {
  const s = Math.sin(n * 91.345 + salt * 47.13) * 43758.5453;
  return s - Math.floor(s);
};

export class Scenery {
  /** 0 = day, 1 = full night (the scene darkens the picture with it). */
  night = 0;
  /** The hour now (24 = midnight). */
  hour = 17;
  readonly cfg: SceneryConfig;
  private sky: Phaser.GameObjects.Graphics;
  private sun: Phaser.GameObjects.Image;
  private moon: Phaser.GameObjects.Image;
  private stars: Phaser.GameObjects.Image[] = [];
  private far: Layer[] = [];
  private mid: Layer[] = [];
  private props: PropLayer[] = [];
  private tunnels: TunnelArt[] = [];
  private ppb: number;

  constructor(private scene: Phaser.Scene, private groundY: number, opts: SceneryOptions = {}) {
    this.cfg = opts.config ?? DEFAULT_SCENERY;
    this.ppb = opts.ppb ?? 110;

    this.sky = scene.add.graphics().setDepth(0);
    for (let i = 0; i < 46; i++) {
      const img = scene.add.image(hash(i, 1) * W, 20 + hash(i, 2) * 330, 'twinkle_0').setDepth(0.2);
      img.setScale(0.5 + hash(i, 3) * 0.7);
      this.stars.push(img);
    }
    this.sun = scene.add.image(1010, 300, 'sun_0').setDepth(0.4);
    this.moon = scene.add.image(780, 160, 'moon_0').setDepth(0.45).setScale(0.8);

    this.far = this.buildLayers((s) => s.far, 2, groundY - 120);
    this.mid = this.buildLayers((s) => s.mid, 4, groundY + 4);

    const pool = (n: number, depth: number) => Array.from({ length: n }, () => scene.add.image(0, 0, 'twinkle_0').setOrigin(0.5, 1).setDepth(depth).setVisible(false));
    this.props = [
      { pick: (s) => s.sky, factor: 0.04, spacing: 470, depth: 1, salt: 3, pool: pool(6, 1) },
      { pick: (s) => s.props, factor: 0.55, spacing: 290, depth: 6, salt: 7, pool: pool(11, 6) },
      { pick: (s) => s.near, factor: 0.85, spacing: 330, depth: 8, salt: 11, pool: pool(10, 8) },
    ];

    if (this.cfg.tunnel && opts.tunnels) for (const t of opts.tunnels) this.tunnels.push(this.buildTunnel(t));
  }

  private setOf(i: number): SceneSet {
    return SCENE_SETS[this.cfg.stages[i]?.set] ?? SCENE_SETS.dusk;
  }

  /** One pair of images per run of stages that share a texture. */
  private buildLayers(pick: (s: SceneSet) => string, depth: number, y: number): Layer[] {
    const out: Layer[] = [];
    this.cfg.stages.forEach((_, i) => {
      const key = pick(this.setOf(i));
      const last = out[out.length - 1];
      if (last && last.key === key) return;
      if (last) last.next = i;
      const imgs = [0, 1].map(() => this.scene.add.image(0, y, `${key}_0`).setOrigin(0, 1).setDepth(depth));
      out.push({ imgs, key, from: i, next: -1 });
    });
    return out;
  }

  private buildTunnel(span: TunnelSpan): TunnelArt {
    const s = this.scene;
    const gy = this.groundY;
    const left = span.x1 - 150; // the entrance opening
    const right = span.x2 + 150;
    const walls: TunnelArt['walls'] = [];
    for (let wx = left; wx < right; wx += 512) {
      const img = s.add.image(0, 0, 'tunnelwall_0').setOrigin(0, 0).setDepth(10);
      walls.push({ img, wx, cropW: Math.min(512, right - wx) });
    }
    const beams: TunnelArt['beams'] = [];
    const lamps: TunnelArt['lamps'] = [];
    let i = 0;
    for (let wx = span.x1 + 260; wx < span.x2 - 160; wx += 470) {
      beams.push({ img: s.add.image(0, 0, 'beam_0').setOrigin(0.5, 0).setDepth(11), wx });
      if (i++ % 2 === 0) lamps.push({ img: s.add.image(0, 70, 'lantern_0').setOrigin(0.5, 0).setDepth(11), wx: wx + 235 });
    }
    const enter = s.add.image(0, gy, 'portal_0').setOrigin(0, 1).setDepth(12);
    const exit = s.add.image(0, gy, 'portal_0').setOrigin(0, 1).setDepth(12).setFlipX(true);
    return { span, walls, beams, lamps, enter, exit };
  }

  /** How much stage i has faded in at this beat (0-1). */
  private fadeIn(i: number, beat: number): number {
    if (i <= 0) return 1;
    const st = this.cfg.stages[i];
    const len = st.dissolve ?? DISSOLVE_BEATS;
    if (len <= 0) return beat >= st.beat ? 1 : 0;
    return Phaser.Math.Clamp((beat - (st.beat - len / 2)) / len, 0, 1);
  }

  update(camX: number, beat: number, time: number, dark: number): void {
    const phase = beat - Math.floor(beat);
    const pulse = Math.pow(1 - phase, 3);
    const side = Math.floor(beat) % 2 === 0 ? 1 : -1;
    const boil = Math.floor(time * 8) % 3;

    // the clock and the sky
    this.hour = hourAt(this.cfg.hours, beat);
    const sky = skyAt(this.hour);
    this.night = 1 - sky.day;
    this.sky.clear();
    this.sky.fillGradientStyle(sky.top, sky.top, sky.bottom, sky.bottom, 1);
    this.sky.fillRect(0, 0, W, this.groundY + 10);
    this.sky.setAlpha(1 - dark * 0.2);
    this.sun.setVisible(sky.sun > -0.25).setPosition(1010, 450 - sky.sun * 320);
    this.sun.setTexture(`sun_${boil}`);
    this.moon.setVisible(sky.moon > -0.25).setPosition(780, 410 - sky.moon * 340);
    this.moon.setTexture(`moon_${boil}`).setRotation(Math.sin(beat * Math.PI * 0.5) * 0.04);
    this.stars.forEach((st, i) => {
      const tw = Math.floor(beat + i) % 4 === 0 ? 0.5 : 1;
      st.setVisible(sky.stars > 0.01).setAlpha(sky.stars * tw);
    });
    const tint = lerpColor(0xffffff, NIGHT_TINT.props, this.night * 0.7);

    this.updateLayers(this.far, camX * 0.12, beat, boil, 1 + pulse * 0.02, lerpColor(0xffffff, NIGHT_TINT.far, this.night));
    this.updateLayers(this.mid, camX * 0.3, beat, boil, 1 + pulse * 0.05, lerpColor(0xffffff, NIGHT_TINT.mid, this.night));

    // props
    for (const L of this.props) {
      let used = 0;
      const scroll = camX * L.factor;
      const n0 = Math.floor((scroll - 320) / L.spacing) - 1;
      const n1 = Math.ceil((scroll + W + 320) / L.spacing) + 1;
      for (let n = n0; n <= n1 && used < L.pool.length; n++) {
        const u = n * L.spacing + (hash(n, L.salt) - 0.5) * L.spacing * 0.5;
        const sx = u - scroll;
        if (sx < -300 || sx > W + 300) continue;
        // the place the train is passing when this prop reaches the middle of the screen
        const centreBeat = (u - W / 2) / L.factor / this.ppb;
        const list = L.pick(this.setOf(stageIndexAt(this.cfg.stages, centreBeat)));
        if (list.length === 0) continue;
        const kind = list[Math.floor(hash(n, L.salt + 1) * list.length)];
        if (!kind) continue;
        const info = PROP_INFO[kind] ?? { scale: 0.8, sway: 0.5 };
        const img = L.pool[used++];
        img.setVisible(true).setTexture(boilKey(kind, time, n & 7)).setX(sx);
        img.setFlipX(hash(n, L.salt + 2) < 0.5);
        img.setTint(info.glow ? 0xffffff : tint);
        const sc = info.scale * (0.9 + hash(n, L.salt + 3) * 0.2);
        if (L.depth === 1) {
          // sky things drift and bob
          img.setOrigin(0.5, 0.5);
          img.y = 80 + hash(n, L.salt + 4) * 110 - pulse * 6 + Math.sin(beat * Math.PI * 0.5 + n) * 4;
          img.setScale(sc * (1 + pulse * 0.03)).setRotation(0);
        } else {
          img.setOrigin(0.5, 1);
          img.y = this.groundY - (L.depth === 6 ? 18 : 6);
          const alt = n % 2 === 0 ? side : -side;
          const sway = alt * (0.07 - 0.05 * (1 - pulse)) * info.sway;
          img.setRotation(sway);
          img.setScale(sc * (1 + pulse * 0.05 * info.sway), sc * (1 - pulse * 0.08 * info.sway));
        }
      }
      for (let i = used; i < L.pool.length; i++) L.pool[i].setVisible(false);
    }

    for (const t of this.tunnels) this.updateTunnel(t, camX, time, pulse, side);
  }

  private updateLayers(layers: Layer[], scroll: number, beat: number, boil: number, sy: number, tint: number): void {
    const x0 = -(((scroll % W) + W) % W);
    for (const L of layers) {
      const alpha = this.fadeIn(L.from, beat) * (L.next >= 0 ? 1 - this.fadeIn(L.next, beat) : 1);
      const vis = alpha > 0.001;
      L.imgs.forEach((img, i) => {
        img.setVisible(vis);
        if (!vis) return;
        img.setTexture(`${L.key}_${boil}`).setAlpha(alpha).setTint(tint);
        img.x = x0 + i * W;
        img.setScale(1, sy);
      });
    }
  }

  private updateTunnel(t: TunnelArt, camX: number, time: number, pulse: number, side: number): void {
    const on = (x: number, w: number) => x + w > -40 && x < W + 40;
    const boil = Math.floor(time * 8) % 3;
    for (const w of t.walls) {
      const x = w.wx - camX;
      const vis = on(x, 512);
      w.img.setVisible(vis);
      if (!vis) continue;
      w.img.setTexture(`tunnelwall_${boil}`).setX(x);
      w.img.setCrop(0, 0, w.cropW, 600);
    }
    for (const b of t.beams) {
      const x = b.wx - camX;
      b.img.setVisible(on(x - 80, 160));
      b.img.setTexture(`beam_${boil}`).setX(x);
    }
    t.lamps.forEach((l, i) => {
      const x = l.wx - camX;
      l.img.setVisible(on(x - 30, 60));
      l.img.setTexture(`lantern_${boil}`).setX(x);
      // swaying on its chain with the beat
      l.img.setRotation(((i % 2 === 0 ? side : -side) * 0.12) * (0.4 + pulse * 0.6));
    });
    const ex = t.span.x1 - 320 - camX;
    t.enter.setVisible(on(ex, 520)).setX(ex).setTexture(`portal_${boil}`);
    const xx = t.span.x2 - 200 - camX;
    t.exit.setVisible(on(xx, 520)).setX(xx).setTexture(`portal_${boil}`);
  }
}
