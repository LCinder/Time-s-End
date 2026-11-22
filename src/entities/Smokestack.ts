// OLD SMOKESTACK — a boastful locomotive with a walrus moustache, a top-hat
// chimney and rubber-hose arms. Drawn procedurally; local origin = nose at ground.
//
// The whole drawing goes through a "warp" (see Ink.warp) so the locomotive moves
// like rubber: the boiler breathes on the beat, the body leans on a spring when
// it winds up / charges / brakes, it ripples while singing and the chimney
// stretches like a top hat when it puffs or coughs.

import Phaser from 'phaser';
import { INK, Ink, PAPER } from '../rig/Ink';

export type ArmPose = 'idle' | 'point' | 'fist' | 'wave';

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
  /** Alternates between wide and round mouth shapes per syllable. */
  mouthWide = false;
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
  blink = 0;
  /** Screen point the eyes look at (Tick). */
  lookTarget = { x: 800, y: 540 };

  // ── internal animation
  private lean = 0;
  private leanVel = 0;
  private prevLunge = 0;
  private whistleT = 0;
  private coughT = 0;
  private laughT = 0;
  private beat = 0;
  private time = 0;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics();
    this.gfx.setDepth(40);
    this.ink = new Ink(this.gfx);
    this.ink.amp = 1.4;
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
  laugh(): void {
    this.laughT = 0.9;
  }

  /** Where the chimney top is (screen coords) – for puffs and projectiles. */
  get chimneyTop(): { x: number; y: number } {
    return { x: this.screenX - 170 + this.lean * 55, y: this.groundY - 450 + this.fallY };
  }

  /** Headlamp position in screen coords (light source in the tunnel). */
  get lamp(): { x: number; y: number } {
    return { x: this.screenX - 40 + this.lean * 40, y: this.groundY - 322 + this.fallY };
  }

  /** Mouth position in screen coords (for breath puffs when shouting). */
  get mouthPos(): { x: number; y: number } {
    return { x: this.screenX - 60 + this.lean * 20, y: this.groundY - 150 + this.fallY };
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
    this.gfx.setPosition(this.screenX + shake, this.groundY + (airborne ? 0 : chug + laughBob) + this.fallY);
    this.gfx.setRotation(this.tilt + (airborne ? 0 : Math.sin(beat * Math.PI) * 0.008));
    const stretch = 1 + Math.pow(1 - phase, 3) * 0.035;
    this.gfx.setScale(1 / Math.sqrt(stretch), stretch);

    // hand-drawn redraw on twos (12 fps)
    this.drawTimer -= dt;
    if (this.drawTimer > 0) return;
    this.drawTimer = 1 / 12;
    this.ink.seed = Math.floor(time * 12) % 3;
    this.blink -= 1 / 12;
    if (this.blink < -2.5 - Math.random() * 2) this.blink = 0.12;
    this.paint();
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
    this.ink.warp = (x: number, y: number) => {
      let nx = x;
      let ny = y;
      // chimney: a top hat that pops up when puffing / coughing
      if (y < -296 && x > -250 && x < -90) {
        const k = Math.min(1, (-296 - y) / 40);
        ny = -296 + (y + 296) * (1 + puff * k);
        nx = -170 + (x + 170) * (1 - puff * 0.35 * k);
      }
      // the boiler breathes on the beat (bulges around its centre line)
      if (y < -100 && y > -310 && x < -30) {
        const along = Math.sin(Math.PI * Phaser.Math.Clamp((x + 620) / 590, 0, 1));
        ny = -210 + (ny + 210) * (1 + breath * 0.05 * along);
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

    // ── front arm
    this.paintArm(true);

    // ── smokestack (a top hat!) – warp stretches it
    k.poly([{ x: -200, y: -300 }, { x: -140, y: -300 }, { x: -118, y: -420 }, { x: -222, y: -420 }], IRON, 5);
    k.rrect(-238, -444, 136, 26, 8, IRON, 5);
    k.rrect(-212, -406, 84, 10, 2, 0x5a5a5a, 0);

    // ── smokebox face
    const fx = -60;
    const fy = -210;
    k.circle(fx, fy, 104, FACE, 5);
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
    const k = this.ink;
    const red = this.charge > 0.3;
    const laughing = this.laughT > 0.05;
    const eyeY = fy - 30 - this.nervous * 4;

    // eyes follow Tick
    const lx = Phaser.Math.Clamp((this.lookTarget.x - (this.screenX + fx)) / 260, -1, 1);
    const ly = Phaser.Math.Clamp((this.lookTarget.y - (this.groundY + eyeY)) / 260, -1, 1);
    for (const ex of [fx - 36, fx + 30]) {
      if (laughing) {
        // squeezed-shut happy eyes  ^ ^
        k.hose(ex - 20, eyeY + 8, ex, eyeY - 22, ex + 20, eyeY + 8, 7);
        continue;
      }
      const big = 1 + this.nervous * 0.2 + this.charge * 0.1;
      k.ellipse(ex, eyeY, 25 * big, 34 * big, red ? 0xe8b0a0 : PAPER, 4);
      const pupilScale = this.nervous > 0.5 ? 0.6 : 1;
      k.pieEye(ex + lx * 8, eyeY + ly * 10, 10 * pupilScale, 16 * pupilScale, lx, ly, this.blink > 0, red ? 0xe8b0a0 : PAPER);
    }

    // brows: angry (inner ends down) ↔ worried (inner ends up)
    const mood = laughing ? 0.2 : Phaser.Math.Clamp(this.anger + this.charge * 0.6 - this.nervous * 1.6, -1, 1);
    for (const [ex, side] of [[fx - 36, -1], [fx + 30, 1]] as const) {
      const by = eyeY - 46 - this.nervous * 10 - (laughing ? 6 : 0);
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
    const w = this.shouting ? 30 : this.mouthWide ? 46 : 32;
    const h = 8 + mo * (this.shouting ? 38 : 26);
    k.ellipse(fx - 2, my + mo * 10, w, h, 0x2a0a0a, 4);
    if (mo > 0.3) k.ellipse(fx - 2, my + mo * 10 + h * 0.5, w * 0.55, h * 0.3, 0x9a3a3a, 0);
    k.rrect(fx - w * 0.7, my - 4, w * 1.4, 8, 2, PAPER, 0);
    if (this.shouting || laughing) k.rrect(fx - w * 0.6, my + mo * 10 + h - 10, w * 1.2, 7, 2, PAPER, 0);

    // walrus moustache: flaps with the voice, flies up when shouting
    const wig = Math.sin(time * 9) * 3 * this.mouth + (this.shouting ? -8 : 0);
    for (const side of [-1, 1]) {
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

  private paintArm(front: boolean): void {
    const k = this.ink;
    const time = this.time;
    const beat = this.beat;
    const shX = front ? -270 : -440;
    const shY = front ? -190 : -210;
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
    const cx = (shX + hx) / 2 - 40;
    const cy = (shY + hy) / 2 + 30;
    k.hose(shX, shY, cx, cy, hx, hy, front ? 14 : 12, front ? INK : 0x262626);
    k.glove(hx, hy, front ? 20 : 17, Math.atan2(hy - cy, hx - cx), fist);
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
