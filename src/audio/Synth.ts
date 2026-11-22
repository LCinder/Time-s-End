// Tiny synthesizers for the placeholder band and the cartoon sound effects.
// Every function schedules sound at an absolute AudioContext time `t`.

import { AudioEngine } from './AudioEngine';

export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

function env(g: GainNode, t: number, peak: number, attack: number, decay: number, sustain = 0, release = 0.05, hold = 0): void {
  const p = g.gain;
  p.cancelScheduledValues(t);
  p.setValueAtTime(0.0001, t);
  p.linearRampToValueAtTime(peak, t + attack);
  p.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), t + attack + decay);
  if (hold > 0) {
    p.setValueAtTime(Math.max(0.0001, sustain || 0.0001), t + attack + decay + hold);
  }
  p.exponentialRampToValueAtTime(0.0001, t + attack + decay + hold + release);
}

function osc(type: OscillatorType, freq: number): OscillatorNode {
  const o = AudioEngine.get().ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  return o;
}

function gain(dest: AudioNode | AudioParam, v = 0): GainNode {
  const g = AudioEngine.get().ctx.createGain();
  g.gain.value = v;
  if (dest instanceof AudioParam) g.connect(dest);
  else g.connect(dest);
  return g;
}

function noiseSrc(): AudioBufferSourceNode {
  const e = AudioEngine.get();
  const s = e.ctx.createBufferSource();
  s.buffer = e.noise;
  return s;
}

