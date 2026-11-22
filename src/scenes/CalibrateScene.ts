// CALIBRATE: two quick tests that measure this machine's latency.
//
//  1. Picture & sound: a ball bounces on every metronome click. The player
//     shifts the picture (←/→) until the ball lands exactly on the click.
//     → audioOffsetMs (the same value the Conductor uses to delay visuals).
//  2. Keys: the player taps along to the clicks without visual cues. The median
//     timing error, measured exactly like ChaseScene.judge(), becomes
//     → inputOffsetMs.
//
// Results are saved in the browser and added on top of game.json (Game.setOffsets).

import Phaser from 'phaser';
import { AudioEngine } from '../audio/AudioEngine';
import { sfx } from '../audio/Sfx';
import * as S from '../audio/Synth';
import { clampOffset } from '../core/Calibration';
import { Conductor } from '../core/Conductor';
import { Game } from '../core/Game';
import { Input } from '../core/Input';
import { Player } from '../entities/Player';
import { addFilm, type FilmPipeline } from '../fx/FilmPipeline';

type Step = 'sync' | 'tap' | 'result';

const BPM = 100;
const COUNT_IN = 4;
const TAPS_WANTED = 16;
const MIN_TAPS = 8;
/** Taps further than this from a click are ignored (missed / double taps). */
const MAX_TAP_ERROR_MS = 220;
/** Beats after the count-in before the tap test gives up. */
const TAP_TIMEOUT_BEATS = 28;
const SCALE_MS = 200;
const SCALE_X0 = 340;
const SCALE_X1 = 940;
const SCALE_Y = 400;

const INK = 0x141414;
const PAPER = 0xf4efe4;
const BALL_X = 640;
const BALL_FLOOR = 430;
const BALL_R = 26;

const TITLE_FONT = 'Rye, Georgia, serif';
const BODY_FONT = 'Limelight, Georgia, serif';

export class CalibrateScene extends Phaser.Scene {
  private conductor!: Conductor;
  private input2!: Input;
  private film: FilmPipeline | null = null;
  private tick!: Player;
  private step: Step = 'sync';
  private nextClick = 0;

  // working values (effective offsets, game.json included)
  private audioMs = 0;
  private inputMs = 0;

  // sync step: hold ←/→ to repeat
  private holdDir = 0;
  private holdT = 0;
  private repeatAcc = 0;

  // tap step
  private tapStart = 0;
  private taps: number[] = [];
  private spread = 0;
  private resultReadyAt = 0;
  /** scene time of the latest jump press during the tap test */
  private lastTapAt = 0;

  // display
  private gfx!: Phaser.GameObjects.Graphics;
  private scaleLabels: Phaser.GameObjects.Text[] = [];
  private stepText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private bigText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private leaving = false;

  constructor() {
    super('Calibrate');
  }

  create(): void {
    this.leaving = false;
    this.taps = [];
    this.scaleLabels = [];
    this.audioMs = Game.audioOffsetMs;
    this.inputMs = Game.inputOffsetMs;
    this.cameras.main.setBackgroundColor('#1b1a17');

    const frame = this.add.graphics().setDepth(1);
    frame.lineStyle(6, PAPER, 1);
    frame.strokeRoundedRect(40, 30, 1200, 660, 34);
    frame.lineStyle(2, PAPER, 1);
    frame.strokeRoundedRect(54, 44, 1172, 632, 26);
    this.add.text(640, 86, 'TUNING THE PROJECTOR', this.style(TITLE_FONT, 50, 9)).setOrigin(0.5).setDepth(5);
    this.stepText = this.add.text(640, 140, '', this.style(BODY_FONT, 26, 5, '#cfc8b8')).setOrigin(0.5).setDepth(5);
    this.infoText = this.add.text(640, 196, '', { ...this.style(BODY_FONT, 24, 5), align: 'center' }).setOrigin(0.5, 0).setDepth(5);
    this.bigText = this.add.text(640, 520, '', { ...this.style(TITLE_FONT, 46, 8), align: 'center' }).setOrigin(0.5).setDepth(5);
    this.hintText = this.add.text(640, 640, '', { ...this.style(BODY_FONT, 20, 4, '#cfc8b8'), align: 'center' }).setOrigin(0.5).setDepth(5);

    this.gfx = this.add.graphics().setDepth(4);
    const st = this.style(BODY_FONT, 22, 4, '#cfc8b8');
    this.scaleLabels = [
      this.add.text(SCALE_X0, SCALE_Y + 44, 'EARLY', st).setOrigin(0.5, 0).setDepth(5),
      this.add.text((SCALE_X0 + SCALE_X1) / 2, SCALE_Y + 44, 'ON THE CLICK', st).setOrigin(0.5, 0).setDepth(5),
      this.add.text(SCALE_X1, SCALE_Y + 44, 'LATE', st).setOrigin(0.5, 0).setDepth(5),
    ];
    this.tick = new Player(this, 250, 600, Game.config.player);
    this.film = addFilm(this, 'bw1928');
    this.input2 = new Input(this, Game.controls);

    const kb = this.input.keyboard;
    const reset = (): void => {
      if (this.step !== 'sync') return;
      this.setAudio(Game.config.audioOffsetMs);
      sfx('click');
    };
    kb?.on('keydown-ZERO', reset);
    kb?.on('keydown-NUMPAD_ZERO', reset);
    kb?.on('keydown-R', () => {
      if (this.step === 'result') this.startTap();
    });
    kb?.on('keydown-BACKSPACE', () => {
      if (this.step === 'tap' || this.step === 'result') this.startSync();
    });

    this.conductor = new Conductor([{ beat: 0, bpm: BPM }], 4);
    this.conductor.offsetSec = this.audioMs / 1000;
    this.conductor.start(0, 0.3);
    this.nextClick = 0;
    this.events.once('shutdown', () => this.conductor.stop());
    this.startSync();
  }

