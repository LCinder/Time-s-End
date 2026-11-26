// Miss Pirouette, the music box ballerina, as a puppet built from her hand-drawn parts
// (`npm run art -- pirouette`: art/pirouette/ → art:tex:pir*).
//
// She is always drawn from the front: face, hair and body never turn on their own (a face
// sliding round a head whose hair stays put looked wrong). Her spins are a 1930s cartoon
// "paper turn" instead: the whole drawing narrows to a fifth of her width and opens out mirrored, again
// and again, with whirl lines round her. Arms and legs are rubber hoses ending in the drawn
// gloves and pointe shoes; their hands and feet are points with a depth (x across, z towards
// us) only to sort them in front of or behind her. Everything is a spring towards the pose
// she is in, redrawn every frame, so it is smooth.

import Phaser from 'phaser';
import { pieceInfo } from '../fx/artTextures';
import { INK, Ink } from '../rig/Ink';
import { NEUTRAL, drawFace, expression, glideFace, type FaceParams } from './FaceRig';

export type DancerPose =
  | 'stance' // the music box pose: on pointe, arms rounded over the head (fifth position)
  | 'sing' // arms open to the audience (second position)
  | 'twirl' // pirouette: one foot at the other knee, arms rounded in front, spinning
  | 'fouette' // whipping kicks, a turn on every beat
  | 'arabesque' // in profile, one leg stretched out behind, one arm forward
  | 'curtsy' // a révérence: knees bent, arms out low, head bowed
  | 'throw' // flicking a note at Tick
  | 'windUp' // reaching behind her back to turn the key
  | 'titter' // a dainty laugh behind the hand
  | 'nervous' // losing her balance
  | 'windDown' // the spring running out: everything droops and slows
  | 'bow'; // the last bow, at peace

type V3 = { x: number; y: number; z: number };

interface Limb {
  /** where it starts on the body (shoulder, hip), in body px from the waist */
  root: V3;
  /** the hand or foot now, and its speed (springs towards the pose) */
  end: V3;
  vel: V3;
  /** the knee or elbow bulge (rubber hose control point offset) */
  bend: V3;
  g: Phaser.GameObjects.Graphics;
  img: Phaser.GameObjects.Image;
}

interface PoseSpec {
  hands: [V3, V3];
  feet: [V3, V3];
  /** body lowered (bent knees) and leaning (radians) */
  drop: number;
  lean: number;
  /** spin speed (radians / s) of her paper turn; 0 = facing the front */
  spin: number;
  /** bowing the head and body forwards (0 … 1) */
  nod?: number;
  /** extra outward bend of the elbows (px): arms rounded round the head instead of across it */
  elbows?: number;
  /** show the back of this hand instead of the palm (a hand over the mouth, a fist on the hip) */
  backs?: [boolean, boolean];
  gloves: [Glove, Glove];
  face: string;
}

type Glove = 'pirGloveOpen' | 'pirGloveFist' | 'pirGlovePoint';

/** Her ankles, from her waist (body px), and how far below them her toes reach (on pointe). */
const FLOOR = 232;
const TOE = 62;
const ARM_W = 13;
const LEG_W = 17;
const SKIN = 0xece8e0;
const TIGHTS = 0xdcd8d0;

const v = (x: number, y: number, z = 0): V3 => ({ x, y, z });

