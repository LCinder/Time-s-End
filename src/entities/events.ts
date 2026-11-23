// Song events for the chase (MAIN.md §7, "eventos"): set pieces made of the
// railway itself and tied to the lyrics. Like the hazards, each one computes its
// state from the current beat, so it stays in sync whatever the frame rate.
//
//   ticketCheck  "Tickets, please…": punch the ticket with on-beat jumps; a valid
//                ticket delays the train
//   holePunch    "Tick-tock… your ticket's overdue": a giant ticket punch bites a
//                hole in the track (the hole itself is a gap in Track)
//   crossing     a level crossing: barriers drop to the bell; jump them
//   cuckoos      "sixty cuckoo clocks": birds spring out across the track on the beat
//   pendulum     "I ran down a grandfather": the ghost of a grandfather clock swings
//                its pendulum through the track like a metronome

import Phaser from 'phaser';
import { sfx } from '../audio/Sfx';
import type { LevelEvent } from '../core/types';
import { INK, Ink, PAPER } from '../rig/Ink';
import type { ChaseCtx, Hazard } from './hazards';

type Box = { left: number; right: number; top: number; bottom: number };
const overlap = (a: Box, b: Box): boolean => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const hurtbox = (c: ChaseCtx): Box => {
  const h = c.player.hurtbox;
  return { left: h.left - c.camX, right: h.right - c.camX, top: h.top, bottom: h.bottom };
};
const num = (e: LevelEvent, k: string, d: number): number => (typeof e[k] === 'number' ? (e[k] as number) : d);
/** World x the player (at the anchor) reaches on a beat, plus a small lead so a jump on the beat clears it. */
const worldXAt = (c: ChaseCtx, beat: number, lead = 40): number => c.camXAtBeat(beat) + c.anchorX + lead;

/** Beats at which a multi-part event needs a reaction (used by the checker too). */
export function partBeats(e: LevelEvent): number[] {
  const n = Math.max(1, Math.round(num(e, 'count', 1)));
  const step = num(e, 'spacingBeats', 2);
  return Array.from({ length: n }, (_, i) => e.beat + i * step);
}

function newInk(c: ChaseCtx, depth: number): Ink {
  const g = c.scene.add.graphics().setDepth(depth);
  const k = new Ink(g);
  k.amp = 0.8;
  return k;
}

// ───────────────────────── Tickets, please ─────────────────────────

export class TicketCheckEvent implements Hazard {
  private k: Ink;
  private beats: number[];
  private holes: boolean[];
  private judged: boolean[];
  private stampT = -1;
  private valid = false;
  private stampText: Phaser.GameObjects.Text;