  private style(font: string, size: number, stroke: number, color = '#f4efe4'): Phaser.Types.GameObjects.Text.TextStyle {
    return { fontFamily: font, fontSize: `${size}px`, color, stroke: '#141414', strokeThickness: stroke };
  }

  // ───────────────────────── steps ─────────────────────────

  private layout(step: Step): void {
    this.step = step;
    this.scaleLabels.forEach((l) => l.setVisible(step !== 'sync'));
    this.bigText.setY(step === 'result' ? 552 : 525);
  }

  private startSync(): void {
    this.layout('sync');
    this.input2.clear();
    this.stepText.setText('STEP 1 OF 2  ·  PICTURE & SOUND');
    this.infoText.setText('Watch the ball and listen to the click.\nPress ← / → until the ball lands exactly ON the click.');
    this.hintText.setText('SHIFT + ←/→ fine steps  ·  0 reset  ·  ENTER next  ·  ESC back to the title');
    this.refreshSync();
  }

  private startTap(): void {
    this.layout('tap');
    this.input2.clear();
    this.taps = [];
    this.tapStart = Math.ceil(this.conductor.beat) + 1;
    this.stepText.setText('STEP 2 OF 2  ·  KEYS');
    this.infoText.setText('Tap JUMP (Space / Z / pad A) on every click.\nNo pictures this time: just listen. Closing your eyes helps!');
    this.hintText.setText('BACKSPACE back to step 1  ·  ESC back to the title');
  }

  private finishTap(): void {
    this.layout('result');
    this.input2.clear();
    this.resultReadyAt = this.time.now + 600;
    if (this.taps.length < MIN_TAPS) {
      this.infoText.setText(`Only ${this.taps.length} taps were close enough to a click.`);
      this.bigText.setText('LET\'S TRY AGAIN');
      this.hintText.setText('R try again  ·  BACKSPACE back to step 1  ·  ESC back to the title');
      return;
    }
    // median, then the mean of the taps near it (robust against stray taps)
    const sorted = [...this.taps].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const near = sorted.filter((v) => Math.abs(v - median) <= 80);
    const mean = near.reduce((a, b) => a + b, 0) / near.length;
    this.spread = Math.sqrt(near.reduce((a, b) => a + (b - mean) ** 2, 0) / near.length);
    this.inputMs = clampOffset(mean);
    const verdict = this.spread <= 25 ? 'Rock steady!' : this.spread <= 45 ? 'Nice and steady.' : 'A little shaky: try again (R) for a better reading.';
    this.infoText.setText(`Steadiness ±${Math.round(this.spread)} ms  ·  ${verdict}`);
    this.bigText.setText(`PICTURE DELAY  ${fmt(this.audioMs)}\nKEY DELAY  ${fmt(this.inputMs)}`);
    this.hintText.setText('ENTER save  ·  R tap again  ·  BACKSPACE back to step 1  ·  ESC cancel');
  }

  private save(): void {
    this.leaving = true;
    Game.setOffsets(this.audioMs, this.inputMs);
    sfx('select');
    this.infoText.setText('');
    this.bigText.setText('SAVED!');
    this.hintText.setText('');
    this.cameras.main.fadeOut(500, 11, 11, 11);
    this.time.delayedCall(520, () => this.scene.start('Title', { select: 'calibrate' }));
  }

