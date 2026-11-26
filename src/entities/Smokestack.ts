// OLD SMOKESTACK — a boastful locomotive with a walrus moustache, a top-hat
// chimney and rubber-hose arms. Drawn procedurally; local origin = nose at ground.
//
// The whole drawing goes through a "warp" (see Ink.warp) so the locomotive moves
// like rubber: the boiler breathes on the beat, the body leans on a spring when
// it winds up / charges / brakes, it ripples while singing and the chimney
// stretches like a top hat when it puffs or coughs.

import Phaser from 'phaser';
import { Game } from '../core/Game';
import type { ArtManifest } from '../core/types';
import type { Viseme } from '../core/visemes';
import { Acting, faceWarp } from '../rig/Acting';
import { ACTS, ACT_FACE, SING_FACES, type ActName, type ActPose, type Gaze } from './SmokestackActs';
import { NEUTRAL, drawFace, expression, glideFace, type FaceParams } from './FaceRig';
import { INK, Ink, PAPER } from '../rig/Ink';
import { pieceInfo } from '../fx/artTextures';

export type ArmPose = 'idle' | 'point' | 'fist' | 'wave';

/** [width, opening, top teeth, bottom teeth] of each mouth shape (code face, 104 px radius). */
const MOUTH_SHAPES: Record<Viseme, [number, number, boolean, boolean]> = {
  rest: [34, 0, false, false],
  closed: [36, 0, false, false],
  teeth: [34, 10, true, false],
  open: [32, 14, true, false],
  wide: [46, 28, true, false],
  mid: [44, 16, true, true],
  round: [26, 26, false, false],
  small: [17, 13, false, false],
};


// ── puppet mode: a body picture + parts from `npm run art -- smokestack` ──
/** Half-height of the face plate on screen (local px): sets the puppet's size. */
const FACE_RY = 76;
/** Local x of the nose (cowcatcher tip), as in the code drawing. */
const NOSE_X = 46;

interface PuppetGeo {
  k: number;
  face: { x: number; y: number; rx: number; ry: number };
  chimney: { x: number; top: number; base: number; capW: number };
  shoulders: { x: number; y: number }[];
  wheels: { x: number; y: number; r: number; spin: number }[];
}

interface Puppet {
  box: Phaser.GameObjects.Container;
  gBack: Phaser.GameObjects.Graphics;
  /** the front arm when it reaches behind the head */
  gUnder: Phaser.GameObjects.Graphics;
  gMid: Phaser.GameObjects.Graphics;
  gFront: Phaser.GameObjects.Graphics;
  rest: { v: Phaser.Geom.Mesh.Vertex; x: number; y: number }[];
  wheels: Phaser.GameObjects.Image[];
  /** Optional parts: a sheet may have no moustache, no hat, no gloves (then they are drawn by code). */
  mustache: Phaser.GameObjects.Image | null;
  hat: Phaser.GameObjects.Image | null;
  gloveF: Phaser.GameObjects.Image | null;
  gloveB: Phaser.GameObjects.Image | null;
  /** hand-drawn things he holds out on the long reach (`npm run art` event pieces), if any */
  props: Partial<Record<'ticket' | 'punchOpen' | 'punchClosed' | 'windKey', Phaser.GameObjects.Image>>;
}

interface Hand {
  x: number;
  y: number;
  angle: number;
  fist: boolean;
  finger: boolean;
  /** The far arm stays out of sight behind the boiler. */
  hidden?: boolean;
}

/** Where everything of the body picture lands in the boss's local coords (nose at ground = 0, 0). */
function puppetGeometry(a: ArtManifest): PuppetGeo {
  const A = a.anchors;
  const k = FACE_RY / A.face[3];
  const L = (px: number, py: number) => ({ x: (px - A.noseX) * k + NOSE_X, y: (py - A.ground) * k });
  const f = L(A.face[0], A.face[1]);
  const top = L(A.chimney[0], A.chimney[1]);
  const big = A.wheels.map(([x, y, r]) => ({ ...L(x, y), r: r * k, spin: 1 }));
  const fw = A.frontWheel;
  return {
    k,
    face: { x: f.x, y: f.y, rx: A.face[2] * k, ry: A.face[3] * k },
    chimney: { x: top.x, top: top.y, base: L(0, A.chimney[2]).y, capW: 130 * k },
    // the near arm comes out just behind the face, low; the far one from behind the boiler
    shoulders: [
      { x: f.x - A.face[2] * k * 1.45, y: f.y + A.face[3] * k * 0.5 },
      ...A.shoulders.slice(1).map(([x, y]) => L(x, y)),
    ],
    wheels: fw ? [...big, { ...L(fw[0], fw[1]), r: fw[2] * k, spin: A.wheels[0][2] / fw[2] }] : big,
  };
}

const BOILER = 0x2c2c2c;
const BOILER_HI = 0x4a4a4a;
const FACE = 0xc8c0b0;
const IRON = 0x1c1c1c;
const BRASS = 0xc9a24a;

export class Smokestack {
  readonly gfx: Phaser.GameObjects.Graphics;
  private ink: Ink;
  private drawTimer = 0;

  // ── state driven by the level
  /** 0..1 how open the mouth is (driven by lyrics). */
  mouth = 0;
  /** Mouth shape of the sound being sung (lip sync by phoneme, see visemes.ts). */
  viseme: Viseme = 'rest';
  /** Accent pose: held for a moment on the big beats (shouted words, lunge peaks). */
  private accentT = 0;
  private accentPainted = false;
  /** 0-1: how much the body is smeared by speed this drawing. */
  private smear = 0;
  private prevHand: { x: number; y: number } | null = null;
  /** Blinks, head turns, nods, tilts, brow raises (rig/Acting.ts). */
  readonly act = new Acting();
  private accentNow = false;
  /** The performance being played from the repertoire (SmokestackActs.ts). */
  private perf: { name: ActName; start: number; dur: number } | null = null;
  private pose: ActPose = {};
  private poseW = 0;
  /** The current syllable is shouted. */
  shouting = false;
  /** -1 calm … 1 furious */
  anger = 0.3;
  /** 0..1 nervous (when the player does well). */
  nervous = 0;
  arm: ArmPose = 'idle';
  /** Wheel rotation in radians (accumulates with distance). */
  wheelAngle = 0;
  /** Extra forward offset (lunge) in px. */
  lunge = 0;
  /** The peak beat of a charge that was called off (Tick stopped time): the charge just eases back. */
  lungeCancelled: number | null = null;
  /** Charging telegraph 0..1 (shake + red eyes). */
  charge = 0;
  /** Screen position of the nose. */
  screenX = 0;
  groundY = 600;
  tilt = 0;
  fallY = 0;
  /** Screen point the eyes look at (Tick). */
  lookTarget = { x: 800, y: 540 };
  /** Overall drawing scale (1 in the chase; small when he sits in the Bijou). */
  size = 1;
  /** A shady villain in his film; friendly once he got his ending (the Bijou). */
  villain = true;
  /** 0-1 darkness around him (the tunnel): his eyes glow in it. */
  dark = 0;

  // ── internal animation
  private lean = 0;
  private leanVel = 0;
  private prevLunge = 0;
  private whistleT = 0;
  private coughT = 0;
  private laughT = 0;
  private beat = 0;
  private time = 0;

  /** Puppet parts (`npm run art -- smokestack`), if a sheet was built and loaded. */
  private art: ArtManifest | null;
  private geo: PuppetGeo | null;
  private puppet: Puppet | null = null;
  private visible = true;
  private dt = 1 / 60;
  /** the mouth shape melts from one syllable into the next */
  private mw = 34;
  private moh = 0;
  /** brows, eye size and lids glide between expressions too */
  private featT = 0;
  private moodS = 0.7;
  private raiseS = 0;
  private bigS = 1;
  private lidS = 0.55;
  /** hands, hat and gloves move on springs: nothing ever jumps */
  private hands = { front: { x: 0, y: 0, vx: 0, vy: 0, init: false }, back: { x: 0, y: 0, vx: 0, vy: 0, init: false } };
  private hatS = { y: 0, vy: 0, r: 0, vr: 0 };
  private gloveType = { front: '', back: '' };
  private glovePop = { front: 0, back: 0 };
  /** the glove's turn, eased (a new pose never snaps it round in one frame) */
  private gloveAng = { front: NaN, back: NaN };
  private lastWhole = -1;
  /**
   * The conductor's long reach (set every frame by song events, in screen coords): the
   * front arm stretches out like a rubber hose to hold a ticket over Tick or to punch
   * the track. Cleared by the event when it is done.
   */
  reach: { x: number; y: number; prop: 'ticket' | 'punch' | 'key'; holes?: boolean[]; closed?: boolean; turn?: number } | null = null;
  /** An event can force a face for a while (e.g. 'gulp' while drinking). */
  faceOverride: string | null = null;
  /** where the puppet looks: at Tick, into the camera (the player!), up at the sky... */
  gaze: Gaze = 'tick';
  private faceNow: FaceParams = { ...NEUTRAL };
  private singFace = 'smirk';
  private wasSinging = false;
  private saccade = { x: 0, y: 0, t: 0, next: 1.5 };
  /** where the warp finds the smokestack and the boiler (the code drawing by default) */
  private chim = { x: -170, base: -296 };
  private boilerBox = { x0: -620, x1: -30, yTop: -310, yBot: -100 };

