// The Conductor converts between seconds and beats (with tempo changes) and
// exposes the current musical position, derived from the AudioContext clock.

import { AudioEngine } from '../audio/AudioEngine';
import type { TempoPoint } from './types';

interface Segment {
  beat: number;
  sec: number;
  spb: number; // seconds per beat
}

export class Conductor {
  private segments: Segment[] = [];
  /** Song time `anchorSong` plays at scheduler time `anchorCtx`, then advances at `rate`. */
  private anchorCtx = 0;
  private anchorSong = 0;
  private rateValue = 1;
  private running = false;
  private frozenSec = 0;
  /** Extra latency compensation (game.json audioOffsetMs). */
  offsetSec = 0;

  constructor(tempoMap: TempoPoint[], public beatsPerBar = 4) {
    const pts = [...tempoMap].sort((a, b) => a.beat - b.beat);
    let sec = 0;
    pts.forEach((p, i) => {
      if (i > 0) {
        const prev = this.segments[i - 1];
        sec = prev.sec + (p.beat - prev.beat) * prev.spb;
      }
      this.segments.push({ beat: p.beat, sec, spb: 60 / p.bpm });
    });
  }

  beatToSec(beat: number): number {
    let s = this.segments[0];
    for (const seg of this.segments) if (beat >= seg.beat) s = seg;
    return s.sec + (beat - s.beat) * s.spb;
  }

  secToBeat(sec: number): number {
    let s = this.segments[0];
    for (const seg of this.segments) if (sec >= seg.sec) s = seg;
    return s.beat + (sec - s.sec) / s.spb;
  }

  secondsPerBeat(beat: number): number {
    let s = this.segments[0];
    for (const seg of this.segments) if (beat >= seg.beat) s = seg;
    return s.spb;
  }

  /** Schedule the song so that `fromBeat` starts `leadIn` seconds from now. Returns ctx time of beat 0. */
  start(fromBeat: number, leadIn = 0.15): number {
    const ctx = AudioEngine.get().ctx;
    this.anchorCtx = ctx.currentTime + leadIn;
    this.anchorSong = this.beatToSec(fromBeat);
    this.rateValue = 1;
    this.running = true;
    return this.anchorCtx - this.anchorSong;
  }

  /** Playback speed (1 = normal). Changes at scheduler time `atCtx` (default: now). */
  setRate(rate: number, atCtx = AudioEngine.get().ctx.currentTime): void {
    this.anchorSong = this.songAt(atCtx);
    this.anchorCtx = atCtx;
    this.rateValue = rate;
  }

  get rate(): number {
    return this.rateValue;
  }

  /** Song seconds being *scheduled* at scheduler time t. */
  private songAt(t: number): number {
    return this.anchorSong + (t - this.anchorCtx) * this.rateValue;
  }

  stop(): void {
    this.frozenSec = this.songSec;
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** ctx time (scheduler clock) for a given beat. */
  ctxTimeOfBeat(beat: number): number {
    return this.anchorCtx + (this.beatToSec(beat) - this.anchorSong) / this.rateValue;
  }

  /** Song seconds as *heard* (compensating output latency + user offset). */
  get songSec(): number {
    if (!this.running) return this.frozenSec;
    const e = AudioEngine.get();
    return this.songAt(e.ctx.currentTime - e.outputLatency() - this.offsetSec);
  }

  /** Beat that was *heard* at a given ctx time (used to judge key presses). */
  beatAtCtxTime(t: number, inputOffsetMs = 0): number {
    const e = AudioEngine.get();
    return this.secToBeat(this.songAt(t - e.outputLatency() - this.offsetSec - inputOffsetMs / 1000));
  }

  get beat(): number {
    return this.secToBeat(this.songSec);
  }

  /** 0..1 position inside the current beat. */
  get beatPhase(): number {
    const b = this.beat;
    return b - Math.floor(b);
  }
}
