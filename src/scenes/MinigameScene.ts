// Small tap-on-the-beat games inside the Bijou (MAIN.md §6.2):
//   thread  — threading the projector, the ritual before each boss (once per reel)
//   popcorn — catch the popcorn as it pops on the beat
//   tickets — stamp the tickets as they slide past
// Popcorn and tickets give film frames (two thresholds, once each).

import Phaser from 'phaser';
import { AudioEngine } from '../audio/AudioEngine';
import { sfx } from '../audio/Sfx';
import * as S from '../audio/Synth';
import { Conductor } from '../core/Conductor';
import { Game } from '../core/Game';
import { Input } from '../core/Input';
import { addFrame } from '../core/Save';
import { Player } from '../entities/Player';
import { addFilm } from '../fx/FilmPipeline';
import { INK, Ink, PAPER } from '../rig/Ink';

type Kind = 'thread' | 'popcorn' | 'tickets';

interface Prompt {
  beat: number;
  result: '' | 'PERFECT!' | 'GOOD' | 'MISS';
}

const COUNT_IN = 4;
const INFO: Record<Kind, { title: string; how: string; bpm: () => number; pattern: number[]; need: number }> = {
  thread: {
    title: 'THREAD THE PROJECTOR',
    how: 'Press JUMP on every beat to hook the film onto each sprocket.',
    bpm: () => Game.levels[Game.chapter.feature]?.song.tempoMap[0].bpm ?? 120,
    pattern: [1, 1, 1, 1, 1, 1, 1, 1],
    need: 6,
  },
  popcorn: {
    title: 'POPCORN!',
    how: 'The kernels pop on the beat: press JUMP to catch each one in the bag.',
    bpm: () => 112,
    pattern: [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0],
    need: 8,
  },
  tickets: {
    title: 'ADMIT ONE',
    how: 'Stamp every ticket as it slides under the stamp: press JUMP on the beat.',
    bpm: () => 100,
    pattern: [1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0],
    need: 8,
  },
};

export class MinigameScene extends Phaser.Scene {
  private kind: Kind = 'popcorn';
  private conductor!: Conductor;
  private input2!: Input;
  private prompts: Prompt[] = [];
  private nextClick = 0;
  private g!: Phaser.GameObjects.Graphics;
  private ink!: Ink;
  private big!: Phaser.GameObjects.Text;
  private judge!: Phaser.GameObjects.Text;
  private state: 'intro' | 'play' | 'result' = 'intro';
  private tick!: Player;
  private stamps: number[] = [];
  private caught = 0;

  constructor() {
    super('Minigame');
  }

  init(data: { kind: Kind }): void {
    this.kind = data.kind;
    this.state = 'intro';
    this.stamps = [];
    this.caught = 0;
  }

  create(): void {
    const info = INFO[this.kind];
    this.cameras.main.setBackgroundColor('#1b1a17');
    this.input2 = new Input(this, Game.controls);
    const frame = this.add.graphics().setDepth(1);
    frame.lineStyle(6, PAPER, 1).strokeRoundedRect(40, 30, 1200, 660, 30);
    this.add.text(640, 80, info.title, { fontFamily: 'Rye, Georgia, serif', fontSize: '52px', color: '#f4efe4', stroke: '#141414', strokeThickness: 9 }).setOrigin(0.5).setDepth(5);
    this.add.text(640, 140, info.how, { fontFamily: 'Limelight, Georgia, serif', fontSize: '24px', color: '#cfc8b8', align: 'center', wordWrap: { width: 1000 } }).setOrigin(0.5).setDepth(5);
    this.big = this.add.text(640, 600, 'press JUMP to start', { fontFamily: 'Rye, Georgia, serif', fontSize: '40px', color: '#f4efe4', stroke: '#141414', strokeThickness: 8, align: 'center' }).setOrigin(0.5).setDepth(5);
    this.judge = this.add.text(640, 210, '', { fontFamily: 'Rye, Georgia, serif', fontSize: '34px', color: '#f4efe4', stroke: '#141414', strokeThickness: 7 }).setOrigin(0.5).setDepth(6);
    this.add.text(640, 660, 'ESC  back to the Bijou', { fontFamily: 'Limelight, Georgia, serif', fontSize: '18px', color: '#8a857a' }).setOrigin(0.5).setDepth(5);
    this.g = this.add.graphics().setDepth(3);
    this.ink = new Ink(this.g);
    this.tick = new Player(this, 260, 560, Game.config.player);
    this.tick.gfx.setDepth(4);
    addFilm(this, 'bw1928');
    this.conductor = new Conductor([{ beat: 0, bpm: info.bpm() }], 4);
    this.conductor.offsetSec = Game.audioOffsetMs / 1000;
    this.events.once('shutdown', () => this.conductor.stop());
  }

  private begin(): void {
    const info = INFO[this.kind];
    this.prompts = [];
    info.pattern.forEach((on, i) => {
      if (on) this.prompts.push({ beat: COUNT_IN + i, result: '' });
    });
    this.conductor.start(0, 0.3);
    this.nextClick = 0;
    this.state = 'play';
    this.input2.clear();
  }