  /**
   * @param artKey which character's parts sheet to wear (public/art/<artKey>/): any parts sheet
   *               made with `npm run art` gets the same puppet, acting and face.
   */
  constructor(private scene: Phaser.Scene, readonly artKey = 'smokestack') {
    this.gfx = scene.add.graphics();
    this.gfx.setDepth(40);
    this.ink = new Ink(this.gfx);
    this.ink.amp = 1.4;
    this.art = Game.art[artKey] ?? null;
    this.geo = this.art ? puppetGeometry(this.art) : null;
  }

  /** The puppet is the villain; the friendly Smokestack in the Bijou stays drawn by code. */
  get usesPuppet(): boolean {
    return this.geo !== null && this.villain;
  }

  /** Move the whole drawing in front of / behind the scenery (e.g. on a far track). */
  setDepth(d: number): void {
    this.gfx.setDepth(d);
    this.puppet?.box.setDepth(d);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.gfx.setVisible(v && !this.usesPuppet);
    this.puppet?.box.setVisible(v && this.usesPuppet);
  }

  /** A point in local coords (nose at ground) on screen. */
  private localPoint(lx: number, ly: number): { x: number; y: number } {
    return { x: this.screenX + lx * this.size, y: this.groundY + ly * this.size + this.fallY };
  }

  // ───────────────────────── reactions ─────────────────────────

  /** Steam whistle blast (TOOT!). */
  toot(): void {
    this.whistleT = 0.6;
  }

  /** Chimney cough (lobbing coal / smoke rings). */
  cough(): void {
    this.coughT = 0.45;
  }

  /** Big belly laugh (the player got hurt). */
  /** Start a performance from the repertoire, lasting `durSec` seconds. */
  perform(name: ActName, durSec: number): void {
    this.perf = { name, start: this.time, dur: Math.max(0.4, durSec) };
  }

  get performing(): ActName | null {
    return this.perf?.name ?? null;
  }

  /** Snap into a big held pose on an accent of the song (classic cartoon "hit"). */
  accent(): void {
    this.accentNow = true;
    this.accentT = 0.2;
    this.accentPainted = false;
    this.drawTimer = 0;
  }

  laugh(): void {
    this.laughT = 0.9;
  }

  /** Where the chimney top is (screen coords) – for puffs and projectiles. */
  get chimneyTop(): { x: number; y: number } {
    if (this.geo && this.usesPuppet) return this.localPoint(this.geo.chimney.x + this.lean * 55, this.geo.chimney.top - 100);
    return { x: this.screenX - 170 + this.lean * 55, y: this.groundY - 450 + this.fallY };
  }

  /** Headlamp position in screen coords (light source in the tunnel). */
  get lamp(): { x: number; y: number } {
    if (this.geo && this.usesPuppet) return this.localPoint(this.geo.face.x + this.lean * 40, this.geo.face.y - this.geo.face.ry - 12);
    return { x: this.screenX - 40 + this.lean * 40, y: this.groundY - 322 + this.fallY };
  }

  /** Mouth position in screen coords (for breath puffs when shouting). */
  get mouthPos(): { x: number; y: number } {
    if (this.geo && this.usesPuppet) return this.localPoint(this.geo.face.x, this.geo.face.y + this.geo.face.ry * 0.45);
    return { x: this.screenX - 60 + this.lean * 20, y: this.groundY - 150 + this.fallY };
  }

  /** Where his eyes are on screen (they glow in the dark). */
  get eyesPos(): { x: number; y: number } {
    if (this.geo && this.usesPuppet) {
      const f = this.geo.face;
      return this.localPoint(f.x + this.act.turn * f.rx * 0.3, f.y - f.ry * 0.27);
    }
    return { x: this.screenX + (-60 + this.act.turn * 30) * this.size, y: this.groundY - 240 * this.size + this.fallY };
  }

  get noseX(): number {
    return this.screenX + 40;
  }

  // ───────────────────────── per frame ─────────────────────────

  update(dt: number, time: number, beat: number): void {
    this.beat = beat;
    this.time = time;
    const phase = beat - Math.floor(beat);
    const eighth = beat * 2 - Math.floor(beat * 2);

    // timers
    this.whistleT = Math.max(0, this.whistleT - dt);
    // the current performance: its pose, faded in and out at the edges
    this.pose = {};
    this.poseW = 0;
    if (this.perf) {
      const t = (time - this.perf.start) / this.perf.dur;
      if (t >= 1 || t < 0) this.perf = null;
      else {
        this.pose = ACTS[this.perf.name].pose(t, beat);
        const edge = Math.min(1, t / 0.15, (1 - t) / 0.15);
        this.poseW = edge * edge * (3 - 2 * edge);
      }
    }
    // acting: sing out to the audience, otherwise keep an eye (and the face) on Tick
    const singing = this.mouth > 0.15 || this.shouting;
    const faceX = this.screenX - 60 * this.size;
    const toTick = Phaser.Math.Clamp((this.lookTarget.x - faceX) / 380, -1, 1) * 0.85;
    let look = singing ? toTick * 0.25 : toTick;
    if (this.pose.turn !== undefined) look += (this.pose.turn - look) * this.poseW;
    if (this.usesPuppet && this.currentGaze() === 'camera') look *= 0.1;
    this.act.update(dt, beat, { look, singing, accent: this.accentNow, nervous: this.nervous, idle: false });
    this.accentNow = false;
    this.accentT = Math.max(0, this.accentT - dt);
    if (this.accentT === 0) this.accentPainted = false;
    this.coughT = Math.max(0, this.coughT - dt);
    this.laughT = Math.max(0, this.laughT - dt);

    // lean on a spring: wind up backwards, throw forward on the charge, rock back when braking
    const dLunge = (this.lunge - this.prevLunge) / Math.max(dt, 1e-3);
    this.prevLunge = this.lunge;
    let target = -this.nervous * 0.12;
    if (this.charge > 0.05 && dLunge <= 1) target = -0.55 * this.charge;
    if (dLunge > 40) target = 0.85;
    else if (dLunge < -40) target = -0.35;
    if (this.fallY > 20) target = 0;
    const acc = (target - this.lean) * 140 - this.leanVel * 11;
    this.leanVel += acc * dt;
    this.lean += this.leanVel * dt;

    // chugging bounce: small hop on every eighth, bigger on the beat, crazy when laughing
    const chug = -Math.pow(1 - eighth, 3) * 4 - Math.pow(1 - phase, 3) * 7;
    const laughBob = this.laughT > 0 ? Math.sin(time * 45) * 7 * Math.min(1, this.laughT * 2) : 0;
    const shake = this.charge > 0 ? (Math.random() - 0.5) * 8 * this.charge : 0;
    const airborne = this.fallY !== 0;
    const pw = this.poseW;
    this.gfx.setPosition(
      this.screenX + shake + (this.pose.shimmy ?? 0) * pw * this.size,
      this.groundY + (airborne ? 0 : chug + laughBob + (this.pose.bob ?? 0) * pw * this.size) + this.fallY,
    );
    this.gfx.setRotation(this.tilt + (airborne ? 0 : Math.sin(beat * Math.PI) * 0.008 + (this.pose.tilt ?? 0) * pw));
    let stretch = 1 + Math.pow(1 - phase, 3) * 0.035;
    if (this.accentT > 0) stretch *= 1.12; // accent: tall, thin, held
    // smear: when charging forward fast, the drawing stretches along the motion
    this.smear = this.fallY !== 0 ? 0 : Phaser.Math.Clamp((dLunge - 250) / 900, 0, 1);
    const smearX = 1 + this.smear * 0.22;
    this.gfx.setScale((this.size * smearX) / Math.sqrt(stretch), this.size * stretch * (1 - this.smear * 0.06));

    this.dt = dt;
    // the mouth shape melts from one syllable into the next
    const laughing = this.laughT > 0.05;
    const vis: Viseme = laughing || this.shouting ? 'wide' : this.mouth < 0.12 ? 'rest' : this.viseme;
    const [tw, toh] = this.shouting ? [32, 40] : MOUTH_SHAPES[vis];
    const m = Math.min(1, dt * 28);
    this.mw += (tw - this.mw) * m;
    this.moh += (toh - this.moh) * m;

    if (this.usesPuppet) {
      glideFace(this.faceNow, this.faceTarget(dt), dt);
      this.updatePuppet();
      return;
    }
    this.puppet?.box.setVisible(false);
    this.gfx.setVisible(this.visible);

    // hand-drawn redraw on twos (12 fps); an accent pose is held, not redrawn
    this.drawTimer -= dt;
    if (this.drawTimer > 0) return;
    if (this.accentT > 0 && this.accentPainted) return;
    if (this.accentT > 0) this.accentPainted = true;
    this.drawTimer = 1 / 12;
    this.ink.seed = Math.floor(time * 12) % 3;
    this.paint();
  }

  // ───────────────────────── puppet mode ─────────────────────────