  private back(): void {
    this.leaving = true;
    sfx('select');
    this.cameras.main.fadeOut(300, 11, 11, 11);
    this.time.delayedCall(320, () => this.scene.start('Title', { select: 'calibrate' }));
  }

  // ───────────────────────── frame ─────────────────────────

  update(_t: number, delta: number): void {
    const dt = Math.min(delta / 1000, 1 / 30);
    const time = this.time.now / 1000;
    this.input2.update();
    this.scheduleClicks();
    const beat = this.conductor.beat;
    const ph = beat - Math.floor(beat);

    this.gfx.clear();
    this.tick.gfx.setVisible(this.step === 'sync');
    if (this.film) this.film.flash = this.step === 'sync' && beat >= 0 ? Math.max(0, 1 - ph * 6) * 0.25 : 0;

    if (this.step === 'sync') {
      this.tick.dance(beat);
      this.tick.draw(dt, time, beat, 0);
      this.drawBall(beat);
    } else {
      this.drawScale();
    }

    if (this.leaving) return;
    if (this.input2.consume('pause') !== null) {
      this.back();
      return;
    }
    if (this.step === 'sync') this.updateSync(dt);
    else if (this.step === 'tap') this.updateTap(beat);
    else this.updateResult();
  }

  private updateResult(): void {
    // Space/Z/pad A are both jump and confirm: a player still tapping along must
    // not save by accident, so presses that keep the rhythm going are ignored.
    const now = this.time.now;
    const tap = this.input2.consume('jump');
    if (tap !== null && now - this.lastTapAt < 1000) {
      this.input2.consume('confirm');
      this.lastTapAt = now;
      return;
    }
    const ok = this.input2.consume('confirm');
    if (ok !== null && now >= this.resultReadyAt && this.taps.length >= MIN_TAPS) this.save();
  }

  private scheduleClicks(): void {
    const ctx = AudioEngine.get().ctx;
    for (;;) {
      const t = this.conductor.ctxTimeOfBeat(this.nextClick);
      if (t > ctx.currentTime + 0.15) break;
      if (t >= ctx.currentTime) {
        const countIn = this.step === 'tap' && this.nextClick >= this.tapStart && this.nextClick < this.tapStart + COUNT_IN;
        S.woodblock(AudioEngine.get().sfx, t, countIn ? 88 : this.nextClick % 4 === 0 ? 81 : 74);
      }
      this.nextClick++;
    }
  }

  private updateSync(dt: number): void {
    const fine = this.input2.isDown('dash');
    const stepMs = fine ? 1 : 5;
    if (this.input2.consume('right') !== null) this.setAudio(this.audioMs + stepMs);
    if (this.input2.consume('left') !== null) this.setAudio(this.audioMs - stepMs);
    const dir = (this.input2.isDown('right') ? 1 : 0) - (this.input2.isDown('left') ? 1 : 0);
    if (dir !== 0 && dir === this.holdDir) {
      this.holdT += dt;
      if (this.holdT > 0.4) {
        this.repeatAcc += dt;
        while (this.repeatAcc >= 0.05) {
          this.repeatAcc -= 0.05;
          this.setAudio(this.audioMs + dir * stepMs);
        }
      }
    } else {
      this.holdDir = dir;
      this.holdT = 0;
      this.repeatAcc = 0;
    }
    this.input2.consume('jump'); // Space is both jump and confirm: don't queue jumps
    if (this.input2.consume('confirm') !== null) {
      sfx('select');
      this.startTap();
    }
  }

  private updateTap(beat: number): void {
    this.input2.consume('confirm'); // Space/Enter double as confirm; only jump counts
    const rel = beat - this.tapStart;
    if (rel < 0) this.bigText.setText('GET READY...');
    else if (rel < COUNT_IN) this.bigText.setText(String(COUNT_IN - Math.floor(rel)));
    else this.bigText.setText(`TAP!   ${this.taps.length} / ${TAPS_WANTED}`);

    const t = this.input2.consume('jump');
    if (t !== null) this.lastTapAt = this.time.now;
    if (t !== null && rel >= COUNT_IN - 0.5) {
      // same maths as ChaseScene.judge(), with no input offset applied
      const b = this.conductor.beatAtCtxTime(t, 0);
      const errMs = (b - Math.round(b)) * this.conductor.secondsPerBeat(b) * 1000;
      if (Math.abs(errMs) <= MAX_TAP_ERROR_MS && Math.round(b) >= this.tapStart + COUNT_IN) this.taps.push(errMs);
    }
    if (this.taps.length >= TAPS_WANTED || rel > COUNT_IN + TAP_TIMEOUT_BEATS) this.finishTap();
  }

