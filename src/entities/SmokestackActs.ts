// Old Smokestack's repertoire: short performances, each with its own arm poses,
// face, body and props. A director (ChaseScene) picks them to act out the lyrics,
// to fill the instrumental bars and to react to the player, so the boss always
// has something new to do (MAIN.md §8.1b). All original, in character: a vain,
// theatrical old engine.
//
// Coordinates are the locomotive's own (nose at 0,0; face centre at -60,-210;
// front shoulder -270,-190; back shoulder -440,-210; chimney top around -170,-430).

export type ActName =
  | 'tipHat' | 'timetable' | 'twirl' | 'shush' | 'cupEar' | 'patBoiler' | 'shimmy' | 'beckon'
  | 'yawn' | 'doubleTake' | 'steamEars' | 'wink' | 'sneeze' | 'lookBack' | 'bow' | 'fakeSob'
  | 'shrug' | 'count' | 'rubHands' | 'wagFinger' | 'panic' | 'stare' | 'cackle';

export interface Hand {
  x: number;
  y: number;
  fist?: boolean;
  /** Index finger raised (pointing up / counting / shushing). */
  finger?: boolean;
  /** Extra fingers shown when counting (1-4). */
  fingers?: number;
  /** Keep the arm behind the face (the hand is out to the side). */
  under?: boolean;
}

export type EyeMode = 'closed' | 'squint' | 'wink' | 'pop' | 'wide';
export type MouthMode = 'grin' | 'o' | 'yawn' | 'smirk' | 'wobble' | 'cackle';

export interface ActPose {
  front?: Hand;
  back?: Hand;
  /** Body: side-to-side shimmy (px), bob (px, + = down), extra tilt (rad). */
  shimmy?: number;
  bob?: number;
  tilt?: number;
  eyes?: EyeMode;
  /** Brow mood override (-1 worried … 1 angry) and raise (0-1). */
  mood?: number;
  raise?: number;
  /** Mouth shape when not singing. */
  mouth?: MouthMode;
  /** Head turn override (-1 behind · 0 audience · 1 towards Tick). */
  turn?: number;
  hatLift?: number;
  hanky?: boolean;
  tears?: boolean;
  timetable?: boolean;
  earSteam?: boolean;
  soot?: boolean;
  red?: boolean;
}

interface ActDef {
  /** Length in beats. */
  beats: number;
  pose: (t: number, beat: number) => ActPose;
}

const wave = (beat: number, amp: number, speed = 1): number => Math.sin(beat * Math.PI * speed) * amp;