  private buildPuppet(): Puppet {
    const a = this.art!;
    const g = this.geo!;
    const s = this.scene;
    const A = a.anchors;
    const box = s.add.container(0, 0).setDepth(40);
    const id = this.artKey;
    const has = (part: string) => !!a.parts[part];
    const gBack = s.add.graphics();
    const gloveB = has('gloveFist') ? s.add.image(0, 0, `art:${id}:gloveFist`).setOrigin(0.5, 0.82) : null;
    const key = `art:${id}:body`;
    const mesh = s.add.mesh(0, 0, key);
    Phaser.Geom.Mesh.GenerateGridVerts({ mesh, texture: key, widthSegments: 20, heightSegments: 12 });
    mesh.hideCCW = false;
    (mesh as unknown as { preUpdate(t: number, d: number): void }).preUpdate(0, 0);
    const W = a.parts.body.w;
    const H = a.parts.body.h;
    const rest = mesh.vertices.map((v) => {
      const px = (v.x + 0.5) * W;
      const py = (0.5 - v.y) * H;
      return { v, x: (px - A.noseX) * g.k + NOSE_X, y: (py - A.ground) * g.k };
    });
    const wheelR = has('wheel') ? a.parts.wheel.w / 2 - 12 : 1;
    const wheels = has('wheel') ? g.wheels.map((w) => s.add.image(0, 0, `art:${id}:wheel`).setScale((w.r * 1.0) / wheelR)) : [];
    const gUnder = s.add.graphics();
    const gMid = s.add.graphics();
    const mustache = has('mustache') ? s.add.image(0, 0, `art:${id}:mustache`).setOrigin(0.5, 0.22) : null;
    const hat = has('hat') ? s.add.image(0, 0, `art:${id}:hat`).setOrigin(0.5, 0.9) : null;
    hat?.setScale((g.chimney.capW * 1.7) / a.parts.hat.w);
    const gFront = s.add.graphics();
    const gloveF = has('gloveOpen') ? s.add.image(0, 0, `art:${id}:gloveOpen`).setOrigin(0.5, 0.82) : null;
    // the ticket, the punch and the winding key, when they are hand-drawn: held in the front glove
    const props: Puppet['props'] = {};
    for (const n of ['ticket', 'punchOpen', 'punchClosed', 'windKey'] as const) {
      if (s.textures.exists(`art:tex:${n}`)) props[n] = s.add.image(0, 0, `art:tex:${n}`).setVisible(false);
    }
    // all of them sit behind the glove: the fist closes over them
    box.add([gBack, ...(gloveB ? [gloveB] : []), mesh, ...wheels, gUnder, gMid, ...(mustache ? [mustache] : []), ...(hat ? [hat] : []), ...Object.values(props), gFront, ...(gloveF ? [gloveF] : [])]);
    // the warp finds the smokestack and the boiler of this picture
    this.chim = { x: g.chimney.x, base: g.chimney.base };
    const f = g.face;
    this.boilerBox = { x0: f.x - f.ry * 6, x1: f.x - f.rx * 0.6, yTop: f.y - f.ry * 1.1, yBot: f.y + f.ry * 1.1 };
    return { box, gBack, gUnder, gMid, gFront, rest, wheels, mustache, hat, gloveF, gloveB, props };
  }

  /** The puppet, redrawn every frame (60 fps) so every movement is continuous. */
  private updatePuppet(): void {
    if (!this.puppet) this.puppet = this.buildPuppet();
    const P = this.puppet;
    const g = this.geo!;
    this.gfx.setVisible(false);
    P.box.setVisible(this.visible);
    const near = 1 + this.faceNow.lean * 0.05;
    P.box.setPosition(this.gfx.x, this.gfx.y).setRotation(this.gfx.rotation).setScale(this.gfx.scaleX * near, this.gfx.scaleY * near);
    this.ink.seed = 0;
    this.ink.amp = 0.5;
    this.setupWarp();
    const warp = this.ink.warp!;
    // the body: every vertex of the picture goes through the rubber warp
    for (const r of P.rest) {
      const p = warp(r.x, r.y);
      r.v.vx = p.x;
      r.v.vy = p.y;
    }
    // wheels spin, the connecting rod follows the crank pins
    g.wheels.forEach((w, i) => {
      const p = warp(w.x, w.y);
      P.wheels[i]?.setPosition(p.x, p.y).setRotation(this.wheelAngle * w.spin);
    });
    const k = this.ink;
    const prevG = k.g;
    P.gBack.clear();
    P.gUnder.clear();
    P.gMid.clear();
    P.gFront.clear();
    k.g = P.gBack;
    this.placeGlove(P.gloveB, this.paintArm(false), 'back');
    k.g = P.gMid;
    const big = g.wheels.slice(0, 3);
    if (big.length >= 2 && P.wheels.length) {
      const pins = big.map((w) => ({ x: w.x + Math.cos(this.wheelAngle) * w.r * 0.48, y: w.y + Math.sin(this.wheelAngle) * w.r * 0.48 }));
      const a0 = pins[0];
      const a1 = pins[pins.length - 1];
      k.line(a0.x, a0.y, a1.x, a1.y, 17, INK);
      k.line(a0.x, a0.y, a1.x, a1.y, 10, 0xa8a8a8);
      for (const p of pins) k.circle(p.x, p.y, 7, PAPER, 3);
    }
    this.paintPuppetFace(P);
    this.updateHat(P, warp);
    k.g = P.gFront;
    for (const img of Object.values(P.props)) img.setVisible(false);
    this.placeGlove(P.gloveF, this.paintArm(true), 'front');
    k.g = prevG;
    k.amp = 1.4;
    this.ink.warp = null;
  }

  /** Where to look right now (an act can override the director's choice). */
  private currentGaze(): Gaze {
    if (this.reach) return 'tick';
    if (this.arm === 'point') return 'up';
    if (this.perf?.name === 'timetable' && this.poseW > 0.3 && (this.time - this.perf.start) / this.perf.dur < 0.62) return 'paper';
    if (this.perf && this.poseW > 0.3) return ACT_FACE[this.perf.name].gaze ?? this.gaze;
    return this.gaze;
  }

  /** The face the puppet should be making now: an expression, the syllable being sung, the gaze, blinks. */
  private faceTarget(dt: number): FaceParams {
    const laughing = this.laughT > 0.05;
    const singing = this.mouth > 0.12 || this.shouting;
    if (singing && !this.wasSinging) this.singFace = SING_FACES[Math.floor(Math.random() * SING_FACES.length)];
    this.wasSinging = singing;
    let name = 'sneer';
    if (this.fallY > 20) name = this.arm === 'wave' ? 'innocent' : 'panic';
    else if (this.faceOverride) name = this.faceOverride;
    else if (laughing) name = 'cackle';
    else if (this.reach) name = this.reach.prop === 'ticket' ? 'smirk' : 'glee';
    else if (this.arm === 'point') name = 'glee';
    else if (this.arm === 'fist' || this.charge > 0.3) name = 'rage';
    else if (this.perf && this.poseW > 0.3) {
      name = ACT_FACE[this.perf.name].face;
      // the timetable: scheming while reading it, then a smirk at you ("right on time")
      if (this.perf.name === 'timetable' && (this.time - this.perf.start) / this.perf.dur > 0.62) name = 'smirk';
    }
    else if (this.nervous > 0.5) name = 'worry';
    else if (singing) name = this.singFace;
    const t = expression(name);
    // the syllable being sung opens and shapes the mouth on top of the expression
    if (singing && !laughing) {
      t.open = Math.max(t.open * 0.5, this.moh / 42);
      t.width = t.width * 0.4 + (this.mw / 34) * 0.6;
      if (this.shouting) {
        t.eye *= 1.12;
        t.browL += 0.4;
        t.browR += 0.4;
      }
    }
    // gaze
    const gaze = this.currentGaze();
    const f = this.geo!.face;
    const faceX = this.screenX + f.x * this.size;
    const faceY = this.groundY + f.y * this.size;
    const dirs: Record<Gaze, [number, number]> = {
      tick: [Phaser.Math.Clamp((this.lookTarget.x - faceX) / 260, -1, 1), Phaser.Math.Clamp((this.lookTarget.y - faceY) / 260, -1, 1)],
      camera: [0.05, 0.08],
      up: [0.35, -0.95],
      back: [-1, -0.1],
      down: [0.15, 0.85],
      side: [0.95, -0.05],
      // reading the timetable held to the left: the eyes run along the rows
      paper: [-0.85 + Math.sin(this.time * 5) * 0.18, 0.05 + ((this.time * 0.8) % 1) * 0.35],
    };
    const own = name in { scheme: 1, listen: 1, suspicious: 1 } ? [t.gazeX, t.gazeY] : null;
    let [gx, gy] = own && gaze === 'tick' ? own : dirs[gaze];
    // the eyes are never dead still: quick little darts (except when staring you down)
    const S = this.saccade;
    S.next -= dt;
    S.t = Math.max(0, S.t - dt);
    if (S.next <= 0) {
      S.x = (Math.random() - 0.5) * 0.5;
      S.y = (Math.random() - 0.5) * 0.3;
      S.t = 0.25 + Math.random() * 0.3;
      S.next = 0.9 + Math.random() * 1.6;
    }
    if (S.t > 0 && name !== 'menace' && gaze !== 'camera') {
      gx += S.x;
      gy += S.y;
    }
    t.gazeX = gx;
    t.gazeY = gy;
    // singing at the player: lean in a little
    if (gaze === 'camera' && singing) t.lean = Math.max(t.lean, 0.45);
    // accents: eyes pop for the big moment
    if (this.accentT > 0) {
      t.eye *= 1.15;
      t.browL += 0.5;
      t.browR += 0.5;
    }
    // blinks (and always on a head turn, see Acting)
    if (this.act.blinking && name !== 'cackle' && name !== 'menace') {
      t.lidL = 1;
      t.lidR = 1;
    }
    return t;
  }

