// Sing-along subtitles with the bouncing ball: the ball hops from word to word
// exactly on the syllables, so the lyrics double as a metronome.

import Phaser from 'phaser';
import type { ExpandedLine, LyricWord } from '../core/lyrics';

interface LineView {
  line: ExpandedLine;
  container: Phaser.GameObjects.Container;
  words: { word: LyricWord; text: Phaser.GameObjects.Text; cx: number; top: number }[];
}

const SUNG = '#f4efe4';
const UNSUNG = '#9c968a';

export class LyricsUI {
  private views: LineView[] = [];
  private ball: Phaser.GameObjects.Image;
  private ballShadow: Phaser.GameObjects.Ellipse;
  private band: Phaser.GameObjects.Graphics;

  /** `fixed`: stay on screen when the camera scrolls (platform levels). */
  constructor(private scene: Phaser.Scene, private lines: ExpandedLine[], private y: number, private fixed = false) {
    this.band = scene.add.graphics().setDepth(89);
    this.ball = scene.add.image(-100, -100, 'ball_0').setDepth(91);
    this.ballShadow = scene.add.ellipse(-100, -100, 18, 5, 0x000000, 0.4).setDepth(90);
    if (fixed) for (const o of [this.band, this.ball, this.ballShadow]) o.setScrollFactor(0);
  }

  private build(line: ExpandedLine): LineView {
    const c = this.scene.add.container(640, this.y).setDepth(90);
    if (this.fixed) c.setScrollFactor(0, 0, true);
    const items: LineView['words'] = [];
    let x = 0;
    const gap = 12;
    for (const w of line.words) {
      if (w.shout && items.length) x += 8;
      const t = this.scene.add
        .text(x, 0, w.text, {
          fontFamily: w.shout ? 'Rye, Georgia, serif' : 'Limelight, Georgia, serif',
          fontSize: w.shout ? '34px' : '28px',
          color: UNSUNG,
          stroke: '#141414',
          strokeThickness: w.shout ? 8 : 6,
        })
        .setOrigin(0, 0.5);
      items.push({ word: w, text: t, cx: 0, top: 0 });
      c.add(t);
      x += t.width + gap + (w.shout ? 8 : 0);
    }
    const total = x - gap;
    c.setData('fit', Math.min(1, 1180 / total));
    c.setData('width', total);
    for (const it of items) {
      it.text.x -= total / 2;
      it.cx = it.text.x + it.text.width / 2;
      it.top = -it.text.height / 2;
    }
    return { line, container: c, words: items };
  }

  private hidden = false;

  /** Silence solos hide the sing-along: only Tick's pendulum keeps the beat. */
  setHidden(h: boolean): void {
    if (h === this.hidden) return;
    this.hidden = h;
    const a = h ? 0 : 1;
    this.scene.tweens.add({ targets: [this.band, this.ball, this.ballShadow, ...this.views.map((v) => v.container)], alpha: a, duration: 200 });
  }

