// Small rhythm games inside the Bijou (MAIN.md §6.2):
//   thread  — threading the projector, the ritual before each boss (once per reel)
//   popcorn — call & response: the machine pops a rhythm, you catch the same one
//   tickets — stamp the tickets as they slide past, to ever busier rhythms
// Every hit plays the next note of a little tune, so a good run *sounds* good;
// a miss leaves a hole in the melody. Notes scroll past on a strip of film.

import Phaser from 'phaser';
import { AudioEngine } from '../audio/AudioEngine';
import { sfx } from '../audio/Sfx';
import { PlaceholderSong } from '../audio/Songs';
import * as S from '../audio/Synth';
import { Conductor } from '../core/Conductor';
import { Game } from '../core/Game';
import { Input } from '../core/Input';
import { addFrame } from '../core/Save';
import type { PlaceholderMusic } from '../core/types';
import { Player } from '../entities/Player';
import { addFilm } from '../fx/FilmPipeline';
import { INK, Ink, PAPER } from '../rig/Ink';

type Kind = 'thread' | 'popcorn' | 'tickets';
type Result = '' | 'PERFECT!' | 'GOOD' | 'MISS';

interface Note {
  beat: number;
  /** Shown and played by the machine (call), or for the player (response). */
  demo: boolean;
  result: Result;
  /** Melody note this hit plays. */
  midi: number;
}

interface Spec {
  title: string;
  how: string;
  bpm: () => number;
  /** One string per bar: 8 eighth notes, x = note. Pairs of [call, response] when callResponse. */
  bars: string[];
  callResponse: boolean;
  melody: number[];
  voice: (out: AudioNode, t: number, midi: number) => void;
  music: PlaceholderMusic;
  /** Fraction of hits needed to pass. */
  pass: number;
}

const COUNT_IN = 4;

const SPECS: Record<Kind, Spec> = {
  thread: {
    title: 'THREAD THE PROJECTOR',
    how: 'Hook the film onto each sprocket: press JUMP when a hole reaches the gate.',
    bpm: () => Game.levels[Game.chapter.feature]?.song.tempoMap[0].bpm ?? 120,
    bars: ['x.x.x.x.', 'x.x.xx.x', 'x.xx.xx.', 'xxx.x.x.'],
    callResponse: false,
    melody: [64, 67, 71, 76, 74, 71, 67, 71, 76, 79, 76, 74, 71, 74, 76, 83],
    voice: (o, t, m) => S.piano(o, t, m, 0.3, 0.55),
    music: { key: 'E', swing: 0.5, sections: [{ name: 'a', bars: 6, chords: ['i', 'iv', 'V7', 'i', 'VI', 'V7'], intensity: 2, train: true }] },
    pass: 0.7,
  },
  popcorn: {
    title: 'POPCORN!',
    how: 'LISTEN to the machine pop a rhythm... then catch the same rhythm: press JUMP on every pop!',
    bpm: () => 116,
    bars: ['x.x.x.x.', 'x.x.x.x.', 'x.x.xx..', 'x.x.xx..', 'xx..xx..', 'xx..xx..', 'x.xx.xx.', 'x.xx.xx.', 'x.x.xxxx', 'x.x.xxxx'],
    callResponse: true,
    melody: [72, 74, 77, 79, 81, 79, 77, 74, 72, 77, 81, 84, 81, 79, 77, 76, 74, 77, 79, 81, 84, 86, 84, 89],
    voice: (o, t, m) => S.clarinet(o, t, m, 0.22, 0.6),
    music: { key: 'F', swing: 0.5, sections: [{ name: 'a', bars: 12, chords: ['I', 'vi', 'ii', 'V7'], intensity: 2 }] },
    pass: 0.6,
  },
  tickets: {
    title: 'ADMIT ONE',
    how: 'Stamp each ticket as it slides under the stamp: press JUMP on the beat. The queue gets busier!',
    bpm: () => 108,
    bars: ['x...x...', 'x.x.x...', 'x.x.x.x.', 'xx..xx..', 'x.xx.xx.', 'x..x..x.', 'xx.xx.xx', 'x.x.xxx.'],
    callResponse: false,
    melody: [67, 71, 74, 79, 78, 74, 71, 74, 76, 79, 83, 81, 79, 76, 74, 71, 72, 76, 79, 84, 83, 79, 76, 74, 79, 83, 86, 91],
    voice: (o, t, m) => S.organ(o, t, m, 0.3, 0.5, 0.1),
    music: { key: 'G', swing: 0.5, sections: [{ name: 'a', bars: 10, chords: ['I', 'IV', 'V7', 'I', 'vi', 'II7', 'V7', 'I'], intensity: 3 }] },
    pass: 0.6,
  },
};