export const ACTS: Record<ActName, ActDef> = {
  // tips his hat... without taking his eyes off Tick
  tipHat: { beats: 3, pose: (t) => ({ front: { x: -175, y: -455 }, hatLift: Math.sin(Math.min(1, t * 1.4) * Math.PI), eyes: 'squint', mouth: 'smirk', tilt: -0.04, turn: 0.9 }) },
  timetable: { beats: 4, pose: (t, b) => ({ front: { x: -120, y: -300 + wave(b, 6) }, back: { x: -360, y: -250, fist: true }, timetable: true, turn: t < 0.6 ? -0.4 : 0.7, raise: t > 0.6 ? 1 : 0, mouth: 'smirk' }) },
  twirl: { beats: 3, pose: (_t, b) => ({ front: { x: -156 + Math.cos(b * Math.PI * 2) * 12, y: -196 + Math.sin(b * Math.PI * 2) * 10, finger: true }, eyes: 'squint', mood: 1, mouth: 'grin', turn: 0.6 }) },
  shush: { beats: 2, pose: () => ({ front: { x: -70, y: -172, fist: true, finger: true }, eyes: 'squint', mouth: 'o', turn: 0, tilt: 0.05 }) },
  cupEar: { beats: 4, pose: (_t, b) => ({ front: { x: -170, y: -236, fist: false }, eyes: 'squint', turn: 0.9, tilt: 0.12 + wave(b, 0.02), raise: 0.6 }) },
  // slow, heavy pats on the boiler: all that iron is coming for you
  patBoiler: { beats: 4, pose: (_t, b) => ({ front: { x: -320, y: -250 + Math.abs(wave(b, 22, 0.5)) }, back: { x: -470, y: -150, fist: true }, tilt: -0.05, mouth: 'grin', eyes: 'squint', turn: 0.8 }) },
  // a slow, looming sway, one claw-like hand conducting the doom
  shimmy: { beats: 4, pose: (_t, b) => ({ front: { x: -180 + wave(b, 26, 0.5), y: -430 - Math.abs(wave(b, 24, 0.5)) }, back: { x: -470, y: -420 }, shimmy: wave(b, 8, 0.5), tilt: wave(b, 0.04, 0.5), mouth: 'smirk', eyes: 'squint', turn: 0.6 }) },
  beckon: { beats: 3, pose: (_t, b) => ({ front: { x: 70, y: -300, fist: Math.floor(b * 2) % 2 === 0, finger: Math.floor(b * 2) % 2 === 0, under: true }, eyes: 'squint', mood: 0.6, mouth: 'smirk', turn: 1 }) },
  yawn: { beats: 4, pose: (t) => ({ front: { x: -150, y: -520 }, back: { x: -470, y: -500 }, eyes: t < 0.7 ? 'closed' : 'squint', mouth: t < 0.7 ? 'yawn' : 'smirk', bob: -Math.sin(t * Math.PI) * 10, tilt: -0.06, turn: t < 0.7 ? 0 : 0.8 }) },
  doubleTake: { beats: 2, pose: (t) => ({ front: { x: -40, y: -250 }, eyes: t > 0.2 ? 'pop' : 'wide', raise: 1, mouth: 'o', bob: t > 0.2 && t < 0.35 ? -18 : 0, turn: t > 0.2 ? 1 : 0 }) },
  steamEars: { beats: 3, pose: (_t, b) => ({ front: { x: 10, y: -330 + wave(b, 10, 2), fist: true, under: true }, back: { x: -360, y: -380 + wave(b + 0.5, 10, 2), fist: true }, earSteam: true, red: true, mood: 1, eyes: 'squint', shimmy: wave(b, 3, 8), turn: 1 }) },
  // a sly wink and a tap on the nose: I know something you don't
  wink: { beats: 2, pose: () => ({ front: { x: -92, y: -206, fist: true, finger: true }, eyes: 'wink', mouth: 'smirk', tilt: 0.06, turn: 0.4 }) },
  sneeze: { beats: 3, pose: (t) => ({ front: { x: -80, y: -250 }, eyes: t < 0.55 ? 'squint' : 'closed', tilt: t < 0.55 ? -0.1 * (t / 0.55) : 0.08, bob: t > 0.55 && t < 0.7 ? 10 : 0, soot: t > 0.55 && t < 0.85, mouth: t < 0.55 ? 'o' : 'grin', turn: 0.3 }) },
  lookBack: { beats: 3, pose: (_t, b) => ({ front: { x: -100, y: -282, fist: false }, eyes: 'squint', turn: -1, tilt: wave(b, 0.04, 0.5) }) },
  // a mocking bow, eyes never leaving his prey
  bow: { beats: 3, pose: (t) => ({ front: { x: -250, y: -225, fist: true }, back: { x: -540, y: -270 }, tilt: Math.sin(Math.min(1, t * 1.5) * Math.PI) * 0.05, bob: Math.sin(Math.min(1, t * 1.5) * Math.PI) * 10, eyes: 'squint', mouth: 'smirk', turn: 1 }) },
  // crocodile tears... then he peeks over the hanky with a wicked grin
  fakeSob: { beats: 4, pose: (t, b) => (t < 0.68
    ? { front: { x: -96, y: -244 + wave(b, 8, 2) }, hanky: true, tears: true, mood: -1, eyes: 'closed', mouth: 'wobble', tilt: wave(b, 0.04), turn: 0 }
    : { front: { x: -96, y: -262 }, hanky: true, mood: 1, eyes: 'squint', mouth: 'grin', tilt: 0.05, turn: 0.9 }) },
  shrug: { beats: 2, pose: (t) => ({ front: { x: -190, y: -340 - Math.sin(t * Math.PI) * 20 }, back: { x: -520, y: -340 - Math.sin(t * Math.PI) * 20 }, raise: 1, tilt: 0.08, mouth: 'smirk', turn: 0 }) },
  count: { beats: 4, pose: (t) => ({ front: { x: -150, y: -400, fist: true, finger: true, fingers: 1 + Math.min(3, Math.floor(t * 4)) }, turn: -0.2, raise: 0.4, eyes: 'wide' }) },
  rubHands: { beats: 3, pose: (_t, b) => ({ front: { x: -210 + wave(b, 14, 4), y: -270 }, back: { x: -250 - wave(b, 14, 4), y: -275 }, eyes: 'squint', mood: 1, mouth: 'grin', turn: 0.8 }) },
  wagFinger: { beats: 3, pose: (_t, b) => ({ front: { x: -140 + wave(b, 26), y: -420, fist: true, finger: true }, mood: 0.4, eyes: 'squint', mouth: 'smirk', turn: 0.7 }) },
  // leans in and stares: wide eyes, tiny pupils, not a word
  stare: { beats: 3, pose: (t) => ({ front: { x: -300, y: -200, fist: true }, back: { x: -470, y: -160, fist: true }, eyes: 'wide', mood: 0.8, shimmy: Math.sin(Math.min(1, t * 3) * Math.PI * 0.5) * 10, tilt: 0.03, turn: 1 }) },
  // a cackle, head thrown back
  cackle: { beats: 3, pose: (_t, b) => ({ front: { x: -300, y: -250 + wave(b, 10, 4) }, back: { x: -500, y: -420 }, mouth: 'cackle', eyes: 'squint', tilt: -0.07 + wave(b, 0.02, 6), mood: 0.9, turn: 0 }) },
  panic: { beats: 3, pose: (_t, b) => ({ front: { x: -150, y: -430 }, back: { x: -370, y: -430 }, eyes: 'pop', mouth: 'o', mood: -1, raise: 1, shimmy: wave(b, 4, 10), turn: 0 }) },
};