  update(_t: number, delta: number): void {
    const dt = Math.min(delta / 1000, 1 / 30);
    const time = this.time.now / 1000;
    this.input2.update();
    if (this.input2.consume('pause') !== null) return this.back(false);
    const beat = this.conductor.isRunning ? this.conductor.beat : 0;

    if (this.state === 'intro') {
      if (this.input2.consume('jump') !== null || this.input2.consume('confirm') !== null) this.begin();
    } else if (this.state === 'play') {
      this.scheduleClicks();
      this.judgeInput();
      for (const p of this.prompts) if (!p.result && beat > p.beat + 0.5) this.mark(p, 'MISS');
      const rel = beat - COUNT_IN;
      this.big.setText(rel < 0 ? String(Math.ceil(-rel)) : '');
      const last = this.prompts[this.prompts.length - 1];
      if (beat > last.beat + 1.5) this.finish();
    } else if (this.input2.consume('confirm') !== null || this.input2.consume('jump') !== null) {
      if (this.success) this.back(true);
      else this.begin();
    }

    this.tick.dance(beat);
    this.tick.draw(dt, time, beat, 0);
    this.draw(beat, time);
  }

  private scheduleClicks(): void {
    const e = AudioEngine.get();
    const last = this.prompts[this.prompts.length - 1].beat + 1;
    for (;;) {
      if (this.nextClick > last) break;
      const t = this.conductor.ctxTimeOfBeat(this.nextClick);
      if (t > e.ctx.currentTime + 0.15) break;
      if (t >= e.ctx.currentTime) {
        S.woodblock(e.sfx, t, this.nextClick < COUNT_IN ? 86 : this.nextClick % 4 === 0 ? 80 : 74);
        if (this.nextClick % 2 === 0) S.tuba(e.music, t, 41 + (this.nextClick % 4 === 0 ? 0 : 7), 0.3, 0.5);
      }
      this.nextClick++;
    }
  }

  private judgeInput(): void {
    const t = this.input2.consume('jump');
    if (t === null) return;
    const b = this.conductor.beatAtCtxTime(t, Game.inputOffsetMs);
    const p = this.prompts.find((q) => !q.result && Math.abs(q.beat - b) <= 0.5);
    if (!p) return;
    const ms = Math.abs(p.beat - b) * this.conductor.secondsPerBeat(b) * 1000;
    const w = Game.diff.hitWindowMs;
    // the minigames are a little more forgiving than the bosses
    this.mark(p, ms <= w.perfect * 1.2 ? 'PERFECT!' : ms <= w.good * 1.4 ? 'GOOD' : 'MISS');
  }

  private mark(p: Prompt, r: Prompt['result']): void {
    p.result = r;
    this.judge.setText(r).setAlpha(1).setScale(1.2);
    this.tweens.add({ targets: this.judge, alpha: 0, scale: 1, duration: 450 });
    if (r === 'MISS') {
      sfx('boing');
      return;
    }
    this.caught++;
    this.stamps.push(p.beat);
    sfx(this.kind === 'popcorn' ? 'pop' : this.kind === 'tickets' ? 'click' : 'land');
  }

  private get hits(): number {
    return this.prompts.filter((p) => p.result === 'PERFECT!' || p.result === 'GOOD').length;
  }

  private get success(): boolean {
    return this.hits >= INFO[this.kind].need;
  }

  private finish(): void {
    this.state = 'result';
    this.conductor.stop();
    const info = INFO[this.kind];
    const n = this.hits;
    let reward = '';
    if (this.kind !== 'thread' && Game.save) {
      const maxFrames = Game.chapter.minigameFrames;
      const earned = (n >= info.need ? 1 : 0) + (n >= this.prompts.length - 1 ? 1 : 0);
      let fresh = 0;
      for (let i = 0; i < Math.min(earned, maxFrames); i++) if (addFrame(Game.save, `${this.kind}:${i}`)) fresh++;
      Game.save.flags.minigames[this.kind] = Math.max(Game.save.flags.minigames[this.kind] ?? 0, n);
      Game.persist();
      reward = fresh ? `\n+${fresh} film frame${fresh > 1 ? 's' : ''}!` : earned ? '\n(frames already collected)' : `\n(${info.need}+ for a film frame)`;
    }
    sfx(this.success ? 'victory' : 'death');
    const head = this.kind === 'thread' ? (this.success ? 'THREADED!' : 'THE FILM SLIPPED!') : `${n} / ${this.prompts.length}`;
    const next = this.success ? 'JUMP / ENTER  back to the Bijou' : 'JUMP / ENTER  try again';
    this.big.setText(`${head}${reward}\n${next}`).setFontSize(34);
  }

  private back(completed: boolean): void {
    this.cameras.main.fadeOut(300, 11, 11, 11);
    this.time.delayedCall(320, () => this.scene.start('Bijou', { from: this.kind, completed }));
  }