export class MinigameScene extends Phaser.Scene {
  private kind: Kind = 'popcorn';
  private spec!: Spec;
  private conductor!: Conductor;
  private song: PlaceholderSong | null = null;
  private input2!: Input;
  private notes: Note[] = [];
  private nextDemo = 0;
  private combo = 0;
  private best = 0;
  private g!: Phaser.GameObjects.Graphics;
  private ink!: Ink;
  private big!: Phaser.GameObjects.Text;
  private judge!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private phase!: Phaser.GameObjects.Text;
  private state: 'intro' | 'play' | 'result' = 'intro';
  private tick!: Player;
  private bonk = 0;
  private flyers: { x: number; y: number; vx: number; vy: number; t: number; kind: 'pop' | 'ticket' | 'crumple' }[] = [];
  private lastLabel = '';

  constructor() {
    super('Minigame');
  }

  init(data: { kind: Kind }): void {
    this.kind = data.kind;
    this.spec = SPECS[this.kind];
    this.state = 'intro';
    this.flyers = [];
    this.song = null;
  }

  create(): void {
    const sp = this.spec;
    this.cameras.main.setBackgroundColor('#1b1a17');
    this.input2 = new Input(this, Game.controls);
    const frame = this.add.graphics().setDepth(1);
    frame.lineStyle(6, PAPER, 1).strokeRoundedRect(40, 30, 1200, 660, 30);
    this.add.text(640, 76, sp.title, { fontFamily: 'Rye, Georgia, serif', fontSize: '50px', color: '#f4efe4', stroke: '#141414', strokeThickness: 9 }).setOrigin(0.5).setDepth(5);
    this.big = this.add.text(640, 560, `${sp.how}\n\npress JUMP to start`, { fontFamily: 'Limelight, Georgia, serif', fontSize: '26px', color: '#f4efe4', stroke: '#141414', strokeThickness: 6, align: 'center', wordWrap: { width: 1000 } }).setOrigin(0.5).setDepth(8);
    this.phase = this.add.text(640, 136, '', { fontFamily: 'Rye, Georgia, serif', fontSize: '30px', color: '#cfc8b8', stroke: '#141414', strokeThickness: 6 }).setOrigin(0.5).setDepth(6);
    this.judge = this.add.text(380, 300, '', { fontFamily: 'Rye, Georgia, serif', fontSize: '30px', color: '#f4efe4', stroke: '#141414', strokeThickness: 7 }).setOrigin(0.5).setDepth(9);
    this.comboText = this.add.text(1180, 136, '', { fontFamily: 'Rye, Georgia, serif', fontSize: '26px', color: '#f4efe4', stroke: '#141414', strokeThickness: 6 }).setOrigin(1, 0.5).setDepth(6);
    this.add.text(640, 668, 'ESC  back to the Bijou', { fontFamily: 'Limelight, Georgia, serif', fontSize: '17px', color: '#8a857a' }).setOrigin(0.5).setDepth(5);
    this.g = this.add.graphics().setDepth(3);
    this.ink = new Ink(this.g);
    this.tick = new Player(this, 250, 600, Game.config.player);
    this.tick.gfx.setDepth(4);
    addFilm(this, 'bw1928');
    this.conductor = new Conductor([{ beat: 0, bpm: sp.bpm() }], 4);
    this.conductor.offsetSec = Game.audioOffsetMs / 1000;
    this.events.once('shutdown', () => {
      this.song?.stop();
      this.conductor.stop();
    });
  }

  private buildChart(): void {
    const sp = this.spec;
    this.notes = [];
    let m = 0;
    sp.bars.forEach((bar, b) => {
      const demo = sp.callResponse && b % 2 === 0;
      if (sp.callResponse && !demo) m -= [...bar].filter((c) => c === 'x').length; // the answer replays the call's tune
      [...bar].forEach((c, e) => {
        if (c !== 'x') return;
        this.notes.push({ beat: COUNT_IN + b * 4 + e / 2, demo, result: '', midi: sp.melody[m++ % sp.melody.length] });
      });
    });
  }

  private begin(): void {
    this.buildChart();
    this.nextDemo = 0;
    this.combo = 0;
    this.best = 0;
    this.big.setText('');
    this.song?.stop();
    this.song = new PlaceholderSong(this.conductor, this.spec.music, [], 4, { voice: false });
    this.conductor.start(0, 0.3);
    this.song.start(0);
    this.state = 'play';
    this.input2.clear();
  }