function filter(type: BiquadFilterType, freq: number, q = 1): BiquadFilterNode {
  const f = AudioEngine.get().ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

function play(nodes: (OscillatorNode | AudioBufferSourceNode)[], t: number, dur: number): void {
  for (const n of nodes) {
    if (n instanceof AudioBufferSourceNode) n.start(t, Math.random() * 1.5);
    else n.start(t);
    n.stop(t + dur + 0.1);
  }
}

// ───────────────────────── Band instruments ─────────────────────────

/** Honky-tonk piano: two slightly detuned triangles + a click. */
export function piano(dest: AudioNode, t: number, midi: number, dur: number, vel = 0.5): void {
  const f = mtof(midi);
  const g = gain(dest);
  const lp = filter('lowpass', 2400 + vel * 2000);
  lp.connect(g);
  const a = osc('triangle', f * 1.003);
  const b = osc('triangle', f * 0.997);
  const c = osc('sine', f * 2);
  const cg = gain(lp, 0.25);
  a.connect(lp);
  b.connect(lp);
  c.connect(cg);
  env(g, t, vel * 0.32, 0.004, Math.min(1.4, dur + 0.4), 0.0001, 0.05);
  play([a, b, c], t, dur + 0.5);
}

/** Tuba / sousaphone "oom". */
export function tuba(dest: AudioNode, t: number, midi: number, dur: number, vel = 0.6): void {
  const f = mtof(midi);
  const g = gain(dest);
  const lp = filter('lowpass', 520, 2);
  lp.connect(g);
  const a = osc('sawtooth', f);
  const b = osc('square', f * 0.5);
  const bg = gain(lp, 0.35);
  a.connect(lp);
  b.connect(bg);
  env(g, t, vel * 0.42, 0.025, dur * 0.6, vel * 0.18, 0.06, dur * 0.2);
  play([a, b], t, dur + 0.2);
}

/** Clarinet-ish lead for instrumental fills. */
export function clarinet(dest: AudioNode, t: number, midi: number, dur: number, vel = 0.4): void {
  const f = mtof(midi);
  const g = gain(dest);
  const lp = filter('lowpass', 1800, 1);
  lp.connect(g);
  const a = osc('square', f);
  const vib = osc('sine', 5.5);
  const vg = gain(a.frequency, f * 0.008);
  vib.connect(vg);
  a.connect(lp);
  env(g, t, vel * 0.16, 0.03, dur * 0.5, vel * 0.1, 0.05, dur * 0.3);
  play([a, vib], t, dur + 0.1);
}

/** The placeholder "singer": a muted-trumpet wah that follows the lyric syllables. */
export function wahVoice(dest: AudioNode, t: number, midi: number, dur: number, shout = false): void {
  const f = mtof(midi);
  const g = gain(dest);
  const bp = filter('bandpass', 700, shout ? 4 : 6);
  bp.connect(g);
  const a = osc('sawtooth', f);
  const b = osc('sawtooth', f * 1.005);
  const vib = osc('sine', 6);
  const vg = gain(a.frequency, f * (shout ? 0.03 : 0.012));
  vib.connect(vg);
  a.connect(bp);
  b.connect(bp);
  // "wah": the formant opens then closes
  const fq = bp.frequency;
  fq.setValueAtTime(500, t);
  fq.linearRampToValueAtTime(shout ? 2200 : 1500, t + Math.min(0.12, dur * 0.4));
  fq.linearRampToValueAtTime(700, t + dur);
  // slight scoop up into the note, like a crooner
  a.frequency.setValueAtTime(f * 0.94, t);
  a.frequency.linearRampToValueAtTime(f, t + 0.05);
  const peak = shout ? 0.55 : 0.36;
  env(g, t, peak, 0.02, Math.max(0.05, dur * 0.5), peak * 0.6, 0.06, Math.max(0, dur * 0.35));
  play([a, b, vib], t, dur + 0.15);
}

export function kick(dest: AudioNode, t: number, vel = 0.6): void {
  const g = gain(dest);
  const o = osc('sine', 120);
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  o.connect(g);
  env(g, t, vel * 0.7, 0.002, 0.18);
  play([o], t, 0.25);
}

export function brush(dest: AudioNode, t: number, vel = 0.5): void {
  const g = gain(dest);
  const bp = filter('bandpass', 2500, 0.7);
  bp.connect(g);
  const n = noiseSrc();
  n.connect(bp);
  env(g, t, vel * 0.35, 0.01, 0.16);
  play([n], t, 0.2);
}

export function hat(dest: AudioNode, t: number, vel = 0.3): void {
  const g = gain(dest);
  const hp = filter('highpass', 7000);
  hp.connect(g);
  const n = noiseSrc();
  n.connect(hp);
  env(g, t, vel * 0.25, 0.002, 0.05);
  play([n], t, 0.08);
}

/** Steam-engine "chuff" (train percussion). */
export function chuff(dest: AudioNode, t: number, accent = false): void {
  const g = gain(dest);
  const bp = filter('bandpass', accent ? 900 : 1300, 0.9);
  bp.connect(g);
  const n = noiseSrc();
  n.connect(bp);
  env(g, t, accent ? 0.42 : 0.22, 0.008, accent ? 0.14 : 0.08);
  play([n], t, 0.2);
}

// ───────────────────────── Cartoon SFX ─────────────────────────

export function slideWhistle(dest: AudioNode, t: number, up: boolean, dur = 0.22): void {
  const g = gain(dest);
  const o = osc('sine', up ? 500 : 1400);
  o.frequency.setValueAtTime(up ? 500 : 1400, t);
  o.frequency.exponentialRampToValueAtTime(up ? 1500 : 380, t + dur);
  const vib = osc('sine', 9);
  const vg = gain(o.frequency, 18);
  vib.connect(vg);
  o.connect(g);
  env(g, t, 0.28, 0.01, dur, 0.15, 0.05);
  play([o, vib], t, dur + 0.1);
}

export function ding(dest: AudioNode, t: number, pitch = 88): void {
  for (const [m, v] of [[pitch, 0.25], [pitch + 12.02, 0.08], [pitch + 19, 0.05]] as const) {
    const g = gain(dest);
    const o = osc('sine', mtof(m));
    o.connect(g);
    env(g, t, v, 0.002, 0.6);
    play([o], t, 0.7);
  }
}

export function woodblock(dest: AudioNode, t: number, pitch = 76): void {
  const g = gain(dest);
  const bp = filter('bandpass', mtof(pitch), 12);
  bp.connect(g);
  const o = osc('triangle', mtof(pitch));
  o.connect(bp);
  env(g, t, 0.9, 0.001, 0.07);
  play([o], t, 0.1);
}

export function boing(dest: AudioNode, t: number): void {
  const g = gain(dest);
  const o = osc('triangle', 180);
  o.frequency.setValueAtTime(180, t);
  o.frequency.exponentialRampToValueAtTime(420, t + 0.08);
  o.frequency.exponentialRampToValueAtTime(160, t + 0.35);
  const vib = osc('sine', 22);
  const vg = gain(o.frequency, 40);
  vib.connect(vg);
  o.connect(g);
  env(g, t, 0.35, 0.005, 0.4);
  play([o, vib], t, 0.45);
}

export function crash(dest: AudioNode, t: number, size = 1): void {
  const g = gain(dest);
  const lp = filter('lowpass', 2800 / size);
  lp.connect(g);
  const n = noiseSrc();
  n.connect(lp);
  env(g, t, 0.7, 0.003, 0.45 * size);
  const tg = gain(dest);
  const thump = osc('sine', 90 / size);
  thump.frequency.exponentialRampToValueAtTime(35, t + 0.3);
  thump.connect(tg);
  env(tg, t, 0.8, 0.002, 0.35);
  play([n, thump], t, 0.6 * size);
}

export function pianoCrash(dest: AudioNode, t: number): void {
  crash(dest, t, 1.2);
  for (const m of [36, 41, 47, 52, 58, 63, 69, 74]) piano(dest, t + Math.random() * 0.03, m, 1.2, 0.7);
}

export function steamWhistle(dest: AudioNode, t: number, dur = 0.5): void {
  for (const m of [74, 78, 81]) {
    const g = gain(dest);
    const bp = filter('bandpass', mtof(m), 3);
    bp.connect(g);
    const o = osc('sawtooth', mtof(m));
    o.frequency.setValueAtTime(mtof(m) * 0.92, t);
    o.frequency.linearRampToValueAtTime(mtof(m), t + 0.06);
    o.connect(bp);
    const n = noiseSrc();
    const ng = gain(bp, 0.4);
    n.connect(ng);
    env(g, t, 0.3, 0.03, dur * 0.4, 0.2, 0.12, dur * 0.4);
    play([o, n], t, dur + 0.2);
  }
}

export function whoosh(dest: AudioNode, t: number): void {
  const g = gain(dest);
  const bp = filter('bandpass', 600, 1.5);
  bp.frequency.setValueAtTime(400, t);
  bp.frequency.exponentialRampToValueAtTime(3000, t + 0.18);
  bp.connect(g);
  const n = noiseSrc();
  n.connect(bp);
  env(g, t, 0.4, 0.03, 0.18);
  play([n], t, 0.25);
}

export function pop(dest: AudioNode, t: number): void {
  const g = gain(dest);
  const o = osc('sine', 900);
  o.frequency.exponentialRampToValueAtTime(200, t + 0.06);
  o.connect(g);
  env(g, t, 0.3, 0.001, 0.07);
  play([o], t, 0.1);
}

export function bonk(dest: AudioNode, t: number): void {
  woodblock(dest, t, 64);
  slideWhistle(dest, t + 0.03, false, 0.35);
  crash(dest, t, 0.5);
}

export function sadTrombone(dest: AudioNode, t: number): void {
  const notes = [62, 61, 60, 59];
  notes.forEach((m, i) => {
    const st = t + i * 0.42;
    const d = i === 3 ? 1.3 : 0.38;
    const g = gain(dest);
    const lp = filter('lowpass', 1100, 2);
    lp.connect(g);
    const o = osc('sawtooth', mtof(m));
    if (i === 3) {
      const vib = osc('sine', 5);
      const vg = gain(o.frequency, 6);
      vib.connect(vg);
      play([vib], st, d);
    }
    o.connect(lp);
    env(g, st, 0.4, 0.04, d * 0.4, 0.25, 0.1, d * 0.5);
    play([o], st, d + 0.2);
  });
}

export function fanfare(dest: AudioNode, t: number): void {
  const seq: [number, number, number][] = [
    [67, 0, 0.15], [72, 0.16, 0.15], [76, 0.32, 0.15], [79, 0.48, 0.5], [76, 1.0, 0.15], [79, 1.16, 0.9],
  ];
  for (const [m, off, d] of seq) {
    wahVoice(dest, t + off, m, d, true);
    piano(dest, t + off, m - 12, d, 0.5);
  }
  for (const m of [55, 59, 62, 67]) piano(dest, t + 1.16, m, 1.2, 0.6);
}

export function tapeRewind(dest: AudioNode, t: number, dur = 1): void {
  const g = gain(dest);
  const o = osc('sawtooth', 200);
  o.frequency.setValueAtTime(200, t);
  o.frequency.exponentialRampToValueAtTime(2400, t + dur);
  const lp = filter('lowpass', 1500);
  o.connect(lp).connect(g);
  const tr = osc('square', 30);
  const tg = gain(g.gain, 0.08);
  tr.connect(tg);
  env(g, t, 0.15, 0.05, dur, 0.1, 0.05);
  play([o, tr], t, dur + 0.1);
}

export function projectorClick(dest: AudioNode, t: number): void {
  const g = gain(dest);
  const hp = filter('highpass', 3000);
  hp.connect(g);
  const n = noiseSrc();
  n.connect(hp);
  env(g, t, 0.15, 0.001, 0.015);
  play([n], t, 0.03);
}
