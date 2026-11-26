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
import { artAnchor, pieceInfo } from '../fx/artTextures';
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

type Img = Phaser.GameObjects.Image;

/**
 * A hand-drawn event piece (`npm run art`: `art:tex:<name>`), turning on its marked point
 * `pivot` (else `origin`), or null when there is no picture and the code drawing stays.
 * `size`: how long it is from the pivot to its `tip` mark (or how tall, without one), in px.
 */
function piece(c: ChaseCtx, name: string, depth: number, size: number, pivot?: string, origin: [number, number] = [0.5, 1]): Img | null {
  const info = pieceInfo(name);
  if (!info || !c.scene.textures.exists(`art:tex:${name}`)) return null;
  const img = c.scene.add.image(-999, -999, `art:tex:${name}`).setDepth(depth).setVisible(false);
  const a = pivot ? info.anchors[pivot] : undefined;
  if (a) img.setOrigin(a[0] / info.w, a[1] / info.h);
  else img.setOrigin(origin[0], origin[1]);
  const tip = info.anchors.tip ?? info.anchors.bob;
  const len = (a && tip ? Math.hypot(tip[0] - a[0], tip[1] - a[1]) : 0) || info.h;
  img.setScale(size / len);
  return img;
}

/** A marked point of a piece, moved to the screen (the piece placed, turned and scaled as it is now). */
function piecePoint(img: Img, name: string, mark: string): { x: number; y: number } | null {
  const info = pieceInfo(name);
  const a = info?.anchors[mark];
  if (!info || !a) return null;
  const lx = (a[0] - img.originX * info.w) * img.scaleX * (img.flipX ? -1 : 1);
  const ly = (a[1] - img.originY * info.h) * img.scaleY;
  const cs = Math.cos(img.rotation);
  const sn = Math.sin(img.rotation);
  return { x: img.x + lx * cs - ly * sn, y: img.y + lx * sn + ly * cs };
}

// ───────────────────────── Tickets, please ─────────────────────────

export class TicketCheckEvent implements Hazard {
  private beats: number[];
  private holes: boolean[];
  private judged: boolean[];
  private stampT = -1;
  private valid = false;
  private jerk = 0;
  private stampText: Phaser.GameObjects.Text;
  private k: Ink;
  /** the hand-drawn ticket, if there is one (else it is drawn by code) */
  private img: Img | null;
  /** where the ticket was tossed from, and the moment */
  private from: { x: number; y: number } | null = null;
  private tossed = false;