  update(_t: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.1);
    const time = this.time.now / 1000;
    this.input2.update();
    if (this.input2.consume('pause') !== null) return this.back(false);
    const beat = this.conductor.isRunning ? this.conductor.beat : 0;

    if (this.state === 'intro') {
      if (this.input2.consume('jump') !== null || this.input2.consume('confirm') !== null) this.begin();
    } else if (this.state === 'play') {
      this.playDemo();
      this.judgeInput();
      for (const n of this.notes) if (!n.demo && !n.result && beat > n.beat + 0.4) this.mark(n, 'MISS');
      this.updatePhase(beat);
      const last = this.notes[this.notes.length - 1];
      if (beat > last.beat + 1.5) this.finish();
    } else if (this.input2.consume('confirm') !== null || this.input2.consume('jump') !== null) {
      if (this.passed) this.back(true);
      else this.begin();
    }

    this.bonk = Math.max(0, this.bonk - dt * 3);
    this.tick.dance(beat);
    this.tick.gfx.setY(600 + this.bonk * 14);
    this.tick.draw(dt, time, beat, 0);
    this.draw(beat, time, dt);
  }

  /** The machine plays the call notes itself (sound + animation), on time. */
  private playDemo(): void {
    const e = AudioEngine.get();
    while (this.nextDemo < this.notes.length) {
      const n = this.notes[this.nextDemo];
      if (!n.demo) {
        this.nextDemo++;
        continue;
      }
      const t = this.conductor.ctxTimeOfBeat(n.beat);
      if (t > e.ctx.currentTime + 0.12) break;
      this.spec.voice(e.music, Math.max(t, e.ctx.currentTime), n.midi);
      S.pop(e.sfx, Math.max(t, e.ctx.currentTime));
      n.result = 'GOOD';
      this.nextDemo++;
    }
  }

  private updatePhase(beat: number): void {
    const sp = this.spec;
    const rel = beat - COUNT_IN;
    let label = '';
    if (rel < 0) label = rel < -2 ? 'READY...' : 'GO!';
    else if (sp.callResponse) label = Math.floor(rel / 4) % 2 === 0 ? 'LISTEN...' : 'YOUR TURN!';
    else label = Math.floor(rel / 4) >= sp.bars.length - 2 ? 'FASTER!' : '';
    if (label !== this.lastLabel) {
      this.lastLabel = label;
      this.phase.setText(label).setScale(1.3);
      this.tweens.add({ targets: this.phase, scale: 1, duration: 250 });
      if (label === 'YOUR TURN!') sfx('select');
    }
  }

  private judgeInput(): void {
    const t = this.input2.consume('jump');
    if (t === null) return;
    const b = this.conductor.beatAtCtxTime(t, Game.inputOffsetMs);
    const n = this.notes.find((q) => !q.demo && !q.result && Math.abs(q.beat - b) <= 0.35);
    if (!n) {
      sfx('boing'); // a press with nothing to catch
      this.combo = 0;
      return;
    }
    const ms = Math.abs(n.beat - b) * this.conductor.secondsPerBeat(b) * 1000;
    const w = Game.diff.hitWindowMs;
    this.mark(n, ms <= w.perfect * 1.2 ? 'PERFECT!' : ms <= w.good * 1.4 ? 'GOOD' : 'MISS', t);
  }

  private mark(n: Note, r: Result, at?: number): void {
    n.result = r;
    this.judge.setText(r).setAlpha(1).setScale(1.25);
    this.tweens.add({ targets: this.judge, alpha: 0, scale: 1, duration: 420 });
    const e = AudioEngine.get();
    if (r === 'MISS') {
      this.combo = 0;
      this.bonk = 1;
      sfx(this.kind === 'popcorn' ? 'hit' : 'boing');
      this.flyers.push({ x: 640, y: 440, vx: -220, vy: -300, t: 0, kind: this.kind === 'popcorn' ? 'pop' : 'crumple' });
    } else {
      this.combo++;
      this.best = Math.max(this.best, this.combo);
      // the hit plays the tune; the combo makes a little ding that climbs
      this.spec.voice(e.music, Math.max(at ?? e.ctx.currentTime, e.ctx.currentTime), n.midi);
      S.ding(e.sfx, e.ctx.currentTime, 84 + Math.min(16, this.combo));
      if (this.kind === 'popcorn') this.flyers.push({ x: 640, y: 420, vx: -330, vy: -420, t: 0, kind: 'pop' });
      if (this.kind === 'tickets') this.flyers.push({ x: 640, y: 450, vx: 380, vy: -360, t: 0, kind: 'ticket' });
      if (this.kind === 'thread') sfx('click');
    }
    this.comboText.setText(this.combo >= 3 ? `COMBO x${this.combo}` : '');
  }

  private get playNotes(): Note[] {
    return this.notes.filter((n) => !n.demo);
  }

  private get score(): number {
    const p = this.playNotes;
    const pts = p.reduce((s, n) => s + (n.result === 'PERFECT!' ? 1 : n.result === 'GOOD' ? 0.7 : 0), 0);
    return p.length ? pts / p.length : 0;
  }

  private get passed(): boolean {
    return this.score >= this.spec.pass;
  }

  private finish(): void {
    this.state = 'result';
    this.song?.stop();
    this.conductor.stop();
    const sc = this.score;
    const rank = sc >= 0.95 ? 'S' : sc >= 0.85 ? 'A' : sc >= 0.7 ? 'B' : 'C';
    let reward = '';
    if (this.kind !== 'thread' && Game.save) {
      const earned = sc >= 0.85 ? 2 : sc >= this.spec.pass ? 1 : 0;
      let fresh = 0;
      for (let i = 0; i < Math.min(earned, Game.chapter.minigameFrames); i++) if (addFrame(Game.save, `${this.kind}:${i}`)) fresh++;
      Game.save.flags.minigames[this.kind] = Math.max(Game.save.flags.minigames[this.kind] ?? 0, Math.round(sc * 100));
      Game.persist();
      reward = fresh ? `+${fresh} film frame${fresh > 1 ? 's' : ''}!` : earned ? '(frames already collected)' : 'rank B for a film frame, A for two';
    }
    sfx(this.passed ? 'victory' : 'death');
    const head = this.kind === 'thread' ? (this.passed ? 'THREADED!' : 'THE FILM SLIPPED!') : `RANK ${rank}`;
    const next = this.passed ? 'JUMP / ENTER  back to the Bijou' : 'JUMP / ENTER  try again';
    this.phase.setText('');
    this.big.setText(`${head}   ·   ${Math.round(sc * 100)}%   ·   best combo ${this.best}\n${reward}\n${next}`).setFontFamily('Rye, Georgia, serif').setFontSize(30);
  }

  private back(completed: boolean): void {
    this.cameras.main.fadeOut(300, 11, 11, 11);
    this.time.delayedCall(320, () => this.scene.start('Bijou', { from: this.kind, completed }));
  }

  // ───────────────────────── drawing ─────────────────────────

  private draw(beat: number, time: number, dt: number): void {
    const g = this.g;
    const k = this.ink;
    g.clear();
    k.seed = Math.floor(time * 8) % 3;
    const pulse = Math.pow(1 - (beat - Math.floor(beat)), 3);

    // the strip of film: notes scroll towards the gate (x = 380)
    const y0 = 214;
    g.fillStyle(0x141414, 1).fillRect(60, y0, 1160, 70);
    g.fillStyle(PAPER, 0.5);
    const off = ((beat * 60) % 30 + 30) % 30;
    for (let x = 60 - off; x < 1220; x += 30) {
      g.fillRect(x, y0 + 4, 12, 8);
      g.fillRect(x, y0 + 58, 12, 8);
    }
    g.lineStyle(5, PAPER, 1).lineBetween(380, y0 - 8, 380, y0 + 78);
    for (const n of this.notes) {
      const x = 380 + (n.beat - beat) * 160;
      if (x < 70 || x > 1210) continue;
      const done = n.result && !n.demo;
      const col = n.result === 'MISS' ? 0x8a2f2a : n.demo ? 0x8a8478 : done ? 0x5a5650 : PAPER;
      const r = n.demo ? 12 : 16 + (Math.abs(n.beat - beat) < 0.25 ? pulse * 4 : 0);
      if (this.kind === 'popcorn') k.cloud(x, y0 + 35, r * 0.8, col);
      else if (this.kind === 'tickets') k.rrect(x - r, y0 + 35 - r * 0.6, r * 2, r * 1.2, 3, col, 3);
      else k.circle(x, y0 + 35, r, col, 3);
    }

    if (this.kind === 'thread') this.drawThread(beat, pulse);
    else if (this.kind === 'popcorn') this.drawPopcorn(beat);
    else this.drawTickets(beat);

    // things flying: popcorn into the bag (or onto Tick's head), stamped tickets, crumpled ones
    this.flyers = this.flyers.filter((f) => {
      f.t += dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vy += 900 * dt;
      if (f.kind === 'pop') k.cloud(f.x, f.y, 11, 0xf4ecc8);
      else if (f.kind === 'ticket') k.rrect(f.x - 30, f.y - 14, 60, 28, 3, 0xe8e1d0, 3);
      else k.circle(f.x, f.y, 12, 0xbdb6a8, 3);
      return f.t < 1.2 && f.y < 760;
    });
  }

  private drawThread(beat: number, pulse: number): void {
    const k = this.ink;
    const g = this.g;
    const wheels = [[520, 380], [640, 440], [760, 380], [880, 460], [760, 530], [640, 490], [520, 540], [430, 470]];
    const done = this.playNotes.filter((n) => n.result === 'PERFECT!' || n.result === 'GOOD').length;
    const seg = Math.min(wheels.length - 1, Math.floor((done / Math.max(1, this.playNotes.length)) * wheels.length));
    g.lineStyle(10, 0x2a2a2a, 1);
    for (let i = 0; i < seg; i++) g.lineBetween(wheels[i][0], wheels[i][1], wheels[i + 1][0], wheels[i + 1][1]);
    wheels.forEach(([x, y], i) => {
      k.circle(x, y, 24 + (i === seg ? pulse * 5 : 0), i <= seg && done > 0 ? PAPER : 0x5a5650, 4);
      for (let t = 0; t < 4; t++) {
        const a = beat * Math.PI * 0.5 + (t / 4) * Math.PI * 2;
        g.fillStyle(INK, 1).fillCircle(x + Math.cos(a) * 16, y + Math.sin(a) * 16, 4);
      }
    });
    k.rrect(960, 350, 120, 220, 12, 0x2c2c2c, 4);
    k.circle(1020, 400, 30, 0x3a3a3a, 4);
    k.circle(1020, 510, 30, 0x3a3a3a, 4);
  }

  private drawPopcorn(beat: number): void {
    const k = this.ink;
    const g = this.g;
    k.rrect(546, 480, 188, 90, 8, 0x8a2f2a, 4, PAPER);
    k.rrect(560, 320, 160, 170, 10, 0x2e2c28, 5, PAPER);
    k.rrect(550, 300, 180, 26, 8, 0x8a2f2a, 4, PAPER);
    // kernels jiggle as a pop approaches, then burst exactly on it
    for (const n of this.notes) {
      const d = n.beat - beat;
      if (d > 0 && d < 1) {
        const j = (1 - d) * 4;
        k.circle(600 + (n.beat * 37) % 80 + Math.sin(beat * 40) * j, 466, 6, 0xd8c98a, 2);
      }
      if (d <= 0 && d > -0.5 && n.demo) k.cloud(640 + Math.sin(n.beat * 3) * 40, 440 + d * 200, 12, 0xf4ecc8);
    }
    // the bag in Tick's hands, filling up with every catch
    const caught = this.playNotes.filter((n) => n.result === 'PERFECT!' || n.result === 'GOOD').length;
    k.poly([{ x: 330, y: 470 }, { x: 410, y: 470 }, { x: 398, y: 560 }, { x: 342, y: 560 }], PAPER, 4);
    g.fillStyle(0x8a2f2a, 1).fillRect(348, 500, 44, 10);
    for (let i = 0; i < Math.min(caught, 20); i++) k.cloud(340 + (i % 4) * 19, 466 - Math.floor(i / 4) * 11, 9, 0xf4ecc8);
  }

  private drawTickets(beat: number): void {
    const k = this.ink;
    const g = this.g;
    k.rrect(420, 470, 640, 30, 6, 0x5a5650, 4);
    for (const n of this.notes) {
      const x = 640 + (n.beat - beat) * 200;
      if (x < 400 || x > 1080 || (n.result && n.result !== 'MISS' && n.beat < beat)) continue;
      k.rrect(x - 46, 432, 92, 38, 4, 0xe8e1d0, 3);
      g.lineStyle(2, INK, 1).lineBetween(x - 26, 438, x - 26, 464);
    }
    // the stamp comes down hard on every hit, and nods on every beat
    const down = Math.max(0, 1 - (beat - Math.floor(beat)) * 5);
    const sy = 350 + down * 70;
    k.line(640, 290, 640, sy, 10, 0x3b2f26);
    k.rrect(608, sy, 64, 30, 6, 0x8a2f2a, 4);
  }
}