  update(beat: number, time: number): void {
    // which lines should be visible: current (sung) line + the upcoming one
    const visible = this.lines.filter((l) => beat >= l.beat - 2.5 && beat <= l.end + 0.6);
    for (const v of [...this.views]) {
      if (!visible.includes(v.line)) {
        v.container.destroy();
        this.views.splice(this.views.indexOf(v), 1);
      }
    }
    for (const l of visible) if (!this.views.find((v) => v.line === l)) this.views.push(this.build(l));
    this.views.sort((a, b) => a.line.beat - b.line.beat);

    // layout: active line big at y, next line smaller below
    let ballSet = false;
    this.band.clear();
    this.views.forEach((v, i) => {
      const active = i === 0;
      const targetY = active ? this.y : this.y + 46;
      if (active) {
        const w = (v.container.getData('width') as number) * (v.container.getData('fit') as number) + 48;
        const fadeIn = Phaser.Math.Clamp((beat - (v.line.beat - 2.5)) / 0.5, 0, 1);
        const fadeOut = beat > v.line.end ? Math.max(0, 1 - (beat - v.line.end) / 0.6) : 1;
        this.band.fillStyle(0x0b0b0b, 0.55 * fadeIn * fadeOut);
        this.band.fillRoundedRect(640 - w / 2, v.container.y - 26, w, 52, 18);
      }
      v.container.y += (targetY - v.container.y) * 0.25;
      v.container.setScale((active ? 1 : 0.72) * (v.container.getData('fit') as number));
      v.container.setAlpha(active ? 1 : 0.75);
      const fadeOut = beat > v.line.end ? 1 - (beat - v.line.end) / 0.6 : 1;
      v.container.setAlpha(v.container.alpha * Math.max(0, fadeOut));

      for (const it of v.words) {
        const sung = beat >= it.word.beat;
        it.text.setColor(sung ? SUNG : UNSUNG);
        if (it.word.shout && sung && beat < it.word.end + 0.5) {
          it.text.setScale(1.06 + Math.sin(time * 40) * 0.04);
          it.text.setAngle(Math.sin(time * 30) * 3);
        } else {
          it.text.setScale(1);
          it.text.setAngle(0);
        }
      }

      if (active && !ballSet && beat >= v.line.beat - 1 && beat <= v.line.end + 0.3) {
        ballSet = true;
        this.placeBall(v, beat);
      }
    });
    if (!ballSet) {
      this.ball.setVisible(false);
      this.ballShadow.setVisible(false);
    }
  }

  private placeBall(v: LineView, beat: number): void {
    const s = v.container.scale;
    const ws = v.words;
    let x: number;
    let y: number;
    const baseTop = (ws[0]?.top ?? -18) * s - 6;
    if (beat < ws[0].word.beat) {
      // entering from the left
      const f = Phaser.Math.Clamp(beat - (ws[0].word.beat - 1), 0, 1);
      const fromX = ws[0].cx - 120;
      x = fromX + (ws[0].cx - fromX) * f;
      y = baseTop - Math.sin(f * Math.PI) * 50;
    } else {
      let i = ws.length - 1;
      for (let k = 0; k < ws.length - 1; k++) if (beat < ws[k + 1].word.beat) { i = k; break; }
      const a = ws[i];
      const b = ws[i + 1];
      if (b) {
        const f = (beat - a.word.beat) / Math.max(0.01, b.word.beat - a.word.beat);
        x = a.cx + (b.cx - a.cx) * f;
        const h = Phaser.Math.Clamp(18 + Math.abs(b.cx - a.cx) * 0.25, 18, 60);
        y = baseTop - Math.sin(f * Math.PI) * h;
      } else {
        const f = Phaser.Math.Clamp(beat - a.word.beat, 0, 1);
        x = a.cx + f * 30;
        y = baseTop - Math.sin(Math.min(1, f) * Math.PI) * 24;
      }
    }
    const sx = v.container.x + x * s;
    const sy = v.container.y + y;
    this.ball.setVisible(true).setPosition(sx, sy - 12);
    this.ballShadow.setVisible(true).setPosition(sx, v.container.y + baseTop + 4);
    this.ball.setTexture(`ball_${Math.floor(this.scene.time.now / 125) % 3}`);
  }

  /** Current mouth openness for the singer (0..1). */
  static mouthAt(lines: ExpandedLine[], beat: number): { open: number; shout: boolean; index: number; word: string; f: number } {
    for (const l of lines) {
      if (beat < l.beat - 0.1 || beat > l.end + 0.1) continue;
      for (let i = 0; i < l.words.length; i++) {
        const w = l.words[i];
        if (beat >= w.beat && beat <= w.end) {
          const f = (beat - w.beat) / Math.max(0.05, w.end - w.beat);
          return { open: w.shout ? 1 : 1 - f * 0.7, shout: w.shout, index: i, word: w.text, f };
        }
      }
    }
    return { open: 0, shout: false, index: -1, word: '', f: 0 };
  }
}
