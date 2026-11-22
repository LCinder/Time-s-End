// One AudioContext for the whole game. Its clock (ctx.currentTime) is the
// master clock for rhythm: visuals and judgement are derived from it.
//
// Routing:  music ─► darkFilter ─┐
//           sfx ─────────────────┼─► vintage (HP + LP + soft clip) ─► master ─► speakers
//  (music and voice also pass a "silence" gate: the silence solos, MAIN.md idea 9)
//           crackle ─────────────┘

export class AudioEngine {
  private static instance: AudioEngine | null = null;

  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly music: GainNode;
  readonly sfx: GainNode;
  readonly voice: GainNode;
  private readonly darkFilter: BiquadFilterNode;
  private readonly silenceGate: GainNode;
  private readonly vintageIn: GainNode;
  private readonly crackleGain: GainNode;
  readonly noise: AudioBuffer;

  /** True once the context exists (it is created on the first user gesture). */
  static ready(): boolean {
    return AudioEngine.instance !== null;
  }

  static get(): AudioEngine {
    if (!AudioEngine.instance) AudioEngine.instance = new AudioEngine();
    return AudioEngine.instance;
  }

  private constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.connect(ctx.destination);

    // "Old recording" chain
    this.vintageIn = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 120;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6200;
    const shaper = ctx.createWaveShaper();
    shaper.curve = softClipCurve(0.6);
    this.vintageIn.connect(hp).connect(lp).connect(shaper).connect(this.master);

    this.darkFilter = ctx.createBiquadFilter();
    this.darkFilter.type = 'lowpass';
    this.darkFilter.frequency.value = 18000;
    this.darkFilter.connect(this.vintageIn);

    this.silenceGate = ctx.createGain();
    this.silenceGate.connect(this.darkFilter);
    this.music = ctx.createGain();
    this.music.connect(this.silenceGate);
    this.voice = ctx.createGain();
    this.voice.connect(this.silenceGate);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.vintageIn);

    // White noise buffer reused by drums / steam / crashes
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Vinyl crackle loop
    this.crackleGain = ctx.createGain();
    this.crackleGain.gain.value = 0;
    this.crackleGain.connect(this.vintageIn);
    const crackle = ctx.createBufferSource();
    crackle.buffer = makeCrackle(ctx);
    crackle.loop = true;
    crackle.connect(this.crackleGain);
    crackle.start();
  }

  configure(opts: { master: number; music: number; sfx: number; vintage: boolean }): void {
    this.master.gain.value = opts.master;
    this.music.gain.value = opts.music * 0.55;
    this.voice.gain.value = opts.music * 0.5;
    this.sfx.gain.value = opts.sfx * 0.6;
    this.crackleGain.gain.value = opts.vintage ? 0.05 : 0;
  }

  resume(): Promise<void> {
    return this.ctx.state === 'suspended' ? this.ctx.resume() : Promise.resolve();
  }

  /** 0 = normal, 1 = muffled (used in the tunnel). */
  setDark(amount: number): void {
    const f = 18000 * Math.pow(700 / 18000, Math.max(0, Math.min(1, amount)));
    this.darkFilter.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.08);
  }

  /** Silence the band (music + voice) between two scheduler times, with short fades. */
  silence(fromCtx: number, toCtx: number): void {
    const g = this.silenceGate.gain;
    g.setTargetAtTime(0, fromCtx, 0.03);
    g.setTargetAtTime(1, toCtx, 0.03);
  }

  /** Bring the band back immediately (restart / quit during a silence). */
  unsilence(): void {
    const g = this.silenceGate.gain;
    g.cancelScheduledValues(this.ctx.currentTime);
    g.setTargetAtTime(1, this.ctx.currentTime, 0.02);
  }

  /** Seconds between ctx.currentTime and the moment that sound reaches the ears. */
  outputLatency(): number {
    const c = this.ctx as AudioContext & { outputLatency?: number };
    return (c.outputLatency || 0) + (c.baseLatency || 0);
  }
}

function softClipCurve(amount: number): Float32Array {
  const n = 1024;
  const curve = new Float32Array(n);
  const k = 1 + amount * 4;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

function makeCrackle(ctx: AudioContext): AudioBuffer {
  const len = ctx.sampleRate * 3;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    let v = (Math.random() * 2 - 1) * 0.04; // hiss
    if (Math.random() < 0.0009) v += (Math.random() * 2 - 1) * 0.9; // pops
    d[i] = v;
  }
  // smooth the pops a bit
  for (let i = 1; i < len; i++) d[i] = d[i] * 0.6 + d[i - 1] * 0.4;
  return buf;
}