/** Lyrics → what to act out (several options = variety). First match wins. */
export const LYRIC_ACTS: [RegExp, ActName[]][] = [
  [/what'?s .*that|wait/i, ['doubleTake']],
  [/bridge|out\?!/i, ['panic']],
  [/howdy|all aboard/i, ['tipHat']],
  [/tickets?,? please|overdue|ticket/i, ['timetable', 'wagFinger']],
  [/forty|sixty|count/i, ['count']],
  [/pity|crime|tragic|grim|dreadful|sad|awful|cruel/i, ['fakeSob', 'shrug', 'rubHands']],
  [/golly|bad!/i, ['shrug']],
  [/listen/i, ['shush']],
  [/hear/i, ['cupEar']],
  [/tunnel|dark|can'?t see/i, ['lookBack', 'cupEar']],
  [/meanest|iron|furnace|belly|throat/i, ['patBoiler', 'cackle']],
  [/derail|unwind|grandfather|crushed/i, ['twirl', 'rubHands']],
  [/nickel|ting-a-ling|tick-tock/i, ['wagFinger']],
  [/comin'? for you|onto you|run/i, ['beckon']],
  [/quick/i, ['rubHands']],
  [/choo-choo/i, ['bow']],
  [/end of the line/i, ['shimmy', 'cackle', 'stare']],
  // a hazard line: the arm points at the sky (the hazard's gesture wins), the face schemes
  [/boxcar|coal|piano|trunk|funeral/i, ['rubHands', 'twirl']],
];

/** For the instrumental bars (nobody singing). */
export const FILLER_ACTS: ActName[] = ['stare', 'cackle', 'shimmy', 'twirl', 'rubHands', 'beckon', 'lookBack', 'yawn', 'wink', 'patBoiler'];

/** Pick a performance for a lyric line, never the same as last time if there's a choice. */
export function actForLine(text: string, last: ActName | null, rnd: () => number = Math.random): ActName | null {
  for (const [re, options] of LYRIC_ACTS) {
    if (!re.test(text)) continue;
    const pool = options.length > 1 ? options.filter((o) => o !== last) : options;
    return pool[Math.floor(rnd() * pool.length)];
  }
  return null;
}

export function fillerAct(last: ActName | null, rnd: () => number = Math.random): ActName {
  const pool = FILLER_ACTS.filter((a) => a !== last);
  return pool[Math.floor(rnd() * pool.length)];
}

// ── the puppet (MAIN.md §8.3): the face and the gaze of each act (expressions are in FaceRig.ts) ──

export type Gaze = 'tick' | 'camera' | 'up' | 'back' | 'down' | 'side';

/** The puppet's face and where it looks for each act of the repertoire. */
export const ACT_FACE: Record<ActName, { face: string; gaze?: Gaze }> = {
  tipHat: { face: 'smug', gaze: 'camera' },
  timetable: { face: 'scheme', gaze: 'down' },
  twirl: { face: 'smirk', gaze: 'camera' },
  shush: { face: 'smirk', gaze: 'camera' },
  cupEar: { face: 'listen', gaze: 'side' },
  patBoiler: { face: 'smug', gaze: 'camera' },
  shimmy: { face: 'grin', gaze: 'camera' },
  beckon: { face: 'smirk', gaze: 'tick' },
  yawn: { face: 'yawn' },
  doubleTake: { face: 'shock', gaze: 'tick' },
  steamEars: { face: 'rage', gaze: 'tick' },
  wink: { face: 'wink', gaze: 'camera' },
  sneeze: { face: 'shock' },
  lookBack: { face: 'suspicious', gaze: 'back' },
  bow: { face: 'smug', gaze: 'camera' },
  fakeSob: { face: 'mockSad', gaze: 'camera' },
  shrug: { face: 'innocent', gaze: 'camera' },
  count: { face: 'scheme', gaze: 'tick' },
  rubHands: { face: 'grin', gaze: 'camera' },
  wagFinger: { face: 'smirk', gaze: 'camera' },
  panic: { face: 'panic' },
  stare: { face: 'menace', gaze: 'camera' },
  cackle: { face: 'cackle' },
};
export const SING_FACES = ['smirk', 'grin', 'sneer', 'scheme', 'glee'];