  constructor(c: ChaseCtx, e: LevelEvent) {
    this.k = newInk(c, 92);
    this.beats = partBeats(e);
    this.holes = this.beats.map(() => false);
    this.judged = this.beats.map(() => false);
    this.stampText = c.scene.add
      .text(0, 0, '', { fontFamily: 'Rye, Georgia, serif', fontSize: '26px', color: '#8a1a1a', stroke: '#f4efe4', strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(93)
      .setVisible(false);
  }

  update(c: ChaseCtx): boolean {
    const k = this.k;
    k.g.clear();
    k.seed = Math.floor(c.time * 8) % 3;
    const first = this.beats[0];
    const last = this.beats[this.beats.length - 1];
    // an on-beat jump near one of the beats punches that hole
    const j = c.lastJump;
    this.beats.forEach((b, i) => {
      if (this.judged[i]) return;
      if (j && j.label && Math.abs(j.beat - b) < 0.45) {
        this.holes[i] = true;
        this.judged[i] = true;
        sfx('punch');
      } else if (c.beat > b + 0.5) this.judged[i] = true;
    });
    if (this.stampT < 0 && c.beat > last + 0.6) {
      this.stampT = c.time;
      this.valid = this.holes.filter(Boolean).length >= Math.max(1, this.beats.length - 1);
      sfx('stamp');
      if (this.valid) {
        c.delayBoss(140, 8);
        c.boss.perform('doubleTake', c.conductor.secondsPerBeat(c.beat) * 2);
      }
    }
    // the ticket floats above Tick: slides in, wobbles to the beat, flies off after the stamp
    const into = Phaser.Math.Clamp((c.beat - (first - 2.5)) / 0.8, 0, 1);
    const out = this.stampT < 0 ? 0 : Phaser.Math.Clamp((c.time - this.stampT - 0.9) / 0.5, 0, 1);
    if (into <= 0) return true;
    const px = c.player.x - c.camX;
    const x = px + 10 + (1 - into) * 600 + out * 700;
    const y = c.groundY - 330 - out * 200 + Math.sin(c.beat * Math.PI) * 4;
    const rot = Math.sin(c.beat * Math.PI) * 0.04 + out * 0.6;
    const w = 46 * this.beats.length + 40;
    const h = 74;
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    const P = (dx: number, dy: number) => ({ x: x + dx * cs - dy * sn, y: y + dx * sn + dy * cs });
    k.poly([P(-w / 2, -h / 2), P(w / 2, -h / 2), P(w / 2, h / 2), P(-w / 2, h / 2)], 0xe9dfc8, 4);
    const band = [P(-w / 2 + 6, -h / 2 + 6), P(w / 2 - 6, -h / 2 + 6), P(w / 2 - 6, -h / 2 + 18), P(-w / 2 + 6, -h / 2 + 18)];
    k.poly(band, 0x3a3630, 0);
    this.beats.forEach((b, i) => {
      const cx = -w / 2 + 40 + i * 46;
      const q = P(cx, 10);
      const now = Math.abs(c.beat - b) < 0.5 && !this.judged[i];
      if (this.holes[i]) k.circle(q.x, q.y, 11, INK, 0);
      else k.circle(q.x, q.y, now ? 14 : 11, null, now ? 4 : 2);
    });
    if (this.stampT >= 0) {
      const s = Phaser.Math.Clamp((c.time - this.stampT) / 0.12, 0, 1);
      const q = P(0, 4);
      this.stampText
        .setVisible(true)
        .setText(this.valid ? 'DELAYED!' : 'NOT VALID')
        .setColor(this.valid ? '#1a5a1a' : '#8a1a1a')
        .setPosition(q.x, q.y)
        .setRotation(rot - 0.2)
        .setScale(2.2 - s * 1.2)
        .setAlpha(1 - out);
    }
    return out < 1;
  }

  destroy(): void {
    this.k.g.destroy();
    this.stampText.destroy();
  }
}

// ───────────────────────── The ticket punch ─────────────────────────

export class HolePunchEvent implements Hazard {
  private k: Ink;
  private bite: number;
  private x: number;
  private bitten = false;
  private chads: { x: number; y: number; vx: number; vy: number }[] = [];

  constructor(c: ChaseCtx, e: LevelEvent) {
    this.k = newInk(c, 47);
    this.bite = e.beat - num(e, 'biteBeats', 1.5);
    const len = num(e, 'lengthBeats', 1) * c.ppb;
    this.x = worldXAt(c, e.beat) + len / 2;
  }

  update(c: ChaseCtx): boolean {
    const k = this.k;
    k.g.clear();
    k.seed = Math.floor(c.time * 8) % 3;
    const sx = this.x - c.camX;
    // descends over the beat before the bite, bites, rises
    const t = c.beat - this.bite;
    let drop: number;
    if (t < 0) drop = Phaser.Math.Clamp(1 + t, 0, 1);
    else drop = Math.max(0, 1 - t * 1.2);
    const ease = drop * drop * (3 - 2 * drop);
    if (!this.bitten && t >= 0) {
      this.bitten = true;
      sfx('punch');
      c.shake(0.008, 160);
      c.dust(sx, c.groundY, 2);
      for (let i = 0; i < 5; i++) this.chads.push({ x: sx + (Math.random() - 0.5) * 40, y: c.groundY - 10, vx: (Math.random() - 0.5) * 260, vy: -300 - Math.random() * 250 });
    }
    const jawY = -260 + ease * (c.groundY + 260 - 6);
    this.drawPunch(k, sx, jawY, t >= 0 && t < 0.25);
    // the punched-out bits of rail fly away
    for (const ch of this.chads) {
      ch.vy += 1400 * c.dt;
      ch.x += ch.vx * c.dt;
      ch.y += ch.vy * c.dt;
      k.circle(ch.x, ch.y, 7, 0x5f5246, 2);
    }
    return sx > -300 && (t < 2 || sx > -200);
  }

  /** A big cartoon ticket punch (pliers), jaws at (x, jawY). */
  private drawPunch(k: Ink, x: number, jawY: number, closed: boolean): void {
    const open = closed ? 0 : 0.3;
    // handles going up and out of the screen
    k.hose(x - 18, jawY - 50, x - 40 - open * 60, jawY - 160, x - 30 - open * 120, jawY - 300, 22, 0x3a3a3a, 4);
    k.hose(x + 18, jawY - 50, x + 40 + open * 60, jawY - 160, x + 30 + open * 120, jawY - 300, 22, 0x3a3a3a, 4);
    // the hinge and the jaws with the round die
    k.circle(x, jawY - 52, 14, 0x9a9a9a, 4);
    k.rrect(x - 40, jawY - 44, 80, 30, 6, 0x5a5a5a, 4);
    k.rrect(x - 40, jawY - 10, 80, 18, 6, 0x5a5a5a, 4);
    k.circle(x, jawY - 18, 12, closed ? INK : 0x2a2a2a, 3);
  }

  destroy(): void {
    this.k.g.destroy();
  }
}

// ───────────────────────── Level crossing ─────────────────────────

export class CrossingEvent implements Hazard {
  private k: Ink;
  private posts: { beat: number; x: number; hit: boolean; broken: number; lastBell: number }[];

  constructor(c: ChaseCtx, e: LevelEvent) {
    this.k = newInk(c, 44);
    this.posts = partBeats(e).map((b) => ({ beat: b, x: worldXAt(c, b, 10), hit: false, broken: -1, lastBell: -99 }));
  }

  update(c: ChaseCtx): boolean {
    const k = this.k;
    k.g.clear();
    k.seed = Math.floor(c.time * 8) % 3;
    let alive = false;
    for (const p of this.posts) {
      const sx = p.x - c.camX;
      if (sx > -250) alive = true;
      if (sx < -200 || sx > 1500) continue;
      // the arm comes down over 1.5 beats, stays down until just after Tick passes, then lifts
      const t = c.beat - p.beat;
      const down = t < -1.5 ? 0 : t < -0.6 ? (t + 1.5) / 0.9 : t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.8);
      const ringing = t > -2.5 && t < 0.8;
      // the bell rings twice a beat while the barrier works
      const ding = Math.floor(c.beat * 2);
      if (ringing && ding !== p.lastBell && sx < 1300) {
        p.lastBell = ding;
        if (ding % 2 === 0) sfx('bell');
      }
      // the train smashes through the barrier once Tick is past
      if (p.broken < 0 && c.boss.noseX > sx - 20 && t > 0) p.broken = c.time;
      this.drawCrossing(k, sx, c.groundY, down, ringing ? Math.floor(c.beat * 2) % 2 : -1, p.broken >= 0 ? c.time - p.broken : -1);
      // the barrier arm is a hurdle along the track at knee height
      if (!p.hit && down > 0.9 && p.broken < 0) {
        const box: Box = { left: sx + 8, right: sx + 84, top: c.groundY - 66, bottom: c.groundY - 40 };
        if (overlap(box, hurtbox(c))) {
          p.hit = true;
          c.hurt('crossing');
        }
      }
    }
    return alive;
  }

  private drawCrossing(k: Ink, x: number, gy: number, down: number, light: number, brokenFor: number): void {
    // post, crossbuck sign and the twin lamps
    k.rrect(x - 7, gy - 150, 14, 150, 3, 0xe9dfc8, 3);
    for (const a of [0.55, -0.55]) {
      const c = Math.cos(a);
      const s = Math.sin(a);
      k.poly([{ x: x - 46 * c - 6 * s, y: gy - 168 - 46 * s + 6 * c }, { x: x + 46 * c - 6 * s, y: gy - 168 + 46 * s + 6 * c }, { x: x + 46 * c + 6 * s, y: gy - 168 + 46 * s - 6 * c }, { x: x - 46 * c + 6 * s, y: gy - 168 - 46 * s - 6 * c }], 0xe9dfc8, 3);
    }
    k.rrect(x - 34, gy - 128, 68, 22, 8, INK, 0);
    k.circle(x - 20, gy - 117, 9, light === 0 ? 0xfff2b0 : 0x3a3a3a, 3);
    k.circle(x + 20, gy - 117, 9, light === 1 ? 0xfff2b0 : 0x3a3a3a, 3);
    // the striped arm, pivoting at knee height
    const len = 90;
    if (brokenFor >= 0) {
      // smashed: two halves tumbling away
      const f = brokenFor;
      k.poly([{ x: x - 120 * f, y: gy - 60 + 400 * f * f - 60 * f }, { x: x - 120 * f + 40, y: gy - 60 + 400 * f * f - 80 * f }, { x: x - 120 * f + 40, y: gy - 50 + 400 * f * f - 80 * f }, { x: x - 120 * f, y: gy - 50 + 400 * f * f - 60 * f }], PAPER, 3);
      return;
    }
    const ang = -Math.PI / 2 + down * (Math.PI / 2);
    const px = x + 8;
    const py = gy - 56;
    const ex = px + Math.cos(ang) * len;
    const ey = py + Math.sin(ang) * len;
    k.line(px, py, ex, ey, 14, INK);
    k.line(px, py, ex, ey, 9, PAPER);
    for (let i = 1; i < 5; i++) {
      const f = i / 5;
      const a = { x: px + (ex - px) * (f - 0.06), y: py + (ey - py) * (f - 0.06) };
      const b = { x: px + (ex - px) * (f + 0.04), y: py + (ey - py) * (f + 0.04) };
      k.line(a.x, a.y, b.x, b.y, 8, 0x8a1a1a);
    }
    k.circle(px, py, 6, 0x9a9a9a, 3);
  }

  destroy(): void {
    this.k.g.destroy();
  }
}

// ───────────────────────── Cuckoo clocks ─────────────────────────

export class CuckooEvent implements Hazard {
  private k: Ink;
  private clocks: { beat: number; x: number; hit: boolean; sang: boolean }[];

