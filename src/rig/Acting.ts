// Secondary acting for code-drawn characters: the little things that make a
// cartoon feel alive. Blinks (random, double, and always on a head turn), head
// turns towards whoever they're talking to or out to the audience, nods on the
// beat while singing, head tilts, eyebrow raises, and idle glances.
//
// The character reads the pose (turn, tilt, nod, brow, blinking) when drawing.

export interface ActingInput {
  /** Where the character wants to face: -1 left · 0 the audience · 1 right. */
  look: number;
  singing: boolean;
  /** Set on the frame an accent happens (shouted word, big hit). */
  accent: boolean;
  /** 0-1 */
  nervous: number;
  /** Standing around with nothing to do: glance about, cock the head. */
  idle: boolean;
}

export class Acting {
  turn = 0;
  tilt = 0;
  nod = 0;
  brow = 0;
  private turnVel = 0;
  private tiltTarget = 0;
  private blinkLeft = 0;
  private nextBlink = 1.5 + Math.random() * 2;
  private doubleBlink = false;
  private glanceLeft = 0;
  private glanceTo = 0;
  private nextGlance = 3 + Math.random() * 3;
  private lastTarget = 0;
  private time = 0;

  get blinking(): boolean {
    return this.blinkLeft > 0;
  }

  blink(): void {
    this.blinkLeft = 0.11;
  }

  update(dt: number, beat: number, inp: ActingInput): void {
    this.time += dt;
    const phase = beat - Math.floor(beat);

    // where to look: the wanted direction, or a quick glance somewhere else
    this.nextGlance -= dt;
    if (this.nextGlance <= 0 && this.glanceLeft <= 0) {
      this.glanceLeft = inp.idle ? 1.2 : 0.7;
      this.glanceTo = inp.idle ? (Math.random() < 0.5 ? 0 : -Math.sign(inp.look || 1) * 0.6) : 0;
      this.nextGlance = (inp.idle ? 1.8 : 4) + Math.random() * 3;
    }
    if (this.glanceLeft > 0) this.glanceLeft -= dt;
    let target = this.glanceLeft > 0 ? this.glanceTo : inp.look;
    if (inp.accent) {
      target = 0; // snap round to the audience for the big moment
      this.glanceLeft = 0.5;
      this.glanceTo = 0;
    }
    // animators blink on head turns
    if (Math.abs(target - this.lastTarget) > 0.35) this.blink();
    this.lastTarget = target;

    // the head turns on a stiff spring: fast, with a little overshoot
    // (small steps keep it stable on slow machines)
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const acc = (target - this.turn) * 260 - this.turnVel * 22;
      this.turnVel += acc * h;
      this.turn += this.turnVel * h;
    }
    this.turn = Math.max(-1.15, Math.min(1.15, this.turn));

    // nod on the beat while singing; a big dip on an accent
    const beatNod = inp.singing ? Math.pow(1 - phase, 3) * 6 : 0;
    if (inp.accent) this.nod = 14;
    this.nod += (beatNod - this.nod) * Math.min(1, dt * 14);

    // tilt: sway with the song, cock the head when idle, shake when nervous
    if (inp.accent) this.tiltTarget = (Math.random() < 0.5 ? -1 : 1) * 0.14;
    else if (inp.singing) this.tiltTarget = Math.sin(beat * Math.PI) * 0.05;
    else if (inp.idle) this.tiltTarget = Math.sin(this.time * 0.9) > 0.6 ? 0.12 : 0;
    else this.tiltTarget *= 0.9;
    this.tilt += (this.tiltTarget - this.tilt) * Math.min(1, dt * 10);
    this.tilt += Math.sin(this.time * 31) * 0.035 * inp.nervous;

    // brows jump up on accents, then settle
    if (inp.accent) this.brow = 1;
    this.brow = Math.max(0, this.brow - dt * 2.2);

    // blinks: random, sometimes double
    this.blinkLeft -= dt;
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blink();
      if (this.doubleBlink) {
        this.doubleBlink = false;
        this.nextBlink = 0.22;
      } else {
        this.doubleBlink = Math.random() < 0.25;
        this.nextBlink = (inp.idle ? 1.6 : 2.4) + Math.random() * 2.5;
      }
    }
  }
}

/** A warp that turns (fake 3D), tilts and nods everything drawn around a face centre. */
export function faceWarp(
  act: Acting,
  cx: number,
  cy: number,
  radius: number,
  prev: ((x: number, y: number) => { x: number; y: number }) | null,
): (x: number, y: number) => { x: number; y: number } {
  const cos = Math.cos(act.tilt);
  const sin = Math.sin(act.tilt);
  const turn = Math.max(-1, Math.min(1, act.turn));
  return (x: number, y: number) => {
    let dx = x - cx;
    let dy = y - cy;
    // features near the middle of the face are "closer": they slide further when turning
    const near = Math.max(0.35, 1 - (dx * dx + dy * dy) / (radius * radius));
    dx = dx * (1 - Math.abs(turn) * 0.2) + turn * radius * 0.3 * near;
    dy += act.nod;
    const p = { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
    return prev ? prev(p.x, p.y) : p;
  };
}
