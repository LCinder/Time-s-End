// Chase-level hazards. Each one is spawned from a level event and keeps itself
// in sync with the song by computing its state from the current beat.

import Phaser from 'phaser';
import { sfx } from '../audio/Sfx';
import type { Conductor } from '../core/Conductor';
import type { DifficultySpec, LevelEvent } from '../core/types';
import { boilKey } from '../fx/Textures';
import type { Solid, SolidWorld } from '../world/Solids';
import type { Player } from './Player';
import type { Smokestack } from './Smokestack';

export interface ChaseCtx {
  scene: Phaser.Scene;
  beat: number;
  time: number;
  dt: number;
  camX: number;
  ppb: number;
  groundY: number;
  anchorX: number;
  player: Player;
  boss: Smokestack;
  world: SolidWorld;
  conductor: Conductor;
  diff: DifficultySpec;
  hurt: (source: string) => void;
  shake: (intensity: number, ms: number) => void;
  dust: (screenX: number, screenY: number, count?: number) => void;
  camXAtBeat: (beat: number) => number;
}

export interface Hazard {
  /** Returns false when finished (it will be destroyed). */
  update(c: ChaseCtx): boolean;
  destroy(): void;
}

type Box = { left: number; right: number; top: number; bottom: number };
const overlap = (a: Box, b: Box): boolean => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

function hurtboxScreen(c: ChaseCtx): Box {
  const h = c.player.hurtbox;
  return { left: h.left - c.camX, right: h.right - c.camX, top: h.top, bottom: h.bottom };
}

/** Spawn beat (when the hazard must exist) for an event. */
import { spawnBeatOf } from '../core/timing';

export { spawnBeatOf };

// ───────────────────────── Falling objects ─────────────────────────

const DROP_SIZES: Record<string, { w: number; h: number; solidH: number; sound: 'crash' | 'pianoCrash' | 'bigCrash' }> = {
  boxcar: { w: 236, h: 150, solidH: 138, sound: 'bigCrash' },
  anvil: { w: 130, h: 92, solidH: 80, sound: 'crash' },
  piano: { w: 230, h: 190, solidH: 180, sound: 'pianoCrash' },
  trunk: { w: 140, h: 104, solidH: 92, sound: 'crash' },
};

export class DropHazard implements Hazard {
  private sprite: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private worldX: number;
  private landed = false;
  private solid: Solid | null = null;
  private fallingIntoGap = false;
  private vyGap = 0;
  private yGap = 0;
  private size: (typeof DROP_SIZES)[string];
  private landBeat: number;
  private fallBeats: number;

  constructor(c: ChaseCtx, private e: LevelEvent) {
    const obj = String(e.object);
    this.size = DROP_SIZES[obj] ?? DROP_SIZES.anvil;
    this.landBeat = e.beat;
    const tele = typeof e.telegraphBeats === 'number' ? e.telegraphBeats : c.diff.telegraphBeats;
    this.fallBeats = Math.min(1, tele);
    let sx: number;
    if (e.x === 'player' || e.x === undefined) sx = Phaser.Math.Clamp(c.player.x - c.camX, 380, 1100);
    else sx = Number(e.x);
    this.worldX = c.camXAtBeat(this.landBeat) + sx;
    this.shadow = c.scene.add.image(0, c.groundY - 8, 'shadow_0').setDepth(30).setAlpha(0);
    this.shadow.setDisplaySize(this.size.w * 0.9, 26);
    this.sprite = c.scene.add.image(0, -400, `${obj}_0`).setOrigin(0.5, 1).setDepth(45);
    this.sprite.setData('obj', obj);
    c.boss.arm = 'point';
  }

