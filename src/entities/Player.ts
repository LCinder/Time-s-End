// TICK — a pocket watch with legs and a metronome pendulum that always swings on the beat.

import Phaser from 'phaser';
import { Acting, faceWarp } from '../rig/Acting';
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
  /** A second jump in the air becomes a forward somersault that hangs longer (the duels). */
  allowFlip?: boolean;
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
  /** 0 … 1 through a forward somersault (a jump in the air), or -1 */
  flip = -1;
  private flipUsed = false;
  facing = 1;
  private coyote = 0;
  private jumpBuffer = 0;
  private jumpCut = false;
  private dashTime = 0;
  private dashCooldown = 0;
  private airDashUsed = false;
  invulnerable = 0;
  private squash = 1;
  private runPhase = 0;
  private drawTimer = 0;
  private mouthOpen = 0;
  dead = false;
  /** Smear drawing at the start of a dash; accent pose on a PERFECT jump. */
  private smearT = 0;
  private accentT = 0;
  /** Blinks, glances, head turns and tilts (rig/Acting.ts). */
  readonly act = new Acting();
  private accentNow = false;
  /** Facing, eased: turning round passes through a front view. */
  private faceAnim = 1;
  /** Seconds standing around doing nothing (idle acting starts after a moment). */
  private idleTime = 0;
  /** Set by the level: where Tick should look (e.g. back at a charging boss). */
  lookBias: number | null = null;
  private startleT = 0;
  private dizzyT = 0;
  /** Fired when landing (for dust/sfx). */
  onLand?: (hard: boolean) => void;
  onJump?: () => void;

  /** Tick as a whole (move, scale, hide it); inside, the drawing in layers. */
  readonly gfx: Phaser.GameObjects.Container;
  private ink: Ink;
  /** behind the body (the far arm and leg, the pendulum), the body and face, in front (the near limbs) */
  private gBack: Phaser.GameObjects.Graphics;
  private gFace: Phaser.GameObjects.Graphics;
  private gFront: Phaser.GameObjects.Graphics;
  /** The hand-drawn pieces (`npm run art -- tick`), when there are pictures of them. */
  private skin: {
    body: Phaser.GameObjects.Image;
    crown: Phaser.GameObjects.Image;
    gloves: Phaser.GameObjects.Image[];
    shoes: Phaser.GameObjects.Image[];
  } | null = null;

  /** A copy of a texture shrunk to `w` px wide in halving steps (smooth, no jagged edges). */
  static smooth(scene: Phaser.Scene, key: string, w: number): string {
    const k = `${key}@${w}`;
    if (scene.textures.exists(k)) return k;
    if (!scene.textures.exists(key)) return key;
    const src = scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    if (src.width <= w) return key;
    let cur: HTMLImageElement | HTMLCanvasElement = src;
    let cw = src.width;
    let ch = src.height;
    const step = (nw: number, nh: number): void => {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(nw));
      c.height = Math.max(1, Math.round(nh));
      const x = c.getContext('2d');
      if (!x) return;
      x.imageSmoothingEnabled = true;
      x.imageSmoothingQuality = 'high';
      x.drawImage(cur, 0, 0, c.width, c.height);
      cur = c;
      cw = c.width;
      ch = c.height;
    };
    while (cw / 2 >= w) step(cw / 2, ch / 2);
    step(w, (ch * w) / cw);
    scene.textures.addCanvas(k, cur as HTMLCanvasElement);
    return k;
  }

  constructor(scene: Phaser.Scene, x: number, y: number, private tune: PlayerTuning) {
    this.x = x;
    this.y = y;
    this.gBack = scene.add.graphics();
    this.gFace = scene.add.graphics();
    this.gFront = scene.add.graphics();
    this.ink = new Ink(this.gBack);
    const has = (k: string) => scene.textures.exists(`art:tex:${k}`);
    const layers: Phaser.GameObjects.GameObject[] = [this.gBack];
    if (has('tickBody') && has('tickCrown') && has('tickGloveOpen') && has('tickShoe')) {
      // (each part from a copy shrunk smoothly to about three times its size on screen: drawn
      // eight to twelve times smaller straight from the big picture, it came out jagged)
      const SIZE: Record<string, number> = { tickBody: 210, tickCrown: 66, tickShoe: 102, tickGloveOpen: 66, tickGloveFist: 66, tickGlovePoint: 66 };
      const img = (k: string, ox: number, oy: number) => scene.add.image(0, 0, Player.smooth(scene, `art:tex:${k}`, SIZE[k] ?? 128)).setOrigin(ox, oy);
      const bodyTex = scene.textures.get(Player.smooth(scene, 'art:tex:tickBody', SIZE.tickBody)).getSourceImage() as HTMLCanvasElement;
      // the case is a circle as wide as the picture, at its bottom (the knob for the crown on top)
      const body = img('tickBody', 0.5, (bodyTex.height - bodyTex.width / 2) / bodyTex.height);
      body.setScale(70 / bodyTex.width);
      const crown = img('tickCrown', 0.5, 1);
      crown.setScale(22 / crown.height);
      const gloves = [img('tickGloveOpen', 0.5, 0.82), img('tickGloveOpen', 0.5, 0.82)];
      const shoes = [img('tickShoe', 0.4, 0.92), img('tickShoe', 0.4, 0.92)];
      for (const s of shoes) s.setScale(34 / s.width);
      this.skin = { body, crown, gloves, shoes };
      layers.push(shoes[0], gloves[0], crown, body);
    }
    layers.push(this.gFace, this.gFront);
    if (this.skin) layers.push(this.skin.shoes[1], this.skin.gloves[1]);
    this.gfx = scene.add.container(0, 0, layers).setDepth(50);
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

  /** Advance by `dt` seconds. Long frames (slow machines) are split into small steps,
   *  so Tick moves at real speed instead of in slow motion. */
  update(dt: number, c: PlayerControls, env: PlayerEnv): void {
    const n = Math.min(6, Math.max(1, Math.ceil(dt / (1 / 60) - 0.01)));
    const sub = dt / n;
    for (let i = 0; i < n; i++) this.step(sub, i === 0 ? c : { ...c, jumpPressed: false, dashPressed: false }, env);
  }

  private step(dt: number, c: PlayerControls, env: PlayerEnv): void {
    const T = this.tune;
    const ms = dt * 1000;
    this.coyote -= ms;
    this.jumpBuffer -= ms;
    this.dashCooldown -= ms;
    this.invulnerable -= ms;
    if (this.dashTime > 0) this.dashTime -= ms;

    if (c.jumpPressed) this.jumpBuffer = T.jumpBufferMs;
    if (c.dir !== 0) this.facing = c.dir;
    this.idleTime = this.onGround && c.dir === 0 && Math.abs(this.vx) < 20 && !c.jumpPressed && !c.dashPressed ? this.idleTime + dt : 0;

    // dash
    // (once on the ground or once per jump: an air dash, as in the cartoons)
    if (c.dashPressed && this.dashCooldown <= 0 && (this.onGround || !this.airDashUsed)) {
      if (!this.onGround) this.airDashUsed = true;
      this.smearT = 0.1;
      this.drawTimer = 0;
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
    else if (this.jumpBuffer > 0 && env.allowFlip && !this.onGround && !this.flipUsed && this.flip < 0) {
      // a jump in the air: a forward somersault, a new lift and a slower fall while it lasts
      this.flipUsed = true;
      this.flip = 0;
      this.vy = -T.jumpVelocity * 0.78;
      this.vx += this.facing * 90;
      this.jumpBuffer = 0;
      this.jumpCut = true;
      this.squash = 1.2;
      this.onJump?.();
    }
    if (this.onGround) {
      this.airDashUsed = false;
      this.flipUsed = false;
      this.flip = -1;
    }
    if (this.flip >= 0) {
      this.flip += dt / 0.55;
      if (this.flip >= 1) this.flip = -1;
    }
    if (!c.jumpHeld && this.vy < 0 && !this.jumpCut) {
      this.vy *= T.jumpCutMultiplier;
      this.jumpCut = true;
    }

    // gravity (floaty during dash)
    if (this.dashTime <= 0) this.vy = Math.min(this.vy + T.gravity * (this.flip >= 0 ? 0.62 : 1) * dt, 1700);

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

  /** A quick held "ta-da!" pose (called on PERFECT jumps). */
  /** Jump with fright: eyes pop, arms up. */
  startle(): void {
    this.startleT = 0.35;
    this.drawTimer = 0;
  }

  /** Stars spinning round his head after a hit. */
  dizzy(): void {
    this.dizzyT = 1.4;
  }

  accent(): void {
    this.accentNow = true;
    this.accentT = 0.16;
    this.drawTimer = 0;
  }

  /** Drive the drawing from recorded positions (the ghost of the previous try). */
  ghostStep(dt: number, x: number, y: number, onGround: boolean, facing: number): void {
    const moved = Math.abs(x - this.x);
    this.vx = 300; // the ghost replays a run: keep the legs going
    this.x = x;
    this.y = y;
    this.onGround = onGround;
    this.facing = facing;
    if (onGround) this.runPhase += dt * (6 + Math.min(600, moved / Math.max(dt, 1e-3)) / 45);
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
    this.smearT = Math.max(0, this.smearT - dt);
    this.accentT = Math.max(0, this.accentT - dt);
    // smear: stretched along the dash for a drawing or two; accent: tall and proud
    const sx = this.smearT > 0 ? 1.45 : this.accentT > 0 ? 0.86 : 1;
    const sy = this.smearT > 0 ? 0.8 : this.accentT > 0 ? 1.2 : 1;
    // turning round: the body narrows through a front view instead of flipping
    this.faceAnim += (this.facing - this.faceAnim) * Math.min(1, dt * 16);
    const turning = Math.abs(this.faceAnim) < 0.75;
    const fx = Math.sign(this.faceAnim || this.facing) * Math.max(0.35, Math.abs(this.faceAnim));
    this.gfx.setScale(fx * (2 - this.squash) ** 0.5 * sx, this.squash * sy);
    const idle = this.idleTime > 1.2 && !this.dead;
    this.startleT = Math.max(0, this.startleT - dt);
    this.dizzyT = Math.max(0, this.dizzyT - dt);
    const look = this.lookBias ?? (turning ? 0 : this.onGround ? 0.6 : 0.4);
    this.act.update(dt, beat, { look, singing: false, accent: this.accentNow, nervous: this.startleT > 0 ? 1 : 0, idle });
    this.accentNow = false;
    this.gfx.setRotation(idle || this.accentT > 0 ? this.act.tilt * 0.8 : 0);
    if (this.flip >= 0) {
      // the somersault (like a cartoon tuck): he curls up hugging his knees, goes round once,
      // fast in the middle of the turn, round the middle of his tucked body, and opens out to land
      const f = Phaser.Math.Clamp((this.flip - 0.06) / 0.8, 0, 1);
      const e = f * f * f * (f * (f * 6 - 15) + 10);
      const a = this.facing * e * Math.PI * 2;
      const u = this.tuck();
      const cy = -58;
      this.gfx.setRotation(a);
      this.gfx.setPosition(this.x - camX + cy * Math.sin(a), this.y + cy - Math.cos(a) * cy);
      // a ball: a touch wider and shorter when fully tucked
      this.gfx.setScale(this.gfx.scaleX * (1 + 0.05 * u), this.gfx.scaleY * (1 - 0.1 * u));
    }
    const flashing = this.invulnerable > 0 && Math.floor(time * 12) % 2 === 0;
    this.gfx.setAlpha(this.dead ? 1 : flashing ? 0.35 : 1);
    this.drawTimer -= dt;
    if (this.drawTimer > 0) return;
    // (the somersault is drawn twice as often: the curl and the opening out must be smooth)
    this.drawTimer = this.flip >= 0 ? 1 / 24 : 1 / 12;
    this.ink.seed = Math.floor(time * 12) % 3;
    this.paint(beat, time);
  }

  /** How tucked he is during the somersault: curls up quickly, holds, opens out to land. */
  private tuck(): number {
    if (this.flip < 0) return 0;
    const t = this.flip;
    const u = t < 0.14 ? t / 0.14 : t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1;
    const c = Phaser.Math.Clamp(u, 0, 1);
    return c * c * (3 - 2 * c);
  }

  private paint(beat: number, time: number): void {
    const k = this.ink;
    this.gBack.clear();
    this.gFace.clear();
    this.gFront.clear();
    k.g = this.gBack;
    let g = this.gBack;
    const skin = this.skin;
    const air = !this.onGround;
    const ph = this.runPhase;
    const bob = air ? 0 : -Math.abs(Math.sin(ph)) * 4;
    const bodyY = -64 + bob;
    const dashing = this.dashTime > 0;
    const tk = this.tuck();

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
      } else if (Math.abs(this.vx) < 20) {
        // standing: feet planted; when idle, one foot taps on every beat
        fx = side * 12;
        const bph = beat - Math.floor(beat);
        fy = this.idleTime > 1.2 && side > 0 ? -Math.pow(1 - bph, 4) * 10 : 0;
      } else {
        const p = ph + (side > 0 ? Math.PI : 0);
        fx = Math.sin(p) * 20;
        fy = -Math.max(0, Math.cos(p)) * 14;
      }
      // the knee (the hose's bend): halfway, pushed forwards
      let kx = (hipX + fx) / 2 + 9;
      let ky = (hipY + fy) / 2;
      if (tk > 0) {
        // tucked: knees up at his chest, shins folded back, feet tucked under the case
        const tkx = hipX + 30 + side * 2;
        const tky = hipY - 22;
        const tfx = hipX + 12 + side * 3;
        const tfy = hipY + 8;
        kx += (tkx - kx) * tk;
        ky += (tky - ky) * tk;
        fx += (tfx - fx) * tk;
        fy += (tfy - fy) * tk;
      }
      return { side, hipX, hipY, fx, fy, kx, ky };
    });

    const drawLeg = (l: (typeof legs)[number], i: number): void => {
      k.hose(l.hipX, l.hipY, l.kx, l.ky, l.fx, l.fy - 4, 7);
      // tucked, the sole turns up under him
      if (skin) skin.shoes[i].setPosition(l.fx, l.fy + 1).setRotation(air ? -0.15 - tk * 2.4 : 0);
      else k.shoe(l.fx, l.fy, 16, 1);
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
      } else if (this.accentT > 0 || this.startleT > 0) {
        hx = side * (this.startleT > 0 ? 44 : 40);
        hy = bodyY - (this.startleT > 0 ? 54 : 46); // arms up: ta-da! (or yikes!)
      } else if (dashing) {
        hx = sx - 26;
        hy = sy + 8;
      } else if (air) {
        hx = side * 34 + 4;
        hy = bodyY - 40;
      } else if (Math.abs(this.vx) < 20) {
        const hips = this.idleTime > 4;
        hx = hips ? side * 34 : sx + side * 4;
        hy = hips ? bodyY + 12 : sy + 24;
      } else {
        const p = ph + (side > 0 ? 0 : Math.PI);
        hx = sx + Math.sin(p) * 18;
        hy = sy + 22;
      }
      if (tk > 0) {
        // tucked: both hands round the knees (fists gripping the shins)
        const thx = 34 + side * 3;
        const thy = bodyY + 20;
        hx += (thx - hx) * tk;
        hy += (thy - hy) * tk;
      }
      return { side, sx, sy, hx, hy };
    });
    const drawArm = (a: (typeof arms)[number], i: number): void => {
      // (tucked, the elbows bow out round the knees)
      const cx = (a.sx + a.hx) / 2 + a.side * 6 + tk * 10;
      const cy = (a.sy + a.hy) / 2 + 6 - tk * 8 * a.side;
      k.hose(a.sx, a.sy, cx, cy, a.hx, a.hy, 6);
      const angle = Math.atan2(a.hy - cy, a.hx - cx);
      if (skin) {
        // a fist when dashing, a pointing finger on the ta-da, an open glove the rest of the time
        const kind = dashing || tk > 0.5 ? 'tickGloveFist' : this.accentT > 0 && i === 1 ? 'tickGlovePoint' : 'tickGloveOpen';
        const gl = skin.gloves[i];
        const key = Player.smooth(this.gfx.scene, `art:tex:${kind}`, 66);
        if (gl.texture.key !== key) gl.setTexture(key);
        // the texture is a right hand seen from the palm (thumb on its right): his right hand (on
        // the left of the drawing, he faces us) wears it as drawn, his left one mirrored
        gl.setFlipX(i === 1);
        gl.setPosition(a.hx, a.hy).setRotation(angle + Math.PI / 2).setScale(22 / gl.height);
      } else k.glove(a.hx, a.hy, 8, angle);
    };

    // smear: speed lines and afterimages trailing a dash
    if (this.smearT > 0 || (dashing && this.dashTime > 60)) {
      for (let i = 0; i < 3; i++) k.line(-46 - i * 6, bodyY - 20 + i * 18, -96 - i * 14, bodyY - 20 + i * 18, 3, 0x8a8478);
      g.fillStyle(CASE, 0.25).fillCircle(-30, bodyY, 30);
      g.fillStyle(CASE, 0.12).fillCircle(-58, bodyY, 28);
    }

    // the somersault's swoosh: arcs trailing the top of the ball as it goes round
    if (tk > 0.3) {
      for (let i = 0; i < 2; i++) {
        const r = 46 + i * 9;
        g.lineStyle(5 - i * 2, 0xffffff, (tk - 0.3) * (0.9 - i * 0.35));
        g.beginPath();
        g.arc(0, bodyY + 6, r, -Math.PI / 2 - 2.3, -Math.PI / 2 - 0.25, false);
        g.strokePath();
        g.lineStyle(2, INK, (tk - 0.3) * 0.6);
        g.beginPath();
        g.arc(0, bodyY + 6, r + 4, -Math.PI / 2 - 2.0, -Math.PI / 2 - 0.5, false);
        g.strokePath();
      }
    }

    drawArm(arms[0], 0);
    drawLeg(legs[0], 0);

    // metronome pendulum: extreme position exactly on every beat
    const ang = Math.cos(Math.PI * beat) * 0.55;
    const px = Math.sin(ang) * 30;
    const py = bodyY + 24 + Math.cos(ang) * 30;
    k.line(0, bodyY + 24, px, py, 3);
    k.circle(px, py, 6.5, BRASS, 3);

    // the body, the face and everything on it go on their own layer
    k.g = this.gFace;
    g = this.gFace;
    if (skin) {
      // the hand-drawn case (its blank dial centred on the body) and the crown on its knob
      skin.body.setPosition(0, bodyY);
      skin.crown.setPosition(0, bodyY - 37).setRotation(Math.sin(ph) * 0.06);
    } else {
      // crown + bow
      k.rrect(-6, bodyY - 42, 12, 10, 3, BRASS, 3);
      g.lineStyle(4, INK, 1);
      g.strokeCircle(0, bodyY - 48, 7);

      // case + dial
      k.circle(0, bodyY, 32, CASE, 4);
      k.circle(0, bodyY, 25, PAPER, 3);
    }
    g.fillStyle(INK, 1);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = i % 3 === 0 ? 2.4 : 1.2;
      g.fillCircle(Math.cos(a) * 21, bodyY + Math.sin(a) * 21, r);
    }

    // face: features turn and nod with the head (fake 3D on the dial)
    k.warp = faceWarp(this.act, 0, bodyY, 26, null);
    const lookX = this.dead ? 0 : Phaser.Math.Clamp(this.act.turn, -1, 1);
    const eyeY = bodyY - 7;
    if (this.dead) {
      for (const ex of [-8, 8]) {
        k.line(ex - 4, eyeY - 4, ex + 4, eyeY + 4, 3);
        k.line(ex + 4, eyeY - 4, ex - 4, eyeY + 4, 3);
      }
    } else {
      const pop = this.startleT > 0 ? 1.35 : 1;
      const shut = (this.act.blinking && pop === 1) || tk > 0.6;
      k.pieEye(-7, eyeY, 4.5 * pop, 7.5 * pop, lookX, air ? -0.5 : 0, shut);
      k.pieEye(8, eyeY, 4.5 * pop, 7.5 * pop, lookX, air ? -0.5 : 0, shut);
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

    k.warp = null;

    // dizzy: little stars circling his head
    if (this.dizzyT > 0) {
      for (let i = 0; i < 3; i++) {
        const a = time * 6 + (i / 3) * Math.PI * 2;
        const sx = Math.cos(a) * 30;
        const sy = bodyY - 52 + Math.sin(a) * 8;
        for (const r of [0, Math.PI / 2]) k.line(sx - Math.cos(r) * 6, sy - Math.sin(r) * 6, sx + Math.cos(r) * 6, sy + Math.sin(r) * 6, 3, BRASS);
      }
    }

    k.g = this.gFront;
    drawLeg(legs[1], 1);
    drawArm(arms[1], 1);
    k.g = this.gBack;
  }

  destroy(): void {
    this.gfx.destroy(); // the container takes its layers and pictures with it
  }
}
