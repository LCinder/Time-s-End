// Song sources: either a real audio file (the final song) or the procedural
// placeholder band that follows the same BPM, structure and lyrics.

import { AudioEngine } from './AudioEngine';
import { chordTones, parseChord, type Chord } from './chords';
import * as S from './Synth';
import type { Conductor } from '../core/Conductor';
import type { ExpandedLine, LyricWord } from '../core/lyrics';
import { hashString, rng } from '../core/lyrics';
import type { PlaceholderMusic } from '../core/types';

export interface SongSource {
  start(fromBeat: number): void;
  stop(): void;
  /** Placeholder songs include their own "singer"; real files already have vocals. */
  readonly hasVoice: boolean;
}

// ───────────────────────── Real audio file ─────────────────────────

export class FileSong implements SongSource {
  readonly hasVoice = true;
  private src: AudioBufferSourceNode | null = null;
  private out: GainNode;

  constructor(private buffer: AudioBuffer, private conductor: Conductor, private offsetMs: number) {
    const e = AudioEngine.get();
    this.out = e.ctx.createGain();
    this.out.connect(e.music);
  }

  static async load(url: string): Promise<AudioBuffer> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.arrayBuffer();
    return AudioEngine.get().ctx.decodeAudioData(data);
  }

  start(fromBeat: number): void {
    const e = AudioEngine.get();
    this.src = e.ctx.createBufferSource();
    this.src.buffer = this.buffer;
    this.src.connect(this.out);
    const fileTime = this.conductor.beatToSec(fromBeat) + this.offsetMs / 1000;
    const when = this.conductor.ctxTimeOfBeat(fromBeat);
    if (fileTime >= 0) this.src.start(when, fileTime);
    else this.src.start(when - fileTime, 0);
  }

  stop(): void {
    const src = this.src;
    this.src = null;
    if (!src) return;
    const ctx = AudioEngine.get().ctx;
    this.out.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    try {
      src.stop(ctx.currentTime + 0.3);
    } catch {
      /* already stopped */
    }
  }
}

// ───────────────────────── Placeholder band ─────────────────────────

interface TimedNote {
  beat: number;
  fire: (t: number, music: AudioNode, voice: AudioNode) => void;
}

interface BarInfo {
  start: number;
  chord: Chord;
  section: PlaceholderMusic['sections'][number];
  index: number;
}

export class PlaceholderSong implements SongSource {
  readonly hasVoice = true;
  private notes: TimedNote[] = [];
  private bars: BarInfo[] = [];
  private idx = 0;
  private timer: number | null = null;
  private music: GainNode;
  private voice: GainNode;

  constructor(
    private conductor: Conductor,
    spec: PlaceholderMusic,
    lines: ExpandedLine[],
    private beatsPerBar: number,
    opts: { voice: boolean } = { voice: true },
  ) {
    const e = AudioEngine.get();
    this.music = e.ctx.createGain();
    this.music.connect(e.music);
    this.voice = e.ctx.createGain();
    this.voice.connect(e.voice);
    this.build(spec, lines, opts.voice);
  }

  /** Total length in beats of the arrangement. */
  get lengthBeats(): number {
    return this.bars.length * this.beatsPerBar;
  }