  constructor(c: ChaseCtx, e: LevelEvent) {
    this.beats = partBeats(e);
    this.holes = this.beats.map(() => false);
    this.judged = this.beats.map(() => false);
    this.k = newInk(c, 49.1);
    this.img = c.scene.textures.exists('art:tex:ticket') ? c.scene.add.image(-500, -500, 'art:tex:ticket').setDepth(49).setVisible(false) : null;
    this.stampText = c.scene.add
      .text(0, 0, '', { fontFamily: 'Rye, Georgia, serif', fontSize: '26px', color: '#8a1a1a', stroke: '#f4efe4', strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(93)
      .setVisible(false);
  }

  update(c: ChaseCtx): boolean {
    const first = this.beats[0];
    const last = this.beats[this.beats.length - 1];
    const spb = c.conductor.secondsPerBeat(c.beat);
    // an on-beat jump near one of the beats: Tick's head punches that hole
    const j = c.lastJump;
    this.beats.forEach((b, i) => {
      if (this.judged[i]) return;
      if (j && j.label && Math.abs(j.beat - b) < 0.45) {
        this.holes[i] = true;
        this.judged[i] = true;
        this.jerk = 1;
        sfx('punch');
      } else if (c.beat > b + 0.5) this.judged[i] = true;
    });
    if (this.stampT < 0 && c.beat > last + 0.6) {
      this.stampT = c.time;
      this.valid = this.holes.filter(Boolean).length >= Math.max(1, this.beats.length - 1);
      sfx('stamp');
      if (this.valid) {
        c.delayBoss(140, 8);
        c.boss.perform('doubleTake', spb * 2);
      }
    }
    this.jerk = Math.max(0, this.jerk - c.dt * 6);

    // "Tickets, please…": the conductor flicks a ticket out of his cab with a tip of the hat;
    // it is caught by the wind and flutters along over Tick's head like a loose bit of paper.
    // Each on-beat jump, Tick's crown punches a hole in it. Stamped, the wind carries it off.
    const tossAt = first - 2.5;
    if (c.beat < tossAt) return true;
    if (!this.tossed) {
      this.tossed = true;
      this.from = { ...c.boss.mouthPos };
      c.boss.perform('tipHat', spb * 1.5);
      sfx('click');
    }
    const px = c.player.x - c.camX;
    const t = c.time;
    // where the wind holds it: a little ahead of Tick, at the height his crown reaches
    const hold = {
      x: px + 14 + Math.sin(t * 2.1) * 12,
      y: c.groundY - 300 + Math.sin(t * 3.3) * 8 + Math.sin(t * 1.3) * 5 - this.jerk * 22,
    };
    let x: number;
    let y: number;
    let rot = Math.sin(t * 2.7) * 0.16 + Math.sin(t * 6.1) * 0.05 + this.jerk * 0.35;
    const fly = Phaser.Math.Clamp((c.beat - tossAt) / 1.4, 0, 1);
    if (fly < 1) {
      // tossed: up out of the cab in an arc, spinning, then the wind catches it
      const f = 1 - Math.pow(1 - fly, 2);
      x = this.from!.x + (hold.x - this.from!.x) * f;
      y = this.from!.y + (hold.y - this.from!.y) * f - Math.sin(fly * Math.PI) * 120;
      rot += (1 - fly) * 5;
    } else {
      x = hold.x;
      y = hold.y;
    }
    let alpha = 1;
    if (this.stampT >= 0) {
      // stamped: a gust takes it up and away over the town
      const g = Math.max(0, c.time - this.stampT - 0.35);
      x += g * g * 420 + g * 120;
      y -= g * 260 + g * g * 120;
      rot += g * 4;
      alpha = Phaser.Math.Clamp(1 - (g - 1.0) / 0.4, 0, 1);
    }
    this.drawTicket(c, x, y, rot, alpha);
    if (this.stampT >= 0) {
      const s = Phaser.Math.Clamp((c.time - this.stampT) / 0.12, 0, 1);
      const out = Phaser.Math.Clamp((c.time - this.stampT - 0.6) / 0.3, 0, 1);
      this.stampText
        .setVisible(out < 1)
        .setText(this.valid ? 'DELAYED!' : 'NOT VALID')
        .setColor(this.valid ? '#1a5a1a' : '#8a1a1a')
        .setPosition(px + 14, c.groundY - 250)
        .setRotation(-0.2)
        .setScale(2.2 - s * 1.2)
        .setAlpha(1 - out);
    }
    return !(this.stampT >= 0 && c.time - this.stampT > 1.9);
  }

  /** The ticket at (x, y) (its centre), turned by rot, with its holes punched or still to punch. */
  private drawTicket(c: ChaseCtx, x: number, y: number, rot: number, alpha: number): void {
    const k = this.k;
    k.g.clear();
    k.seed = Math.floor(c.time * 8) % 3;
    k.g.setAlpha(alpha);
    const n = this.holes.length;
    const w = 40 + n * 34;
    const h = this.img ? (this.img.height * w) / this.img.width : 58;
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    const P = (lx: number, ly: number) => ({ x: x + lx * cs - ly * sn, y: y + lx * sn + ly * cs });
    if (this.img) {
      this.img.setVisible(alpha > 0.01).setPosition(x, y).setScale(w / this.img.width).setRotation(rot).setAlpha(alpha);
    } else {
      k.poly([P(-w / 2, -h / 2), P(w / 2, -h / 2), P(w / 2, h / 2), P(-w / 2, h / 2)], 0xe9dfc8, 4);
    }
    this.holes.forEach((punched, i) => {
      const p = P(-w / 2 + (w * (i + 0.5)) / n, h * 0.04);
      if (punched) k.circle(p.x, p.y, 9, INK, 0);
      else k.circle(p.x, p.y, 9, null, 2);
    });
  }

  destroy(): void {
    this.stampText.destroy();
    this.k.g.destroy();
    this.img?.destroy();
  }
}

// ───────────────────────── The ticket punch ─────────────────────────

export class HolePunchEvent implements Hazard {
  private k: Ink;
  private bite: number;
  private x: number;
  private bitten = false;
  private boss: ChaseCtx['boss'];
  private chads: { x: number; y: number; vx: number; vy: number }[] = [];

  constructor(c: ChaseCtx, e: LevelEvent) {
    this.k = newInk(c, 47);
    this.boss = c.boss;
    this.bite = e.beat - num(e, 'biteBeats', 1.5);
    const len = num(e, 'lengthBeats', 1) * c.ppb;
    this.x = worldXAt(c, e.beat) + len / 2;
  }

  update(c: ChaseCtx): boolean {
    const k = this.k;
    k.g.clear();
    k.seed = Math.floor(c.time * 8) % 3;
    const sx = this.x - c.camX;
    const t = c.beat - this.bite;
    // the conductor stretches his arm out ahead of Tick, hovers the punch over the rail,
    // slams it down on the beat, and pulls back
    if (t > -1.3 && t < 0.7) {
      const hover = c.groundY - 230 + Math.sin(c.time * 9) * 6;
      const slam = c.groundY - 86;
      const f = t < -0.25 ? 0 : t < 0 ? (t + 0.25) / 0.25 : t < 0.3 ? 1 : 1 - (t - 0.3) / 0.4;
      c.boss.reach = { x: sx, y: hover + (slam - hover) * f * f, prop: 'punch', closed: t >= 0 && t < 0.3 };
    } else if (t >= 0.7 && c.boss.reach?.prop === 'punch') {
      c.boss.reach = null;
    }
    if (!this.bitten && t >= 0) {
      this.bitten = true;
      sfx('punch');
      c.shake(0.008, 160);
      c.dust(sx, c.groundY, 2);
      for (let i = 0; i < 5; i++) this.chads.push({ x: sx + (Math.random() - 0.5) * 40, y: c.groundY - 10, vx: (Math.random() - 0.5) * 260, vy: -300 - Math.random() * 250 });
    }
    // the punched-out bits of rail fly away
    for (const ch of this.chads) {
      ch.vy += 1400 * c.dt;
      ch.x += ch.vx * c.dt;
      ch.y += ch.vy * c.dt;
      k.circle(ch.x, ch.y, 7, 0x5f5246, 2);
    }
    return t < 2.5;
  }

  destroy(): void {
    this.k.g.destroy();
    if (this.boss.reach?.prop === 'punch') this.boss.reach = null;
  }
}

// ───────────────────────── Level crossing ─────────────────────────

export class CrossingEvent implements Hazard {
  private k: Ink;
  private posts: { beat: number; x: number; hit: boolean; broken: number; lastBell: number; post: Img | null; arm: Img | null }[];

  constructor(c: ChaseCtx, e: LevelEvent) {
    this.k = newInk(c, 44);
    this.posts = partBeats(e).map((b) => ({
      beat: b,
      x: worldXAt(c, b, 10),
      hit: false,
      broken: -1,
      lastBell: -99,
      // the hand-drawn post and barrier arm, when there are pictures of them
      post: piece(c, 'crossingPost', 43.9, 215),
      arm: piece(c, 'crossingArm', 44.1, 100, 'pivot', [0.06, 0.33]),
    }));
  }

  update(c: ChaseCtx): boolean {
    const k = this.k;
    k.g.clear();
    k.seed = Math.floor(c.time * 8) % 3;
    let alive = false;
    for (const p of this.posts) {
      const sx = p.x - c.camX;
      if (sx > -250) alive = true;
      p.post?.setVisible(false);
      p.arm?.setVisible(false);
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
      const light = ringing ? Math.floor(c.beat * 2) % 2 : -1;
      const brokenFor = p.broken >= 0 ? c.time - p.broken : -1;
      if (p.post && p.arm) this.placeCrossing(p.post, p.arm, sx, c.groundY, down, light, brokenFor);
      else this.drawCrossing(k, sx, c.groundY, down, light, brokenFor);
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

  /** The hand-drawn crossing: the post shivers with the bell, the arm swings on its hinge. */
  private placeCrossing(post: Img, arm: Img, x: number, gy: number, down: number, light: number, brokenFor: number): void {
    post.setVisible(true).setPosition(x, gy + 2).setRotation(light < 0 ? 0 : light ? 0.018 : -0.018);
    arm.setVisible(true);
    if (brokenFor >= 0) {
      // smashed: the arm spins away and falls
      const f = brokenFor;
      arm.setPosition(x + 8 - 120 * f, gy - 56 + 400 * f * f - 80 * f).setRotation(-f * 7).setAlpha(Math.max(0, 1 - f * 0.8));
      return;
    }
    arm.setAlpha(1).setPosition(x + 8, gy - 56).setRotation(-Math.PI / 2 + down * (Math.PI / 2));
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
    for (const p of this.posts) {
      p.post?.destroy();
      p.arm?.destroy();
    }
  }
}

// ───────────────────────── Cuckoo clocks ─────────────────────────

export class CuckooEvent implements Hazard {
  private k: Ink;
  private trees: Phaser.GameObjects.Image[];
  private clocks: { beat: number; x: number; hit: boolean; sang: boolean; bird: Img | null }[];
  /** the hand-drawn graveyard tree with its cuckoo clock (mirrored: the clock faces the rails) */
  private door: { x: number; y: number } | undefined;

  constructor(c: ChaseCtx, e: LevelEvent) {
    this.k = newInk(c, 47);
    this.door = artAnchor('cuckootree', 'door');
    this.clocks = partBeats(e).map((b) => ({
      beat: b,
      x: worldXAt(c, b, -14),
      hit: false,
      sang: false,
      bird: this.door ? piece(c, 'cuckooBird', 47.1, 46, undefined, [0.5, 0.55]) : null,
    }));
    // the same trees as the graveyard scenery, standing right behind the rails
    const tree = this.door ? 'cuckootree' : 'deadtree';
    this.trees = this.clocks.map(() => c.scene.add.image(-500, 0, `${tree}_0`).setOrigin(0.5, 1).setDepth(9).setScale(0.95).setFlipX(!!this.door));
  }

  update(c: ChaseCtx): boolean {
    const k = this.k;
    k.g.clear();
    k.seed = Math.floor(c.time * 8) % 3;
    let alive = false;
    this.clocks.forEach((cl, i) => {
      const sx = cl.x - c.camX;
      const tree = this.trees[i];
      tree.setVisible(sx > -200 && sx < 1500);
      tree.setPosition(sx, c.groundY - 6).setTexture(`${this.door ? 'cuckootree' : 'deadtree'}_${(Math.floor(c.time * 8) + i) % 3}`);
      cl.bird?.setVisible(false);
      if (sx > -250) alive = true;
      if (sx < -200 || sx > 1500) return;
      const t = c.beat - cl.beat;
      // the bird springs out a moment before the beat, stays out half a beat, goes back in;
      // on the beats before it peeks out, so you can feel when it will come
      const out = t < -0.4 ? 0 : t < -0.2 ? (t + 0.4) / 0.2 : t < 0.45 ? 1 : Math.max(0, 1 - (t - 0.45) / 0.3);
      const peek = t < -0.4 && t > -4 ? Math.max(0, 1 - Math.abs(c.beat - Math.round(c.beat)) * 6) * 0.3 : 0;
      if (!cl.sang && t >= -0.2) {
        cl.sang = true;
        sfx('cuckoo');
      }
      if (this.door && cl.bird) this.springBird(k, cl.bird, sx, c.groundY, Math.max(out, peek), c.time);
      else this.drawClock(k, sx, c.groundY, Math.max(out, peek), c.time);
      if (!cl.hit && out > 0.8) {
        const box: Box = { left: sx + 54, right: sx + 70 + 66 * out, top: c.groundY - 80, bottom: c.groundY - 42 };
        if (overlap(box, hurtbox(c))) {
          cl.hit = true;
          c.hurt('cuckoo');
        }
      }
    });
    return alive;
  }

  /** The hand-drawn bird shoots out of the tree's clock on a spring, down across the rails. */
  private springBird(k: Ink, bird: Img, x: number, gy: number, out: number, time: number): void {
    const d = this.door!;
    const door = { x: x - d.x * 0.95, y: gy - 6 + d.y * 0.95 };
    if (out < 0.03) return;
    const bx = door.x + (x + 136 - door.x) * out;
    const by = door.y + (gy - 60 - door.y) * out;
    k.g.lineStyle(3, INK, 1);
    k.g.beginPath();
    k.g.moveTo(door.x, door.y);
    const n = 10;
    for (let i = 1; i <= n; i++) {
      const f = i / n;
      k.g.lineTo(door.x + (bx - door.x) * f + (i % 2 ? -5 : 5), door.y + (by - door.y) * f);
    }
    k.g.strokePath();
    bird.setVisible(true).setPosition(bx, by).setFlipX(true).setRotation(Math.sin(time * 30) * 0.06 + (out > 0.8 ? 0.15 : 0));
  }

  /** A cuckoo clock nailed to the trunk; the bird shoots out on a spring, down across the rails. */
  private drawClock(k: Ink, x: number, gy: number, out: number, time: number): void {
    const cx = x + 8;
    const cy = gy - 150;
    k.rrect(cx - 26, cy - 22, 52, 48, 4, 0x6a5038, 3);
    k.poly([{ x: cx - 34, y: cy - 18 }, { x: cx, y: cy - 48 }, { x: cx + 34, y: cy - 18 }], 0x4a3828, 3);
    k.circle(cx, cy + 6, 12, PAPER, 2);
    k.line(cx, cy + 6, cx - 3, cy - 2, 2);
    k.circle(cx - 18, cy - 14, 2.5, 0x9a9a9a, 1); // the nail
    for (const dx of [-8, 8]) {
      k.line(cx + dx, cy + 26, cx + dx, cy + 60 + dx, 1.5);
      k.ellipse(cx + dx, cy + 70 + dx, 5, 10, 0x4a3828, 2);
    }
    const reach = 66 * out;
    const bx = x + 70 + reach;
    const by = gy - 60;
    const doorX = cx + 22;
    const doorY = cy - 6;
    if (out > 0.05) {
      k.g.lineStyle(3, INK, 1);
      k.g.beginPath();
      k.g.moveTo(doorX, doorY);
      const n = 8;
      for (let i = 1; i <= n; i++) {
        const f = i / n;
        k.g.lineTo(doorX + (bx - doorX) * f + (i % 2 ? -5 : 5), doorY + (by - doorY) * f);
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
    for (const t of this.trees) t.destroy();
    for (const cl of this.clocks) cl.bird?.destroy();
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
  /** the hand-drawn clock case and pendulum, when there are pictures of them */
  private caseImg: Img | null;
  private bobImg: Img | null;

  constructor(c: ChaseCtx, private e: LevelEvent) {
    this.k = newInk(c, 46);
    this.x = worldXAt(c, e.beat, 45);
    this.last = partBeats(e).slice(-1)[0];
    this.caseImg = piece(c, 'grandfatherCase', 45.9, 430);
    this.bobImg = this.caseImg ? piece(c, 'pendulum', 46.1, 1, 'bob') : null;
    if (this.bobImg) {
      // the bob as big as the one it hits with (radius 28); the rest of the rod is drawn
      const info = pieceInfo('pendulum')!;
      this.bobImg.setScale(60 / info.w);
    }
  }

  update(c: ChaseCtx): boolean {
    const k = this.k;
    k.g.clear();
    k.seed = Math.floor(c.time * 8) % 3;
    const sx = this.x - c.camX;
    const gy = c.groundY;
    this.caseImg?.setVisible(false);
    this.bobImg?.setVisible(false);
    if (sx < -300) return false;
    if (sx > 1500) return true;
    // asleep in the graveyard → wakes up (shudder, eyes snap open, door bangs open, the
    // pendulum swings out across the rails) → slows down and dozes off again behind Tick
    const b0 = this.e.beat;
    const wake = Phaser.Math.Clamp((c.beat - (b0 - 3.5)) / 0.6, 0, 1);
    const sleep = Phaser.Math.Clamp((c.beat - (this.last + 1.5)) / 1.2, 0, 1);
    const awake = wake * (1 - sleep);
    const amp = 0.62 * Phaser.Math.Clamp((c.beat - (b0 - 3)) / 0.8, 0, 1) * (1 - sleep);
    const shudder = wake > 0 && wake < 1 ? Math.sin(c.time * 60) * 0.03 : 0;
    const tilt = -0.04 + shudder;
    // the clock: a tall case on its grave mound, the same drawing as the graveyard's clocks
    const top = gy - 430;
    const faceY = gy - 345;
    const rot = (x: number, y: number) => ({ x: sx + (x - sx) * Math.cos(tilt) - (y - gy) * Math.sin(tilt), y: gy + (x - sx) * Math.sin(tilt) + (y - gy) * Math.cos(tilt) });
    k.ellipse(sx, gy - 6, 110, 16, 0x4e443a, 3);
    if (this.caseImg && this.bobImg) {
      this.drawArtClock(c, sx, gy, tilt, awake, amp);
      return true;
    }
    const wood = 0x5a4a3a;
    k.poly([rot(sx - 52, gy - 10), rot(sx - 52, gy - 50), rot(sx + 52, gy - 50), rot(sx + 52, gy - 10)].map((p) => p), wood, 4);
    k.poly([rot(sx - 40, gy - 50), rot(sx - 40, top + 150), rot(sx + 40, top + 150), rot(sx + 40, gy - 50)], wood, 4);
    // the hood with its pediment
    k.poly([rot(sx - 54, top + 150), rot(sx - 54, top + 30), rot(sx + 54, top + 30), rot(sx + 54, top + 150)], wood, 4);
    k.poly([rot(sx - 58, top + 34), rot(sx - 42, top + 4), rot(sx, top - 10), rot(sx + 42, top + 4), rot(sx + 58, top + 34)], wood, 4);
    // the face, with eyes that open when it wakes
    const fc = rot(sx, faceY);
    k.circle(fc.x, fc.y, 38, PAPER, 4);
    for (let i = 0; i < 12; i++) {
      const an = (i / 12) * Math.PI * 2;
      k.line(fc.x + Math.cos(an) * 29, fc.y + Math.sin(an) * 29, fc.x + Math.cos(an) * 35, fc.y + Math.sin(an) * 35, 2);
    }
    if (awake > 0.3) {
      for (const s of [-1, 1]) {
        k.ellipse(fc.x + s * 13, fc.y - 6, 7, 9, 0xe8e2d0, 2);
        k.circle(fc.x + s * 12, fc.y - 4, 3.5, INK, 0);
        k.line(fc.x + s * 22, fc.y - 18, fc.x + s * 5, fc.y - 13, 3);
      }
      k.hose(fc.x - 12, fc.y + 18, fc.x, fc.y + 12, fc.x + 12, fc.y + 18, 4);
    } else {
      for (const s of [-1, 1]) k.hose(fc.x + s * 20, fc.y - 6, fc.x + s * 12, fc.y - 2, fc.x + s * 4, fc.y - 6, 3);
      k.line(fc.x, fc.y, fc.x - 6, fc.y + 12, 3);
    }
    // the case door: shut when asleep, swung open when awake (the pendulum comes out)
    const door = awake;
    const dl = rot(sx - 30, top + 165);
    const db = rot(sx - 30, gy - 62);
    const w = 60 * (1 - door * 0.85);
    k.poly([dl, { x: dl.x + w, y: dl.y }, { x: db.x + w, y: db.y }, db], door > 0.2 ? 0x2a221c : 0x6a5a48, 3);
    if (door > 0.2) k.poly([{ x: dl.x - 4, y: dl.y }, { x: dl.x - 4 - 40 * door, y: dl.y + 12 }, { x: db.x - 4 - 40 * door, y: db.y - 12 }, { x: db.x - 4, y: db.y }], 0x6a5a48, 3);
    // the pendulum: from the face down through the open door, swinging across the rails
    // (it reaches the bottom a moment after the beat: a jump on the beat is already high)
    const swing = -Math.sin((c.beat - b0 - BOB_LAG) * Math.PI) * amp;
    const rod = gy - 40 - fc.y;
    const bobX = fc.x + Math.sin(swing) * rod;
    const bobY = fc.y + Math.cos(swing) * rod;
    if (amp > 0.02) {
      k.line(fc.x, fc.y, bobX, bobY, 6, 0x6a6a6a);
      k.circle(bobX, bobY, 28, 0xd8c890, 4);
      k.circle(bobX - 8, bobY - 8, 7, PAPER, 0);
      const tick = Math.round(c.beat);
      if (Math.abs(c.beat - tick) < 0.08 && tick !== this.lastTick && sx < 1280) {
        this.lastTick = tick;
        sfx('tick');
      }
    }
    if (!this.hit && amp > 0.5 && c.beat > b0 - 0.1 && c.beat < this.last + 1) {
      const box: Box = { left: bobX - 24, right: bobX + 24, top: bobY - 24, bottom: bobY + 24 };
      if (overlap(box, hurtbox(c))) {
        this.hit = true;
        c.hurt('pendulum');
      }
    }
    return true;
  }

  /** The same clock, hand-drawn: the face wakes up, the door opens, the pendulum swings out. */
  private drawArtClock(c: ChaseCtx, sx: number, gy: number, tilt: number, awake: number, amp: number): void {
    const k = this.k;
    const b0 = this.e.beat;
    const cs = this.caseImg!;
    cs.setVisible(true).setPosition(sx, gy - 4).setRotation(tilt);
    const fc = piecePoint(cs, 'grandfatherCase', 'face')!;
    const R = 29 * cs.scaleY;
    const q = R / 38;
    for (let i = 0; i < 12; i++) {
      const an = (i / 12) * Math.PI * 2;
      k.line(fc.x + Math.cos(an) * 29 * q, fc.y + Math.sin(an) * 29 * q, fc.x + Math.cos(an) * 35 * q, fc.y + Math.sin(an) * 35 * q, 2);
    }
    if (awake > 0.3) {
      for (const s of [-1, 1]) {
        k.ellipse(fc.x + s * 13 * q, fc.y - 6 * q, 7 * q, 9 * q, 0xe8e2d0, 2);
        k.circle(fc.x + s * 12 * q, fc.y - 4 * q, 3.5 * q, INK, 0);
        k.line(fc.x + s * 22 * q, fc.y - 18 * q, fc.x + s * 5 * q, fc.y - 13 * q, 3);
      }
      k.hose(fc.x - 12 * q, fc.y + 18 * q, fc.x, fc.y + 12 * q, fc.x + 12 * q, fc.y + 18 * q, 4);
    } else {
      for (const s of [-1, 1]) k.hose(fc.x + s * 20 * q, fc.y - 6 * q, fc.x + s * 12 * q, fc.y - 2 * q, fc.x + s * 4 * q, fc.y - 6 * q, 3);
      k.line(fc.x, fc.y, fc.x - 6 * q, fc.y + 12 * q, 3);
    }
    // the glass door swings open when it wakes (a dark hole, the door folded back to the left)
    const dt = piecePoint(cs, 'grandfatherCase', 'doorTop')!;
    const db = piecePoint(cs, 'grandfatherCase', 'doorBottom')!;
    if (awake > 0.2) {
      const w = (db.x - dt.x) * (1 - awake * 0.85);
      k.poly([dt, { x: db.x, y: dt.y }, db, { x: dt.x, y: db.y }], 0x1c1c1c, 3);
      k.poly([{ x: dt.x, y: dt.y }, { x: dt.x - w * 0.7, y: dt.y + 12 }, { x: dt.x - w * 0.7, y: db.y - 12 }, { x: dt.x, y: db.y }], 0x7a7a7a, 3);
    }
    // the pendulum: the rod from the face, the hand-drawn bob at its end (where it hits)
    const swing = -Math.sin((c.beat - b0 - BOB_LAG) * Math.PI) * amp;
    const rod = gy - 40 - fc.y;
    const bobX = fc.x + Math.sin(swing) * rod;
    const bobY = fc.y + Math.cos(swing) * rod;
    if (amp > 0.02) {
      k.line(fc.x, fc.y, bobX, bobY, 8, INK);
      k.line(fc.x, fc.y, bobX, bobY, 4, 0x8a8a8a);
      this.bobImg!.setVisible(true).setPosition(bobX, bobY).setRotation(-swing);
      const tick = Math.round(c.beat);
      if (Math.abs(c.beat - tick) < 0.08 && tick !== this.lastTick && sx < 1280) {
        this.lastTick = tick;
        sfx('tick');
      }
    }
    if (!this.hit && amp > 0.5 && c.beat > b0 - 0.1 && c.beat < this.last + 1) {
      const box: Box = { left: bobX - 24, right: bobX + 24, top: bobY - 24, bottom: bobY + 24 };
      if (overlap(box, hurtbox(c))) {
        this.hit = true;
        c.hurt('pendulum');
      }
    }
  }

  destroy(): void {
    this.k.g.destroy();
    this.caseImg?.destroy();
    this.bobImg?.destroy();
  }
}

// ═════════════════════════ Batch 2: what the train does ═════════════════════════

const easeOutBack = (x: number): number => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);

// ───────────────────────── The water stop (the silence solo) ─────────────────────────

/**
 * The band stops; so does the train: it pulls up at the town's water tower and drinks from
 * the spout, eyes shut, gulping, while Tick runs on alone and the town goes dark a window at
 * a time. When the music comes back, the train comes back too, at full steam.
 */
export class WaterStopEvent implements Hazard {
  private k: Ink;
  private tower: Phaser.GameObjects.Image;
  private towerX: number;
  private end: number;
  private back = false;
  private lastGulp = -1;

  constructor(c: ChaseCtx, private e: LevelEvent) {
    this.k = newInk(c, 41);
    this.end = e.beat + num(e, 'lengthBeats', 8);
    // the tower stands where the train's front is when the band stops
    this.towerX = c.camXAtBeat(e.beat) + c.boss.screenX - 40;
    this.tower = c.scene.add.image(-500, 0, 'watertower_0').setOrigin(0.5, 1).setDepth(9).setScale(1.45);
  }

  update(c: ChaseCtx): boolean {
    const k = this.k;
    k.g.clear();
    k.seed = Math.floor(c.time * 8) % 3;
    const t = c.beat - this.e.beat;
    const tx = this.towerX - c.camX;
    this.tower.setPosition(tx, c.groundY - 4).setTexture(`watertower_${Math.floor(c.time * 8) % 3}`).setVisible(tx > -300 && tx < 1600);
    const len = this.end - this.e.beat;
    if (t >= 0 && t < len) {
      // stopped at the tower: the train drifts back with the world (off the screen)
      c.mods.away = t * c.ppb;
      c.boss.faceOverride = 'gulp';
      // the town goes dark, a little more on every beat
      c.mods.dim = Math.min(0.6, 0.12 + Math.floor(t) * 0.07);
      // the water: from the tower's spout in an arc into his mouth
      // (the hand-drawn tower marks its own spout; the drawn-by-code one has it here)
      const sp = artAnchor('watertower', 'spout') ?? { x: 86, y: -144 };
      const spout = { x: tx + 1.45 * sp.x, y: c.groundY - 4 + 1.45 * sp.y };
      const m = c.boss.mouthPos;
      if (m.x > -100) {
        const n = 14;
        for (let i = 0; i < n; i++) {
          const f = (i + ((c.time * 6) % 1)) / n;
          const x = spout.x + (m.x - spout.x) * f;
          const y = spout.y + (m.y - spout.y) * f - Math.sin(f * Math.PI) * 60;
          k.circle(x, y, 7 - f * 2, 0xdce8f0, 2);
        }
        const g = Math.floor(c.beat);
        if (g !== this.lastGulp) {
          this.lastGulp = g;
          sfx('hop');
        }
      }
    } else if (t >= len && t < len + 1.6) {
      // the music is back: so is he, at full steam
      if (!this.back) {
        this.back = true;
        c.boss.faceOverride = null;
        c.boss.perform('steamEars', c.conductor.secondsPerBeat(c.beat) * 3);
        sfx('whistle');
        c.shake(0.012, 300);
      }
      const f = Math.min(1, (t - len) / 1.5);
      c.mods.away = len * c.ppb * (1 - easeOutBack(f));
      c.mods.dim = Math.max(0, 0.6 * (1 - f * 2));
    }
    return t < len + 2 || tx > -300;
  }

  destroy(): void {
    this.k.g.destroy();
    this.tower.destroy();
  }
}

// ───────────────────────── The points (track switch) ─────────────────────────

/**
 * A points lever stands by the track. Tick runs past it and it flips: the train is switched
 * onto the far track. For a few bars it runs alongside in the distance, small and dark
 * behind the scenery, still singing, until the tracks join again and it is right behind Tick.
 */
export class TrackSwitchEvent implements Hazard {
  private k: Ink;
  private far: Ink;
  private leverX: number;
  private mergeX: number;
  private flipped = false;
  private end: number;
  private tooted = [false, false];
  private reachPoints: number | undefined;
  /** the hand-drawn lever (base and handle), when there are pictures of them */
  private base: Img | null;
  private handle: Img | null;

  constructor(c: ChaseCtx, private e: LevelEvent) {
    this.k = newInk(c, 15);
    this.base = piece(c, 'leverBase', 14.9, 46);
    this.handle = this.base ? piece(c, 'leverHandle', 14.8, 78, 'pivot') : null;
    this.far = newInk(c, 7.2);
    this.end = e.beat + num(e, 'lengthBeats', 12);
    this.leverX = worldXAt(c, e.beat, 20);
    this.mergeX = c.camXAtBeat(this.end) + c.boss.screenX + 150;
  }

  update(c: ChaseCtx): boolean {
    const k = this.k;
    const far = this.far;
    k.g.clear();
    far.g.clear();
    k.seed = far.seed = Math.floor(c.time * 8) % 3;
    const gy = c.groundY;
    const lx = this.leverX - c.camX;
    const mx = this.mergeX - c.camX;
    // the far track: curves away from the main line at the lever and back in at the merge
    const farY = gy - 130;
    const curve = 320;
    const left = Math.max(-40, lx);
    const right = Math.min(1320, mx + curve);
    if (right > left && lx < 1320) {
      const yAt = (x: number) => {
        if (x < lx + curve) return gy - 130 * smooth01((x - lx) / curve);
        if (x > mx) return gy - 130 * (1 - smooth01((x - mx) / curve));
        return farY;
      };
      for (let x = Math.ceil(left / 34) * 34; x < right; x += 34) far.rrect(x, yAt(x) - 6, 20, 10, 2, 0x3b2e22, 2);
      far.g.lineStyle(5, INK, 1);
      far.g.beginPath();
      for (let x = left; x <= right; x += 10) (x === left ? far.g.moveTo(x, yAt(x) - 10) : far.g.lineTo(x, yAt(x) - 10));
      far.g.strokePath();
      far.g.lineStyle(3, 0xa8a8a8, 1);
      far.g.beginPath();
      for (let x = left; x <= right; x += 10) (x === left ? far.g.moveTo(x, yAt(x) - 10) : far.g.lineTo(x, yAt(x) - 10));
      far.g.strokePath();
    }
    // the lever: flips when Tick runs past it
    if (!this.flipped && c.beat >= this.e.beat) {
      this.flipped = true;
      sfx('click');
      sfx('stamp', 0.05);
    }
    this.base?.setVisible(false);
    this.handle?.setVisible(false);
    if (lx > -100 && lx < 1400 && this.base && this.handle) {
      // the hand-drawn lever: the handle turns on the base's axle
      const ang = this.flipped ? 0.55 : -0.55;
      const info = pieceInfo('leverHandle')!;
      const [px, py] = info.anchors.pivot;
      const [tx, ty] = info.anchors.tip;
      const drawn = Math.atan2(tx - px, py - ty); // how far the picture already leans
      this.base.setVisible(true).setPosition(lx, gy + 2);
      const axle = piecePoint(this.base, 'leverBase', 'pivot')!;
      this.handle.setVisible(true).setPosition(axle.x, axle.y).setRotation(ang - drawn);
    } else if (lx > -100 && lx < 1400) {
      const ang = this.flipped ? 0.55 : -0.55;
      k.rrect(lx - 22, gy - 34, 44, 30, 4, 0x5a4532, 3);
      k.line(lx, gy - 30, lx + Math.sin(ang) * 70, gy - 30 - Math.cos(ang) * 70, 7);
      const tip = { x: lx + Math.sin(ang) * 70, y: gy - 30 - Math.cos(ang) * 70 };
      k.circle(tip.x, tip.y, 14, this.flipped ? 0x8a1a1a : PAPER, 3);
      k.circle(tip.x, tip.y, 6, this.flipped ? PAPER : 0x8a1a1a, 0);
    }
    // the train never slides across from one track to the other: it reaches the points a
    // little after Tick, drops back off the left of the screen, and comes in again on the far
    // track (smaller, behind the houses); near the end it drops back the same way and returns
    // on the main line. The track only changes while it is out of sight.
    // (worked out once: while it drops back its own position moves, and must not move this)
    this.reachPoints ??= this.e.beat + Math.max(0, (this.leverX - c.camXAtBeat(this.e.beat) - c.boss.screenX) / c.ppb);
    const reachPoints = this.reachPoints;
    const AWAY = 900;
    const LEAVE = 1.1; // beats to drop out of sight
    const GAP = 0.6; // beats out of sight
    const ENTER = 1.6; // beats to come back in
    const swing = (from: number): { away: number; switched: boolean } => {
      const t = c.beat - from;
      if (t < 0) return { away: 0, switched: false };
      if (t < LEAVE) return { away: AWAY * smooth01(t / LEAVE), switched: false };
      if (t < LEAVE + GAP) return { away: AWAY, switched: true };
      const f = Math.min(1, (t - LEAVE - GAP) / ENTER);
      return { away: AWAY * Math.pow(1 - f, 3), switched: true };
    };
    const backFrom = this.end - (LEAVE + GAP + ENTER);
    const go = swing(reachPoints);
    const ret = swing(backFrom);
    const onFar = go.switched && !ret.switched;
    c.mods.track = onFar ? 1 : 0;
    c.mods.away = Math.max(c.mods.away, c.beat < backFrom ? go.away : ret.away);
    // a whistle as it comes back into view, each time
    const inBeat = (from: number) => from + LEAVE + GAP;
    for (const [i, b] of [inBeat(reachPoints), inBeat(backFrom)].entries()) {
      if (!this.tooted[i] && c.beat >= b) {
        this.tooted[i] = true;
        sfx('whistle');
      }
    }
    return c.beat < this.end + 1 || mx + curve > -50;
  }

  destroy(): void {
    this.k.g.destroy();
    this.far.g.destroy();
    this.base?.destroy();
    this.handle?.destroy();
  }
}

function smooth01(x: number): number {
  const t = Phaser.Math.Clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

// ───────────────────────── The winding key ─────────────────────────

/**
 * "I'll unwind your spring": the conductor reaches over with a giant winding key, sticks it
 * in Tick's crown and turns it backwards. Tick's spring runs down fast; every on-beat jump
 * winds it up again (an empty spring slows the whole world down).
 */
export class UnwindKeyEvent implements Hazard {
  private end: number;
  private lastClick = -1;

  constructor(_c: ChaseCtx, private e: LevelEvent) {
    this.end = e.beat + num(e, 'lengthBeats', 6);
  }

  update(c: ChaseCtx): boolean {
    const t = c.beat - this.e.beat;
    const px = c.player.x - c.camX;
    if (c.beat > this.e.beat - 1.2 && c.beat < this.end) {
      c.boss.reach = { x: px - 4, y: c.player.y - 150, prop: 'key', turn: t > 0 ? -t * Math.PI * 0.9 : 0 };
    } else if (c.beat >= this.end && c.boss.reach?.prop === 'key') {
      c.boss.reach = null;
    }
    if (t >= 0 && t < this.end - this.e.beat) {
      c.mods.extraDrain = num(this.e, 'drainPerBeat', 0.07);
      const ck = Math.floor(c.beat * 2);
      if (ck !== this.lastClick) {
        this.lastClick = ck;
        sfx('tick');
      }
    }
    return c.beat < this.end + 0.5;
  }

  destroy(): void {}
}

// ───────────────────────── The ghosts of the flattened watches ─────────────────────────

interface Ghost {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gone: number;
  stone: { worldX: number; top: number; land: number; solid: ReturnType<ChaseCtx['world']['add']> | null } | null;
  /** the hand-drawn ghost, when there is a picture of it */
  img: Img | null;
}

/**
 * "I've flattened forty pocket-watches…": their ghosts rise from the graveyard and follow
 * Tick, ticking along. Every hit Tick takes, one of them leaves. The ones still with him at
 * the broken bridge fly ahead and become extra stepping stones between the sung words.
 */
export class GhostWatchesEvent implements Hazard {
  private k: Ink;
  private ghosts: Ghost[] = [];
  private lastHurts: number;
  private bridge: number;
  private stones: { worldX: number; top: number; land: number }[] = [];

  constructor(c: ChaseCtx, e: LevelEvent) {
    this.k = newInk(c, 49);
    this.lastHurts = c.hurts;
    this.bridge = num(e, 'bridgeBeat', 321);
    const n = Math.max(1, Math.round(num(e, 'count', 5)));
    const px = c.player.x - c.camX;
    for (let i = 0; i < n; i++) this.ghosts.push({ x: px + 120 + i * 60, y: c.groundY + 40, vx: 0, vy: 0, gone: -1, stone: null, img: piece(c, 'ghostWatch', 49.1, 52, undefined, [0.5, 0.5]) });
    // extra stones halfway between the word stones of the broken bridge
    const words = c.events.filter((o) => o.type === 'lyricObject' && o.beat >= this.bridge && o.beat < this.bridge + 14).sort((a, b) => a.beat - b.beat);
    for (let i = 0; i + 1 < words.length; i++) {
      const a = words[i];
      const b = words[i + 1];
      const land = (a.beat + b.beat) / 2;
      const ha = typeof a.height === 'number' ? a.height : 120;
      const hb = typeof b.height === 'number' ? b.height : 120;
      const sx = typeof a.x === 'number' ? a.x : 760;
      this.stones.push({ worldX: c.camXAtBeat(land) + sx, top: c.groundY - (ha + hb) / 2 - 10, land });
    }
  }

  update(c: ChaseCtx): boolean {
    const k = this.k;
    k.g.clear();
    k.seed = Math.floor(c.time * 8) % 3;
    k.g.setAlpha(0.75);
    for (const g of this.ghosts) g.img?.setVisible(false);
    const px = c.player.x - c.camX;
    const py = c.player.y;
    // every hit: one ghost gives up and drifts away
    for (; this.lastHurts < c.hurts; this.lastHurts++) {
      const g = this.ghosts.find((gh) => gh.gone < 0 && !gh.stone);
      if (g) g.gone = c.time;
    }
    const dt = Math.min(c.dt, 1 / 30);
    const free = this.ghosts.filter((g) => g.gone < 0);
    free.forEach((g, i) => {
      // the bridge: each remaining ghost takes a place between two words, in time
      if (!g.stone && c.beat > this.bridge - 1 && i < this.stones.length) {
        const s = this.stones[i];
        g.stone = { ...s, solid: null };
      }
      let tx: number;
      let ty: number;
      // a stone ghost stretches flat into a plank as it lands (the width of its solid)
      const flat = g.stone ? Phaser.Math.Clamp((c.beat - g.stone.land + 0.5) / 0.5, 0, 1) : 0;
      if (g.stone) {
        tx = g.stone.worldX - c.camX;
        ty = c.beat < g.stone.land - 0.75 ? g.stone.top - 160 : g.stone.top + 1 + 17 - 6 * flat;
        if (!g.stone.solid && c.beat >= g.stone.land) {
          g.stone.solid = c.world.add({ x: g.stone.worldX - 34, y: g.stone.top, w: 68, h: 20, oneWay: true, active: true, tag: 'ghost' });
          sfx('boing');
        }
      } else {
        // a little trail behind and above Tick, bobbing on the beat
        tx = px - 70 - i * 46;
        ty = py - 120 - Math.abs(Math.sin((c.beat + i * 0.25) * Math.PI)) * 16 - i * 8;
      }
      g.vx += ((tx - g.x) * 60 - g.vx * 12) * dt;
      g.vy += ((ty - g.y) * 60 - g.vy * 12) * dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      this.drawGhost(k, g.x, g.y, c.time + i, 1, flat, g.img);
    });
    for (const g of this.ghosts) {
      if (g.gone < 0) continue;
      const f = (c.time - g.gone) / 1.2;
      if (f < 1) this.drawGhost(k, g.x - f * 120, g.y - f * 180, c.time, 1 - f, 0, g.img);
    }
    for (const g of this.ghosts) if (g.stone?.solid) g.stone.solid.x = g.stone.worldX - 34;
    return c.beat < this.bridge + 16;
  }

  /**
   * A small ghost pocket-watch with a kind face and a wavy tail; `flat` (0-1) stretches it
   * into a plank to stand on, still smiling.
   */
  private drawGhost(k: Ink, x: number, y: number, t: number, a: number, flat = 0, img: Img | null = null): void {
    if (img) {
      // the hand-drawn ghost: it bobs and sways, and stretches into a plank on the bridge
      const s = 52 / pieceInfo('ghostWatch')!.h;
      img.setVisible(true).setPosition(x, y + 4 * flat).setAlpha(0.85 * a);
      img.setScale(s * (1 + 0.95 * flat), s * (1 - 0.42 * flat)).setRotation(Math.sin(t * 3) * 0.1 * (1 - flat));
      return;
    }
    k.g.setAlpha(0.75 * a);
    const rx = 17 + 19 * flat;
    const ry = 17 - 6 * flat;
    const tail: { x: number; y: number }[] = [];
    for (let i = 0; i <= 6; i++) tail.push({ x: x - rx + 1 + (i * (rx - 1) * 2) / 6, y: y + ry + 1 + (i % 2 ? 10 : 4) * (1 - flat * 0.4) + Math.sin(t * 6 + i) * 3 });
    k.poly([{ x: x - rx, y }, ...tail, { x: x + rx, y }], 0xdfe8ec, 2);
    k.ellipse(x, y, rx, ry, 0xeef4f6, 3);
    if (flat < 0.5) k.rrect(x - 4, y - ry - 7, 8, 7, 2, 0xdfe8ec, 2);
    const ex = 6 + 8 * flat;
    k.circle(x - ex, y - 3 + flat, 2.5, INK, 0);
    k.circle(x + ex, y - 3 + flat, 2.5, INK, 0);
    k.hose(x - 6 - 4 * flat, y + 5 - flat * 2, x, y + 8 - flat * 2, x + 6 + 4 * flat, y + 5 - flat * 2, 2);
    if (flat < 0.5) k.line(x, y, x + 5, y - 9, 1.5);
  }

  destroy(): void {
    this.k.g.destroy();
    for (const g of this.ghosts) {
      if (g.stone?.solid) g.stone.solid.active = false;
      g.img?.destroy();
    }
  }
}

// ═════════════════════════ Batch 3: the song stops ═════════════════════════

/** How long (real seconds) the song takes to grind to a stop and to start up again. */
const TAPE_STOP = 0.45;
const TAPE_START = 0.35;

/**
 * The song's speed through a stop: slows to nothing like a record when the power is cut,
 * holds still for `hold` seconds, then spins back up. `t` is real seconds since the stop began.
 */
function stopCurve(t: number, hold: number): number {
  if (t < 0) return 1;
  if (t < TAPE_STOP) return Math.pow(1 - t / TAPE_STOP, 1.6);
  if (t < TAPE_STOP + hold) return 0;
  const u = (t - TAPE_STOP - hold) / TAPE_START;
  return u >= 1 ? 1 : u * u;
}

// ───────────────────────── The red signal (a fermata) ─────────────────────────

/**
 * "…here comes my favorite note…": a railway signal by the track. As Tick reaches it the arm
 * drops to danger and the whole song grinds to a halt on the held note (the music, the beat,
 * the camera). The train brakes right behind Tick and stares at you, breathing down his neck.
 * Nobody moves until the arm goes back up: if Tick moves (a step, a jump, a dash) he gets hit.
 */
export class RedSignalEvent implements Hazard {
  private k: Ink;
  private x: number;
  private hold: number;
  private stopT = -1;
  private stopped = false;
  private done = false;
  private caught = false;
  private lastTick = -1;
  private brake = 0;

  constructor(c: ChaseCtx, private e: LevelEvent) {
    this.k = newInk(c, 15);
    // the signal stands a little ahead: Tick pulls up in front of it
    this.x = worldXAt(c, e.beat, 150);
    this.hold = num(e, 'holdSec', 2.4);
  }

  update(c: ChaseCtx): boolean {
    const k = this.k;
    k.g.clear();
    k.seed = Math.floor(c.time * 8) % 3;
    const sx = this.x - c.camX;
    const b0 = this.e.beat;
    // the arm drops to danger a beat before (with a clank), back up when the hold is over
    let red = c.beat >= b0 - 1 ? 1 : 0;
    if (!this.stopped && c.beat >= b0) {
      this.stopped = true;
      this.stopT = c.time;
      c.boss.perform('stare', this.hold + 0.6);
    }
    if (this.stopped && !this.done) {
      const t = c.time - this.stopT;
      c.setTempo(stopCurve(t, this.hold));
      const holding = t > TAPE_STOP * 0.6 && t < TAPE_STOP + this.hold;
      if (t >= TAPE_STOP + this.hold) red = 0;
      // the train creeps up right behind Tick and waits there, steaming
      this.brake = Math.min(1, this.brake + c.dt * 1.5);
      c.mods.noCatch = true;
      const gapPx = c.player.hurtbox.left - c.camX - c.boss.noseX - 26;
      c.mods.away = Math.min(c.mods.away, -Math.max(0, gapPx) * smooth01(this.brake));
      // the hold is silent but for Tick's ticking
      const tick = Math.floor(t * 2.2);
      if (holding && tick !== this.lastTick) {
        this.lastTick = tick;
        sfx('tick');
      }
      // anyone who moves gets it
      const p = c.player;
      if (holding && !this.caught && (!p.onGround || p.isDashing || Math.abs(p.vx) > 60)) {
        this.caught = true;
        c.hurt('moved');
      }
      if (t >= TAPE_STOP + this.hold + TAPE_START) {
        this.done = true;
        c.setTempo(1);
        sfx('whistle');
      }
    } else if (this.done) {
      // the train lets Tick go ahead again
      this.brake = Math.max(0, this.brake - c.dt * 0.8);
      const gapPx = c.player.hurtbox.left - c.camX - c.boss.noseX - 26;
      if (this.brake > 0) {
        c.mods.noCatch = true;
        c.mods.away = Math.min(c.mods.away, -Math.max(0, gapPx) * smooth01(this.brake));
      }
    }
    if (sx > -120 && sx < 1400) this.drawSignal(k, sx, c.groundY, red, c.time);
    return !this.done || this.brake > 0 || sx > -120;
  }

  /** A home signal: a tall post, the striped arm (level = danger), and its lamp. */
  private drawSignal(k: Ink, x: number, gy: number, red: number, t: number): void {
    const top = gy - 300;
    k.rrect(x - 7, top, 14, 300, 3, 0x5a4a3a, 3);
    k.rrect(x - 16, gy - 16, 32, 16, 3, 0x4a4036, 3);
    for (let y = top + 40; y < gy - 30; y += 34) k.line(x - 10, y, x + 10, y - 8, 3); // ladder rungs
    // the arm pivots on the post: level for danger, raised for clear (it bounces when it drops)
    const ang = red ? Math.sin(t * 30) * 0.02 * Math.max(0, 1) : -0.75;
    const len = 96;
    const px = x + 6;
    const py = top + 26;
    const ex = px + Math.cos(ang) * len;
    const ey = py + Math.sin(ang) * len;
    k.line(px, py, ex, ey, 16, INK);
    k.line(px, py, ex, ey, 10, red ? 0x8a1a1a : PAPER);
    k.line(px + (ex - px) * 0.7, py + (ey - py) * 0.7, px + (ex - px) * 0.8, py + (ey - py) * 0.8, 10, PAPER);
    k.circle(px, py, 6, 0x9a9a9a, 3);
    // the lamp: red for danger, glowing; white for clear
    k.circle(x - 16, top + 30, 12, red ? 0xd83a2a : 0xf4efe4, 3);
    if (red) {
      k.g.fillStyle(0xff6a4a, 0.25 + Math.sin(t * 8) * 0.1);
      k.g.fillCircle(x - 16, top + 30, 26);
    }
  }

  destroy(): void {
    this.k.g.destroy();
  }
}

// ───────────────────────── Tick stops time ─────────────────────────

/**
 * Tick is a watch: on a perfect run he can stop the clock. If his combo is at least `need` when
 * the train winds up the charge peaking on `beat`, the whole world freezes for one bar (the boss
 * mid-word, the song on a held note, the picture washed pale) while Tick keeps ticking; when
 * time starts again the charge has fizzled out and the train is shaken back.
 */
export class TimeStopEvent implements Hazard {
  private k: Ink;
  private wash: Phaser.GameObjects.Rectangle;
  private banner: Phaser.GameObjects.Text;
  private need: number;
  private judged = false;
  private on = false;
  private t0 = 0;
  private hold = 0;
  private finished = false;
  private lastTick = -1;

  constructor(c: ChaseCtx, private e: LevelEvent) {
    this.k = newInk(c, 92);
    this.need = Math.round(num(e, 'need', 4));
    // the stopped world: lifted to a pale grey, like a still photograph (works by night too)
    this.wash = c.scene.add.rectangle(640, 360, 1280, 720, 0x9aa6b4, 0).setDepth(91).setBlendMode(Phaser.BlendModes.SCREEN);
    this.banner = c.scene.add
      .text(640, 210, 'TIME STOP!', { fontFamily: 'Rye, Georgia, serif', fontSize: '64px', color: '#f4efe4', stroke: '#141414', strokeThickness: 10 })
      .setOrigin(0.5)
      .setDepth(93)
      .setVisible(false);
  }

  update(c: ChaseCtx): boolean {
    const k = this.k;
    k.g.clear();
    const at = this.e.beat - 0.9; // during the wind-up, before the charge
    if (!this.judged && c.beat >= at) {
      this.judged = true;
      if (c.combo >= this.need) {
        this.on = true;
        this.t0 = c.time;
        this.hold = c.conductor.secondsPerBeat(c.beat) * 4;
        sfx('jumpBeat');
        sfx('tick', 0.05);
      } else return false; // no perfect run: the charge comes as usual
    }
    if (!this.on) return true;
    const t = c.time - this.t0;
    // it stops at once (no grinding down: Tick snaps it), holds a bar, then starts again
    const rate = t < 0.08 ? 1 - t / 0.08 : t < 0.08 + this.hold ? 0 : Math.min(1, (t - 0.08 - this.hold) / 0.25);
    c.setTempo(rate);
    const frozen = t >= 0.05 && t < 0.08 + this.hold;
    // a white flash as it snaps, then the pale still
    const flash = Math.max(0, 1 - t / 0.25);
    this.wash.setFillStyle(flash > 0.05 ? 0xffffff : 0x9aa6b4);
    this.wash.setAlpha(frozen ? Math.max(0.55, flash) : Math.max(0, 0.55 - (t - 0.08 - this.hold) * 2));
    // Tick's own ticking carries on in the stopped world
    const tick = Math.floor(t * 4);
    if (frozen && tick !== this.lastTick) {
      this.lastTick = tick;
      sfx('tick');
    }
    // a ring of clock marks bursts out of Tick
    const px = c.player.x - c.camX;
    const py = c.player.y - 40;
    const r = 40 + Math.min(1, t / 0.5) * 520;
    k.g.setAlpha(Math.max(0, 1 - t / 0.9));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      k.line(px + Math.cos(a) * r, py + Math.sin(a) * r, px + Math.cos(a) * (r + 26), py + Math.sin(a) * (r + 26), 5);
    }
    this.banner.setVisible(frozen).setScale(1 + Math.max(0, 0.3 - t) * 2).setRotation(-0.06);
    // the train's charge is called off; it gets the fright of its life
    if (frozen && c.boss.lungeCancelled !== this.e.beat) {
      c.boss.lungeCancelled = this.e.beat;
    }
    c.mods.noCatch = c.mods.noCatch || t < this.hold + 1.5;
    if (!this.finished && t >= 0.08 + this.hold + 0.25) {
      this.finished = true;
      c.setTempo(1);
      c.boss.perform('doubleTake', c.conductor.secondsPerBeat(c.beat) * 2);
      c.delayBoss(120, 6);
      sfx('boing');
    }
    return !this.finished || t < this.hold + 2;
  }

  destroy(): void {
    this.k.g.destroy();
    this.wash.destroy();
    this.banner.destroy();
  }
}

// ───────────────────────── The tunnel, listening ─────────────────────────

/**
 * "But I can hear you tick-tick, tick-tick, tick-tick…": in the dark tunnel the train cups
 * its ear and sweeps its headlamp along the walls like a searchlight. On each "tick-tick"
 * (the beats in `listen`, each lasting `windowBeats`) Tick tucks into a niche in the wall and
 * must not make a sound: a jump or a dash there and the train hears him, and he gets it.
 * Rhythm the other way round: in these beats you have to do nothing.
 */
export class TunnelListenEvent implements Hazard {
  private k: Ink;
  private windows: { from: number; to: number; heard: boolean; niche: number }[];

  constructor(c: ChaseCtx, e: LevelEvent) {
    this.k = newInk(c, 12);
    const list = Array.isArray(e.listen) ? (e.listen as number[]) : [e.beat];
    const len = num(e, 'windowBeats', 0.9);
    // a niche in the wall where Tick will be standing in each window
    this.windows = list.map((b) => ({ from: b, to: b + len, heard: false, niche: c.camXAtBeat(b + len / 2) + c.anchorX }));
  }

  update(c: ChaseCtx): boolean {
    const k = this.k;
    k.g.clear();
    k.seed = Math.floor(c.time * 8) % 3;
    const gy = c.groundY;
    let alive = false;
    // all through the "tick-tick"s the headlamp sweeps the walls slowly, to and fro, like a
    // searchlight looking for him (it lingers at each end, as if listening)
    const from = this.windows[0].from - 0.6;
    const to = this.windows[this.windows.length - 1].to + 0.3;
    if (c.beat >= from && c.beat < to) {
      const f = (c.beat - from) / (to - from);
      const sweep = Math.sin(f * Math.PI * 2.5 - Math.PI / 2);
      c.mods.beam = { x: 660 + sweep * 520, y: gy - 150 + Math.cos(f * Math.PI * 5) * 30, r: 300 };
    }
    for (const w of this.windows) {
      const nx = w.niche - c.camX;
      if (c.beat < w.to + 4) alive = true;
      // the niche: a dark arched recess in the brick, just Tick's size
      if (nx > -80 && nx < 1360) {
        k.shape(
          [
            { x: nx - 34, y: gy },
            { x: nx - 34, y: gy - 110 },
            { x: nx - 24, y: gy - 130 },
            { x: nx, y: gy - 138 },
            { x: nx + 24, y: gy - 130 },
            { x: nx + 34, y: gy - 110 },
            { x: nx + 34, y: gy },
          ],
          0x0c0c0c,
          5,
          0x9a948a, // a worn stone rim, so the recess reads in the dark
        );
      }
      const inside = c.beat >= w.from && c.beat < w.to;
      if (inside) {
        // the train listens, ear cupped
        c.boss.faceOverride = 'listen';
        if (!c.boss.performing) c.boss.perform('cupEar', c.conductor.secondsPerBeat(c.beat) * 1.2);
        const j = c.lastJump;
        const moved = (j && j.beat >= w.from - 0.05 && j.beat < w.to) || c.player.isDashing;
        if (!w.heard && moved) {
          w.heard = true;
          sfx('whistle');
          c.boss.perform('cackle', c.conductor.secondsPerBeat(c.beat) * 2);
          c.hurt('heard');
        }
      } else if (c.boss.faceOverride === 'listen' && !this.windows.some((o) => c.beat >= o.from && c.beat < o.to)) {
        c.boss.faceOverride = null;
      }
    }
    return alive;
  }

  destroy(): void {
    this.k.g.destroy();
  }
}

// ═════════════════════════ Batch 4: the big set pieces ═════════════════════════

// ───────────────────────── The funeral piano ─────────────────────────

/**
 * "If a PIANO from the freight car played your funeral…": the piano crashes down right behind
 * Tick and starts a funeral march, and its keyboard rises out of the gap ahead as a bridge.
 * The keys go down with the march: on each beat in `presses` the key Tick is reaching sinks
 * (and stays down a moment), so he jumps it on that note, then lands on the keys beyond.
 * `beat` is where the keyboard starts (the anchor reaches it), `lengthBeats` how long it is.
 */
export class PianoKeysEvent implements Hazard {
  private k: Ink;
  private x0: number;
  private keys: { x: number; w: number; down: number; solid: ReturnType<ChaseCtx['world']['add']>; note: boolean }[] = [];
  private presses: number[];
  private rise = 0;
  private lastStep = -1;

  constructor(c: ChaseCtx, private e: LevelEvent) {
    // in front of the track (the pit is drawn there), behind Tick
    this.k = newInk(c, 21);
    const len = num(e, 'lengthBeats', 3);
    this.presses = Array.isArray(e.presses) ? (e.presses as number[]) : [e.beat];
    this.x0 = c.camXAtBeat(e.beat) + c.anchorX + 10;
    const total = len * c.ppb - 20;
    const n = Math.round(len * 2); // two white keys a beat
    const w = total / n;
    for (let i = 0; i < n; i++) {
      const x = this.x0 + i * w;
      this.keys.push({ x, w, down: 0, note: false, solid: c.world.add({ x: x + 1, y: c.groundY, w: w - 2, h: 24, active: false, tag: 'pianoKey' }) });
    }
  }

  update(c: ChaseCtx): boolean {
    const k = this.k;
    k.g.clear();
    k.seed = Math.floor(c.time * 8) % 3;
    const gy = c.groundY;
    // the keyboard rises out of the gap as the piano lands (a beat before Tick gets there)
    this.rise = Phaser.Math.Clamp((c.beat - (this.e.beat - 1.5)) / 0.8, 0, 1);
    // which key the anchor is over at a beat
    const keyAt = (beat: number) => Math.floor((c.camXAtBeat(beat) + c.anchorX + 10 - this.x0) / this.keys[0].w);
    for (const p of this.presses) {
      const i = keyAt(p + 0.35);
      for (const ki of [i - 1, i, i + 1]) {
        const key = this.keys[ki];
        if (!key) continue;
        // pressed from a third of a beat before Tick gets there until he is well past
        const on = c.beat >= p - 0.4 && c.beat < p + 1.2;
        key.down += ((on ? 1 : 0) - key.down) * Math.min(1, c.dt * 18);
        if (on && !key.note && ki === i) {
          key.note = true;
          sfx(['keyLo', 'keyMid', 'keyHi'][this.presses.indexOf(p) % 3] as 'keyLo');
        }
      }
    }
    // a footstep note for every key Tick lands on (the march goes on under his feet)
    const p = c.player;
    if (p.onGround) {
      const ki = Math.floor((p.x - this.x0) / this.keys[0].w);
      if (ki >= 0 && ki < this.keys.length && ki !== this.lastStep) {
        this.lastStep = ki;
        sfx(ki % 2 ? 'keyLo' : 'keyMid', 0);
      }
    }
    let alive = false;
    this.keys.forEach((key, i) => {
      const sx = key.x - c.camX;
      if (sx + key.w > -40) alive = true;
      key.solid.active = this.rise > 0.9 && key.down < 0.5;
      key.solid.y = gy + key.down * 46;
      if (sx < -key.w - 20 || sx > 1320) return;
      const y = gy + (1 - this.rise) * 120 + key.down * 46;
      // the white key, with its front edge, the black key between pairs
      k.rrect(sx + 1, y, key.w - 2, 150, 4, 0xf4efe4, 3);
      k.rrect(sx + 1, y, key.w - 2, 14, 3, 0xd8d0bc, 2);
      if (i % 2 === 0 && i < this.keys.length - 1) k.rrect(sx + key.w - 13, y - 34, 26, 40, 3, INK, 0);
    });
    return alive;
  }

  destroy(): void {
    this.k.g.destroy();
    for (const key of this.keys) key.solid.active = false;
  }
}

// ───────────────────────── The roof run ─────────────────────────

/**
 * Chorus 2: a string of runaway boxcars comes rolling down the line ahead (slower than Tick),
 * and he runs along their roofs. He jumps up onto the first one on `beat`, and over each
 * coupling: car i is under him from `beat` + i·(car + coupling) for `carBeats`, then the gap
 * of `couplingBeats`. A missed jump runs him into the next car. Off the last one, back on
 * the rails. Meanwhile the train looks back over its shoulder at him.
 */
export class RoofRunEvent implements Hazard {
  private cars: { t: number; len: number; img: Phaser.GameObjects.Image; roof: ReturnType<ChaseCtx['world']['add']>; hit: boolean }[] = [];
  private speed: number;
  private h: number;
  private first: number;
  private last: number;

  constructor(c: ChaseCtx, e: LevelEvent) {
    const n = Math.max(1, Math.round(num(e, 'count', 4)));
    const carBeats = num(e, 'carBeats', 2);
    const coupling = num(e, 'couplingBeats', 1);
    this.speed = num(e, 'speed', 0.3);
    // the jumps: onto the first car on `beat`, then over each coupling
    const jumps = Array.from({ length: n }, (_, i) => (i === 0 ? e.beat : e.beat + i * (carBeats + coupling) - coupling));
    this.first = jumps[0];
    const rel = (1 - this.speed) * c.ppb; // how fast Tick gains on a car, px per beat
    const tex = c.scene.textures.get('boxcar_0').getSourceImage() as HTMLImageElement;
    this.h = (tex.height * (rel * carBeats - 30)) / tex.width;
    jumps.forEach((t, i) => {
      const next = jumps[i + 1] ?? t + carBeats;
      // as long as Tick runs along it between this jump and the next (minus a step at each end)
      const len = rel * (next - t) - 30;
      const img = c.scene.add.image(-999, 0, 'boxcar_0').setOrigin(0, 1).setDepth(44).setDisplaySize(len, this.h);
      const roof = c.world.add({ x: 0, y: c.groundY - this.h + 8, w: len, h: 16, oneWay: true, active: true, tag: 'roof' });
      this.cars.push({ t, len, img, roof, hit: false });
    });
    this.last = jumps[n - 1] + carBeats;
  }

  /**
   * World x of a car's back end at a beat: on its own jump beat it is 40 px ahead of Tick (he
   * jumps up and over it), and it rolls on at `speed`. Its front reaches Tick at the next jump,
   * and the next car's back is then 30 px further: a jump on the beat lands well on its roof.
   */
  private backX(c: ChaseCtx, t: number, beat: number): number {
    return c.camXAtBeat(t) + c.anchorX + 25 + this.speed * c.ppb * (beat - t);
  }

  update(c: ChaseCtx): boolean {
    const gy = c.groundY;
    let alive = false;
    const roofY = gy - this.h + 8;
    for (const car of this.cars) {
      const wx = this.backX(c, car.t, c.beat);
      const sx = wx - c.camX;
      if (sx + car.len > -60) alive = true;
      car.roof.x = wx + 4;
      car.roof.w = car.len - 8;
      const bob = Math.abs(Math.sin((c.beat + car.t) * Math.PI)) * 3;
      car.img.setVisible(sx > -car.len - 40 && sx < 1320).setPosition(sx, gy + 2 - bob).setTexture(boilKeyOf('boxcar', c.time, car.t));
      car.img.setDisplaySize(car.len, this.h);
      car.roof.y = roofY - bob;
      // running into the side of a car (a missed jump) hurts
      if (!car.hit) {
        const box: Box = { left: sx + 10, right: sx + car.len - 10, top: roofY + 22, bottom: gy };
        if (overlap(box, hurtbox(c))) {
          car.hit = true;
          c.hurt('boxcar');
        }
      }
    }
    // the train looks back over its shoulder at the cars and at Tick on top of them
    if (c.beat > this.first - 1 && c.beat < this.last && !c.boss.performing) c.boss.perform('lookBack', c.conductor.secondsPerBeat(c.beat) * 2);
    return alive;
  }

  destroy(): void {
    for (const car of this.cars) {
      car.img.destroy();
      car.roof.active = false;
    }
  }
}

/** A boiling texture key for a car (each car on its own boil frame). */
function boilKeyOf(name: string, time: number, salt: number): string {
  return `${name}_${(Math.floor(time * 8) + Math.round(salt)) % 3}`;
}