  constructor(c: ChaseCtx, e: LevelEvent) {
    this.k = newInk(c, 47);
    this.clocks = partBeats(e).map((b) => ({ beat: b, x: worldXAt(c, b, 10), hit: false, sang: false }));
  }

  update(c: ChaseCtx): boolean {
    const k = this.k;
    k.g.clear();
    k.seed = Math.floor(c.time * 8) % 3;
    let alive = false;
    for (const cl of this.clocks) {
      const sx = cl.x - c.camX;
      if (sx > -250) alive = true;
      if (sx < -200 || sx > 1500) continue;
      const t = c.beat - cl.beat;
      // the bird springs out a quarter beat early, stays out half a beat, goes back in
      const out = t < -0.4 ? 0 : t < -0.2 ? (t + 0.4) / 0.2 : t < 0.45 ? 1 : Math.max(0, 1 - (t - 0.45) / 0.3);
      // it also peeks out on the beats before, so you can feel when it will come
      const peek = t < -0.4 && t > -4 ? Math.max(0, 1 - Math.abs(c.beat - Math.round(c.beat)) * 6) * 0.35 : 0;
      if (!cl.sang && t >= -0.2) {
        cl.sang = true;
        sfx('cuckoo');
      }
      this.drawClock(k, sx, c.groundY, Math.max(out, peek), c.time);
      if (!cl.hit && out > 0.8) {
        const reach = 70 * out;
        const box: Box = { left: sx + 30, right: sx + 40 + reach, top: c.groundY - 78, bottom: c.groundY - 40 };
        if (overlap(box, hurtbox(c))) {
          cl.hit = true;
          c.hurt('cuckoo');
        }
      }
    }
    return alive;
  }