  update(c: ChaseCtx): boolean {
    const sx = this.worldX - c.camX;
    const obj = this.sprite.getData('obj') as string;
    this.sprite.setTexture(boilKey(obj, c.time));
    this.sprite.x = sx;
    this.shadow.x = sx;

    if (this.fallingIntoGap) {
      this.vyGap += 2600 * c.dt;
      this.yGap += this.vyGap * c.dt;
      this.sprite.y = this.yGap;
      return this.yGap < 1100 && sx > -400;
    }

    if (!this.landed) {
      const f = Phaser.Math.Clamp((c.beat - (this.landBeat - this.fallBeats)) / this.fallBeats, 0, 1);
      const before = c.beat < this.landBeat - this.fallBeats;
      // shadow grows as the object approaches
      const total = Math.max(0.01, this.landBeat - (spawnBeatOf(this.e, c.diff)));
      const tp = Phaser.Math.Clamp(1 - (this.landBeat - c.beat) / total, 0, 1);
      const beatPulse = Math.pow(1 - (c.beat - Math.floor(c.beat)), 3);
      this.shadow.setAlpha(0.45 + tp * 0.55);
      this.shadow.setScale(((this.size.w * 0.9 * (0.4 + tp * 0.6)) / 124) * (1 + beatPulse * 0.12), 0.9 + beatPulse * 0.2);
      this.sprite.setAngle(Math.sin(c.time * 12) * 4);
      // dangles, peeking from the top of the screen, until it drops
      const hang = 64 + Math.sin(c.time * 6) * 6;
      this.sprite.y = before ? hang : hang + (c.groundY - hang) * f * f;
      if (c.beat >= this.landBeat) this.land(c, sx);
    } else if (this.solid) {
      this.solid.x = this.worldX - this.size.w / 2 + 8;
    }
    return sx > -this.size.w;
  }

  private land(c: ChaseCtx, sx: number): void {
    this.landed = true;
    this.sprite.setAngle(0);
    this.shadow.setVisible(false);
    if (c.boss.arm === 'point') c.boss.arm = 'idle';
    const ground = c.world.groundAt(this.worldX, c.groundY - 5);
    if (ground === null) {
      this.fallingIntoGap = true;
      this.yGap = c.groundY;
      this.vyGap = 300;
      sfx('fall');
      return;
    }
    this.sprite.y = c.groundY;
    const box: Box = { left: sx - this.size.w / 2 + 10, right: sx + this.size.w / 2 - 10, top: c.groundY - this.size.h, bottom: c.groundY };
    if (overlap(box, hurtboxScreen(c))) c.hurt('crushed');
    sfx(this.size.sound);
    c.shake(this.size.w > 200 ? 0.018 : 0.01, 250);
    c.dust(sx - this.size.w / 2, c.groundY, 3);
    c.dust(sx + this.size.w / 2, c.groundY, 3);
    this.solid = c.world.add({
      x: this.worldX - this.size.w / 2 + 8,
      y: c.groundY - this.size.solidH,
      w: this.size.w - 16,
      h: this.size.solidH,
      active: true,
    });
    c.scene.tweens.add({ targets: this.sprite, scaleY: { from: 0.75, to: 1 }, scaleX: { from: 1.15, to: 1 }, duration: 220, ease: 'Back.Out' });
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
    if (this.solid) this.solid.active = false;
  }
}

// ───────────────────────── Sung words that become platforms ─────────────────────────

export class LyricWordHazard implements Hazard {
  private text: Phaser.GameObjects.Text;
  private worldX: number;
  private topY: number;
  private solid: Solid | null = null;
  private landBeat: number;
  private life: number;
  private popped = false;

  constructor(c: ChaseCtx, e: LevelEvent) {
    this.landBeat = e.beat;
    this.life = typeof e.lifeBeats === 'number' ? e.lifeBeats : 8;
    const sx = typeof e.x === 'number' ? e.x : 760;
    const height = typeof e.height === 'number' ? e.height : 120;
    this.worldX = c.camXAtBeat(this.landBeat) + sx;
    this.topY = c.groundY - height;
    this.text = c.scene.add
      .text(0, -200, String(e.word), {
        fontFamily: 'Rye, Georgia, serif',
        fontSize: '64px',
        color: '#f4efe4',
        stroke: '#141414',
        strokeThickness: 12,
      })
      .setOrigin(0.5, 0)
      .setDepth(44)
      .setPadding(4, 4, 4, 4);
  }