function poseSpec(p: DancerPose, beat: number, dir: number): PoseSpec {
  const ph = beat - Math.floor(beat);
  const swing = Math.sin(beat * Math.PI); // a beat each way
  switch (p) {
    case 'sing':
      return { hands: [v(-185, -95 + swing * 8, 30), v(185, -115 - swing * 8, 30)], feet: [v(-16, FLOOR, 4), v(16, FLOOR, -4)], drop: 0, lean: swing * 0.03, spin: 0, gloves: ['pirGloveOpen', 'pirGloveOpen'], face: 'diva' };
    case 'twirl':
      return { hands: [v(-38, -36, 92), v(38, -36, 92)], feet: [v(0, FLOOR, 0), v(-6, 150, 36)], drop: -6, lean: 0, spin: Math.PI * 4, gloves: ['pirGloveOpen', 'pirGloveOpen'], face: 'haughty' };
    case 'fouette': {
      // on each beat the working leg whips out to the side and back into the knee
      const out = Math.sin(ph * Math.PI);
      return {
        hands: [v(-175 * out - 40 * (1 - out), -90 * out - 30 * (1 - out), 60 * (1 - out)), v(175 * out + 40 * (1 - out), -90 * out - 30 * (1 - out), 60 * (1 - out))],
        feet: [v(0, FLOOR, 0), v(-6 + 170 * out, 150 - 40 * out, 36 * (1 - out))],
        drop: -4,
        lean: 0,
        spin: Math.PI * 2 * (1 - out * 0.7) * 1.6,
        gloves: ['pirGloveOpen', 'pirGloveOpen'],
        face: 'pout',
      };
    }
    case 'arabesque': {
      // reaching towards Tick with one arm, the leg on the far side stretched out behind her
      const fwd = v(dir * 215, -205, 30);
      const back = v(-dir * 165, -95, -20);
      const leg = v(-dir * 235, 118, -20);
      const stand = v(0, FLOOR, 0);
      return dir > 0
        ? { hands: [back, fwd], feet: [leg, stand], drop: 0, lean: dir * 0.1, spin: 0, gloves: ['pirGloveOpen', 'pirGlovePoint'], face: 'haughty' }
        : { hands: [fwd, back], feet: [stand, leg], drop: 0, lean: dir * 0.1, spin: 0, gloves: ['pirGlovePoint', 'pirGloveOpen'], face: 'haughty' };
    }
    case 'curtsy':
      // holding out the edge of her tutu between finger and thumb (fists pinching the tulle)
      return { hands: [v(-150, 28, 30), v(150, 28, 30)], feet: [v(-16, FLOOR, 10), v(26, FLOOR, -40)], drop: 46, lean: 0.04, nod: 0.5, spin: 0, gloves: ['pirGloveFist', 'pirGloveFist'], backs: [true, true], face: 'haughty' };
    case 'throw': {
      // the hand on Tick's side flicks the note out, the other rests on her hip
      const flick = v(dir * 230, -175 + Math.sin(ph * Math.PI) * 30, 40);
      // (a fist on the hip, knuckles to us, at her waist's side)
      const hip = v(-dir * 112, 2, 10);
      const left = dir < 0;
      return { hands: left ? [flick, hip] : [hip, flick], feet: [v(-16, FLOOR, 0), v(16, FLOOR, 0)], drop: 0, lean: dir * 0.06, spin: 0, gloves: left ? ['pirGlovePoint', 'pirGloveFist'] : ['pirGloveFist', 'pirGlovePoint'], backs: left ? [false, true] : [true, false], face: 'coy' };
    }
    case 'windUp':
      // one hand behind her gripping the key's bow and turning it, the other fist on her hip
      return { hands: [v(-112, -52, -78), v(112, 2, 10)], feet: [v(-14, FLOOR, 0), v(14, FLOOR, 0)], drop: 0, lean: -0.05, spin: 0, gloves: ['pirGloveFist', 'pirGloveFist'], backs: [false, true], face: 'haughty' };
    case 'titter': {
      const shake = Math.sin(beat * Math.PI * 6) * 4;
      // the back of one hand to her mouth, the other on her middle
      return { hands: [v(-60, -40 + shake, 50), v(40, -165, 70)], feet: [v(-16, FLOOR, 0), v(16, FLOOR, 0)], drop: 0, lean: -0.1, spin: 0, gloves: ['pirGloveOpen', 'pirGloveOpen'], backs: [false, true], face: 'titter' };
    }
    case 'nervous': {
      const flail = Math.sin(beat * Math.PI * 4);
      return { hands: [v(-160, -150 + flail * 60, 20), v(160, -150 - flail * 60, 20)], feet: [v(-30 + flail * 20, FLOOR, 0), v(26, FLOOR - Math.max(0, flail) * 40, 0)], drop: 6, lean: flail * 0.12, spin: 0, gloves: ['pirGloveOpen', 'pirGloveOpen'], face: 'worry' };
    }
    case 'windDown':
      return { hands: [v(-95, 30, 30), v(95, 40, 30)], feet: [v(-14, FLOOR, 0), v(14, FLOOR, 0)], drop: 22, lean: 0.1, nod: 0.6, spin: 0, gloves: ['pirGloveOpen', 'pirGloveOpen'], face: 'tender' };
    case 'bow':
      return { hands: [v(-170, 60, 30), v(170, 60, 30)], feet: [v(-14, FLOOR, 12), v(28, FLOOR, -46)], drop: 60, lean: 0.05, nod: 1, spin: 0, gloves: ['pirGloveOpen', 'pirGloveOpen'], face: 'tender' };
    default:
      // stance: the music box pose, arms rounded over the head, slowly going round
      // (fifth position: the arms make an oval round the head, hands meeting above the bun)
      return { hands: [v(-34, -345 + swing * 4, 14), v(34, -345 - swing * 4, 14)], feet: [v(-6, FLOOR, 6), v(6, FLOOR, -6)], drop: 0, lean: swing * 0.025, spin: 0, elbows: 120, gloves: ['pirGloveOpen', 'pirGloveOpen'], face: 'haughty' };
  }
}