  private build(spec: PlaceholderMusic, lines: ExpandedLine[], withVoice: boolean): void {
    const bpb = this.beatsPerBar;
    const sw = spec.swing;
    let beat = 0;
    let barIndex = 0;
    for (const section of spec.sections) {
      for (let i = 0; i < section.bars; i++) {
        const chord = parseChord(section.chords[i % section.chords.length], spec.key);
        this.bars.push({ start: beat, chord, section, index: barIndex });
        beat += bpb;
        barIndex++;
      }
    }

    const allWords: LyricWord[] = lines.flatMap((l) => l.words);
    const wordBars = new Set(allWords.map((w) => Math.floor(w.beat / bpb)));
    const p = (beatPos: number, fire: TimedNote['fire']): void => {
      this.notes.push({ beat: beatPos, fire });
    };

    for (const bar of this.bars) {
      const { start: B, chord, section } = bar;
      const intensity = section.intensity ?? 2;
      const dark = section.mood === 'dark';
      const bass = chord.root - 12;
      const pah = chordTones(chord, 58, 70).slice(0, 4);

      for (let b = 0; b < bpb; b++) {
        const t = B + b;
        const strong = b % 2 === 0;
        if (strong) {
          const n = b === 0 ? bass : bass + 7 > 47 ? bass - 5 : bass + 7;
          p(t, (tt, m) => S.tuba(m, tt, n, dark ? 0.8 : 0.35, dark ? 0.5 : 0.7));
          if (!dark) p(t, (tt, m) => S.piano(m, tt, n + 12, 0.25, 0.35));
          if (intensity >= 2 && !dark) p(t, (tt, m) => S.kick(m, tt, 0.5));
        } else {
          p(t, (tt, m) => pah.forEach((n) => S.piano(m, tt, n, 0.2, dark ? 0.22 : 0.4)));
          if (intensity >= 2) p(t, (tt, m) => S.brush(m, tt, dark ? 0.25 : 0.5));
        }
        if (intensity >= 3) {
          p(t, (tt, m) => S.hat(m, tt, 0.3));
          p(t + sw, (tt, m) => S.hat(m, tt, 0.18));
        }
        if (section.train) {
          p(t, (tt, m) => S.chuff(m, tt, true));
          p(t + sw, (tt, m) => S.chuff(m, tt, false));
        }
      }

      // Instrumental clarinet riff in bars without singing
      const barNo = Math.floor(B / bpb);
      if (!wordBars.has(barNo) && !dark && intensity >= 1) {
        const r = rng(hashString(`riff${bar.index}${section.name}`));
        const tones = chordTones(chord, 67, 84);
        let ti = Math.floor(r() * tones.length);
        for (let e8 = 0; e8 < bpb * 2; e8++) {
          if (r() < 0.28) continue;
          ti = Math.max(0, Math.min(tones.length - 1, ti + Math.floor(r() * 3) - 1));
          const n = tones[ti];
          const pos = B + Math.floor(e8 / 2) + (e8 % 2 ? sw : 0);
          p(pos, (tt, m) => S.clarinet(m, tt, n, 0.22, 0.5));
        }
      }
    }

    // Final chord
    const last = this.bars[this.bars.length - 1];
    if (last) {
      const endBeat = last.start + bpb;
      const tones = chordTones(parseChord('I', spec.key), 55, 72);
      p(endBeat, (tt, m) => {
        tones.forEach((n) => S.piano(m, tt, n, 2, 0.6));
        S.tuba(m, tt, parseChord('I', spec.key).root - 12, 1.5, 0.8);
      });
    }

    // The "singer"
    if (withVoice) {
      for (const line of lines) {
        const r = rng(hashString(line.words.map((w) => w.text).join(' ')));
        let prev = 69;
        line.words.forEach((w, i) => {
          const chord = this.chordAt(w.beat);
          const tones = chordTones(chord, 62, 79);
          let n: number;
          if (w.shout) {
            n = tones[tones.length - 1 - Math.floor(r() * 2)];
          } else if (i === line.words.length - 1) {
            const stable = tones.filter((x) => (x - chord.root) % 12 === 0 || (x - chord.root) % 12 === chord.intervals[1]);
            n = nearest(stable.length ? stable : tones, prev);
          } else {
            const sorted = [...tones].sort((a, b) => Math.abs(a - prev) - Math.abs(b - prev));
            n = sorted[Math.min(sorted.length - 1, Math.floor(r() * 3))];
          }
          prev = n;
          const spb = this.conductor.secondsPerBeat(w.beat);
          const dur = Math.max(0.08, (w.end - w.beat) * spb);
          p(w.beat, (tt, _m, v) => S.wahVoice(v, tt, n, dur, w.shout));
          if (w.shout) {
            p(w.beat, (tt, m) => {
              S.crash(m, tt, 0.6);
              chordTones(chord, 48, 72).forEach((x) => S.piano(m, tt, x, 0.3, 0.7));
            });
          }
        });
      }
    }

    this.notes.sort((a, b) => a.beat - b.beat);
  }

  chordAt(beat: number): Chord {
    const i = Math.max(0, Math.min(this.bars.length - 1, Math.floor(beat / this.beatsPerBar)));
    return this.bars[i]?.chord ?? parseChord('I', 'C');
  }

  start(fromBeat: number): void {
    this.idx = this.notes.findIndex((n) => n.beat >= fromBeat - 0.001);
    if (this.idx < 0) this.idx = this.notes.length;
    const ctx = AudioEngine.get().ctx;
    const tick = (): void => {
      const horizon = ctx.currentTime + 0.15;
      while (this.idx < this.notes.length) {
        const n = this.notes[this.idx];
        const t = this.conductor.ctxTimeOfBeat(n.beat);
        if (t > horizon) break;
        if (t >= ctx.currentTime - 0.02) n.fire(Math.max(t, ctx.currentTime), this.music, this.voice);
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
    for (const g of [this.music, this.voice]) {
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
      const gg = g;
      window.setTimeout(() => gg.disconnect(), 400);
    }
  }
}

function nearest(list: number[], target: number): number {
  return list.reduce((best, x) => (Math.abs(x - target) < Math.abs(best - target) ? x : best), list[0]);
}