  private drawClock(k: Ink, x: number, gy: number, out: number, time: number): void {
    // a cuckoo clock nailed on a crooked post
    k.rrect(x - 6, gy - 70, 12, 70, 3, 0x5a4532, 3);
    k.rrect(x - 30, gy - 130, 60, 56, 4, 0x6a5038, 3);
    k.poly([{ x: x - 38, y: gy - 126 }, { x, y: gy - 160 }, { x: x + 38, y: gy - 126 }], 0x4a3828, 3);
    k.circle(x, gy - 96, 13, PAPER, 2);
    k.line(x, gy - 96, x - 3, gy - 104, 2);
    // the bird, on a spring that shoots out across the track
    const reach = 70 * out;
    const bx = x + 30 + reach;
    const by = gy - 60;
    if (out > 0.05) {
      k.g.lineStyle(3, INK, 1);
      k.g.beginPath();
      k.g.moveTo(x + 22, gy - 112);
      const n = 7;
      for (let i = 1; i <= n; i++) {
        const f = i / n;
        k.g.lineTo(x + 22 + (bx - x - 22) * f, gy - 112 + (by - gy + 112) * f + (i % 2 ? -6 : 6));
      }
      k.g.strokePath();
    }
    k.ellipse(bx, by, 16, 11, 0xb0a890, 3);
    k.poly([{ x: bx + 13, y: by - 4 }, { x: bx + 28, y: by + (out > 0.8 ? -4 : 0) }, { x: bx + 13, y: by + 3 }], 0xc9a24a, 2);
    if (out > 0.8) k.poly([{ x: bx + 13, y: by + 2 }, { x: bx + 26, y: by + 8 }, { x: bx + 13, y: by + 6 }], 0xc9a24a, 2);
    k.circle(bx + 6, by - 4, 3, INK, 0);
    k.line(bx - 12, by - 2, bx - 22, by - 8 + Math.sin(time * 30) * 3, 3);
  }

