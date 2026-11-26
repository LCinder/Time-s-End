// The inside of Miss Pirouette's music box: the arena of her duel (a fixed stage, no scroll).
// The hand-drawn backdrop (art/pirouette: musicboxBack) with, on top of it, the things that
// move: the turntable she dances on (a brass stud goes round its rim; Tick can stand on it
// too, and it carries him round when it turns), the velvet cushions
// (platforms for Tick, they can rise and sink), the light falling in through the open lid with
// dust drifting in it, sparks on the comb's teeth when a note is played, and her reflection
// dancing in the mirror of the lid (seen from behind: the mirror is behind her).

import Phaser from 'phaser';
import { Pirouette } from '../entities/Pirouette';
import type { Player } from '../entities/Player';
import type { Solid, SolidWorld } from './Solids';

/** Where things are on the 1280×720 stage (the backdrop is fitted to the screen). */
export const STAGE = {
  /** the velvet floor Tick runs on */
  floorY: 640,
  /** the turntable in the middle and the height she dances at */
  tableX: 640,
  tableY: 652,
  danceY: 552,
  /** the mirror in the lid (an ellipse) */
  mirror: { x: 637, y: 106, rx: 300, ry: 74 },
  /** the comb at the back (notes leave from here) */
  comb: { x0: 486, x1: 858, y: 532 },
};

interface Cushion {
  img: Phaser.GameObjects.Image;
  solid: Solid;
  x: number;
  /** how far it is raised (0 = on the floor, 1 = up) and where it is going */
  rise: number;
  target: number;
}

export class MusicBoxStage {
  readonly reflection: Pirouette | null = null;
  private back: Phaser.GameObjects.Image;
  private light: Phaser.GameObjects.Graphics;
  private dust: { x: number; y: number; vy: number; r: number; ph: number }[] = [];
  private sparks: Phaser.GameObjects.Graphics;
  private table: Phaser.GameObjects.Image | null;
  private stud: Phaser.GameObjects.Graphics;
  /** the brass springs a raised cushion stands on */
  private coils: Phaser.GameObjects.Graphics;
  private cushions: Cushion[] = [];
  /** the top of the turntable: Tick can stand on it, and it carries him round when it turns */
  private tableTop: Solid;
  private sparkAt: { x: number; t: number }[] = [];
  private tableTurn = 0;
  /** the lid: 1 open (light), 0 shut (dark) */
  lid = 1;

  constructor(scene: Phaser.Scene, world: SolidWorld) {
    const s = scene;
    this.back = s.add.image(640, 360, 'art:tex:musicboxBack').setDepth(0);
    this.back.setDisplaySize(1280, 720);
    // her reflection in the lid's mirror: a second dancer, mirrored, seen only inside the oval
    if (Pirouette.available(s)) {
      const r = new Pirouette(s);
      // (small and standing on the oval's lower rim, so the boss bar above never hides her)
      r.size = 0.17;
      r.x = STAGE.mirror.x;
      r.groundY = STAGE.mirror.y + STAGE.mirror.ry - 2;
      // the mirror is in the lid, behind her: it shows her from behind (her back, the bun,
      // the key), the same way round on the screen as she is
      r.backView = true;
      r.setDepth(0.6);
      r.setAlpha(0.55);
      const m = s.make.graphics({}, false);
      m.fillStyle(0xffffff, 1);
      m.fillEllipse(STAGE.mirror.x, STAGE.mirror.y, STAGE.mirror.rx * 2 - 24, STAGE.mirror.ry * 2 - 16);
      r.setMask(m.createGeometryMask());
      (this as { reflection: Pirouette | null }).reflection = r;
    }
    this.light = s.add.graphics().setDepth(0.8).setBlendMode(Phaser.BlendModes.ADD);
    this.sparks = s.add.graphics().setDepth(0.9).setBlendMode(Phaser.BlendModes.ADD);
    for (let i = 0; i < 40; i++) this.dust.push({ x: 380 + Math.random() * 520, y: 120 + Math.random() * 480, vy: 6 + Math.random() * 10, r: 1 + Math.random() * 1.8, ph: Math.random() * 6 });
    // the turntable: she dances on it; a brass stud on its rim shows it going round
    this.table = s.textures.exists('art:tex:mbTurntable') ? s.add.image(STAGE.tableX, STAGE.tableY, 'art:tex:mbTurntable').setOrigin(0.5, 1).setDepth(5) : null;
    this.table?.setScale(340 / this.table.width);
    this.stud = s.add.graphics().setDepth(5.1);
    this.tableTop = world.add({ x: STAGE.tableX - 150, y: STAGE.danceY, w: 300, h: 16, oneWay: true, active: true, tag: 'table' });
    this.coils = s.add.graphics().setDepth(5.9);
    // the velvet cushions, left and right: Tick's platforms (one-way: he can jump up through)
    for (const [x, h] of [[200, 0], [1080, 0]] as const) {
      const img = s.add.image(x, STAGE.floorY + 4, 'art:tex:mbCushion').setOrigin(0.5, 1).setDepth(6);
      img.setScale(190 / img.width);
      const top = STAGE.floorY + 4 - img.displayHeight + 18;
      const solid = world.add({ x: x - img.displayWidth / 2 + 12, y: top, w: img.displayWidth - 24, h: 16, oneWay: true, active: true, tag: 'cushion' });
      this.cushions.push({ img, solid, x, rise: h, target: h });
    }
  }

