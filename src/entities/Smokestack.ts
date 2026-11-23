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
import { ACTS, type ActName, type ActPose } from './SmokestackActs';
import { INK, Ink, PAPER } from '../rig/Ink';

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
  gMid: Phaser.GameObjects.Graphics;
  gFront: Phaser.GameObjects.Graphics;
  rest: { v: Phaser.Geom.Mesh.Vertex; x: number; y: number }[];
  wheels: Phaser.GameObjects.Image[];
  mustache: Phaser.GameObjects.Image;
  hat: Phaser.GameObjects.Image;
  gloveF: Phaser.GameObjects.Image;
  gloveB: Phaser.GameObjects.Image;
}

interface Hand {
  x: number;
  y: number;
  angle: number;
  fist: boolean;
  finger: boolean;
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
    shoulders: A.shoulders.map(([x, y]) => L(x, y)),
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
  /** hands, hat and gloves move on springs: nothing ever jumps */
  private hands = { front: { x: 0, y: 0, vx: 0, vy: 0, init: false }, back: { x: 0, y: 0, vx: 0, vy: 0, init: false } };
  private hatS = { y: 0, vy: 0, r: 0, vr: 0 };
  private gloveType = { front: '', back: '' };
  private glovePop = { front: 0, back: 0 };
  private lastWhole = -1;
  /** where the warp finds the smokestack and the boiler (the code drawing by default) */
  private chim = { x: -170, base: -296 };
  private boilerBox = { x0: -620, x1: -30, yTop: -310, yBot: -100 };

  constructor(private scene: Phaser.Scene) {
    this.gfx = scene.add.graphics();
    this.gfx.setDepth(40);
    this.ink = new Ink(this.gfx);
    this.ink.amp = 1.4;
    this.art = Game.art.smokestack ?? null;
    this.geo = this.art ? puppetGeometry(this.art) : null;
  }

  /** The puppet is the villain; the friendly Smokestack in the Bijou stays drawn by code. */
  get usesPuppet(): boolean {
    return this.geo !== null && this.villain;
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
    const gBack = s.add.graphics();
    const gloveB = s.add.image(0, 0, 'art:smokestack:gloveFist').setOrigin(0.5, 0.82);
    const key = 'art:smokestack:body';
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
    const wheelR = a.parts.wheel.w / 2 - 12;
    const wheels = g.wheels.map((w) => s.add.image(0, 0, 'art:smokestack:wheel').setScale((w.r * 1.05) / wheelR));
    const gMid = s.add.graphics();
    const mustache = s.add.image(0, 0, 'art:smokestack:mustache').setOrigin(0.5, 0.3);
    const hat = s.add.image(0, 0, 'art:smokestack:hat').setOrigin(0.5, 0.9);
    hat.setScale((g.chimney.capW * 1.7) / a.parts.hat.w);
    const gFront = s.add.graphics();
    const gloveF = s.add.image(0, 0, 'art:smokestack:gloveOpen').setOrigin(0.5, 0.82);
    box.add([gBack, gloveB, mesh, ...wheels, gMid, mustache, hat, gFront, gloveF]);
    // the warp finds the smokestack and the boiler of this picture
    this.chim = { x: g.chimney.x, base: g.chimney.base };
    const f = g.face;
    this.boilerBox = { x0: f.x - f.ry * 6, x1: f.x - f.rx * 0.6, yTop: f.y - f.ry * 1.1, yBot: f.y + f.ry * 1.1 };
    return { box, gBack, gMid, gFront, rest, wheels, mustache, hat, gloveF, gloveB };
  }