  /** The rig face, fitted onto the round plate of the picture (it turns, tilts and nods with the acting). */
  private paintPuppetFace(P: Puppet): void {
    const f = this.geo!.face;
    const p = this.faceNow;
    const fs = (f.ry / 104) * (1 + p.lean * 0.14);
    const sq = Math.min(1, (f.rx / f.ry) * 1.12 + p.lean * 0.08);
    const bodyWarp = this.ink.warp;
    const head = faceWarp(this.act, f.x, f.y, f.ry, bodyWarp);
    const toFace = (x: number, y: number) => head(f.x + x * fs * sq, f.y + y * fs);
    const k = this.ink;
    k.warp = toFace;
    const red = this.charge > 0.3 || (this.poseW > 0.5 && !!this.pose.red);
    k.circle(0, -4, 10, 0x4a4a4a, 4); // nose rivet
    drawFace(k, 0, 0, p, { plate: 0xbababb, white: red ? 0xe8b0a0 : 0xeae6da, glow: this.dark > 0.4, eyeY: -38, mouthY: 60 });
    // props that live on the face
    const pose = this.poseW > 0.5 ? this.pose : ({} as ActPose);
    const time = this.time;
    if (pose.tears) {
      for (const [ex, ph] of [[-34, 0], [34, 0.5]] as const) {
        const d = ((time * 1.6 + ph) % 1) * 70;
        k.poly([{ x: ex, y: -10 + d }, { x: ex + 7, y: 4 + d }, { x: ex - 7, y: 4 + d }], 0xd8ecff, 2);
      }
    }
    if (pose.earSteam || this.charge > 0.6) {
      for (const side of [-1, 1]) {
        const puff = (time * 3) % 1;
        k.cloud(side * (112 + puff * 40), -40 - puff * 50, 14 + puff * 14);
      }
    }
    if (this.nervous > 0.4) {
      const drip = (time * 1.5) % 1;
      k.poly([{ x: 84, y: -64 + drip * 30 }, { x: 94, y: -38 + drip * 30 }, { x: 74, y: -38 + drip * 30 }], 0xe0f0ff, 3);
    }
    if (pose.soot) k.cloud(60, 70, 46, 0x2a2a2a);
    // the moustache picture rides on the face: lifts with a smile, tilts with a sneer, flaps when singing
    const wig = Math.sin(time * 9) * 3 * this.mouth + (this.laughT > 0 ? Math.sin(time * 40) * 4 : 0);
    // (it hangs from just under the nose, the mouth shows below it)
    const m = toFace(-2, 4 - p.smile * 5 - p.open * 6 + wig);
    const width = 122 * fs * (0.55 + 0.45 * sq) * (1 + p.smile * 0.06);
    const flap = 1 + this.mouth * 0.06 * Math.sin(time * 18) + (this.shouting ? 0.1 : 0);
    P.mustache?.setPosition(m.x, m.y);
    P.mustache?.setRotation(this.act.tilt * 1.2 - p.skew * 0.09);
    P.mustache?.setScale((width / P.mustache.width) * flap, (width / P.mustache.width) * (2 - flap));
    k.warp = bodyWarp;
  }

  /** The top hat sits on the smokestack on a spring: it hops on every downbeat, flies up on TOOT! */
  private updateHat(P: Puppet, warp: (x: number, y: number) => { x: number; y: number }): void {
    const g = this.geo!;
    const H = this.hatS;
    const whole = Math.floor(this.beat);
    if (whole !== this.lastWhole) {
      this.lastWhole = whole;
      H.vy -= 60;
      H.vr += (whole % 2 === 0 ? 1 : -1) * 0.5;
    }
    const lift = (this.pose.hatLift ?? 0) * this.poseW * 80 + (this.whistleT > 0 ? 40 : 0) + this.coughT * 50 + (this.laughT > 0 ? 12 : 0);
    const dt = Math.min(this.dt, 1 / 30);
    H.vy += ((-lift - H.y) * 260 - H.vy * 13) * dt;
    H.y += H.vy * dt;
    const tiltTarget = -this.lean * 0.35 + (this.pose.hatLift ? -0.25 * this.poseW : 0);
    H.vr += ((tiltTarget - H.r) * 160 - H.vr * 9) * dt;
    H.r += H.vr * dt;
    const top = warp(g.chimney.x, g.chimney.top);
    P.hat?.setPosition(top.x, top.y + H.y).setRotation(H.r);
  }

  /** Put the glove picture at the end of the hose arm, pointing along it. */
  private placeGlove(img: Phaser.GameObjects.Image | null, h: Hand, side: 'front' | 'back'): void {
    if (!img) {
      if (!h.hidden) this.ink.glove(h.x, h.y, 22, h.angle, h.fist);
      return;
    }
    img.setVisible(!h.hidden);
    if (h.hidden) return;
    const type = h.finger ? 'glovePoint' : h.fist ? 'gloveFist' : 'gloveOpen';
    if (type !== this.gloveType[side]) {
      this.gloveType[side] = type;
      img.setTexture(this.scene.textures.exists(`art:${this.artKey}:${type}`) ? `art:${this.artKey}:${type}` : `art:${this.artKey}:gloveOpen`);
      this.glovePop[side] = 1;
    }
    this.glovePop[side] = Math.max(0, this.glovePop[side] - this.dt * 6);
    const target = (type === 'glovePoint' ? 84 : type === 'gloveFist' ? 54 : 66) * (side === 'back' ? 0.9 : 1);
    const pop = 1 + Math.sin(this.glovePop[side] * Math.PI) * 0.18;
    const p = this.ink.warp ? this.ink.warp(h.x, h.y) : h;
    // the glove turns towards where the forearm points, but eased: when a gesture starts the
    // elbow can jump, and the glove would snap round 80° in one frame (it looked inside out)
    let ang = this.gloveAng[side];
    if (!Number.isFinite(ang) || h.hidden) ang = h.angle;
    ang += Phaser.Math.Angle.Wrap(h.angle - ang) * Math.min(1, this.dt * 12);
    this.gloveAng[side] = ang;
    // we see the train's left side: the near hand is a left hand, palm towards us (the gloves
    // are drawn fingers up with the thumb on the right), and it only ever turns, never mirrors
    const s = (target / img.height) * pop;
    img.setFlipX(false).setPosition(p.x, p.y).setRotation(ang + Math.PI / 2).setScale(s);
    // whatever the hand holds goes in the fist, wherever the eased glove is now
    const props = this.puppet?.props;
    if (side === 'front' && this.reach && props) this.placeHeld(props, p, ang, target * pop);
  }

  // ───────────────────────── drawing ─────────────────────────

  private setupWarp(): void {
    const beat = this.beat;
    const time = this.time;
    const phase = beat - Math.floor(beat);
    const breath = Math.pow(1 - phase, 2);
    const puff = Math.pow(1 - phase, 3) * 0.12 + this.coughT * 0.9 + this.whistleT * 0.15;
    const wiggle = this.mouth * (this.shouting ? 1.6 : 0.7) + this.laughT * 1.5;
    const lean = this.lean;
    // the puppet's hat is a picture of its own: the stack only stretches when it puffs
    const hat = this.usesPuppet ? 0 : (this.pose.hatLift ?? 0) * this.poseW;
    const cx = this.chim.x;
    const cb = this.chim.base;
    const bb = this.boilerBox;
    const bMid = (bb.yTop + bb.yBot) / 2;
    this.ink.warp = (x: number, y: number) => {
      let nx = x;
      let ny = y;
      // chimney: a top hat that pops up when puffing / coughing, and is tipped by hand
      if (y < cb && x > cx - 80 && x < cx + 80) {
        const k = Math.min(1, (cb - y) / 40);
        ny = cb + (y - cb) * (1 + puff * k) - hat * 46 * k;
        nx = cx + (x - cx) * (1 - puff * 0.35 * k) + hat * 10 * k;
      }
      // the boiler breathes on the beat (bulges around its centre line)
      if (y < bb.yBot && y > bb.yTop && x < bb.x1) {
        const along = Math.sin(Math.PI * Phaser.Math.Clamp((x - bb.x0) / (bb.x1 - bb.x0), 0, 1));
        ny = bMid + (ny - bMid) * (1 + breath * 0.05 * along);
      }
      // rubber ripple running along the body while singing / laughing
      const h = Phaser.Math.Clamp((-ny - 90) / 300, 0, 1);
      ny += Math.sin(x / 85 + time * 11) * wiggle * 5 * h;
      // lean: shear proportional to height (wheels stay on the rails)
      nx += lean * -ny * 0.13;
      return { x: nx, y: ny };
    };
  }

