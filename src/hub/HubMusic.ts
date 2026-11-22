// The Bijou's theatre organ (MAIN.md §6.1): a melancholy waltz that starts as a
// single trembling melody in an empty cinema and gains an instrument for every
// boss that got their ending. The loneliness can be heard.

import { AudioEngine } from '../audio/AudioEngine';
import { chordTones, parseChord } from '../audio/chords';
import * as S from '../audio/Synth';
import { Conductor } from '../core/Conductor';

export const HUB_BPM = 92;
const BPB = 3;
const KEY = 'A';
// A minor waltz, 16 bars
const CHORDS = ['i', 'iv', 'V7', 'i', 'VI', 'iv', 'V7', 'V7', 'i', 'iv', 'V7', 'i', 'VI', 'II7', 'V7', 'i'];
// melody: [bar, beat, midi, length in beats]
const MELODY: [number, number, number, number][] = [
  [0, 0, 76, 2], [0, 2, 72, 1], [1, 0, 74, 2], [1, 2, 77, 1], [2, 0, 76, 1.5], [2, 1.5, 74, 0.5], [2, 2, 71, 1], [3, 0, 69, 3],
  [4, 0, 72, 2], [4, 2, 76, 1], [5, 0, 74, 2], [5, 2, 72, 1], [6, 0, 71, 2], [6, 2, 68, 1], [7, 0, 71, 3],
  [8, 0, 76, 2], [8, 2, 72, 1], [9, 0, 74, 2], [9, 2, 77, 1], [10, 0, 76, 1], [10, 1, 79, 1], [10, 2, 76, 1], [11, 0, 81, 3],
  [12, 0, 79, 2], [12, 2, 77, 1], [13, 0, 76, 1], [13, 1, 74, 1], [13, 2, 72, 1], [14, 0, 71, 2], [14, 2, 68, 1], [15, 0, 69, 3],
];

interface Note {
  beat: number;
  fire: (t: number, out: AudioNode) => void;
}

export class HubMusic {
  readonly conductor = new Conductor([{ beat: 0, bpm: HUB_BPM }], BPB);
  private out: GainNode;
  private notes: Note[] = [];
  private idx = 0;
  private loop = 0;
  private timer: number | null = null;
  readonly lengthBeats = CHORDS.length * BPB;

  /** `friends`: how many bosses are sitting in the Bijou; `gifts`: their instruments. */
  constructor(friends: number, gifts: string[]) {
    const e = AudioEngine.get();
    this.out = e.ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(e.music);
    this.out.gain.setTargetAtTime(1, e.ctx.currentTime, 0.4);
    this.build(friends, gifts);
  }

  private build(friends: number, gifts: string[]): void {
    const lonely = friends === 0;
    const p = (beat: number, fire: Note['fire']): void => {
      this.notes.push({ beat, fire });
    };
    for (const [bar, b, midi, len] of MELODY) {
      const beat = bar * BPB + b;
      // alone, the organ trembles and plays an octave lower, softly
      p(beat, (t, o) => S.organ(o, t, lonely ? midi - 12 : midi, len * 0.62, lonely ? 0.5 : 0.42, lonely ? 1 : 0.2));
    }
    if (friends >= 1) {
      CHORDS.forEach((c, bar) => {
        const chord = parseChord(c, KEY);
        const tones = chordTones(chord, 55, 66).slice(0, 3);
        p(bar * BPB, (t, o) => tones.forEach((n) => S.organ(o, t, n, 1.8, 0.2, 0.1)));
        p(bar * BPB, (t, o) => S.tuba(o, t, chord.root - 12, 0.5, 0.45));
        p(bar * BPB + 1, (t, o) => tones.forEach((n) => S.piano(o, t, n + 12, 0.15, 0.18)));
        p(bar * BPB + 2, (t, o) => tones.forEach((n) => S.piano(o, t, n + 12, 0.15, 0.18)));
      });
    }
    if (gifts.includes('train')) {
      // Old Smokestack's gift: a soft chugga-chugga under the waltz
      for (let b = 0; b < this.lengthBeats; b++) {
        p(b, (t, o) => S.chuff(o, t, b % BPB === 0));
        p(b + 0.5, (t, o) => S.chuff(o, t, false));
      }
    }
    this.notes.sort((a, b) => a.beat - b.beat);
  }

  start(): void {
    const ctx = AudioEngine.get().ctx;
    this.conductor.start(0, 0.3);
    this.idx = 0;
    this.loop = 0;
    const tick = (): void => {
      const horizon = ctx.currentTime + 0.15;
      for (;;) {
        if (this.idx >= this.notes.length) {
          this.idx = 0;
          this.loop++;
        }
        const n = this.notes[this.idx];
        const beat = n.beat + this.loop * this.lengthBeats;
        const t = this.conductor.ctxTimeOfBeat(beat);
        if (t > horizon) break;
        if (t >= ctx.currentTime - 0.02) n.fire(Math.max(t, ctx.currentTime), this.out);
        this.idx++;
      }
    };
    tick();
    this.timer = window.setInterval(tick, 25);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    const ctx = AudioEngine.get().ctx;
    this.out.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    const o = this.out;
    window.setTimeout(() => o.disconnect(), 900);
  }

  get beat(): number {
    return this.conductor.beat;
  }
}