export class Pirouette {
  /** where her toes touch the stage (screen) and how big she is (1 = her drawing's size) */
  x = 640;
  groundY = 600;
  size = 0.8;
  pose: DancerPose = 'stance';
  /** -1 Tick is to her left, 1 to her right (which way she throws, and looks) */
  dir = -1;
  /** singing: how open the mouth is (0 … 1) */
  mouth = 0;
  /** where she looks (screen), or null */
  lookTarget: { x: number; y: number } | null = null;
  /** her spring (1 full … 0 run down): slows her, the key turns backwards as it drains */
  spring = 1;

  private box: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Image;
  private faceG: Phaser.GameObjects.Graphics;
  /** whirl lines round her while she spins */
  private whirlG: Phaser.GameObjects.Graphics;
  /** her hair and the back of her bodice (seen from behind) */
  private backG: Phaser.GameObjects.Graphics;
  private tiara: Phaser.GameObjects.Image;
  private key: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Ellipse;
  private arms: Limb[];
  private legs: Limb[];
  private faceInk: Ink;
  private face: FaceParams = { ...NEUTRAL };
  private turn = 0;
  /** how wide the paper turn has her (1 front, -1 mirrored, near 0 edge-on) */
  private pw = 1;
  private spinNow = 0;
  private keyTurn = 0;
  private drop = 0;
  private lean = 0;
  private nod = 0;
  private blinkT = 2;
  private A: Record<string, [number, number]>;
  private waist: [number, number];

  constructor(scene: Phaser.Scene) {
    const info = pieceInfo('pirBody');
    this.A = info?.anchors ?? {};
    this.waist = this.A.waist ?? [165, 340];
    const [wx, wy] = this.waist;
    const at = (k: string, d: [number, number]): V3 => {
      const a = this.A[k] ?? d;
      return v(a[0] - wx, a[1] - wy, 0);
    };
    this.box = scene.add.container(0, 0).setDepth(40);
    this.shadow = scene.add.ellipse(0, 0, 210, 30, 0x000000, 0.28).setDepth(39.5);
    const bw = info?.w ?? 329;
    const bh = info?.h ?? 455;
    this.body = scene.add.image(0, 0, 'art:tex:pirBody').setOrigin(wx / bw, wy / bh);
    this.faceG = scene.add.graphics();
    this.whirlG = scene.add.graphics();
    this.backG = scene.add.graphics();
    this.faceInk = new Ink(this.faceG);
    this.faceInk.amp = 0.4;
    const bun = at('bun', [140, 52]);
    this.tiara = scene.add.image(bun.x, bun.y + 6, 'art:tex:pirTiara').setOrigin(0.5, 0.85);
    this.tiara.setScale(78 / this.tiara.width);
    const ki = pieceInfo('pirKey');
    const kp = ki?.anchors.pivot ?? [112, 75];
    this.key = scene.add.image(0, 0, 'art:tex:pirKey').setOrigin(kp[0] / (ki?.w ?? 126), kp[1] / (ki?.h ?? 105));
    const limb = (root: V3, end: V3, img: string, ox: number, oy: number): Limb => ({
      root,
      end: { ...end },
      vel: v(0, 0, 0),
      bend: v(0, 0, 0),
      g: scene.add.graphics(),
      img: scene.add.image(0, 0, `art:tex:${img}`).setOrigin(ox, oy),
    });
    this.arms = [
      limb(at('shoulderL', [100, 272]), v(-22, -350, 14), 'pirGloveOpen', 0.5, 0.82),
      limb(at('shoulderR', [230, 272]), v(22, -350, 14), 'pirGloveOpen', 0.5, 0.82),
    ];
    const si = pieceInfo('pirShoe');
    const ank = si?.anchors.ankle ?? [52, 82];
    this.legs = [
      limb(at('hipL', [142, 430]), v(-6, FLOOR, 6), 'pirShoe', ank[0] / (si?.w ?? 230), ank[1] / (si?.h ?? 163)),
      limb(at('hipR', [188, 430]), v(6, FLOOR, -6), 'pirShoe', ank[0] / (si?.w ?? 230), ank[1] / (si?.h ?? 163)),
    ];
    for (const l of [...this.arms, ...this.legs]) l.img.setScale(1);
    this.box.add([this.whirlG, this.key, ...this.legs.flatMap((l) => [l.g, l.img]), this.body, this.faceG, this.backG, this.tiara, ...this.arms.flatMap((l) => [l.g, l.img])]);
  }