  private setAudio(ms: number): void {
    this.audioMs = clampOffset(ms);
    this.conductor.offsetSec = this.audioMs / 1000;
    this.refreshSync();
  }

  private refreshSync(): void {
    const dir = this.audioMs > 0 ? '(picture waits for the sound)' : this.audioMs < 0 ? '(picture runs ahead of the sound)' : '';
    this.bigText.setText(`PICTURE DELAY  ${fmt(this.audioMs)}`);
    this.hintText.setText(
      `${dir ? dir + '\n' : ''}SHIFT + ←/→ fine steps  ·  0 reset  ·  ENTER next  ·  ESC back to the title`,
    );
  }

  // ───────────────────────── drawing ─────────────────────────

  /** A bouncing ball that touches the floor exactly on every beat. */
  private drawBall(beat: number): void {
    const g = this.gfx;
    const ph = beat - Math.floor(beat);
    const h = beat < 0 ? 0 : 4 * ph * (1 - ph) * 150;
    const impact = beat < 0 ? 0 : Math.max(0, 1 - ph * 7);
    const sq = 1 - impact * 0.35;
    const y = BALL_FLOOR - BALL_R * sq - h;

    // floor + impact lines
    g.lineStyle(5, PAPER, 1);
    g.lineBetween(BALL_X - 150, BALL_FLOOR, BALL_X + 150, BALL_FLOOR);
    if (impact > 0) {
      g.lineStyle(4, PAPER, impact);
      for (const s of [-1, 1]) {
        g.lineBetween(BALL_X + s * 48, BALL_FLOOR - 10, BALL_X + s * (66 + impact * 20), BALL_FLOOR - 26 - impact * 10);
        g.lineBetween(BALL_X + s * 52, BALL_FLOOR - 2, BALL_X + s * (80 + impact * 22), BALL_FLOOR - 4);
      }
    }
    // shadow
    g.fillStyle(0x000000, 0.35 + impact * 0.2);
    g.fillEllipse(BALL_X, BALL_FLOOR + 6, 70 - h * 0.2, 12);
    // ball
    const rx = BALL_R / Math.sqrt(sq);
    const ry = BALL_R * sq;
    g.fillStyle(PAPER, 1);
    g.fillEllipse(BALL_X, y, rx * 2, ry * 2);
    g.lineStyle(5, INK, 1);
    g.strokeEllipse(BALL_X, y, rx * 2, ry * 2);
    g.fillStyle(0xffffff, 0.9);
    g.fillEllipse(BALL_X - rx * 0.35, y - ry * 0.4, rx * 0.5, ry * 0.35);
  }

  /** Early/late ruler with a mark for every tap. */
  private drawScale(): void {
    const g = this.gfx;
    const x0 = SCALE_X0;
    const x1 = SCALE_X1;
    const y = SCALE_Y;
    const xOf = (ms: number): number => x0 + ((Phaser.Math.Clamp(ms, -SCALE_MS, SCALE_MS) + SCALE_MS) / (2 * SCALE_MS)) * (x1 - x0);
    g.lineStyle(4, PAPER, 1);
    g.lineBetween(x0, y, x1, y);
    for (let ms = -SCALE_MS; ms <= SCALE_MS; ms += 50) {
      const big = ms === 0;
      g.lineStyle(big ? 5 : 3, PAPER, big ? 1 : 0.6);
      g.lineBetween(xOf(ms), y - (big ? 26 : 12), xOf(ms), y + (big ? 26 : 12));
    }
    this.taps.forEach((ms, i) => {
      const fresh = i === this.taps.length - 1;
      g.fillStyle(fresh ? 0xffffff : 0xcfc8b8, fresh ? 1 : 0.75);
      g.fillCircle(xOf(ms), y - 44, fresh ? 9 : 7);
      g.lineStyle(3, INK, 1);
      g.strokeCircle(xOf(ms), y - 44, fresh ? 9 : 7);
    });
    if (this.step === 'result' && this.taps.length >= MIN_TAPS) {
      g.lineStyle(4, 0xffffff, 1);
      g.lineBetween(xOf(this.inputMs), y - 70, xOf(this.inputMs), y + 34);
    }
  }
}

function fmt(ms: number): string {
  return `${ms > 0 ? '+' : ms < 0 ? '-' : ''}${Math.abs(ms)} ms`;
}