  update(c: ChaseCtx): boolean {
    const sx = this.worldX - c.camX;
    this.text.x = sx;
    const fallStart = this.landBeat - 0.75;
    if (c.beat < this.landBeat) {
      const f = Phaser.Math.Clamp((c.beat - fallStart) / 0.75, 0, 1);
      this.text.y = -120 + (this.topY - 6 + 120) * f * f;
      this.text.setAngle((1 - f) * -10);
    } else if (!this.solid && !this.popped) {
      this.text.y = this.topY - 6;
      this.text.setAngle(0);
      sfx('boing');
      c.dust(sx - this.text.width / 2, this.topY + 40, 1);
      c.dust(sx + this.text.width / 2, this.topY + 40, 1);
      c.scene.tweens.add({ targets: this.text, scaleY: { from: 0.6, to: 1 }, scaleX: { from: 1.3, to: 1 }, duration: 380, ease: 'Elastic.Out' });
      this.solid = c.world.add({
        x: this.worldX - this.text.width / 2 + 10,
        y: this.topY,
        w: this.text.width - 20,
        h: 24,
        oneWay: true,
        active: true,
        tag: 'lyric',
        onLand: () => {
          if (!this.text.getData('squish')) {
            this.text.setData('squish', true);
            c.scene.tweens.add({
              targets: this.text,
              scaleY: { from: 0.85, to: 1 },
              duration: 200,
              onComplete: () => this.text.setData('squish', false),
            });
          }
        },
      });
    }
    if (this.solid) {
      this.solid.x = this.worldX - this.text.width / 2 + 10;
      const left = this.landBeat + this.life - c.beat;
      if (left < 1) this.text.setAlpha(Math.floor(c.time * 16) % 2 ? 0.4 : 1);
      if (left <= 0 && !this.popped) this.pop(c);
    }
    if (this.popped) return this.text.alpha > 0.01;
    return sx > -this.text.width;
  }

  private pop(c: ChaseCtx): void {
    this.popped = true;
    if (this.solid) this.solid.active = false;
    this.solid = null;
    sfx('pop');
    c.scene.tweens.add({ targets: this.text, scale: 1.5, alpha: 0, duration: 250 });
  }

  destroy(): void {
    this.text.destroy();
    if (this.solid) this.solid.active = false;
  }
}

// ───────────────────────── Whistle shock-wave ─────────────────────────

export class GroundWaveHazard implements Hazard {
  private sprite: Phaser.GameObjects.Image;
  private start: number;
  private travel: number;
  private hitDone = false;
  private startX = 0;

  constructor(c: ChaseCtx, private e: LevelEvent) {
    this.travel = (typeof e.travelBeats === 'number' ? e.travelBeats : 2) / c.diff.hazardSpeedMultiplier;
    this.start = e.beat - this.travel;
    this.startX = c.boss.noseX;
    this.sprite = c.scene.add.image(this.startX, c.groundY + 4, 'wave_0').setOrigin(0.5, 1).setDepth(46);
    sfx('whistle');
    c.boss.toot();
    c.boss.arm = 'wave';
  }

  update(c: ChaseCtx): boolean {
    const f = (c.beat - this.start) / this.travel;
    const x = this.startX + (c.anchorX - this.startX) * f;
    this.sprite.x = x;
    this.sprite.setTexture(boilKey('wave', c.time));
    this.sprite.setScale(1, 0.9 + Math.sin(c.time * 30) * 0.1);
    if (f > 0.3 && c.boss.arm === 'wave') c.boss.arm = 'idle';
    if (!this.hitDone) {
      const box: Box = { left: x - 22, right: x + 26, top: c.groundY - 70, bottom: c.groundY };
      if (overlap(box, hurtboxScreen(c))) {
        this.hitDone = true;
        c.hurt('wave');
      }
    }
    void this.e;
    return x < 1400;
  }

  destroy(): void {
    this.sprite.destroy();
  }
}

// ───────────────────────── Living, hopping coal ─────────────────────────