  destroy(): void {
    this.k.g.destroy();
  }
}

// ───────────────────────── The grandfather clock's pendulum ─────────────────────────

/** Beats after the beat at which the bob passes the bottom (Tick is near the top of his jump). */
const BOB_LAG = 0.3;

export class PendulumEvent implements Hazard {
  private k: Ink;
  private x: number;
  private hit = false;
  private last: number;
  private lastTick = -99;

  constructor(c: ChaseCtx, private e: LevelEvent) {
    this.k = newInk(c, 46);
    this.x = worldXAt(c, e.beat, 45);
    this.last = partBeats(e).slice(-1)[0];
  }

  update(c: ChaseCtx): boolean {
    const k = this.k;
    k.g.clear();
    k.seed = Math.floor(c.time * 8) % 3;
    const sx = this.x - c.camX;
    const gy = c.groundY;
    // the ghost rises from its grave over two beats, fades after the last swing
    const rise = Phaser.Math.Clamp((c.beat - (this.e.beat - 5)) / 2, 0, 1);
    const fade = Phaser.Math.Clamp(1 - (c.beat - this.last - 1) / 1.5, 0, 1);
    const a = rise * fade;
    if (a <= 0) return c.beat < this.last + 3;
    // the bob passes the bottom on every beat: the pendulum ticks like a metronome
    // (it comes towards Tick from the front, so a jump right on the beat clears it)
    // the bob reaches the bottom a moment after the beat: a jump on the beat is already high
    const swing = -Math.sin((c.beat - this.e.beat - BOB_LAG) * Math.PI) * 0.62;
    const pivotX = sx;
    const pivotY = gy - 370 + (1 - rise) * 220;
    const rod = 330;
    const bobX = pivotX + Math.sin(swing) * rod;
    const bobY = pivotY + Math.cos(swing) * rod;
    const tick = Math.round(c.beat);
    if (Math.abs(c.beat - tick) < 0.08 && tick !== this.lastTick && c.beat > this.e.beat - 4) {
      this.lastTick = tick;
      sfx('tick');
    }
    k.g.setAlpha(0.3 + a * 0.55);
    // the ghost of a grandfather clock, as tall as the screen, floating up out of the ground
    const lift = (1 - rise) * 220;
    const top = pivotY - 150 + lift;
    const left = pivotX - 58;
    const right = pivotX + 58;
    const body = [{ x: left, y: top + 30 }, { x: pivotX, y: top - 12 }, { x: right, y: top + 30 }];
    // the hem waves like a sheet (no feet)
    for (let i = 0; i <= 8; i++) {
      const x = right - (i / 8) * (right - left);
      body.push({ x, y: gy - 30 + lift + Math.sin(i * 1.6 + c.time * 5) * 8 });
    }
    k.poly(body, 0xb8c4c8, 4);
    // the face in the hood, with a stern frown
    const fy = top + 62;
    k.circle(pivotX, fy, 40, 0xe8f0f2, 4);
    for (let i = 0; i < 12; i++) {
      const an = (i / 12) * Math.PI * 2;
      k.line(pivotX + Math.cos(an) * 31, fy + Math.sin(an) * 31, pivotX + Math.cos(an) * 37, fy + Math.sin(an) * 37, 2);
    }
    k.poly([{ x: pivotX - 24, y: fy - 12 }, { x: pivotX - 6, y: fy - 6 }, { x: pivotX - 22, y: fy }], INK, 0);
    k.poly([{ x: pivotX + 24, y: fy - 12 }, { x: pivotX + 6, y: fy - 6 }, { x: pivotX + 22, y: fy }], INK, 0);
    k.hose(pivotX - 14, fy + 20, pivotX, fy + 14, pivotX + 14, fy + 20, 4);
    // the pendulum window, dark, where the rod hangs
    k.rrect(pivotX - 30, top + 112, 60, gy - top - 190, 8, 0x5a6468, 3);
    // the rod and the big brass bob
    k.line(pivotX, pivotY, bobX, bobY, 6, 0x6a6a6a);
    k.circle(bobX, bobY, 28, 0xd8c890, 4);
    k.circle(bobX - 8, bobY - 8, 7, PAPER, 0);
    if (!this.hit && a > 0.8 && c.beat > this.e.beat - 0.1) {
      const box: Box = { left: bobX - 24, right: bobX + 24, top: bobY - 24, bottom: bobY + 24 };
      if (overlap(box, hurtbox(c))) {
        this.hit = true;
        c.hurt('pendulum');
      }
    }
    return c.beat < this.last + 3;
  }

  destroy(): void {
    this.k.g.destroy();
  }
}
