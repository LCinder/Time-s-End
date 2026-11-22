// TICK — a pocket watch with legs and a metronome pendulum that always swings on the beat.

import Phaser from 'phaser';
import { INK, Ink, PAPER } from '../rig/Ink';
import type { PlayerTuning } from '../core/types';
import type { SolidWorld } from '../world/Solids';

export interface PlayerControls {
  dir: number; // -1, 0, 1
  jumpPressed: boolean;
  jumpHeld: boolean;
  dashPressed: boolean;
  /** Multiplier for this jump (on-beat bonus). */
  jumpMultiplier: number;
  /** Extra invulnerability for this dash (on-beat bonus). */
  dashBonusMs: number;
}

export interface PlayerEnv {
  world: SolidWorld;
  /** World px/s the camera scrolls (auto-run base speed). */
  baseSpeed: number;
  autoRun: boolean;
  minX: number;
  maxX: number;
}

const BRASS = 0xc9a24a;
const CASE = 0xd8c17a;

export class Player {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  readonly w = 40;
  readonly h = 100;
  onGround = false;
  facing = 1;
  private coyote = 0;
  private jumpBuffer = 0;
  private jumpCut = false;
  private dashTime = 0;
  private dashCooldown = 0;
  invulnerable = 0;
  private squash = 1;
  private runPhase = 0;
  private drawTimer = 0;
  private mouthOpen = 0;
  private blink = 0;
  dead = false;
  /** Fired when landing (for dust/sfx). */
  onLand?: (hard: boolean) => void;
  onJump?: () => void;

  readonly gfx: Phaser.GameObjects.Graphics;
  private ink: Ink;

  constructor(scene: Phaser.Scene, x: number, y: number, private tune: PlayerTuning) {
    this.x = x;
    this.y = y;
    this.gfx = scene.add.graphics();
    this.gfx.setDepth(50);
    this.ink = new Ink(this.gfx);
  }

  get isDashing(): boolean {
    return this.dashTime > 0;
  }

  get bounds(): { left: number; right: number; top: number; bottom: number } {
    return { left: this.x - this.w / 2, right: this.x + this.w / 2, top: this.y - this.h, bottom: this.y };
  }

  /** Smaller box used for getting hurt (forgiving). */
  get hurtbox(): { left: number; right: number; top: number; bottom: number } {
    return { left: this.x - 14, right: this.x + 14, top: this.y - 88, bottom: this.y - 6 };
  }

  update(dt: number, c: PlayerControls, env: PlayerEnv): void {
    const T = this.tune;
    const ms = dt * 1000;
    this.coyote -= ms;
    this.jumpBuffer -= ms;
    this.dashCooldown -= ms;
    this.invulnerable -= ms;
    if (this.dashTime > 0) this.dashTime -= ms;

    if (c.jumpPressed) this.jumpBuffer = T.jumpBufferMs;
    if (c.dir !== 0) this.facing = c.dir;

    // dash
    if (c.dashPressed && this.dashCooldown <= 0) {
      this.dashTime = T.dashMs;
      this.dashCooldown = T.dashCooldownMs;
      this.invulnerable = Math.max(this.invulnerable, T.dashMs + c.dashBonusMs);
      this.vy = Math.min(this.vy, 0) * 0.3;
    }

    // horizontal
    const base = env.autoRun ? env.baseSpeed : 0;
    if (this.dashTime > 0) {
      this.vx = base + this.facing * T.dashSpeed;
    } else {
      const target = base + c.dir * T.runSpeed;
      const acc = T.acceleration * (this.onGround ? 1 : T.airControl);
      if (this.vx < target) this.vx = Math.min(target, this.vx + acc * dt);
      else this.vx = Math.max(target, this.vx - acc * dt);
    }

    // jump
    if (this.jumpBuffer > 0 && (this.onGround || this.coyote > 0)) {
      this.vy = -T.jumpVelocity * c.jumpMultiplier;
      this.onGround = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.jumpCut = false;
      this.squash = 1.25;
      this.mouthOpen = 1;
      this.onJump?.();
    }
    if (!c.jumpHeld && this.vy < 0 && !this.jumpCut) {
      this.vy *= T.jumpCutMultiplier;
      this.jumpCut = true;
    }

    // gravity (floaty during dash)
    if (this.dashTime <= 0) this.vy = Math.min(this.vy + T.gravity * dt, 1700);

    this.moveX(this.vx * dt, env);
    const wasGround = this.onGround;
    const fallSpeed = this.vy;
    this.moveY(this.vy * dt, env);
    if (!wasGround && this.onGround) {
      this.squash = fallSpeed > 900 ? 0.72 : 0.84;
      this.onLand?.(fallSpeed > 900);
    }
    if (wasGround && !this.onGround && this.vy >= 0) this.coyote = T.coyoteMs;

    // clamp to screen
    if (this.x < env.minX) {
      this.x = env.minX;
      if (this.vx < base) this.vx = base;
    }
    if (this.x > env.maxX) {
      this.x = env.maxX;
      if (this.vx > base) this.vx = base;
    }

    // animation state
    this.squash += (1 - this.squash) * Math.min(1, dt * 12);
    const relSpeed = Math.abs(this.vx - (env.autoRun ? 0 : 0));
    if (this.onGround) this.runPhase += dt * (6 + relSpeed / 45);
    this.mouthOpen = Math.max(0, this.mouthOpen - dt * 3);
  }