interface Lump {
  sprite: Phaser.GameObjects.Image;
  landBeat: number;
  fromX: number; // world
  fromY: number;
  toX: number; // world
  launched: boolean;
  dead: boolean;
  vy: number;
  hit: boolean;
}

export class CoalHazard implements Hazard {
  private lumps: Lump[] = [];
  private hopPx: number;

  constructor(c: ChaseCtx, e: LevelEvent) {
    const count = typeof e.count === 'number' ? e.count : 3;
    const spacing = typeof e.spacingBeats === 'number' ? e.spacingBeats : 1;
    const landX = typeof e.landX === 'number' ? e.landX : 1020;
    this.hopPx = typeof e.hopPx === 'number' ? e.hopPx : 60;
    for (let i = 0; i < count; i++) {
      const landBeat = e.beat + i * spacing;
      this.lumps.push({
        sprite: c.scene.add.image(-200, -200, 'coal_0').setOrigin(0.5, 1).setDepth(47).setVisible(false),
        landBeat,
        fromX: 0,
        fromY: 0,
        toX: c.camXAtBeat(landBeat) + landX + i * 30,
        launched: false,
        dead: false,
        vy: 0,
        hit: false,
      });
    }
  }

  update(c: ChaseCtx): boolean {
    let alive = false;
    for (const l of this.lumps) {
      if (l.dead) continue;
      alive = true;
      const launchBeat = l.landBeat - 1;
      if (c.beat < launchBeat) continue;
      if (!l.launched) {
        l.launched = true;
        const ch = c.boss.chimneyTop;
        l.fromX = ch.x + c.camX;
        l.fromY = ch.y;
        l.sprite.setVisible(true);
        c.boss.cough();
        sfx('pop');
      }
      l.sprite.setTexture(boilKey('coal', c.time, 1));
      let wx: number;
      let y: number;
      if (c.beat < l.landBeat) {
        // lobbed from the chimney
        const f = c.beat - launchBeat;
        wx = l.fromX + (l.toX - l.fromX) * f;
        y = l.fromY + (c.groundY - l.fromY) * f - Math.sin(f * Math.PI) * 220;
        l.sprite.setAngle(f * 360);
      } else {
        const hops = Math.floor(c.beat - l.landBeat);
        const f = c.beat - l.landBeat - hops;
        const x0 = l.toX - hops * this.hopPx;
        wx = x0 - this.hopPx * f;
        const groundHere = c.world.groundAt(wx, c.groundY - 5);
        if (groundHere === null && f < 0.1) {
          // fell into a gap
          l.vy += 2600 * c.dt;
          y = Math.min(1200, (l.sprite.y || c.groundY) + l.vy * c.dt);
          if (y >= 1100) l.dead = true;
        } else {
          y = c.groundY - Math.sin(f * Math.PI) * 70;
          if (f < 0.05 && !l.sprite.getData(`h${hops}`)) {
            l.sprite.setData(`h${hops}`, true);
            sfx('hop');
          }
        }
        l.sprite.setAngle(0);
        l.sprite.setScale(1 + (f < 0.15 ? (0.15 - f) * 2 : 0), 1 - (f < 0.15 ? (0.15 - f) * 2 : 0));
      }
      const sx = wx - c.camX;
      l.sprite.setPosition(sx, y);
      if (!l.hit) {
        const box: Box = { left: sx - 22, right: sx + 22, top: y - 50, bottom: y - 4 };
        if (overlap(box, hurtboxScreen(c))) {
          l.hit = true;
          c.hurt('coal');
        }
      }
      if (sx < -80) l.dead = true;
      if (l.dead) l.sprite.setVisible(false);
    }
    return alive;
  }

  destroy(): void {
    for (const l of this.lumps) l.sprite.destroy();
  }
}

// ───────────────────────── Smoke rings ─────────────────────────

export class SmokeRingHazard implements Hazard {
  private sprite: Phaser.GameObjects.Image;
  private start: number;
  private travel: number;
  private fromX: number;
  private fromY: number;
  private toX: number;
  private landed = false;
  private hit = false;
  private fade = 1;