  /** Turn round to be seen from the front or from behind, with a paper turn (the swap happens
   *  edge-on, so it never pops). */
  turnAround(back: boolean): void {
    if (back === this.backView) return;
    this.backView = back;
    this.turn = Math.PI * 0.48;
  }

  /** Is there a drawing of her (`npm run art -- pirouette`)? */
  static available(scene: Phaser.Scene): boolean {
    return ['pirBody', 'pirTiara', 'pirKey', 'pirGloveOpen', 'pirShoe'].every((k) => scene.textures.exists(`art:tex:${k}`));
  }

  /** Mirrored left to right. */
  flip = false;
  /** Seen from behind (her reflection in the lid's mirror, which is behind her): the back of
   *  her head with the bun, the key in front of her back, her hands and feet sorted the other
   *  way round, and the backs of her gloves. */
  backView = false;

  /** Show her only inside a mask (the mirror), faded (a reflection). */
  setMask(mask: Phaser.Display.Masks.GeometryMask): void {
    this.box.setMask(mask);
    this.shadow.setVisible(false);
  }

  setAlpha(a: number): void {
    this.box.setAlpha(a);
  }

  setDepth(d: number): void {
    this.box.setDepth(d);
    this.shadow.setDepth(d - 0.5);
  }

  setVisible(on: boolean): void {
    this.box.setVisible(on);
    this.shadow.setVisible(on);
  }

  destroy(): void {
    this.box.destroy();
    this.shadow.destroy();
  }

  /** A point of her body on the drawing (x, y) and how near us it is (to sort the limbs). */
  private project(p: V3): { x: number; y: number; d: number } {
    return { x: p.x, y: p.y, d: this.backView ? -p.z : p.z };
  }

  update(dt: number, time: number, beat: number): void {
    const slow = 0.35 + 0.65 * this.spring; // a run-down spring makes everything lazy
    const spec = poseSpec(this.pose, beat, this.dir);

    // the paper turn: spin at the pose's speed, or settle facing the front (the nearest way)
    if (spec.spin > 0) {
      this.spinNow += (spec.spin * slow - this.spinNow) * Math.min(1, dt * 6);
      this.turn += this.spinNow * dt;
    } else {
      this.spinNow *= Math.max(0, 1 - dt * 8);
      const front = Math.round(this.turn / (Math.PI * 2)) * Math.PI * 2;
      this.turn += (front - this.turn) * Math.min(1, dt * 9) + this.spinNow * dt;
    }

    // springs: hands and feet towards the pose (a little overshoot, like rubber)
    const k = 120 * slow;
    const damp = 16;
    const step = (l: Limb, t: V3) => {
      for (const a of ['x', 'y', 'z'] as const) {
        l.vel[a] += ((t[a] - l.end[a]) * k - l.vel[a] * damp) * dt;
        l.end[a] += l.vel[a] * dt;
      }
    };
    // (in small steps: a long frame must not make the rubber explode)
    const steps = Math.ceil(dt / (1 / 120));
    const full = dt;
    dt = full / steps;
    for (let n = 0; n < steps; n++) {
      this.arms.forEach((l, i) => step(l, spec.hands[i]));
      // (lowered for a curtsy or a bow, the body comes down but the feet stay on the floor:
      // the knees bend)
      this.legs.forEach((l, i) => step(l, { ...spec.feet[i], y: spec.feet[i].y - this.drop }));
    }
    dt = full;
    this.drop += (spec.drop - this.drop) * Math.min(1, dt * 8);
    this.lean += (spec.lean - this.lean) * Math.min(1, dt * 8);
    this.nod += ((spec.nod ?? 0) - this.nod) * Math.min(1, dt * 6);

    // the waltz in her body: a rise on the first beat of every bar of three
    const bar = beat / 3 - Math.floor(beat / 3);
    const rise = Math.pow(1 - bar, 3) * 6 * slow;
    const breathe = Math.sin(time * 2.2) * 1.5;

    const s = this.size;
    const lift = -rise + this.drop;
    // the whole drawing narrows and flips with the paper turn (never quite to nothing), and
    // stretches up a little as it narrows, like a cartoon whirl
    const paper = Math.cos(this.turn);
    const pw = (paper < 0 ? -1 : 1) * Math.max(0.2, Math.abs(paper));
    this.pw = pw;
    const stretch = 1 + (1 - Math.abs(pw)) * 0.06;
    this.box
      .setPosition(this.x, this.groundY - (FLOOR + TOE) * s * stretch + lift * s)
      .setScale((this.flip ? -s : s) * pw, s * stretch)
      .setRotation(this.flip ? -this.lean : this.lean);
    this.shadow.setPosition(this.x, this.groundY + 2).setScale(s * (1 - rise * 0.01), s);
    // bowing: the body squashes down a little and the head (face, tiara) dips forwards
    this.body.setScale(1, 1 + breathe * 0.002 - this.nod * 0.06);
    this.paintWhirl(time);
    const bun = this.A.bun ?? [140, 52];
    this.tiara.setY(bun[1] - this.waist[1] + 6 + this.nod * 34);

    this.paintLimbs(spec);
    this.paintKey(dt);
    this.paintFace(dt, spec);
    this.paintBack();
  }