  private moveX(dx: number, env: PlayerEnv): void {
    this.x += dx;
    const b = this.bounds;
    for (const s of env.world.near(b.left, b.right)) {
      if (s.oneWay) continue;
      if (b.bottom > s.y + 2 && b.top < s.y + s.h) {
        if (dx > 0 && b.right > s.x && b.left < s.x) this.x = s.x - this.w / 2;
        else if (dx < 0 && b.left < s.x + s.w && b.right > s.x + s.w) this.x = s.x + s.w + this.w / 2;
      }
    }
  }

  private moveY(dy: number, env: PlayerEnv): void {
    const prevBottom = this.y;
    const prevTop = this.y - this.h;
    this.y += dy;
    this.onGround = false;
    const b = this.bounds;
    for (const s of env.world.near(b.left + 4, b.right - 4)) {
      if (dy >= 0) {
        if (prevBottom <= s.y + 1 && b.bottom >= s.y) {
          this.y = s.y;
          this.vy = 0;
          this.onGround = true;
          s.onLand?.();
        }
      } else if (!s.oneWay) {
        if (prevTop >= s.y + s.h - 1 && b.top <= s.y + s.h) {
          this.y = s.y + s.h + this.h;
          this.vy = 0;
        }
      }
    }
    // standing still on ground: probe slightly below
    if (!this.onGround && dy === 0) {
      for (const s of env.world.near(b.left + 4, b.right - 4)) if (Math.abs(this.y - s.y) < 1) this.onGround = true;
    }
  }

  /** Dance in place to the music (title screen). */
  dance(beat: number): void {
    this.onGround = true;
    this.runPhase = beat * Math.PI;
    const ph = beat - Math.floor(beat);
    this.squash = 1 - Math.pow(1 - ph, 4) * 0.12;
  }

  /** Redraw at 12 fps ("on twos") for the hand-animated feel; position updates every frame. */
  draw(dt: number, time: number, beat: number, camX: number): void {
    this.gfx.setPosition(this.x - camX, this.y);
    this.gfx.setScale(this.facing * (2 - this.squash) ** 0.5, this.squash);
    const flashing = this.invulnerable > 0 && Math.floor(time * 12) % 2 === 0;
    this.gfx.setAlpha(this.dead ? 1 : flashing ? 0.35 : 1);
    this.drawTimer -= dt;
    if (this.drawTimer > 0) return;
    this.drawTimer = 1 / 12;
    this.ink.seed = Math.floor(time * 12) % 3;
    this.blink -= 1 / 12;
    if (this.blink < -3 + Math.random()) this.blink = 0.15;
    this.paint(beat, time);
  }