  /** Raise (1) or lower (0) cushion i (0 left, 1 right). */
  setCushion(i: number, up: number): void {
    const c = this.cushions[i];
    if (c) c.target = up;
  }

  /** A note is played: the comb's tooth at x sparks. */
  pluck(x: number, time: number): void {
    this.sparkAt.push({ x, t: time });
  }

  /** `rider`: Tick, carried up and down by a cushion he is standing on. */
  update(dt: number, time: number, beat: number, spin: number, rider?: Player): void {
    // the light from the open lid: a soft cone with dust turning in it
    const g = this.light;
    g.clear();
    const a = 0.07 * this.lid;
    if (a > 0.002) {
      g.fillStyle(0xffffff, a);
      g.fillPoints([{ x: 420, y: 170 }, { x: 860, y: 170 }, { x: 1010, y: STAGE.floorY + 20 }, { x: 270, y: STAGE.floorY + 20 }], true);
      g.fillStyle(0xffffff, a * 1.4);
      g.fillPoints([{ x: 520, y: 170 }, { x: 760, y: 170 }, { x: 860, y: STAGE.floorY + 20 }, { x: 420, y: STAGE.floorY + 20 }], true);
      for (const d of this.dust) {
        d.y -= d.vy * dt;
        d.x += Math.sin(time * 0.7 + d.ph) * 6 * dt;
        if (d.y < 140) {
          d.y = STAGE.floorY;
          d.x = 380 + Math.random() * 520;
        }
        const tw = 0.5 + 0.5 * Math.sin(time * 3 + d.ph + beat * Math.PI);
        g.fillStyle(0xffffff, (0.25 + tw * 0.45) * this.lid);
        g.fillCircle(d.x, d.y, d.r);
      }
    }
    // sparks on the comb
    this.sparks.clear();
    this.sparkAt = this.sparkAt.filter((p) => time - p.t < 0.35);
    for (const p of this.sparkAt) {
      const f = (time - p.t) / 0.35;
      this.sparks.lineStyle(3, 0xffffff, 1 - f);
      for (let i = 0; i < 4; i++) {
        const an = (i / 4) * Math.PI * 2 + f;
        const r0 = 6 + f * 10;
        const r1 = 16 + f * 22;
        this.sparks.lineBetween(p.x + Math.cos(an) * r0, STAGE.comb.y + Math.sin(an) * r0, p.x + Math.cos(an) * r1, STAGE.comb.y + Math.sin(an) * r1);
      }
    }
    // the turntable turns with her, and its top carries whoever stands on it (its near edge
    // goes right to left: a fast spin flings Tick off)
    this.tableTurn += spin * dt;
    const t = this.tableTop;
    if (rider && rider.onGround && spin > 0 && Math.abs(rider.y - t.y) < 3 && rider.x > t.x - 10 && rider.x < t.x + t.w + 10) rider.x -= spin * 34 * dt;
    this.stud.clear();
    if (this.table) {
      const w = this.table.displayWidth;
      const h = this.table.displayHeight;
      const cy = STAGE.tableY - h * 0.7;
      for (let i = 0; i < 3; i++) {
        const an = this.tableTurn + (i / 3) * Math.PI * 2;
        const front = Math.sin(an) > 0;
        this.stud.fillStyle(front ? 0xe8e8e8 : 0x8a8a8a, 1);
        this.stud.lineStyle(2, 0x141414, 1);
        this.stud.fillCircle(STAGE.tableX + Math.cos(an) * w * 0.44, cy + Math.sin(an) * h * 0.27, front ? 5 : 3.5);
        this.stud.strokeCircle(STAGE.tableX + Math.cos(an) * w * 0.44, cy + Math.sin(an) * h * 0.27, front ? 5 : 3.5);
      }
    }
    // cushions glide up and down (and bob on the first beat of each bar)
    const bar = beat / 3 - Math.floor(beat / 3);
    this.coils.clear();
    for (const c of this.cushions) {
      c.rise += (c.target - c.rise) * Math.min(1, dt * 4);
      const lift = c.rise * 130 + Math.pow(1 - bar, 4) * 4;
      // a raised cushion stands on a big coiled spring (squashing a little on the first beat)
      if (lift > 6) {
        const top = STAGE.floorY + 4 - lift - 6;
        const bottom = STAGE.floorY + 4;
        const turns = 6;
        const w = 34;
        const pts: { x: number; y: number }[] = [];
        for (let k = 0; k <= turns * 12; k++) {
          const f = k / (turns * 12);
          pts.push({ x: c.x + Math.sin(f * turns * Math.PI * 2) * w, y: bottom - (bottom - top) * f });
        }
        this.coils.lineStyle(9, 0x141414, 1);
        this.coils.strokePoints(pts);
        this.coils.lineStyle(4.5, 0xb8b8b8, 1);
        this.coils.strokePoints(pts);
      }
      // the picture bobs to the waltz; the top you stand on only moves when it is raised or
      // lowered, and takes Tick with it (a platform moving under his feet would drop him)
      c.img.setY(STAGE.floorY + 4 - lift);
      const top = STAGE.floorY + 4 - c.img.displayHeight + 18 - c.rise * 130;
      if (rider && rider.onGround && Math.abs(rider.y - c.solid.y) < 3 && rider.x > c.solid.x - 10 && rider.x < c.solid.x + c.solid.w + 10) rider.y = top;
      c.solid.y = top;
    }
  }
}