  constructor(c: ChaseCtx, private e: LevelEvent) {
    this.travel = (typeof e.travelBeats === 'number' ? e.travelBeats : 2) / c.diff.hazardSpeedMultiplier;
    this.start = e.beat - this.travel;
    const ch = c.boss.chimneyTop;
    this.fromX = ch.x + c.camX;
    this.fromY = ch.y;
    let sx: number;
    if (e.x === 'player' || e.x === undefined) sx = Phaser.Math.Clamp(c.player.x - c.camX + 40, 400, 1150);
    else sx = Number(e.x);
    this.toX = c.camXAtBeat(e.beat) + sx;
    this.sprite = c.scene.add.image(-200, -200, 'ring_0').setDepth(48);
    c.boss.cough();
    sfx('dash');
  }

  update(c: ChaseCtx): boolean {
    const f = (c.beat - this.start) / this.travel;
    this.sprite.setTexture(boilKey('ring', c.time));
    if (!this.landed) {
      const ff = Math.min(1, f);
      const wx = this.fromX + (this.toX - this.fromX) * ff;
      const y = this.fromY + (c.groundY - 30 - this.fromY) * ff - Math.sin(ff * Math.PI) * 260;
      const sx = wx - c.camX;
      this.sprite.setPosition(sx, y);
      this.sprite.setScale(0.6 + ff * 0.6);
      if (!this.hit && ff > 0.4) {
        const box: Box = { left: sx - 40, right: sx + 40, top: y - 22, bottom: y + 22 };
        if (overlap(box, hurtboxScreen(c))) {
          this.hit = true;
          c.hurt('ring');
        }
      }
      if (f >= 1) {
        this.landed = true;
        c.dust(sx, c.groundY, 2);
        sfx('pop');
      }
    } else {
      this.fade -= c.dt * 3;
      this.sprite.setAlpha(Math.max(0, this.fade));
      this.sprite.setScale(this.sprite.scaleX + c.dt * 2);
      this.sprite.x -= (c.ppb / c.conductor.secondsPerBeat(c.beat)) * c.dt;
    }
    void this.e;
    return this.fade > 0;
  }

  destroy(): void {
    this.sprite.destroy();
  }
}

// ───────────────────────── Boss lunge ─────────────────────────

export class LungeHazard implements Hazard {
  private peak: number;
  private tele: number;
  private dist: number;
  private announced = false;

  constructor(c: ChaseCtx, e: LevelEvent) {
    this.peak = e.beat;
    this.tele = typeof e.telegraphBeats === 'number' ? e.telegraphBeats : c.diff.telegraphBeats;
    this.dist = (typeof e.distance === 'number' ? e.distance : 230) * c.diff.bossLungeMultiplier;
  }

  update(c: ChaseCtx): boolean {
    const b = c.beat;
    const boss = c.boss;
    if (!this.announced) {
      this.announced = true;
      sfx('whistle');
      boss.toot();
      boss.arm = 'fist';
    }
    const t0 = this.peak - this.tele;
    if (b < this.peak - 0.5) {
      const f = Phaser.Math.Clamp((b - t0) / Math.max(0.01, this.tele - 0.5), 0, 1);
      boss.charge = f;
      boss.lunge = -40 * Math.sin(f * Math.PI * 0.5); // wind-up
    } else if (b < this.peak) {
      const f = (b - (this.peak - 0.5)) / 0.5;
      boss.charge = 1;
      boss.lunge = -40 + (this.dist + 40) * (1 - Math.pow(1 - f, 3));
    } else if (b < this.peak + 0.5) {
      boss.charge = 0.5;
      boss.lunge = this.dist;
    } else if (b < this.peak + 2.5) {
      const f = (b - (this.peak + 0.5)) / 2;
      boss.charge = 0;
      boss.lunge = this.dist * (1 - f * f * (3 - 2 * f));
    } else {
      boss.lunge = 0;
      boss.charge = 0;
      boss.arm = 'idle';
      return false;
    }
    return true;
  }

  destroy(): void {}
}
