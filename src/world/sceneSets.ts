// Scenery sets and the time of day: pure data and maths (no Phaser), so the
// validator and the tests can use them too.
//
// A chase level is a journey. Its JSON lists the places it passes through
// ("stages", by beat) and the clock ("hours", by beat): the sky, the sun, the
// moon, the stars and how dark the picture gets all follow the hour, so the
// song can start in the afternoon and end at dawn.

/** One place along the line: what the far and middle layers show and which props stand by the track. */
export interface SceneSet {
  /** Far tileable layer (texture name) and the middle one. */
  far: string;
  mid: string;
  /** Things in the sky (drift very slowly). Empty = none. */
  sky: string[];
  /** Props on the middle layer (trees, houses...). `null` entries leave a gap. */
  props: (string | null)[];
  /** Props on the near layer (bushes, fences, rocks...). */
  near: (string | null)[];
}

export const SCENE_SETS: Record<string, SceneSet> = {
  /** Dry fields at the end of the afternoon: dead trees, a scarecrow, crows. */
  dusk: {
    far: 'farhills',
    mid: 'hills',
    sky: ['wisp', 'wisp2'],
    props: ['deadtree', 'pole', 'crowtree', 'scarecrow', 'deadtree', 'polecrow', null],
    near: ['thorn', 'fence', 'thorn', null, 'rock'],
  },
  /** A ghost town at sunset: crooked houses, the water tower, a stopped station clock. */
  town: {
    far: 'skyline',
    mid: 'hills',
    sky: ['wisp', 'wisp2'],
    props: ['house', 'semaphore', 'house', 'watertower', 'lamppost', 'stationclock', 'house2', null],
    near: ['fence', 'thorn', 'lamppost', null],
  },
  /** The graveyard of crushed clocks (verse 2: "forty pocket-watches, sixty cuckoo clocks"). */
  graveyard: {
    far: 'farhills',
    mid: 'hills',
    sky: ['wisp'],
    props: ['grandclock', 'cuckootree', 'grandclock2', 'deadtree', 'handcross', 'grandclock', null],
    near: ['clockstone', 'gravefence', 'watchpile', 'clockstone', 'handcross', null],
  },
  /** Pine forest at midnight, the mountain getting closer; eyes in the bushes. */
  pines: {
    far: 'mountains',
    mid: 'pinehills',
    sky: ['wisp'],
    props: ['pine', 'pine', 'owltree', 'pine2', 'pine', null],
    near: ['eyesbush', 'rock', 'thorn', 'eyesbush', null],
  },
  /** The gorge at dawn: crags, vultures, the river far below. */
  gorge: {
    far: 'canyonfar',
    mid: 'cliffs',
    sky: ['wisp', 'wisp2'],
    props: ['crag', 'vulture', 'crag2', 'deadtree', 'crag', null],
    near: ['rock', 'thorn', 'rock', null],
  },
};

export interface SceneryStage {
  beat: number;
  set: string;
  /** Beats the far layers take to dissolve into this place (default 8; 0 = cut, e.g. while inside a tunnel). */
  dissolve?: number;
}

/** The `scenery` block of a chase level. */
export interface SceneryConfig {
  stages: SceneryStage[];
  /** [beat, hour] pairs. Hours keep counting past midnight (24 = midnight, 30 = 6 am). */
  hours: [number, number][];
  /** Turn `tunnel` events into a real tunnel (portals and walls), not just darkness. */
  tunnel?: 'brick';
  /** How dark the picture gets at full night (0-1). Default 0.45. */
  nightDark?: number;
}

export const DEFAULT_SCENERY: SceneryConfig = {
  stages: [{ beat: 0, set: 'dusk' }],
  hours: [[0, 17.2]],
};

/** Which stage a given beat belongs to (the last one that has started). */
export function stageIndexAt(stages: SceneryStage[], beat: number): number {
  let i = 0;
  for (let k = 0; k < stages.length; k++) if (stages[k].beat <= beat) i = k;
  return i;
}

/** The hour at a beat, interpolated between the keyframes. */
export function hourAt(hours: [number, number][], beat: number): number {
  if (hours.length === 0) return 17;
  if (beat <= hours[0][0]) return hours[0][1];
  for (let i = 1; i < hours.length; i++) {
    const [b1, h1] = hours[i];
    const [b0, h0] = hours[i - 1];
    if (beat <= b1) return h0 + ((h1 - h0) * (beat - b0)) / Math.max(1e-6, b1 - b0);
  }
  return hours[hours.length - 1][1];
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface SkyState {
  /** 0 = full night, 1 = full day */
  day: number;
  /** How much the horizon glows (sunrise / sunset), 0-1. */
  glow: number;
  /** Sun height: 1 = high, 0 = on the horizon, negative = below. */
  sun: number;
  /** Moon height, same scale. */
  moon: number;
  stars: number;
  top: number;
  bottom: number;
}

const lerpColor = (a: number, b: number, t: number): number => {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};
export { lerpColor };

/** The sky at an hour (any number: 30 means 6 am of the next day). */
export function skyAt(hourRaw: number): SkyState {
  const h = ((hourRaw % 24) + 24) % 24;
  // the sun is up from 6 to 19
  const sun = h >= 6 && h <= 19 ? Math.sin((Math.PI * (h - 6)) / 13) : -Math.sin((Math.PI * (((h - 19 + 24) % 24))) / 11);
  // the moon from half past seven in the evening to half past six in the morning
  const mh = (h - 19.5 + 24) % 24;
  const moon = mh <= 11 ? Math.sin((Math.PI * mh) / 11) : -0.5;
  const day = smooth(-0.12, 0.3, sun);
  const glow = Math.exp(-((sun / 0.2) ** 2));
  const top = lerpColor(0x1a1a22, 0xa9a79d, day);
  let bottom = lerpColor(0x3c3c46, 0xe6e2d6, day);
  bottom = lerpColor(bottom, 0xf0dcb4, glow * 0.65);
  return { day, glow, sun, moon, stars: smooth(0.55, 0.95, 1 - day), top, bottom };
}

/** Every texture a set needs (for the validator and the tests). */
export function setTextures(s: SceneSet): string[] {
  return [s.far, s.mid, ...s.sky, ...s.props.filter((p): p is string => !!p), ...s.near.filter((p): p is string => !!p)];
}