  /** The puppet, redrawn every frame (60 fps) so every movement is continuous. */
  private updatePuppet(): void {
    if (!this.puppet) this.puppet = this.buildPuppet();
    const P = this.puppet;
    const g = this.geo!;
    this.gfx.setVisible(false);
    P.box.setVisible(this.visible);
    P.box.setPosition(this.gfx.x, this.gfx.y).setRotation(this.gfx.rotation).setScale(this.gfx.scaleX, this.gfx.scaleY);
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
      P.wheels[i].setPosition(p.x, p.y).setRotation(this.wheelAngle * w.spin);
    });
    const k = this.ink;
    const prevG = k.g;
    P.gBack.clear();
    P.gMid.clear();
    P.gFront.clear();
    k.g = P.gBack;
    this.placeGlove(P.gloveB, this.paintArm(false), 'back');
    k.g = P.gMid;
    const big = g.wheels.slice(0, 3);
    if (big.length >= 2) {
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
    this.placeGlove(P.gloveF, this.paintArm(true), 'front');
    k.g = prevG;
    k.amp = 1.4;
    this.ink.warp = null;
  }

  /** The code face, fitted onto the round plate of the picture (it turns, tilts and nods with the acting). */
  private paintPuppetFace(P: Puppet): void {
    const f = this.geo!.face;
    const fs = f.ry / 104;
    const sq = Math.min(1, (f.rx / f.ry) * 1.12);
    const bodyWarp = this.ink.warp;
    const head = faceWarp(this.act, f.x, f.y, f.ry, bodyWarp);
    const toFace = (x: number, y: number) => head(f.x + (x + 60) * fs * sq, f.y + (y + 210) * fs);
    this.ink.warp = toFace;
    this.paintFeatures(-60, -210, this.time, true);
    // the moustache picture: rides on the face, flaps with the voice, flies up when shouting
    const wig = Math.sin(this.time * 9) * 3 * this.mouth + (this.shouting ? -8 : 0) + (this.laughT > 0 ? Math.sin(this.time * 40) * 4 : 0);
    const m = toFace(-62, -192 + wig);
    const width = 200 * fs * (0.55 + 0.45 * sq);
    const flap = 1 + this.mouth * 0.06 * Math.sin(this.time * 18) + (this.shouting ? 0.1 : 0);
    P.mustache.setPosition(m.x, m.y);
    P.mustache.setRotation(this.act.tilt * 1.2 + (this.charge > 0.3 ? -0.05 : 0));
    P.mustache.setScale((width / P.mustache.width) * flap, (width / P.mustache.width) * (2 - flap));
    this.ink.warp = bodyWarp;
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
    P.hat.setPosition(top.x, top.y + H.y).setRotation(H.r);
  }

  /** Put the glove picture at the end of the hose arm, pointing along it. */
  private placeGlove(img: Phaser.GameObjects.Image, h: Hand, side: 'front' | 'back'): void {
    const type = h.finger ? 'glovePoint' : h.fist ? 'gloveFist' : 'gloveOpen';
    if (type !== this.gloveType[side]) {
      this.gloveType[side] = type;
      img.setTexture(`art:smokestack:${type}`);
      this.glovePop[side] = 1;
    }
    this.glovePop[side] = Math.max(0, this.glovePop[side] - this.dt * 6);
    const target = (type === 'glovePoint' ? 84 : type === 'gloveFist' ? 54 : 66) * (side === 'back' ? 0.9 : 1);
    const pop = 1 + Math.sin(this.glovePop[side] * Math.PI) * 0.18;
    const p = this.ink.warp ? this.ink.warp(h.x, h.y) : h;
    img.setPosition(p.x, p.y).setRotation(h.angle + Math.PI / 2).setScale((target / img.height) * pop);
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
    for (const ex of [fx - 36, fx + 30]) {
      const shut = eyesMode === 'closed' || (eyesMode === 'wink' && ex < fx);
      if ((laughing && !vil) || shut) {
        // eyes shut: happy ^ ^ when friendly, a smug flat lid when villainous
        if (vil) k.hose(ex - 20, eyeY - 2, ex, eyeY + 8, ex + 20, eyeY - 2, 7);
        else k.hose(ex - 20, eyeY + 8, ex, eyeY - 22, ex + 20, eyeY + 8, 7);
        continue;
      }
      const big = 1 + this.nervous * 0.2 + this.charge * 0.1 + (this.accentT > 0 ? 0.22 : 0) + act.brow * 0.06 + (eyesMode === 'pop' ? 0.4 : eyesMode === 'wide' ? 0.15 : 0);
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
      // lids: a heavy squint, or (villain) always half-lidded and watchful
      if (eyesMode === 'squint' || (vil && laughing)) k.hose(ex - 26 * big, eyeY - 8, ex, eyeY - 18, ex + 26 * big, eyeY - 8, 9, INK);
      else if (vil && !eyesMode && this.accentT === 0 && !glow) k.hose(ex - 25 * big, eyeY - 15, ex, eyeY - 27 * big, ex + 25 * big, eyeY - 15, 7, INK);
    }

    // brows: angry (inner ends down) ↔ worried (inner ends up)
    const baseAnger = vil ? Math.max(this.anger, 0.7) : this.anger;
    let mood = laughing ? (vil ? 0.9 : 0.2) : Phaser.Math.Clamp(baseAnger + this.charge * 0.6 - this.nervous * 1.6, -1, 1);
    if (pose.mood !== undefined) mood = pose.mood;
    const raise = Math.max(act.brow, pose.raise ?? 0);
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
          hx = -230 + Math.sin(beat * Math.PI) * 30 * sing;
          hy = -360 - Math.pow(1 - ph, 2) * 30 * sing;
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
      // the targets were designed around the code face: move them with the puppet's face,
      // then let the hand travel there on a spring (fast, with a little overshoot)
      hx += geo.face.x + 60;
      hy += geo.face.y + 210;
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
    const cx = (shX + hx) / 2 - 40;
    const cy = (shY + hy) / 2 + 30;
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
    const hand: Hand = { x: hx, y: hy, angle, fist, finger: finger || fingers > 0 || (front && this.arm === 'point') };
    if (!geo) k.glove(hx, hy, front ? 20 : 17, angle, fist);
    // raised fingers: one to point, shush or wag; several to count
    for (let f = 0; !geo && f < Math.max(finger ? 1 : 0, fingers); f++) {
      const a = -Math.PI / 2 + (f - (Math.max(1, fingers) - 1) / 2) * 0.32;
      k.hose(hx, hy - 6, hx + Math.cos(a) * 14, hy - 6 + Math.sin(a) * 14, hx + Math.cos(a) * 28, hy - 6 + Math.sin(a) * 28, 7, PAPER, 2);
    }
    if (front && this.poseW > 0.3) {
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