  private paint(): void {
    const k = this.ink;
    const g = this.gfx;
    g.clear();
    this.setupWarp();
    const beat = this.beat;
    const time = this.time;
    const phase = beat - Math.floor(beat);

    // ── speed lines behind a smeared charge
    if (this.smear > 0.15) {
      for (let i = 0; i < 5; i++) {
        const y = -380 + i * 70 + Math.sin(time * 30 + i) * 6;
        const len = 120 + this.smear * 160 + (i % 2) * 40;
        k.line(-640 - len, y, -630, y, 4 + (i % 2) * 2, 0x8a8478);
      }
    }

    // ── back arm (behind everything)
    this.paintArm(false);

    // ── running board & frame
    k.rrect(-600, -128, 560, 26, 6, IRON, 4);

    // ── wheels + rods
    const wheels = [-210, -350, -490];
    const pins = wheels.map((wx) => ({
      x: wx + Math.cos(this.wheelAngle) * 30,
      y: -62 + Math.sin(this.wheelAngle) * 30,
    }));
    for (const wx of wheels) this.wheel(wx, -62, 58);
    this.wheel(-95, -34, 32, 6);
    k.line(pins[0].x, pins[0].y, pins[2].x, pins[2].y, 9, 0x9a9a9a);
    // piston: crosshead slides with the wheel, rod bends a little (rubber hose!)
    const cross = -150 + Math.cos(this.wheelAngle) * 22;
    k.rrect(-176, -114, 76, 42, 8, BOILER_HI, 4);
    k.hose(cross, -93, (cross + pins[0].x) / 2, (-93 + pins[0].y) / 2 - 10, pins[0].x, pins[0].y, 7, 0xb0b0b0, 2);
    for (const p of pins) k.circle(p.x, p.y, 6, PAPER, 3);
    // steam jets from the cylinder twice per wheel turn
    const jet = Math.pow(Math.max(0, Math.sin(this.wheelAngle * 2)), 6);
    if (jet > 0.25) {
      k.cloud(-92 + jet * 18, -86, 10 + jet * 14);
      k.cloud(-70 + jet * 34, -78, 6 + jet * 10);
    }
    // sparks when charging
    if (this.charge > 0.4 || this.lunge > 60) {
      for (let i = 0; i < 6; i++) {
        const wx = wheels[i % 3] + (Math.random() - 0.5) * 30;
        const len = 18 + Math.random() * 26;
        const a = Math.PI + 0.3 + Math.random() * 0.5;
        k.line(wx, -4, wx + Math.cos(a) * len, -4 + Math.sin(a) * len, 3, PAPER);
      }
    }

    // ── boiler
    k.rrect(-620, -300, 580, 180, 70, BOILER, 5);
    k.rrect(-590, -286, 520, 20, 10, BOILER_HI, 0);
    for (const bx of [-230, -380, -530]) {
      k.rrect(bx - 8, -300, 16, 180, 4, 0x3d3d3d, 3);
      for (let y = -282; y < -130; y += 26) k.circle(bx, y, 2.6, PAPER, 0);
    }

    // ── steam dome
    k.ellipse(-360, -300, 40, 30, BOILER_HI, 4);

    // ── bell, just behind the chimney (swings on every beat)
    const swing = Math.sin(beat * Math.PI) * 0.5;
    const bp = { x: -232, y: -352 };
    const rot = (x: number, y: number): { x: number; y: number } => {
      const c = Math.cos(swing);
      const s = Math.sin(swing);
      return { x: bp.x + x * c - y * s, y: bp.y + x * s + y * c };
    };
    k.rrect(-244, -356, 24, 58, 4, IRON, 3); // yoke
    k.poly([rot(-8, 0), rot(8, 0), rot(16, 26), rot(24, 34), rot(-24, 34), rot(-16, 26)], BRASS, 4);
    const clap = rot(0, 38);
    k.circle(clap.x, clap.y, 5, IRON, 2);

    // ── steam whistle between chimney and face: stretches and shrieks on TOOT!
    const wh = this.whistleT > 0 ? 1 + this.whistleT * 1.2 : 1;
    k.rrect(-132, -330 - 26 * (wh - 1), 22, 34 * wh, 6, BRASS, 3);
    k.rrect(-136, -334 - 26 * (wh - 1), 30, 8, 3, BRASS, 3);

    // ── front arm (drawn over the face instead when a performance needs the hand up there)
    const frontOnTop = !!this.pose.front && !this.pose.front.under && this.poseW > 0.3 && this.arm === 'idle' && this.laughT <= 0.05 && this.accentT === 0;
    if (!frontOnTop) this.paintArm(true);

    // ── smokestack (a top hat!) – warp stretches it
    k.poly([{ x: -200, y: -300 }, { x: -140, y: -300 }, { x: -118, y: -420 }, { x: -222, y: -420 }], IRON, 5);
    k.rrect(-238, -444, 136, 26, 8, IRON, 5);
    k.rrect(-212, -406, 84, 10, 2, 0x5a5a5a, 0);

    // ── smokebox face
    const fx = -60;
    const fy = -210;
    k.circle(fx, fy, 104, this.villain ? 0xa69e8e : FACE, 5);
    if (this.villain) {
      // a grimy face: soot smudges
      for (const [sx, sy, r] of [[-130, -150, 18], [10, -268, 14], [-20, -128, 11], [-118, -276, 9]] as const) k.ellipse(sx, sy, r * 1.4, r, 0x8a8273, 0);
    }
    k.circle(fx, fy, 90, null, 3);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      k.circle(fx + Math.cos(a) * 97, fy + Math.sin(a) * 97, 2.2, INK, 0);
    }

    // headlamp (flickers brighter on the beat)
    k.rrect(fx - 26, -350, 52, 38, 6, BOILER_HI, 4);
    k.circle(fx, -331, 14, Math.pow(1 - phase, 3) > 0.5 ? 0xffffff : 0xfffff0, 3);

    this.paintFace(fx, fy, time);

    // ── cowcatcher (a toothy beard that chatters when nervous)
    const chatter = this.nervous > 0.5 ? Math.sin(time * 60) * 3 : 0;
    k.poly([{ x: -150, y: -112 }, { x: -20, y: -112 }, { x: 46 + chatter, y: -6 }, { x: -150, y: -6 }], 0x8a8a8a, 5);
    for (let x = -130; x < 30; x += 20) {
      const topX = Math.min(x, -20);
      k.line(topX, -110, x + 10 + chatter, -8, 4);
    }

    if (frontOnTop) this.paintArm(true);

    // whistle steam on top of everything
    if (this.whistleT > 0) {
      const s = this.whistleT / 0.6;
      const top = -350 - 26 * (wh - 1);
      for (const dx of [-30, 0, 30]) k.line(-121 + dx * 0.4, top, -121 + dx * 1.8, top - 50 - (1 - s) * 30, 4, PAPER);
      k.cloud(-110, top - 40 - (1 - s) * 60, 20 + (1 - s) * 26);
    }