  private paint(beat: number, time: number): void {
    const k = this.ink;
    const g = this.gfx;
    g.clear();
    const air = !this.onGround;
    const ph = this.runPhase;
    const bob = air ? 0 : -Math.abs(Math.sin(ph)) * 4;
    const bodyY = -64 + bob;
    const dashing = this.dashTime > 0;

    // legs
    const legs = [-1, 1].map((side) => {
      const hipX = side * 10;
      const hipY = bodyY + 26;
      let fx: number;
      let fy: number;
      if (this.dead) {
        fx = side * 26;
        fy = 0;
      } else if (air) {
        fx = side * 10 + (dashing ? -18 : 6);
        fy = this.vy < 0 ? -22 : -12;
      } else {
        const p = ph + (side > 0 ? Math.PI : 0);
        fx = Math.sin(p) * 20;
        fy = -Math.max(0, Math.cos(p)) * 14;
      }
      return { side, hipX, hipY, fx, fy };
    });

    const drawLeg = (l: (typeof legs)[number]): void => {
      const cx = (l.hipX + l.fx) / 2 + 9;
      const cy = (l.hipY + l.fy) / 2;
      k.hose(l.hipX, l.hipY, cx, cy, l.fx, l.fy - 4, 7);
      k.shoe(l.fx, l.fy, 16, 1);
    };

    // arms
    const arms = [-1, 1].map((side) => {
      const sx = side * 24;
      const sy = bodyY - 2;
      let hx: number;
      let hy: number;
      if (this.dead) {
        hx = side * 40;
        hy = bodyY - 30;
      } else if (dashing) {
        hx = sx - 26;
        hy = sy + 8;
      } else if (air) {
        hx = side * 34 + 4;
        hy = bodyY - 40;
      } else {
        const p = ph + (side > 0 ? 0 : Math.PI);
        hx = sx + Math.sin(p) * 18;
        hy = sy + 22;
      }
      return { side, sx, sy, hx, hy };
    });
    const drawArm = (a: (typeof arms)[number]): void => {
      const cx = (a.sx + a.hx) / 2 + a.side * 6;
      const cy = (a.sy + a.hy) / 2 + 6;
      k.hose(a.sx, a.sy, cx, cy, a.hx, a.hy, 6);
      k.glove(a.hx, a.hy, 8, Math.atan2(a.hy - cy, a.hx - cx));
    };

    drawArm(arms[0]);
    drawLeg(legs[0]);

    // metronome pendulum: extreme position exactly on every beat
    const ang = Math.cos(Math.PI * beat) * 0.55;
    const px = Math.sin(ang) * 30;
    const py = bodyY + 24 + Math.cos(ang) * 30;
    k.line(0, bodyY + 24, px, py, 3);
    k.circle(px, py, 6.5, BRASS, 3);

    // crown + bow
    k.rrect(-6, bodyY - 42, 12, 10, 3, BRASS, 3);
    g.lineStyle(4, INK, 1);
    g.strokeCircle(0, bodyY - 48, 7);

    // case + dial
    k.circle(0, bodyY, 32, CASE, 4);
    k.circle(0, bodyY, 25, PAPER, 3);
    g.fillStyle(INK, 1);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = i % 3 === 0 ? 2.4 : 1.2;
      g.fillCircle(Math.cos(a) * 21, bodyY + Math.sin(a) * 21, r);
    }

    // face
    const lookX = this.dead ? 0 : 0.6;
    const eyeY = bodyY - 7;
    if (this.dead) {
      for (const ex of [-8, 8]) {
        k.line(ex - 4, eyeY - 4, ex + 4, eyeY + 4, 3);
        k.line(ex + 4, eyeY - 4, ex - 4, eyeY + 4, 3);
      }
    } else {
      k.pieEye(-7, eyeY, 4.5, 7.5, lookX, air ? -0.5 : 0, this.blink > 0);
      k.pieEye(8, eyeY, 4.5, 7.5, lookX, air ? -0.5 : 0, this.blink > 0);
    }
    // clock hands as a little moustache that spins with time
    const minute = time * 1.2;
    k.line(0, bodyY + 4, Math.cos(minute) * 13, bodyY + 4 + Math.sin(minute) * 13, 2.5);
    k.line(0, bodyY + 4, Math.cos(minute / 12) * 8, bodyY + 4 + Math.sin(minute / 12) * 8, 3.5);
    g.fillStyle(INK, 1);
    g.fillCircle(0, bodyY + 4, 3);
    // mouth
    if (this.mouthOpen > 0.2 || this.dead) {
      k.ellipse(3, bodyY + 15, 6, 4 + this.mouthOpen * 3, INK, 0);
    } else {
      g.lineStyle(3, INK, 1);
      g.beginPath();
      g.arc(3, bodyY + 10, 7, 0.4, Math.PI - 0.4);
      g.strokePath();
    }

    drawLeg(legs[1]);
    drawArm(arms[1]);
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
