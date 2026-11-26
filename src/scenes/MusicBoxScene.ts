// Miss Pirouette's music box, as a stage to look at and walk around in while her duel is built:
// the arena, her dancing through her repertoire on the turntable (and in the mirror), a brass
// note flying from her hand, and Tick to move about (← → Z) and hop onto the velvet cushions.
// `?stage=pirouette`, or from the test stage.

import Phaser from 'phaser';
import { sfx } from '../audio/Sfx';
import { Game } from '../core/Game';
import { Input } from '../core/Input';
import { Pirouette, type DancerPose } from '../entities/Pirouette';
import { Player } from '../entities/Player';
import { addFilm } from '../fx/FilmPipeline';
import { MusicBoxStage, STAGE } from '../world/MusicBox';
import { SolidWorld } from '../world/Solids';

/** A waltz: about 100 beats a minute, three to a bar. */
const BPM = 100;
const SHOW: DancerPose[] = ['stance', 'sing', 'twirl', 'throw', 'fouette', 'arabesque', 'titter', 'windUp', 'curtsy'];

export class MusicBoxScene extends Phaser.Scene {
  private world!: SolidWorld;
  private stage!: MusicBoxStage;
  private dancer!: Pirouette;
  private tick!: Player;
  private input2!: Input;
  private t0 = 0;
  private lastBeat = -1;
  private notes: { img: Phaser.GameObjects.Image; from: { x: number; y: number }; t0: number; dur: number }[] = [];

  constructor() {
    super('MusicBox');
  }

  create(): void {
    this.world = new SolidWorld();
    this.world.add({ x: -100, y: STAGE.floorY, w: 1480, h: 200, active: true });
    this.stage = new MusicBoxStage(this, this.world);
    this.dancer = new Pirouette(this);
    this.dancer.size = 0.58;
    this.dancer.x = STAGE.tableX;
    this.dancer.groundY = STAGE.danceY;
    this.tick = new Player(this, 330, STAGE.floorY, Game.config.player);
    this.input2 = new Input(this, Game.controls);
    addFilm(this, 'bw1928');
    this.add
      .text(640, 700, 'MISS PIROUETTE  ·  the music box (preview)   ← → move · Z jump · Esc back', { fontFamily: 'Limelight, Georgia, serif', fontSize: '18px', color: '#f4efe4', stroke: '#141414', strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(100);
    this.t0 = this.time.now;
  }

  update(time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 1 / 20);
    const t = (time - this.t0) / 1000;
    const beat = t * (BPM / 60);
    const i = this.input2;
    i.update();
    if (i.consume('pause') !== null) {
      this.scene.start('Test');
      return;
    }
    // Tick
    const jump = i.consume('jump');
    this.tick.update(
      dt,
      { dir: (i.isDown('right') ? 1 : 0) - (i.isDown('left') ? 1 : 0), jumpPressed: jump !== null, jumpHeld: i.isDown('jump'), dashPressed: i.consume('dash') !== null, jumpMultiplier: 1, dashBonusMs: 0 },
      { world: this.world, baseSpeed: 0, autoRun: false, minX: 90, maxX: 1190, allowFlip: true },
    );
    this.tick.draw(dt, t, beat, 0);

    // her show: a new number every two bars; she faces Tick
    const pose = SHOW[Math.floor(beat / 6) % SHOW.length];
    const d = this.dancer;
    d.dir = this.tick.x < d.x ? -1 : 1;
    if (pose !== d.pose && pose === 'throw') this.notes.push({ img: this.add.image(0, 0, 'art:tex:mbNote').setDepth(45).setScale(0.32), from: { x: 0, y: 0 }, t0: beat + 1, dur: 1.5 });
    d.pose = pose;
    d.mouth = pose === 'sing' ? Math.max(0, Math.sin(beat * Math.PI)) * 0.9 : 0;
    d.lookTarget = { x: this.tick.x, y: this.tick.y - 60 };
    d.update(dt, t, beat);
    const r = this.stage.reflection;
    if (r) {
      r.pose = d.pose;
      r.mouth = d.mouth;
      r.dir = d.dir;
      r.update(dt, t, beat);
    }
    // the box plays: a tooth of the comb on every beat
    const whole = Math.floor(beat);
    if (whole !== this.lastBeat) {
      this.lastBeat = whole;
      this.stage.pluck(STAGE.comb.x0 + Math.random() * (STAGE.comb.x1 - STAGE.comb.x0), t);
      if (whole % 3 === 0) sfx('tick');
    }
    this.stage.update(dt, t, beat, pose === 'twirl' || pose === 'fouette' ? 6 : pose === 'stance' ? 0.9 : 0);
    // the cushions rise and sink in turn, every four bars
    const phase = Math.floor(beat / 12) % 3;
    this.stage.setCushion(0, phase === 1 ? 1 : 0);
    this.stage.setCushion(1, phase === 2 ? 1 : 0);

    // a brass note flies from her hand to Tick in an arc, spinning
    this.notes = this.notes.filter((n) => {
      if (beat < n.t0) {
        n.img.setVisible(false);
        n.from = d.handPos(d.dir < 0 ? 0 : 1);
        return true;
      }
      const f = (beat - n.t0) / n.dur;
      if (f >= 1) {
        n.img.destroy();
        return false;
      }
      const to = { x: this.tick.x, y: this.tick.y - 50 };
      n.img.setVisible(true).setPosition(n.from.x + (to.x - n.from.x) * f, n.from.y + (to.y - n.from.y) * f - Math.sin(f * Math.PI) * 120).setRotation(f * 6);
      return true;
    });
  }
}