  // ───────────────────────── drawing ─────────────────────────

  private draw(beat: number, time: number): void {
    const g = this.g;
    const k = this.ink;
    g.clear();
    k.seed = Math.floor(time * 8) % 3;
    const ph = beat - Math.floor(beat);
    const pulse = Math.pow(1 - ph, 3);
    // the prompts as a strip of beats: past ones show the result
    this.prompts.forEach((p, i) => {
      const x = 640 + (p.beat - beat) * 120;
      if (x < 80 || x > 1200) return;
      const col = p.result === 'MISS' ? 0x8a2f2a : p.result ? PAPER : 0x8a8478;
      k.circle(x, 260, p.result ? 12 : 16, col, 3);
      void i;
    });
    g.lineStyle(4, PAPER, 1).lineBetween(640, 236, 640, 284);

    if (this.kind === 'thread') this.drawThread(beat, pulse);
    else if (this.kind === 'popcorn') this.drawPopcorn(beat, pulse);
    else this.drawTickets(beat, pulse);
  }

  private drawThread(beat: number, pulse: number): void {
    const k = this.ink;
    const g = this.g;
    const wheels = [[520, 360], [640, 420], [760, 360], [880, 440], [760, 520], [640, 470], [520, 530], [400, 460]];
    const done = this.prompts.filter((p) => p.result && p.result !== 'MISS').length;
    // film path so far
    g.lineStyle(10, 0x2a2a2a, 1);
    for (let i = 0; i < Math.min(done, wheels.length - 1); i++) g.lineBetween(wheels[i][0], wheels[i][1], wheels[i + 1][0], wheels[i + 1][1]);
    wheels.forEach(([x, y], i) => {
      const current = this.state === 'play' && Math.floor(beat) - COUNT_IN === i;
      k.circle(x, y, 26 + (current ? pulse * 6 : 0), i < done ? PAPER : 0x5a5650, 4);
      for (let t = 0; t < 4; t++) {
        const a = beat * Math.PI * 0.5 + (t / 4) * Math.PI * 2;
        g.fillStyle(INK, 1).fillCircle(x + Math.cos(a) * 18, y + Math.sin(a) * 18, 4);
      }
    });
    k.rrect(960, 330, 120, 220, 12, 0x2c2c2c, 4);
    k.circle(1020, 380, 30, 0x3a3a3a, 4);
    k.circle(1020, 490, 30, 0x3a3a3a, 4);
  }

  private drawPopcorn(beat: number, pulse: number): void {
    const k = this.ink;
    const g = this.g;
    k.rrect(546, 480, 188, 90, 8, 0x8a2f2a, 4, PAPER);
    k.rrect(560, 320, 160, 170, 10, 0x2e2c28, 5, PAPER);
    k.rrect(550, 300, 180, 26, 8, 0x8a2f2a, 4, PAPER);
    k.ellipse(640, 470, 60, 14, 0x5a5650, 4);
    for (const p of this.prompts) {
      const d = beat - (p.beat - 0.5);
      if (d < 0 || d > 1.2 || p.result === 'MISS') continue;
      const x = 640 + Math.sin(p.beat * 2.3) * 40;
      const y = 460 - Math.sin(Math.min(1, d) * Math.PI) * 120;
      k.cloud(x, y, 12, 0xf4ecc8);
    }
    // the bag in Tick's hands, filling up
    k.poly([{ x: 330, y: 470 }, { x: 410, y: 470 }, { x: 398, y: 560 }, { x: 342, y: 560 }], PAPER, 4);
    g.fillStyle(0x8a2f2a, 1).fillRect(348, 500, 44, 10);
    for (let i = 0; i < Math.min(this.caught, 16); i++) k.cloud(342 + (i % 4) * 18, 466 - Math.floor(i / 4) * 12 - pulse * 2, 9, 0xf4ecc8);
  }

  private drawTickets(beat: number, pulse: number): void {
    const k = this.ink;
    const g = this.g;
    k.rrect(420, 470, 640, 30, 6, 0x5a5650, 4);
    // tickets slide right to left and pass under the stamp at x=640 on their beat
    for (const p of this.prompts) {
      const x = 640 + (p.beat - beat) * 180;
      if (x < 380 || x > 1100) continue;
      k.rrect(x - 50, 430, 100, 40, 4, 0xe8e1d0, 3);
      g.lineStyle(2, INK, 1).lineBetween(x - 30, 436, x - 30, 464);
      if (p.result && p.result !== 'MISS') k.circle(x + 10, 450, 13, null, 3);
    }
    // the stamp comes down on every beat
    const down = Math.max(0, 1 - (beat - Math.floor(beat)) * 4);
    const sy = 360 + down * 60;
    k.line(640, 300, 640, sy, 10, 0x3b2f26);
    k.rrect(610, sy, 60, 28, 6, 0x8a2f2a, 4);
    void pulse;
  }
}