    this.ink.warp = null;
  }

  private paintFace(fx: number, fy: number, time: number): void {
    // the face is a head of its own on the boiler front: it turns, tilts and nods
    const bodyWarp = this.ink.warp;
    this.ink.warp = faceWarp(this.act, fx, fy, 100, bodyWarp);
    this.paintFeatures(fx, fy, time);
    this.ink.warp = bodyWarp;
  }

  private paintFeatures(fx: number, fy: number, time: number, puppet = false): void {
    const k = this.ink;
    const act = this.act;
    const pose = this.poseW > 0.5 ? this.pose : ({} as ActPose);
    const red = this.charge > 0.3 || !!pose.red;
    const laughing = this.laughT > 0.05;
    const eyeY = fy - 30 - this.nervous * 4;

    // eyes follow Tick
    const lx = Phaser.Math.Clamp((this.lookTarget.x - (this.screenX + fx)) / 260 + act.turn * 0.5, -1, 1);
    const ly = Phaser.Math.Clamp((this.lookTarget.y - (this.groundY + eyeY)) / 260, -1, 1);
    const vil = this.villain;
    // friendly (in the Bijou) the same performances read warm: squints become smiles
    const eyesMode = !vil && pose.eyes === 'squint' ? 'closed' : pose.eyes;
    const glow = vil && this.dark > 0.4;
    // expressions glide instead of snapping (time-based, so it works on twos and at 60 fps)
    const fdt = Phaser.Math.Clamp(time - this.featT, 0, 0.1);
    this.featT = time;
    const glide = (cur: number, target: number, rate: number) => cur + (target - cur) * Math.min(1, fdt * rate);
    const bigTarget = 1 + this.nervous * 0.2 + this.charge * 0.1 + (this.accentT > 0 ? 0.22 : 0) + act.brow * 0.06 + (eyesMode === 'pop' ? 0.4 : eyesMode === 'wide' ? 0.15 : 0);
    this.bigS = glide(this.bigS, bigTarget, 18);
    const lidTarget = eyesMode === 'squint' || (vil && laughing) ? 1 : vil && !eyesMode && this.accentT === 0 && !glow ? 0.55 : 0;
    this.lidS = glide(this.lidS, lidTarget, 14);
    for (const ex of [fx - 36, fx + 30]) {
      const shut = eyesMode === 'closed' || (eyesMode === 'wink' && ex < fx);
      if ((laughing && !vil) || shut) {
        // eyes shut: happy ^ ^ when friendly, a smug flat lid when villainous
        if (vil) k.hose(ex - 20, eyeY - 2, ex, eyeY + 8, ex + 20, eyeY - 2, 7);
        else k.hose(ex - 20, eyeY + 8, ex, eyeY - 22, ex + 20, eyeY + 8, 7);
        continue;
      }
      const big = this.bigS;
      if (vil) k.ellipse(ex, eyeY + 2, 31 * big, 41 * big, 0x6e685c, 0); // sunken sockets
      const white = glow ? 0x141414 : red ? 0xe8b0a0 : vil ? 0xe2dccb : PAPER;
      k.ellipse(ex, eyeY, 25 * big, 34 * big, white, 4);
      const pupilScale = (this.nervous > 0.5 ? 0.6 : 1) * (vil ? 0.78 : 1) * (eyesMode === 'wide' ? 0.72 : 1);
      if (glow) {
        // in the dark: only two burning pinpricks
        k.ellipse(ex + lx * 8, eyeY + ly * 10, 7 * pupilScale + 2, 11 * pupilScale + 2, 0xfff2b0, 0);
      } else {
        k.pieEye(ex + lx * 8, eyeY + ly * 10, 10 * pupilScale, 16 * pupilScale, lx, ly, act.blinking && !laughing, white);
      }
      // lids slide down: none → villain's half-lid → heavy squint
      const L = this.lidS;
      if (L > 0.04) {
        const edge = eyeY - 30 * big + L * (30 * big - 8);
        k.hose(ex - 26 * big, edge, ex, edge - 10 - (1 - L) * 4, ex + 26 * big, edge, 6 + L * 3, INK);
      }
    }

    // brows: angry (inner ends down) ↔ worried (inner ends up)
    const baseAnger = vil ? Math.max(this.anger, 0.7) : this.anger;
    let mood = laughing ? (vil ? 0.9 : 0.2) : Phaser.Math.Clamp(baseAnger + this.charge * 0.6 - this.nervous * 1.6, -1, 1);
    if (pose.mood !== undefined) mood = pose.mood;
    this.moodS = glide(this.moodS, mood, 12);
    mood = this.moodS;
    this.raiseS = glide(this.raiseS, Math.max(act.brow, pose.raise ?? 0), 16);
    const raise = this.raiseS;
    for (const [ex, side] of [[fx - 36, -1], [fx + 30, 1]] as const) {
      const by = eyeY - 46 - this.nervous * 10 - (laughing ? 6 : 0) - raise * 14;
      const outerX = ex + side * 28;
      const innerX = ex - side * 26;
      k.hose(outerX, by - mood * 8, ex, by - 12, innerX, by + mood * 14, 10);
    }

    // sweat drops when nervous
    if (this.nervous > 0.4) {
      const drip = (time * 1.5) % 1;
      k.poly([{ x: fx + 82, y: eyeY - 34 + drip * 30 }, { x: fx + 92, y: eyeY - 8 + drip * 30 }, { x: fx + 72, y: eyeY - 8 + drip * 30 }], 0xe0f0ff, 3);
      if (this.nervous > 0.8) k.poly([{ x: fx - 96, y: eyeY - 20 }, { x: fx - 88, y: eyeY + 2 }, { x: fx - 104, y: eyeY + 2 }], 0xe0f0ff, 3);
    }

    // mouth: wide/round shapes per syllable, huge "O" when shouting, cackle when laughing
    const mo = laughing ? 0.7 + Math.sin(time * 40) * 0.3 : Math.max(this.mouth, 0.08);
    const my = fy + 46;
    const v: Viseme = laughing || this.shouting ? 'wide' : this.mouth < 0.12 ? 'rest' : this.viseme;
    // [width, open height, teeth top, teeth bottom] for each mouth shape
    const shapes: Record<Viseme, [number, number, boolean, boolean]> = {
      rest: [34, 0, false, false],
      closed: [36, 0, false, false],
      teeth: [34, 10, true, false],
      open: [32, 14, true, false],
      wide: [46, 28, true, false],
      mid: [44, 16, true, true],
      round: [26, 26, false, false],
      small: [17, 13, false, false],
    };
    let [w, oh, tTop, tBot] = shapes[v];
    if (this.shouting) [w, oh, tTop, tBot] = [32, 40, true, true];
    // the shape melts from syllable to syllable (see update)
    w = this.mw;
    oh = oh === 0 && this.moh < 1.5 ? 0 : Math.max(this.moh, 0.01);
    let silentFace = this.mouth < 0.15 && !this.shouting && !laughing ? pose.mouth : undefined;
    if (!vil && (silentFace === 'smirk' || silentFace === 'cackle')) silentFace = 'grin';
    const fangs = (x1: number, x2: number, y: number, dir: 1 | -1, n: number): void => {
      const step = (x2 - x1) / n;
      for (let i = 0; i < n; i++) {
        const a = x1 + i * step;
        k.poly([{ x: a, y }, { x: a + step, y }, { x: a + step / 2, y: y + dir * 11 }], PAPER, 2);
      }
    };
    if (vil && (laughing || silentFace === 'cackle')) {
      // a cackle: mouth thrown open, pointed teeth top and bottom
      const open = 26 + Math.sin(time * 38) * 6;
      k.ellipse(fx - 2, my + 14, 42, open, 0x2a0a0a, 4);
      fangs(fx - 34, fx + 30, my + 14 - open * 0.75, 1, 6);
      fangs(fx - 26, fx + 22, my + 14 + open * 0.75, -1, 4);
    } else if (vil && silentFace === 'grin') {
      // a wicked grin full of pointed teeth
      k.hose(fx - 46, my - 10, fx - 2, my + 22, fx + 46, my - 10, 9, 0x2a0a0a);
      k.ellipse(fx - 2, my + 4, 38, 12, 0x2a0a0a, 0);
      fangs(fx - 34, fx + 30, my - 6, 1, 7);
    } else if (vil && (silentFace === 'smirk' || (!silentFace && this.mouth < 0.12 && !this.shouting && !laughing))) {
      // the resting sneer: one corner up, a fang peeking out
      k.hose(fx - 40, my + 10, fx - 4, my + 6, fx + 40, my - 8, 8, 0x2a0a0a);
      k.poly([{ x: fx + 18, y: my - 1 }, { x: fx + 28, y: my - 4 }, { x: fx + 24, y: my + 9 }], PAPER, 2);
    } else if (silentFace === 'grin' || silentFace === 'smirk') {
      // a cocky grin (or a lopsided smirk), teeth showing
      const lop = silentFace === 'smirk' ? 10 : 0;
      k.hose(fx - 44, my - 4 - lop, fx - 2, my + 18, fx + 44, my - 10 + lop * 0.4, 9, 0x2a0a0a);
      if (silentFace === 'grin') k.rrect(fx - 30, my - 2, 60, 9, 3, PAPER, 0);
    } else if (silentFace === 'o' || silentFace === 'yawn') {
      const big = silentFace === 'yawn';
      k.ellipse(fx - 2, my + (big ? 18 : 8), big ? 34 : 16, big ? 40 : 16, 0x2a0a0a, 4);
      if (big) k.ellipse(fx - 2, my + 40, 18, 10, 0x9a3a3a, 0);
    } else if (silentFace === 'wobble') {
      // trembling lip: a mock sob
      const pts = [];
      for (let i = 0; i <= 8; i++) pts.push({ x: fx - 34 + i * 8.5, y: my + 8 + Math.sin(i * 1.7 + time * 30) * 4 });
      for (let i = 1; i < pts.length; i++) k.line(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, 5, 0x2a0a0a);
    } else if (oh === 0) {
      // lips pressed together (M, B, P) or the resting smirk
      k.hose(fx - w, my + 2, fx - 2, my + (v === 'closed' ? 6 : 10), fx + w, my + 2, v === 'closed' ? 9 : 6, 0x2a0a0a);
    } else {
      const h = 6 + mo * oh;
      k.ellipse(fx - 2, my + h * 0.4, w, h, 0x2a0a0a, 4);
      if (h > 14) k.ellipse(fx - 2, my + h * 0.9, w * 0.55, h * 0.3, 0x9a3a3a, 0); // tongue
      if (tTop) k.rrect(fx - w * 0.7, my - 4, w * 1.4, 8, 2, PAPER, 0);
      if (tBot || laughing) k.rrect(fx - w * 0.6, my + h * 1.2 - 6, w * 1.2, 7, 2, PAPER, 0);
      if (v === 'teeth') k.rrect(fx - w * 0.8, my + 6, w * 1.6, 9, 3, 0x6a2a2a, 0); // lower lip under the teeth (F, V)
      if (v === 'small' || v === 'round') k.ellipse(fx - 2, my + h * 0.4, w + 6, h + 6, null, 5); // pursed lips
    }

    // walrus moustache: flaps with the voice, flies up when shouting
    const wig = Math.sin(time * 9) * 3 * this.mouth + (this.shouting ? -8 : 0);
    for (const side of puppet ? [] : [-1, 1]) {
      const sx = fx - 2;
      k.poly(
        [
          { x: sx, y: fy + 8 },
          { x: sx + side * 30, y: fy + 4 + wig },
          { x: sx + side * 70, y: fy + 20 + wig },
          { x: sx + side * 96, y: fy + 6 + wig * 1.6 },
          { x: sx + side * 92, y: fy + 30 + wig },
          { x: sx + side * 60, y: fy + 42 + wig },
          { x: sx + side * 20, y: fy + 34 },
          { x: sx, y: fy + 30 },
        ],
        INK,
        3,
      );
    }
    // nose rivet
    k.circle(fx - 2, fy + 2, 12, BOILER_HI, 4);

    // props that live on the face
    if (pose.tears) {
      for (const [ex, ph] of [[fx - 36, 0], [fx + 30, 0.5]] as const) {
        const d = ((time * 1.6 + ph) % 1) * 70;
        k.poly([{ x: ex, y: eyeY + 20 + d }, { x: ex + 7, y: eyeY + 34 + d }, { x: ex - 7, y: eyeY + 34 + d }], 0xd8ecff, 2);
      }
    }
    if (pose.earSteam) {
      for (const side of [-1, 1]) {
        const puff = (time * 3) % 1;
        k.cloud(fx + side * (112 + puff * 40), fy - 40 - puff * 50, 14 + puff * 14);
      }
    }
    if (pose.soot) k.cloud(fx + 60, fy + 70, 46, 0x2a2a2a);
  }

  private wheel(cx: number, cy: number, r: number, spokes = 10): void {
    const k = this.ink;
    k.circle(cx, cy, r, IRON, 5);
    k.circle(cx, cy, r - 8, null, 3);
    for (let i = 0; i < spokes; i++) {
      const a = this.wheelAngle + (i / spokes) * Math.PI * 2;
      k.line(cx, cy, cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8), 3, 0x8a8a8a);
    }
    // counterweight crescent
    const a = this.wheelAngle + Math.PI;
    k.ellipse(cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45, r * 0.32, r * 0.18, 0x3a3a3a, 0, a);
    k.circle(cx, cy, r * 0.25, 0x9a9a9a, 3);
  }

  /**
   * The puppet's timetable: unfolds when it comes out and folds when it goes away,
   * held by one edge (the glove covers it), flutters in the wind and curls at the top.
   */
  private paintTimetable(hx: number, hy: number, r: number): void {
    const k = this.ink;
    const t = this.perf ? (this.time - this.perf.start) / this.perf.dur : 1;
    const easeOutBack = (x: number) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);
    const open = t < 0.18 ? easeOutBack(Math.min(1, t / 0.18)) : t > 0.84 ? Math.max(0, (1 - t) / 0.16) : 1;
    if (open <= 0.02) return;
    const w = r * 0.95 * open;
    const h = r * 1.2;
    const flutter = Math.sin(this.time * 3.1) * 0.05 + Math.sin(this.time * 7.3) * 0.015;
    const c = Math.cos(flutter);
    const sn = Math.sin(flutter);
    // the paper hangs from the hand towards the left, rotated by the flutter around the grip
    const P = (x: number, y: number) => ({ x: hx + x * c - y * sn, y: hy + x * sn + y * c });
    const top = -h * 0.75;
    const bot = h * 0.25;
    const curl = 6 + Math.sin(this.time * 4) * 3;
    const pts = [P(8, top), P(-w * 0.5, top - curl), P(-w, top + 2), P(-w + 3, bot), P(-w * 0.5, bot + 4), P(8, bot)];
    k.poly(pts, 0xe8e1d0, 3);
    // a fold line down the middle, a header and the rows of times
    if (open > 0.6) {
      const a = P(-w * 0.5, top - curl + 4);
      const b = P(-w * 0.5, bot);
      k.line(a.x, a.y, b.x, b.y, 1.5, 0xb8b0a0);
      const hd1 = P(-w + 8, top + 10);
      const hd2 = P(-6, top + 8);
      k.line(hd1.x, hd1.y, hd2.x, hd2.y, 5, 0x3a3630);
      for (let row = 0; row < 6; row++) {
        const y = top + 24 + row * ((bot - top - 30) / 6);
        const l1 = P(-w + 8, y);
        const l2 = P(-w * 0.55, y);
        const l3 = P(-w * 0.42, y);
        const l4 = P(-8, y);
        k.line(l1.x, l1.y, l2.x, l2.y, 2, 0x5a5650);
        k.line(l3.x, l3.y, l4.x, l4.y, 2, 0x5a5650);
      }
    }
  }

  /** What the long arm holds: the ticket being punched, or the giant ticket punch. */
  private paintReachProp(hx: number, hy: number, angle: number): void {
    const k = this.ink;
    const R = this.reach!;
    const art = this.usesPuppet ? this.puppet?.props : undefined;
    if (art && this.hasArtProp(art)) return; // placed in the fist by placeGlove
    if (R.prop === 'ticket') {
      // the ticket hangs from the glove's fingertips, its holes punched by Tick's head
      const holes = R.holes ?? [];
      const w = 40 + holes.length * 34;
      const h = 58;
      const x0 = hx - w * 0.5;
      const y0 = hy + 14;
      k.poly([{ x: x0, y: y0 }, { x: x0 + w, y: y0 - 4 }, { x: x0 + w + 2, y: y0 + h - 4 }, { x: x0 + 2, y: y0 + h }], 0xe9dfc8, 4);
      k.poly([{ x: x0 + 6, y: y0 + 6 }, { x: x0 + w - 6, y: y0 + 3 }, { x: x0 + w - 6, y: y0 + 14 }, { x: x0 + 6, y: y0 + 17 }], 0x3a3630, 0);
      holes.forEach((punched, i) => {
        const cx = x0 + 30 + i * 34;
        const cy = y0 + 36;
        if (punched) k.circle(cx, cy, 9, INK, 0);
        else k.circle(cx, cy, 9, null, 2);
      });
      return;
    }
    if (R.prop === 'key') {
      // a giant winding key, turning backwards in the glove
      const a0 = R.turn ?? 0;
      const c = Math.cos(a0);
      const sn = Math.sin(a0);
      const P = (x: number, y: number) => ({ x: hx + x * c - y * sn, y: hy + 30 + x * sn + y * c });
      const shaftA = P(0, -10);
      const shaftB = P(0, 60);
      k.line(shaftA.x, shaftA.y, shaftB.x, shaftB.y, 14, INK);
      k.line(shaftA.x, shaftA.y, shaftB.x, shaftB.y, 8, 0xc9a24a);
      for (const side of [-1, 1]) {
        const q = P(side * 26, -22);
        k.ellipse(q.x, q.y, 24, 16, 0xc9a24a, 4, a0);
        const h = P(side * 26, -22);
        k.ellipse(h.x, h.y, 9, 6, 0x5a4a2a, 0, a0);
      }
      return;
    }
    // the punch: two long handles in the fist, round jaws below biting down
    const open = R.closed ? 0 : 1;
    const c = Math.cos(angle - Math.PI / 2);
    const sn = Math.sin(angle - Math.PI / 2);
    const P = (x: number, y: number) => ({ x: hx + x * c - y * sn, y: hy + x * sn + y * c });
    const a = P(-14 - open * 10, 8);
    const b = P(14 + open * 10, 8);
    const j1 = P(-16, 70);
    const j2 = P(16, 70);
    k.line(a.x, a.y, j1.x, j1.y, 14, INK);
    k.line(b.x, b.y, j2.x, j2.y, 14, INK);
    k.line(a.x, a.y, j1.x, j1.y, 8, 0x5a5a5a);
    k.line(b.x, b.y, j2.x, j2.y, 8, 0x5a5a5a);
    const jaw = P(0, 78);
    k.rrect(jaw.x - 26, jaw.y - 10, 52, 22, 6, 0x5a5a5a, 4);
    k.circle(jaw.x, jaw.y, 8, R.closed ? INK : 0x2a2a2a, 3);
  }

  /** Is there a hand-drawn picture of what the long reach holds now? */
  private hasArtProp(art: Puppet['props']): boolean {
    const R = this.reach!;
    if (R.prop === 'ticket') return !!art.ticket;
    if (R.prop === 'key') return !!art.windKey;
    return !!art.punchOpen && !!art.punchClosed;
  }

  /**
   * The hand-drawn ticket / punch / key gripped in the fist. `p` is where the glove is (its
   * wrist), `ang` the way its fingers point, `gh` its height: the middle of the fist is a third
   * of the way up the glove. Everything here is in the puppet's own coordinates, already warped.
   */
  private placeHeld(art: Puppet['props'], p: { x: number; y: number }, ang: number, gh: number): void {
    const k = this.ink;
    const R = this.reach!;
    const fx = p.x + Math.cos(ang) * gh * 0.34;
    const fy = p.y + Math.sin(ang) * gh * 0.34;
    if (R.prop === 'ticket' && art.ticket) {
      // the fist pinches the top edge; the ticket hangs below it, swinging a little
      const holes = R.holes ?? [];
      const w = 40 + holes.length * 34;
      const img = art.ticket;
      const s = w / img.width;
      const h = img.height * s;
      const rot = Math.sin(this.time * 2.6) * 0.05;
      img.setVisible(true).setOrigin(0.5, 0.08).setPosition(fx, fy).setScale(s).setRotation(rot);
      const warp = k.warp;
      k.warp = null;
      holes.forEach((punched, i) => {
        const lx = -w / 2 + (w * (i + 0.5)) / Math.max(1, holes.length);
        const ly = h * 0.46;
        const cx = fx + lx * Math.cos(rot) - ly * Math.sin(rot);
        const cy = fy + lx * Math.sin(rot) + ly * Math.cos(rot);
        if (punched) k.circle(cx, cy, 9, INK, 0);
        else k.circle(cx, cy, 9, null, 2);
      });
      k.warp = warp;
      return;
    }
    if (R.prop === 'key' && art.windKey) {
      // the bow gripped in the fist (its loops stick out either side), the shaft pointing down
      // at Tick's crown; turning, the bow is seen flat, then edge-on
      const img = art.windKey;
      const info = pieceInfo('windKey');
      const [px, py] = info?.anchors.pivot ?? [img.width * 0.2, img.height / 2];
      const [tx] = info?.anchors.tip ?? [img.width, 0];
      const s = 100 / (tx - px);
      const turn = R.turn ?? 0;
      img.setVisible(true).setOrigin(px / img.width, py / img.height).setPosition(fx, fy);
      img.setRotation(Math.PI / 2).setScale(s, s * Math.max(0.12, Math.abs(Math.cos(turn))));
      return;
    }
    if (R.prop === 'punch' && art.punchOpen && art.punchClosed) {
      // the handles go through the fist (their ends stick out behind it), the jaws point down
      // at the rails they are about to bite
      const name = R.closed ? 'punchClosed' : 'punchOpen';
      const img = art[name]!;
      art[R.closed ? 'punchOpen' : 'punchClosed']!.setVisible(false);
      const info = pieceInfo(name);
      const [gx, gy] = info?.anchors.grip ?? [img.width * 0.92, img.height / 2];
      const [jx, jy] = info?.anchors.jaw ?? [0, img.height / 2];
      const hx = jx + (gx - jx) * 0.74;
      const hy = jy + (gy - jy) * 0.74;
      const s = 110 / Math.hypot(gx - jx, gy - jy);
      const drawn = Math.atan2(jy - gy, jx - gx); // the way the jaws point in the picture
      const aim = Math.PI / 2 - 0.25; // down, a touch forwards
      img.setVisible(true).setOrigin(hx / img.width, hy / img.height).setPosition(fx, fy).setScale(s).setRotation(aim - drawn);
    }
  }

  private paintArm(front: boolean): Hand {
    const k = this.ink;
    const time = this.time;
    const beat = this.beat;
    const geo = this.usesPuppet ? this.geo : null;
    const sh = geo?.shoulders[front ? 0 : 1];
    const shX = sh ? sh.x : front ? -270 : -440;
    const shY = sh ? sh.y : front ? -190 : -210;
    let hx: number;
    let hy: number;
    let fist = false;
    const laughing = this.laughT > 0.05;
    if (laughing) {
      // slapping the boiler with laughter
      hx = front ? -200 : -470;
      hy = -160 + Math.sin(time * 40) * 12;
    } else if (front) {
      switch (this.arm) {
        case 'point':
          hx = -150 + Math.sin(time * 10) * 6;
          hy = -470;
          break;
        case 'fist':
          hx = 30 + Math.sin(beat * Math.PI * 2) * 22;
          hy = -330;
          fist = true;
          break;
        case 'wave':
          hx = -60 + Math.sin(time * 14) * 30;
          hy = -420;
          break;
        default: {
          // conducts the band: a little flourish on every beat while singing
          const ph = beat - Math.floor(beat);
          const sing = this.mouth > 0.2 ? 1 : 0.4;
          if (this.usesPuppet) {
            // the puppet rests its hand low on the boiler and only lifts it to sing
            hx = -190 + Math.sin(beat * Math.PI) * 26 * sing;
            hy = -150 - sing * 90 - Math.pow(1 - ph, 2) * 24 * sing;
          } else {
            hx = -230 + Math.sin(beat * Math.PI) * 30 * sing;
            hy = -360 - Math.pow(1 - ph, 2) * 30 * sing;
          }
        }
      }
    } else {
      switch (this.arm) {
        case 'fist':
          hx = -360;
          hy = -380 + Math.sin(beat * Math.PI * 2 + 1) * 16;
          fist = true;
          break;
        case 'wave':
          // hand on its head: "uh-oh"
          hx = -330;
          hy = -330;
          break;
        case 'point':
          hx = -410;
          hy = -420;
          break;
        default:
          // hand on hip
          hx = -470;
          hy = -150;
          fist = true;
      }
    }
    if (this.accentT > 0 && !laughing) {
      // accent pose: both arms flung up and out ("ta-da!")
      hx = front ? -120 : -480;
      hy = front ? -540 : -500;
      fist = false;
    }
    // a performance from the repertoire (hazard gestures like pointing win over it)
    const ap = front ? this.pose.front : this.pose.back;
    let finger = false;
    let fingers = 0;
    if (ap && this.poseW > 0 && this.arm === 'idle' && !laughing && this.accentT === 0) {
      const w = this.poseW;
      hx += (ap.x - hx) * w;
      hy += (ap.y - hy) * w;
      if (w > 0.5) {
        fist = ap.fist ?? false;
        finger = !!ap.finger;
        fingers = ap.fingers ?? 0;
      }
    }
    if (geo) {
      // the targets were designed around the code face (centre -60,-210, radius 104):
      // move and scale them to the puppet's face, keep them within reach and on screen,
      // then let the hand travel there on a spring (fast, with a little overshoot)
      const f = geo.face;
      const s = f.ry / 104;
      hx = f.x + (hx + 60) * s;
      hy = f.y + (hy + 210) * s;
      const charging = (this.arm === 'fist' || this.charge > 0.3) && !laughing && this.fallY === 0;
      if (front && charging) {
        // the charge: a fist thrust forward under the chin, shaking at Tick
        hx = f.x + f.rx * 1.75 + Math.sin(time * 34) * 5 * this.charge;
        hy = f.y + f.ry * 1.05 + Math.sin(time * 27) * 4 * this.charge;
        fist = true;
      }
      if (front && this.pose.timetable && this.poseW > 0.3) {
        // the timetable is read held out to the side of the face, at eye level
        hx = f.x - f.rx * 1.55;
        hy = f.y - f.ry * 0.15 + Math.sin(beat * Math.PI) * 3;
      }
      if (!front) {
        // the far arm only shows when its hand comes round in front of the face
        const show = hx > f.x + f.rx * 0.3 && !charging;
        if (!show) return { x: hx, y: hy, angle: 0, fist, finger: false, hidden: true };
      }
      const long = front && this.reach;
      if (long) {
        // the long reach: straight to the event's spot (no arm-length limit: it's rubber!)
        hx = (this.reach!.x - this.screenX) / this.size;
        hy = (this.reach!.y - this.groundY - this.fallY) / this.size;
        fist = true; // gripping the ticket's edge, the punch's handles or the key's bow
      } else {
        const reach = f.ry * 3.3;
        const d = Math.hypot(hx - shX, hy - shY);
        if (d > reach) {
          hx = shX + ((hx - shX) * reach) / d;
          hy = shY + ((hy - shY) * reach) / d;
        }
        hy = Math.max(hy, -(this.groundY - 75) / this.size);
        hx = Math.min(hx, (1240 - this.screenX) / this.size);
      }
      const H = front ? this.hands.front : this.hands.back;
      if (!H.init) Object.assign(H, { x: hx, y: hy, init: true });
      const dt = Math.min(this.dt, 1 / 30);
      H.vx += ((hx - H.x) * 340 - H.vx * 24) * dt;
      H.vy += ((hy - H.y) * 340 - H.vy * 24) * dt;
      H.x += H.vx * dt;
      H.y += H.vy * dt;
      hx = H.x;
      hy = H.y;
    }
    let cx = (shX + hx) / 2 - 40;
    let cy = (shY + hy) / 2 + 30;
    let underHead = false;
    if (geo) {
      // the elbow bends away from the face; an arm that would cross the face goes behind the head
      const f = geo.face;
      const mx = (shX + hx) / 2;
      const my = (shY + hy) / 2;
      let nx = -(hy - shY);
      let ny = hx - shX;
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl;
      ny /= nl;
      if ((mx + nx - f.x) ** 2 + (my + ny - f.y) ** 2 < (mx - nx - f.x) ** 2 + (my - ny - f.y) ** 2) {
        nx = -nx;
        ny = -ny;
      }
      const bend = 22 + Math.min(40, Math.hypot(hx - shX, hy - shY) * 0.12);
      cx = mx + nx * bend;
      cy = my + ny * bend;
      // does the hose pass over the face plate?
      for (let i = 1; i < 8 && front; i++) {
        const t = i / 8;
        const qx = (1 - t) * (1 - t) * shX + 2 * (1 - t) * t * cx + t * t * hx;
        const qy = (1 - t) * (1 - t) * shY + 2 * (1 - t) * t * cy + t * t * hy;
        if (((qx - f.x) / (f.rx * 1.05)) ** 2 + ((qy - f.y) / (f.ry * 1.05)) ** 2 < 1) underHead = true;
      }
    }
    const armG = k.g;
    if (underHead && this.puppet) k.g = this.puppet.gUnder;
    if (front && !geo) {
      // smear: a fast swing leaves a streak from where the hand was one drawing ago
      const p = this.prevHand;
      if (p && Math.hypot(hx - p.x, hy - p.y) > 60) {
        k.hose(p.x, p.y, (p.x + hx) / 2 + 20, (p.y + hy) / 2 - 20, hx, hy, 22, 0x6a665e);
      }
      this.prevHand = { x: hx, y: hy };
    }
    k.hose(shX, shY, cx, cy, hx, hy, geo ? (front ? 17 : 15) : front ? 14 : 12, front ? INK : 0x262626);
    const angle = Math.atan2(hy - cy, hx - cx);
    k.g = armG;
    // holding something out on the long reach, the hand is a fist round it (never pointing)
    const holding = front && !!this.reach;
    const hand: Hand = { x: hx, y: hy, angle, fist: fist || holding, finger: !holding && (finger || fingers > 0 || (front && this.arm === 'point')) };
    if (!geo) k.glove(hx, hy, front ? 20 : 17, angle, fist);
    // raised fingers: one to point, shush or wag; several to count
    for (let f = 0; !geo && f < Math.max(finger ? 1 : 0, fingers); f++) {
      const a = -Math.PI / 2 + (f - (Math.max(1, fingers) - 1) / 2) * 0.32;
      k.hose(hx, hy - 6, hx + Math.cos(a) * 14, hy - 6 + Math.sin(a) * 14, hx + Math.cos(a) * 28, hy - 6 + Math.sin(a) * 28, 7, PAPER, 2);
    }
    if (front && this.reach) this.paintReachProp(hx, hy, angle);
    if (front && this.poseW > 0.3 && geo && !this.reach) {
      if (this.pose.hanky) {
        // a hanky hanging from the glove, swaying
        const sw = Math.sin(time * 5) * 5;
        const r = geo.face.ry;
        k.poly([{ x: hx - r * 0.12, y: hy - r * 0.08 }, { x: hx + r * 0.32, y: hy }, { x: hx + r * 0.2 + sw, y: hy + r * 0.55 }, { x: hx - r * 0.18 + sw * 0.7, y: hy + r * 0.4 }], PAPER, 3);
      }
      if (this.pose.timetable) this.paintTimetable(hx, hy, geo.face.ry);
    } else if (front && this.poseW > 0.3 && !geo) {
      if (this.pose.hanky) {
        // a hanky for crocodile tears
        k.poly([{ x: hx - 8, y: hy - 6 }, { x: hx + 26, y: hy + 4 }, { x: hx + 12, y: hy + 44 }, { x: hx - 14, y: hy + 30 }], PAPER, 3);
      }
      if (this.pose.timetable) {
        // the timetable, held up to read
        k.rrect(hx - 4, hy - 70, 70, 86, 3, 0xe8e1d0, 3);
        for (let r = 0; r < 5; r++) k.line(hx + 6, hy - 56 + r * 14, hx + 56, hy - 56 + r * 14, 2, 0x5a5650);
      }
    }
    return hand;
  }

  destroy(): void {
    this.gfx.destroy();
    this.puppet?.box.destroy();
  }
}