  /** From behind: her glossy black hair over the whole head (waves with white shine, the
   *  parting down the middle, gathered at the nape), and the plain back of her bodice. */
  private paintBack(): void {
    const g = this.backG;
    g.clear();
    this.faceG.setVisible(!this.backView);
    if (!this.backView) return;
    const [wx, wy] = this.waist;
    const head = this.A.head ?? [168, 135];
    const hx = head[0] - wx;
    const hy = head[1] - wy + this.nod * 30;
    const R = 98;
    g.fillStyle(0x141414, 1);
    g.fillCircle(hx, hy, R - 2);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const r = R * (0.42 + i * 0.17);
        g.lineStyle(7 - i * 1.5, 0xeeeeee, 0.85 - i * 0.15);
        g.beginPath();
        const a0 = side < 0 ? Math.PI * (1.08 + i * 0.04) : Math.PI * (1.62 - i * 0.04);
        const a1 = side < 0 ? Math.PI * (1.38 + i * 0.03) : Math.PI * (1.92 - i * 0.03);
        g.arc(hx + side * 6, hy + 10, r, a0, a1);
        g.strokePath();
      }
    }
    g.fillStyle(0x141414, 1);
    g.fillTriangle(hx - 30, hy + R * 0.75, hx + 30, hy + R * 0.75, hx, hy + R + 14);
    g.lineStyle(3, 0x4a4a4a, 1);
    g.lineBetween(hx, hy - R + 8, hx, hy + R * 0.7);
    g.lineStyle(5, INK, 1);
    g.strokeCircle(hx, hy, R - 2);
    // the back of the bodice: no laces, a seam down the middle
    const bx = 165 - wx;
    g.fillStyle(0xc4c4c4, 1);
    g.fillRoundedRect(bx - 24, 286 - wy, 48, 52, 8);
    g.lineStyle(3, 0x5a5a5a, 1);
    g.lineBetween(bx, 284 - wy, bx, 338 - wy);
  }

  /** Whirl lines round her tutu and over her head while she spins fast (drawn on her, so
   *  they narrow and flip with her: they read as the blur of the turn). */
  private paintWhirl(time: number): void {
    const g = this.whirlG;
    g.clear();
    const a = Phaser.Math.Clamp((this.spinNow - 2) / 6, 0, 1);
    if (a <= 0) return;
    const wy = this.waist[1];
    const head = this.A.head ?? [168, 135];
    for (let i = 0; i < 4; i++) {
      const y = [-(wy - head[1]) - 40, -170, 30, 120][i];
      const w = [190, 230, 330, 210][i];
      const ph = time * 9 + i * 1.7;
      g.lineStyle(7, 0xffffff, a * 0.85);
      g.beginPath();
      g.arc(0, y, w / 2, Math.PI * (0.15 + 0.1 * Math.sin(ph)), Math.PI * (0.85 + 0.1 * Math.sin(ph)), false);
      g.strokePath();
      g.lineStyle(3, INK, a * 0.7);
      g.beginPath();
      g.arc(0, y + 6, w / 2, Math.PI * (0.2 + 0.1 * Math.sin(ph)), Math.PI * (0.7 + 0.1 * Math.sin(ph)), false);
      g.strokePath();
    }
  }

  /** Arms and legs: rubber hoses from shoulder / hip to the hand / foot, sorted front to back. */
  private paintLimbs(spec: PoseSpec): void {
    const order: { obj: Phaser.GameObjects.GameObject; d: number }[] = [];
    const draw = (l: Limb, i: number, arm: boolean) => {
      const r = this.project(l.root);
      const e = this.project(l.end);
      // the elbow or knee bulges outwards (arms) or forwards (bent legs)
      const mid = v((l.root.x + l.end.x) / 2, (l.root.y + l.end.y) / 2, (l.root.z + l.end.z) / 2);
      const out = Math.sign(l.root.x) || (i ? 1 : -1);
      const len = Math.hypot(l.end.x - l.root.x, l.end.y - l.root.y, l.end.z - l.root.z);
      const slack = Math.max(0, (arm ? 300 : 250) - len) * 0.5; // a short reach bends more
      let b: { x: number; y: number; d: number };
      if (arm) {
        // the elbow bows out sideways from the line shoulder → hand (away from her middle, or down
        // for an arm held out level), never further than allows the forearm to keep pointing at
        // the hand: no wrist bent back on itself
        const ax = e.x - r.x;
        const ay = e.y - r.y;
        const al = Math.hypot(ax, ay) || 1;
        let px = -ay / al;
        let py = ax / al;
        const away = Math.abs(px) > 0.35 ? Math.sign(px) === out : py > 0;
        if (!away) {
          px = -px;
          py = -py;
        }
        const amount = Math.min(24 + slack * 0.6 + (spec.elbows ?? 0), al * 0.42);
        b = { x: (r.x + e.x) / 2 + px * amount, y: (r.y + e.y) / 2 + py * amount, d: (r.d + e.d) / 2 + 10 };
      } else b = this.project(v(mid.x + out * slack * 0.2, mid.y, mid.z + slack * 0.7));
      const ink = new Ink(l.g);
      ink.amp = 0.4;
      l.g.clear();
      ink.hose(r.x, r.y, b.x, b.y, e.x, e.y, arm ? ARM_W : LEG_W, arm ? SKIN : TIGHTS, 4.5);
      if (arm) {
        // the glove: points along the forearm. The drawing is a RIGHT hand seen from the palm
        // (thumb on its right): that is her right hand, on the screen's left, palm to us. Her
        // left hand (screen right) is the mirror image. From behind we see the backs of her
        // hands, so it is the other way round.
        const key = `art:tex:${spec.gloves[i]}`;
        if (l.img.texture.key !== key) l.img.setTexture(key);
        const ang = Math.atan2(e.y - b.y, e.x - b.x);
        l.img.setPosition(e.x, e.y).setRotation(ang + Math.PI / 2).setScale((spec.gloves[i] === 'pirGlovePoint' ? 84 : 66) / l.img.height);
        const back = this.backView !== !!spec.backs?.[i];
        l.img.setFlipX(back ? i === 0 : i === 1);
      } else {
        // the pointe shoe: the toe points along the shin (on pointe: straight down)
        const si = pieceInfo('pirShoe');
        const [ax, ay] = si?.anchors.ankle ?? [52, 82];
        const [tx, ty] = si?.anchors.toe ?? [218, 122];
        const drawn = Math.atan2(ty - ay, tx - ax);
        const ang = Math.atan2(e.y - b.y, e.x - b.x);
        l.img.setPosition(e.x, e.y).setScale(68 / Math.hypot(tx - ax, ty - ay)).setRotation(ang - drawn).setFlipX(false);
      }
      // the far ones behind her, the near ones in front (legs always come out under the tutu)
      const d = arm ? e.d : -400 + e.d;
      order.push({ obj: l.g, d }, { obj: l.img, d: d + 0.01 });
    };
    this.arms.forEach((l, i) => draw(l, i, true));
    this.legs.forEach((l, i) => draw(l, i, false));
    // the body, face, hair and tiara sit at depth 0 (in that order); the key behind her back
    const keyD = this.project(v(0, -20, -40)).d;
    const list: { obj: Phaser.GameObjects.GameObject; d: number }[] = [
      ...order,
      { obj: this.body, d: 0 },
      { obj: this.whirlG, d: -500 },
      { obj: this.faceG, d: 0.001 },
      { obj: this.backG, d: 0.0015 },
      { obj: this.tiara, d: 0.003 },
      { obj: this.key, d: keyD > 0 ? 0.004 : -50 },
    ];
    list.sort((a, b) => a.d - b.d);
    list.forEach((o, i) => this.box.moveTo(o.obj, i));
  }

  /** The heart key in her back: sticks out behind her, turning round its shaft. */
  private paintKey(dt: number): void {
    const winding = this.pose === 'windUp';
    // winding herself up: quick turns; dancing: it unwinds slowly; run down: still
    this.keyTurn += dt * (winding ? 14 : this.spring > 0.02 ? -2.2 * this.spring : 0);
    const base = this.project(v(0, -20, -40));
    const tip = this.project(v(-110, -50, -80));
    const ang = Math.atan2(tip.y - base.y, tip.x - base.x);
    const ki = pieceInfo('pirKey');
    const [px, py] = ki?.anchors.pivot ?? [112, 75];
    const [hx, hy] = ki?.anchors.handle ?? [45, 25];
    const full = Math.hypot(px - hx, py - hy);
    const len = Math.hypot(tip.x - base.x, tip.y - base.y);
    const s = 100 / full;
    this.key.setPosition(base.x, base.y).setRotation(ang - Math.PI);
    this.key.setScale(s * Math.max(0.25, len / 120), s * Math.cos(this.keyTurn));
  }

  /** The porcelain face, always from the front (her spins are paper turns of the whole drawing). */
  private paintFace(dt: number, spec: PoseSpec): void {
    const [wx, wy] = this.waist;
    const faceAt = this.A.face ?? [192, 150];
    // the expression, with blinks, the singing mouth and the gaze
    this.blinkT -= dt;
    const blink = this.blinkT < 0.12;
    if (this.blinkT < 0) this.blinkT = 1.8 + Math.random() * 3;
    const over: Partial<FaceParams> = {};
    if (this.mouth > 0.05) {
      over.open = Math.max(expression(spec.face).open, this.mouth * 0.7);
      over.width = 0.45 + this.mouth * 0.2;
    }
    if (this.lookTarget) {
      const fx = this.x + (faceAt[0] - wx) * this.size * (this.flip ? -1 : 1);
      over.gazeX = Phaser.Math.Clamp(((this.lookTarget.x - fx) / 300) * (this.flip ? -1 : 1), -1, 1);
    }
    if (blink) {
      over.lidL = 1;
      over.lidR = 1;
    }
    glideFace(this.face, expression(spec.face, over), dt);
    this.faceG.clear();
    this.faceG.setPosition(faceAt[0] - wx, faceAt[1] - wy + this.nod * 40).setScale(0.6, 0.6 * (1 - this.nod * 0.25));
    // a blush on each cheek (porcelain doll), then the face
    this.faceG.fillStyle(0xb8b0a8, 0.35);
    this.faceG.fillEllipse(-62, 30, 34, 20);
    this.faceG.fillEllipse(62, 30, 34, 20);
    drawFace(this.faceInk, 0, 0, this.face, { plate: 0xf3f0ea, white: 0xffffff, glow: false, eyeY: -26, mouthY: 52, eyeX: 32, lashes: true, lips: 0x3a3a3a });
  }

  /** Where her head is (screen) — returned notes fly back to it. */
  headPos(): { x: number; y: number } {
    const head = this.A.head ?? [168, 135];
    const hx = (head[0] - this.waist[0]) * (this.flip ? -1 : 1) * this.pw;
    const hy = head[1] - this.waist[1];
    return { x: this.box.x + hx * this.size, y: this.box.y + hy * this.size };
  }

  /** Where her hand is (screen) — notes leave from here. */
  handPos(i: 0 | 1): { x: number; y: number } {
    // the same transform as her container: mirrored (a reflection) first, then leaning
    const e = this.project(this.arms[i].end);
    const ex = (this.flip ? -e.x : e.x) * this.pw;
    const r = this.flip ? -this.lean : this.lean;
    const cs = Math.cos(r);
    const s = Math.sin(r);
    return { x: this.box.x + (ex * cs - e.y * s) * this.size, y: this.box.y + (ex * s + e.y * cs) * this.size };
  }
}
