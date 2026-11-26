// The duel with Miss Pirouette, inside her music box (data/levels/pirouette.json).
//
// No scrolling: one stage. Her life is her spring (the key in her back), the bar at the top.
// Each phase is a turn of her key, made of several little choreographies (sections) that play
// one after another, round and round, until her spring runs out; then she winds herself up
// (three clicks on the beat) and the waltz gets faster. When the third one runs out she winds
// down, stops and bows.
//
// What she does (all on the beat, and announced):
//   note     a brass note flies at Tick (from her hand, the comb or her reflection) and lands on
//            him exactly on its beat: it follows him until the last half beat, a ring closes on
//            him and a tick sounds the beat before. PARRY (C) then and it flies back and unwinds
//            her; step away at the last moment and it shatters on the floor.
//   twirl    her tulle sweeps the floor on the beat: be in the air, or up on a cushion.
//   pins     the music box's brass cylinder breaks loose and rolls across the floor in bounds,
//            pins out, a THUMP on every beat: jump it (or be up on a cushion or the turntable).
//   kicks    fouettés: on each beat her leg sweeps the floor round her: keep away, or jump.
//   moths    moths flutter out of the lid at Tick, one a beat: swat them (C) or dodge.
//   bouquets roses thrown from the dark gallery fall where Tick is, on their beats.
//   minuet   she shows three steps in one bar (C, C, jump); Tick repeats them in the next: each
//            step on the beat unwinds her a little.
//   move     a grand jeté to another spot of the stage.
//   hush     the lid shuts: dark, only Tick, her face and what glows.
//   cushions the velvet cushions rise on their springs (platforms to stand on).
//   sweep    her tulle covers the whole floor (and the turntable) for some beats: get up high.
//   dash     she spins across the floor: jump over her.
//   bourree  she hunts him down: one hop towards Tick on every beat (count hops). Touching
//            her hurts: jump over her, or get up out of her way.
//   mirror   her reflection steps out of the lid's mirror and dances on the stage too (her
//            notes "from the mirror" then leave its hand), or goes back in (out: false).
//
// The turntable is a platform too, and turns when she spins on it: it carries Tick with it
// (a twirl flings him off). Dancing the minuet beside her on it is a pas de deux: the steps
// count for more. Touching her hurts, always. A note he dodges instead of sending back,
// she catches: it winds her up a little (no waiting her out). Three hits for the whole duel,
// and losing starts it over from the first turn of the key (a boss fight, not a practice).
// She talks: a card over her head when Tick is hit, when he hurts her, at
// each turn of the key and at the end.
//
// The music is a waltz played by the game on music box bells (until the real song is in);
// the scene's own clock (the AudioContext) keeps everything on its beats.

import Phaser from 'phaser';
import { AudioEngine } from '../audio/AudioEngine';
import { sfx } from '../audio/Sfx';
import { FileSong } from '../audio/Songs';
import * as S from '../audio/Synth';
import { leaveLevel } from '../core/flow';
import { Game } from '../core/Game';
import { Input } from '../core/Input';
import { recordLevel } from '../core/Save';
import { Pirouette, type DancerPose } from '../entities/Pirouette';
import { Player } from '../entities/Player';
import { addFilm, type FilmPipeline } from '../fx/FilmPipeline';
import { Hud } from '../ui/Hud';
import { LyricsUI } from '../ui/LyricsUI';
import { expandLyrics, type ExpandedLine } from '../core/lyrics';
import type { LyricLine } from '../core/types';
import { MusicBoxStage, STAGE } from '../world/MusicBox';
import { SolidWorld } from '../world/Solids';

type EventType = 'note' | 'twirl' | 'sing' | 'hush' | 'cushions' | 'pins' | 'kicks' | 'moths' | 'bouquets' | 'minuet' | 'move' | 'sweep' | 'dash' | 'mirror' | 'bourree';

interface DuelEvent {
  type: EventType;
  beat: number;
  from?: 'hand' | 'comb' | 'mirror';
  lengthBeats?: number;
  count?: number;
  dir?: number;
  to?: 'left' | 'center' | 'right';
  up?: number[];
  /** a note thrown high: only reachable in the air (a jump, a somersault, or from a cushion) */
  high?: boolean;
  /** mirror: out of the mirror (true, the default) or back in (false) */
  out?: boolean;
  /** a golden note: sent back, it gives Tick back a hit */
  gold?: boolean;
  /** minuet: beats between her steps (and his), to follow the song's own call (default 1) */
  every?: number;
}

/** A stanza of her song. Beats [0, loopFrom) are sung once, with the attacks the words
 *  announce; beats [loopFrom, beats) are its instrumental refrain, which plays over and over
 *  (the same attack again, without words) until her spring is down to `until`, and then the
 *  song goes on to the next stanza at the end of the refrain. Without loopFrom the stanza plays
 *  once (the last stanza: it all comes round until her spring runs out). */
interface DuelSection {
  name: string;
  beats: number;
  events: DuelEvent[];
  loopFrom?: number;
  /** her spring must be down to this to move on (default: evenly spaced over the stanzas) */
  until?: number;
  /** with the recorded song: where this stanza is in the song file (`sung`, from its first strong
   *  beat to the next stanza's) and the bars of the voiceless file its refrain loops (`loop`),
   *  in seconds. Each is played fitted to the stanza's beats (a hair faster or slower: the song's
   *  own tempo wanders a little, the game's does not, and so every beat stays on the music). */
  audio?: { sung: [number, number]; loop: [number, number] };
  /** (older) where in the loop file its refrain is taken from, seconds */
  loopAt?: number;
  /** the words she sings in this stanza (beats from its start), shown with the bouncing ball */
  lyrics?: LyricLine[];
}

interface DuelPhase {
  name: string;
  subtitle: string;
  bpm: number;
  melody: string;
  damage: { perfect: number; good: number };
  sections: DuelSection[];
  /** when the sections run out and her spring has not: play again from this one (default: the last) */
  encoreFrom?: number;
  /** the recorded song for this turn of the key: `song` holds every stanza back to back (its
   *  phase beat 0 at `at` seconds), `loop` the same music without the voice, for the refrains */
  audio?: { song: string; loop: string; at: number };
}

interface DuelLevel {
  id: string;
  title: string;
  subtitle: string;
  phases: DuelPhase[];
  /** what she leaves behind for Elias' desk when she gets her ending */
  lostObject?: { id: string; name: string; text: string };
  /** her spoken opening (played from 0 to `to` before the first turn) and her winding down */
  audio?: { intro?: { file: string; to: number }; outro?: string };
}

type Pt = { x: number; y: number };

/** The first time each thing turns up, the game stops and a card explains it (once ever). */
type TipKey = 'note' | 'minuet' | 'moths' | 'mirror' | 'gold' | 'high' | 'sweep' | 'pins' | 'bouquets';
const TIPS: Record<TipKey, { title: string; body: string }> = {
  note: {
    title: 'SEND HER NOTES BACK!',
    body: 'Her notes fly at you in an arc, landing on the beat of the song.\nPress  C  exactly when the closing ring reaches you: the note flies back\nand unwinds her spring. Too early or too late, and it hits you.',
  },
  minuet: {
    title: 'THE MINUET',
    body: 'First she dances three steps, one on each strong beat:  C  ·  C  ·  Z  (Z is a little jump).\nThen it is YOUR TURN: copy them, on the beat, as they light up over your head.\nEvery step in time unwinds her. Beside her on the turntable it is a\nPAS DE DEUX, and every step hurts her more.',
  },
  moths: {
    title: 'MOTHS!',
    body: 'Fifty years of dust... moths fly out of the lid, one on each beat, straight at you.\nSwat each one with  C  as it reaches you (or get out of its way).\nEvery moth you swat costs her a little spring.',
  },
  mirror: {
    title: 'HER REFLECTION',
    body: 'Her reflection steps out of the mirror. It dances with her and throws its own notes.\nSend them back with  C : each one cracks the glass.\nThree cracks and it SHATTERS: a big blow to her spring, and the mirror stays broken.',
  },
  gold: {
    title: 'A GOLDEN NOTE',
    body: 'The white note with the spinning star.\nSend it back with a GOOD or a PERFECT and you get a hit back\n(or, if nothing has hit you, it does double damage).',
  },
  high: {
    title: 'A HIGH NOTE',
    body: 'The dotted line and the arrow: this note passes high above the floor.\nSend it back in the air (jump, or jump twice for a somersault) or from a raised cushion.\nIf it gets past you, she catches it and winds up a little.',
  },
  bouquets: {
    title: 'BRAVO! BRAVO!',
    body: 'Roses fall from the dark gallery, one on each beat, aimed at where you stand. A beat and a half before each one lands, a target and a cross mark its spot: get off it, and keep moving.',
  },
  pins: {
    title: 'THE CYLINDER',
    body: 'THUMP! The music box\'s brass cylinder breaks loose and rolls across the floor, pins out, landing on every beat. The arrows on the floor show where it comes from. Jump over it (or get up on a raised cushion or the turntable).',
  },
  sweep: {
    title: 'THE TULLE SWEEP',
    body: 'Her tulle covers the whole floor for a few beats, turntable and lowered cushions too.\nGet up on a RAISED cushion before it comes (or stay in the air).',
  },
};
const TIPS_KEY = 'timesend.duelTips';
/** the recorded song a little louder, and the effects at half volume while the duel lasts */
const SONG_GAIN = 1.25;
const SFX_IN_DUEL = 0.25;

/** A piece of the song laid out on the phase's beats: stanza `sec`, its beats [from, to),
 *  starting at phase beat `start`; `refrain` passes repeat, mirrored on every other one. */
interface Block {
  sec: number;
  start: number;
  from: number;
  to: number;
  refrain: boolean;
  mirror?: boolean;
}

/** Something flying at Tick that he can send back or swat: a note or a moth. */
interface Flyer {
  kind: 'note' | 'moth';
  src: 'hand' | 'comb' | 'mirror' | 'lid';
  launch: number;
  arrive: number;
  from: Pt;
  to: Pt;
  img: Phaser.GameObjects.Image;
  state: 'wait' | 'fly' | 'back' | 'gone';
  high: boolean;
  ticked: boolean;
  backT0: number;
  backFrom: Pt;
  dmg: number;
  shatter: number;
  /** decided the moment it lands, where Tick is then: does it hit his body? (null: not yet) */
  bodyHit: boolean | null;
  gold: boolean;
}

/** Beats a note flies before it lands; how big it is drawn. */
const TRAVEL = 2;
const NOTE_SCALE = 0.6;
/** the music box's cylinder (the pins attack): its radius, pins not counted */
const DRUM_R = 40;
/** Where she can dance: the turntable in the middle, the floor either side. */
const SPOTS = { left: 330, center: STAGE.tableX, right: 950 };

// ── the music box waltz (provisional): per bar, the bass bell on 1, a tune, chords on 2 and 3 ──
type Bar = [number, number[], number[]];
const MELODIES: Record<string, Bar[]> = {
  waltz: [
    [57, [76, 0, 72], [64, 69]], [52, [71, 0, 68], [62, 64]], [57, [69, 72, 76], [64, 69]], [50, [77, 0, 74], [65, 69]],
    [57, [76, 0, 72], [64, 69]], [52, [74, 71, 68], [62, 64]], [57, [69, 0, 0], [64, 69]], [52, [68, 71, 74], [62, 68]],
  ],
  minuet: [
    [50, [74, 77, 81], [65, 69]], [57, [79, 77, 76], [64, 69]], [50, [77, 74, 69], [65, 69]], [55, [70, 74, 79], [67, 70]],
    [57, [76, 73, 76], [64, 67]], [50, [77, 0, 74], [65, 69]], [55, [79, 77, 76], [67, 70]], [57, [73, 76, 69], [64, 67]],
  ],
  frantic: [
    [57, [88, 84, 88], [76, 81]], [52, [83, 80, 83], [74, 76]], [57, [81, 84, 88], [76, 81]], [50, [89, 86, 89], [77, 81]],
    [57, [88, 84, 81], [76, 81]], [52, [86, 83, 80], [74, 76]], [57, [81, 88, 81], [76, 81]], [52, [80, 83, 86], [74, 80]],
  ],
};
/** Each section of a phase in its own key, so they don't all sound the same. */
const SECTION_KEY = [0, 5, -2, 3];

type State = 'intro' | 'play' | 'windup' | 'victory' | 'dead';

/** What she says (one line at a time, in a card over her head). */
const LINES = {
  taunt: ['Clumsy little clock!', 'Off the beat, darling!', 'Tsk! Two left feet.', 'Is that a dance...\nor a fall?', 'Again! From the top!', 'Ha! Amateur.'],
  whiff: ['Swinging at shadows?', 'Too soon, darling!', 'Patience! Wait for the note.'],
  nervous: ['My spring!', 'A fluke!\nA pure fluke!', "Don't you dare!", 'Oh! Oh my...', "Nobody's EVER\ndone that!", 'Stop that this instant!'],
  low: ['No, no, no...\nnot yet!', "I'm winding down...", 'Just one more dance!'],
  phase: ['Every night I dance for no one.\nTonight... for you, little clock.', 'A minuet needs a partner.\nKeep up!', 'Faster! FASTER!'],
  windup: ["Wind me up...\nI'm not finished!", 'Click... click... CLICK!'],
  pas: ['Oh! A real partner...', 'You... dance with me?'],
  mirrorOut: ['Mirror, mirror...\ncome out and dance!', 'Two of me!\nTwice the grace!'],
  mirrorIn: ['Back in the glass, dear.'],
  shatter: ['My mirror!\nYou BROKE my mirror!', 'Seven years\nof bad luck... for YOU!'],
  dead: ['Back in your box,\nlittle clock.', 'And nobody watched.\nAs usual.'],
};
type LineKind = keyof typeof LINES;

/** Tick on the turntable: how wide its top is either side of the middle. */
const TABLE_HALF = 150;

export class DuelScene extends Phaser.Scene {
  private level!: DuelLevel;
  private world!: SolidWorld;
  private stage!: MusicBoxStage;
  private dancer!: Pirouette;
  private tick!: Player;
  private input2!: Input;
  private hud!: Hud;
  private film: FilmPipeline | null = null;
  private fx!: Phaser.GameObjects.Graphics;
  private gauge!: Phaser.GameObjects.Graphics;
  private gaugeLabel!: Phaser.GameObjects.Text;
  private sectionLabel!: Phaser.GameObjects.Text;
  private title!: Phaser.GameObjects.Text;
  private sub!: Phaser.GameObjects.Text;
  private stepIcons: Phaser.GameObjects.Text[] = [];
  private refrainTip!: Phaser.GameObjects.Text;
  /** the keys, at the bottom: while the title cards are up, at the start, and after a fall */
  private helpText!: Phaser.GameObjects.Text;
  private stepCaps: Phaser.GameObjects.Text[] = [];
  private stepWho!: Phaser.GameObjects.Text;
  /** when her reflection last stepped out (beats), for the hint */
  private twinOutAt = -99;
  /** her reflection out on the stage cracks each time one of its own notes is sent back to it;
   *  at three it shatters (a big blow to her spring) and the lid's mirror stays broken */
  private twinCracks = 0;
  private mirrorBroken = false;
  private dust: { x: number; y: number; t: number }[] = [];
  private thumps: { x: number; t: number }[] = [];
  private thumpText: Phaser.GameObjects.Text[] = [];
  private shards: { x: number; y: number; vx: number; vy: number; r: number; vr: number; s: number }[] = [];
  /** the card explaining something new, while the game waits */
  private tip: { box: Phaser.GameObjects.Container; at: number } | null = null;
  private tipsSeen = new Set<string>();
  private bells!: GainNode;
  private chords!: GainNode;

  private state: State = 'intro';
  private phaseIdx = 0;
  private phase!: DuelPhase;
  private t0 = 0;
  private bpm = 92;
  private beat = -4;
  private schedBeat = 0;
  private spring = 1;
  private hits = 0;
  private combo = 0;
  /** the sections laid out so far: where each pass starts (phase beats) */
  /** the song as laid out so far: blocks of a stanza (its sung part, or a pass of its refrain) */
  private plan: Block[] = [];
  private queue: { e: DuelEvent; ab: number; sec: number; done: boolean }[] = [];
  private flyers: Flyer[] = [];
  private twirls: { beat: number; x: number; judged: boolean }[] = [];
  private pins: { beat: number; dir: number; hit: boolean }[] = [];
  private kicks: { beat: number; x: number; judged: boolean }[] = [];
  private bouquets: { beat: number; x: number; img: Phaser.GameObjects.Image; landed: number }[] = [];
  private minuets: { beat: number; every: number; steps: ('parry' | 'jump')[]; done: boolean[]; told: boolean[] }[] = [];
  private leap: { from: number; to: number; b0: number } | null = null;
  /** her hunt: a hop towards Tick on every beat from b0, n hops; the hop under way */
  private bourree: { b0: number; n: number; k: number; from: number; to: number } | null = null;
  private contactAt = -99;
  /** how high her hop on pointe has her (drawn only: touching her is judged at her feet's floor) */
  private hopLift = 0;
  private hush: { from: number; to: number } | null = null;
  private sing: { from: number; to: number } | null = null;
  private hurtAt = -99;
  private laughAt = -99;
  private stateT = 0;
  private windBeat = 0;
  private swipe = 0;
  /** impact stars: where Tick sends a note back (`big` on a PERFECT), and where it hits her */
  private sparks: { x: number; y: number; t: number; big?: boolean; hit?: boolean }[] = [];
  private freeze = 0;
  /** parry: a short recovery after each swing, a long one after a swing at nothing */
  /** When (audio clock) the bat is free to swing again: no mashing the parry. */
  private parryFree = -Infinity;
  /** when the recent swings at nothing were (mashing makes him dizzy) */
  private whiffs: number[] = [];
  /** the floor Tick last stood on (notes aim at him there, not up in his jumps) */
  private standY: number = STAGE.floorY;
  private sweeps: { from: number; to: number; judged: Set<number> }[] = [];
  private dash: { from: number; to: number; b0: number; hit: boolean } | null = null;
  private lastSection = -1;
  private levelId = 'pirouette';
  /** her reflection out of the mirror: 0 in the glass … 1 down on the stage, where it is going, and where it dances */
  private twin: Pirouette | null = null;
  private twinOut = 0;
  private twinGoal = 0;
  private twinX = 960;
  /** her lines: the card over her head, when she last spoke, the last line (no repeats) */
  private bubble!: Phaser.GameObjects.Text;
  private saidAt = -99;
  private lastLine = '';
  private saidLow = false;
  private saidPas = false;
  private hint!: Phaser.GameObjects.Text;
  private leaveAsk = -99;
  private results: Phaser.GameObjects.Container | null = null;
  private maxCombo = 0;
  private parries = 0;
  private tries = 0;
  /** lives for the whole duel (each is a full set of hits): losing one winds back this turn */
  private lives = 3;
  /** the recorded song: decoded files (kept between runs), whether it can be used, what is playing */
  private static buffers = new Map<string, Promise<AudioBuffer>>();
  private songState: 'loading' | 'ready' | 'none' = 'loading';
  private songBufs = new Map<string, AudioBuffer>();
  private playing: { src: AudioBufferSourceNode; g: GainNode }[] = [];
  private songBus!: GainNode;
  private songTone!: BiquadFilterNode;
  private introAt = -1;
  private sfxLevel = 1;
  private hushedSong = false;
  /** the sing-along: the lines of the stanzas planned so far (phase beats) */
  private lines: ExpandedLine[] = [];
  private lyricsUI!: LyricsUI;

  constructor() {
    super('Duel');
  }

  init(data: { levelId?: string }): void {
    // a scene is reused: start every run from scratch
    this.levelId = data?.levelId ?? 'pirouette';
    this.state = 'intro';
    this.phaseIdx = 0;
    this.beat = -4;
    this.spring = 1;
    this.hits = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.parries = 0;
    this.tries = 0;
    this.lives = Game.diff.duelLives ?? 3;
    this.plan = [];
    this.queue = [];
    this.flyers = [];
    this.twirls = [];
    this.pins = [];
    this.kicks = [];
    this.bouquets = [];
    this.minuets = [];
    this.sweeps = [];
    this.stepIcons = [];
    this.stepCaps = [];
    this.twinOutAt = -99;
    this.twinCracks = 0;
    this.mirrorBroken = false;
    this.shards = [];
    this.dust = [];
    this.thumps = [];
    this.thumpText = [];
    this.tip = null;
    try {
      this.tipsSeen = new Set(JSON.parse(localStorage.getItem(TIPS_KEY) ?? '[]') as string[]);
    } catch {
      this.tipsSeen = new Set();
    }
    this.sparks = [];
    this.leap = null;
    this.hush = null;
    this.sing = null;
    this.dash = null;
    this.bourree = null;
    this.freeze = 0;
    this.parryFree = -Infinity;
    this.whiffs = [];
    this.standY = STAGE.floorY;
    this.twinOut = 0;
    this.twinGoal = 0;
    this.saidAt = -99;
    this.saidLow = false;
    this.saidPas = false;
    this.leaveAsk = -99;
    this.results = null;
    this.songState = 'loading';
    this.songBufs = new Map();
    this.playing = [];
    this.introAt = -1;
    this.hushedSong = false;
    this.lines = [];
  }

  preload(): void {
    this.load.json(`duel:${this.levelId}`, `data/levels/${this.levelId}.json?v=${Date.now()}`);
  }

  create(): void {
    this.level = this.cache.json.get(`duel:${this.levelId}`) as DuelLevel;
    this.world = new SolidWorld();
    this.world.add({ x: -100, y: STAGE.floorY, w: 1480, h: 200, active: true });
    this.stage = new MusicBoxStage(this, this.world);
    this.dancer = new Pirouette(this);
    this.dancer.size = 0.58;
    this.dancer.x = SPOTS.center;
    this.dancer.groundY = STAGE.danceY;
    // her reflection, for when it steps out of the mirror (mirrored, a little see-through)
    if (Pirouette.available(this)) {
      this.twin = new Pirouette(this);
      // out of the glass she turns round to face the stage: an ordinary (not mirrored) dancer,
      // told apart from her by her see-through look and the mirror frame round her
      this.twin.setDepth(38);
      this.twin.setVisible(false);
    }
    this.tick = new Player(this, 320, STAGE.floorY, Game.config.player);
    this.input2 = new Input(this, Game.controls);
    this.hud = new Hud(this, Game.diff.playerHits);
    this.film = addFilm(this, 'bw1928');
    this.fx = this.add.graphics().setDepth(48);
    this.gauge = this.add.graphics().setDepth(95);
    const style = (size: number, font = 'Rye') => ({ fontFamily: `${font}, Georgia, serif`, fontSize: `${size}px`, color: '#f4efe4', stroke: '#141414', strokeThickness: size > 30 ? 8 : 5, align: 'center' });
    // (her name sits on the bar itself: below it is the mirror, and her reflection in it)
    this.gaugeLabel = this.add.text(640, 32, 'MISS PIROUETTE', style(15)).setOrigin(0.5).setDepth(96);
    // (the stanza's name goes under the mirror, so it never covers the reflection)
    this.sectionLabel = this.add.text(640, 200, '', style(18, 'Limelight')).setOrigin(0.5, 0).setDepth(96).setAlpha(0);
    this.title = this.add.text(640, 410, '', style(54)).setOrigin(0.5).setDepth(120);
    this.sub = this.add.text(640, 472, '', style(26)).setOrigin(0.5).setDepth(120);
    for (let k = 0; k < 3; k++) this.stepIcons.push(this.add.text(0, 0, '', { ...style(28), strokeThickness: 0 }).setOrigin(0.5).setDepth(97));
    this.stepCaps = [0, 1, 2].map(() => this.add.text(0, 0, '', style(15, 'Limelight')).setOrigin(0.5).setDepth(97));
    this.stepWho = this.add.text(0, 0, '', style(20)).setOrigin(0.5).setDepth(97);
    this.bubble = this.add
      .text(0, 0, '', { fontFamily: 'Rye, Georgia, serif', fontSize: '19px', color: '#141414', backgroundColor: '#f4efe4', padding: { x: 12, y: 7 }, align: 'center' })
      .setOrigin(0.5, 1)
      .setDepth(99)
      .setAlpha(0);
    this.hint = this.add.text(640, 112, '', style(19, 'Limelight')).setOrigin(0.5).setDepth(97).setAlpha(0);
    this.refrainTip = this.add
      .text(640, 674, '♫  REFRAIN  ♫   send her notes back (C) to wind her down to the notch: then the song goes on', style(18, 'Limelight'))
      .setOrigin(0.5)
      .setDepth(92)
      .setAlpha(0);
    this.helpText = this.add
      .text(640, 704, 'C  send notes back ON THE BEAT   ·   Z  jump (twice: somersault)   ·   SHIFT  dash   ·   ARROWS  move   ·   Esc  leave', style(16, 'Limelight'))
      .setOrigin(0.5)
      .setDepth(100);
    const e = AudioEngine.get();
    this.bells = e.ctx.createGain();
    this.bells.gain.value = 0.55;
    this.bells.connect(e.music);
    this.chords = e.ctx.createGain();
    this.chords.gain.value = 0.25;
    this.chords.connect(e.music);
    this.songTone = e.ctx.createBiquadFilter();
    this.songTone.type = 'lowpass';
    this.songTone.frequency.value = 20000;
    this.songBus = e.ctx.createGain();
    this.songBus.gain.value = SONG_GAIN;
    // the song comes first: the effects play under it while the duel lasts
    this.sfxLevel = e.sfx.gain.value;
    e.sfx.gain.value = this.sfxLevel * SFX_IN_DUEL;
    this.songTone.connect(this.songBus);
    this.songBus.connect(e.music);
    this.loadSong();
    this.makeNoteTextures();
    this.lyricsUI = new LyricsUI(this, this.lines, 674);
    this.input.keyboard?.on('keydown-F2', () => {
      Game.invincible = !Game.invincible;
    });
    this.events.once('shutdown', () => {
      AudioEngine.get().sfx.gain.value = this.sfxLevel;
      if (this.tip) void AudioEngine.get().ctx.resume();
      this.tip = null;
      this.stopSong(false);
      this.bells.disconnect();
      this.chords.disconnect();
      this.songBus.disconnect();
    });
    this.state = 'intro';
    this.stateT = 0;
    this.showTitle(this.level.title, 'Miss Pirouette', 2.4);
  }

  // ───────────────────────── the clock ─────────────────────────

  private get spb(): number {
    return 60 / this.bpm;
  }

  private heardBeat(): number {
    const e = AudioEngine.get();
    return (e.ctx.currentTime - e.outputLatency() - Game.audioOffsetMs / 1000 - this.t0) / this.spb;
  }

  private beatOfPress(ctxTime: number): number {
    const e = AudioEngine.get();
    return (ctxTime - e.outputLatency() - Game.audioOffsetMs / 1000 - Game.inputOffsetMs / 1000 - this.t0) / this.spb;
  }

  private startPhase(i: number, at: number): void {
    this.phaseIdx = i;
    this.phase = this.level.phases[i];
    this.bpm = this.phase.bpm;
    this.t0 = at;
    this.schedBeat = 0;
    this.spring = 1;
    this.queue = [];
    this.lines.length = 0;
    this.plan = [this.firstBlock(0, 0)];
    this.queueSection(this.plan[0]);
    this.twirls = [];
    this.pins = [];
    this.kicks = [];
    this.minuets = [];
    this.sweeps = [];
    this.dash = null;
    this.bourree = null;
    this.hush = null;
    this.sing = null;
    this.lastSection = -1;
    this.state = 'play';
    // a new turn of the key starts with her reflection back in the glass (and the glass mended)
    this.twinGoal = 0;
    this.twinOut = 0;
    this.twinCracks = 0;
    this.mirrorBroken = false;
    this.time.delayedCall(900, () => this.speak('phase', i));
  }

  /** Which block of the song is playing at a phase beat. */
  private sectionAt(b: number): Block {
    let cur = this.plan[0] ?? this.firstBlock(0, 0);
    for (const p of this.plan) if (p.start <= b) cur = p;
    return cur;
  }

  /** A stanza from its start, sung through once (its refrain bars too, with the words). */
  private firstBlock(sec: number, start: number): Block {
    const S = this.phase.sections[sec];
    return { sec, start, from: 0, to: S.beats, refrain: false };
  }

  /** How far her spring must be down to leave stanza i (default: evenly spaced; the last: 0). */
  private gateOf(i: number): number {
    const secs = this.phase.sections;
    if (i >= secs.length - 1) return 0;
    return secs[i].until ?? 1 - (i + 1) / secs.length;
  }

  private scheduleMusic(): void {
    const ctx = AudioEngine.get().ctx;
    const tune = MELODIES[this.phase.melody] ?? MELODIES.waltz;
    while (this.t0 + this.schedBeat * this.spb < ctx.currentTime + 0.2) {
      const b = this.schedBeat++;
      const t = Math.max(ctx.currentTime, this.t0 + b * this.spb);
      const at = this.sectionAt(b);
      const key = SECTION_KEY[at.sec % SECTION_KEY.length];
      // (the stanza's own bars: a refrain plays the same bars again)
      const sb = b - at.start + at.from;
      const [bass, notes, chord] = tune[Math.floor(sb / 3) % tune.length];
      const pos = ((sb % 3) + 3) % 3;
      const hushed = this.hush && b >= this.hush.from && b < this.hush.to;
      if (this.songOn) continue;
      if (pos === 0 && !hushed) S.ding(this.bells, t, bass + key);
      const n = notes[pos];
      if (n) S.ding(this.bells, t, (hushed ? n - 12 : n) + key);
      if (pos > 0 && !hushed) for (const c of chord) S.ding(this.chords, t, c + key);
    }
  }

  // ───────────────────────── her notes ─────────────────────────

  /** Her notes, drawn crisp in ink: a little living eighth note with eyes and a grin (black
   *  with a white rim, so it reads on any part of the stage); the golden one is white. */
  private makeNoteTextures(): void {
    const make = (key: string, gold: boolean): void => {
      if (this.textures.exists(key)) return;
      const W = 132;
      const H = 156;
      const tex = this.textures.createCanvas(key, W, H);
      if (!tex) return;
      const c = tex.getContext();
      const ink = gold ? '#f8f4ea' : '#141414';
      const rim = gold ? '#141414' : '#f8f4ea';
      const shape = (): void => {
        c.beginPath();
        c.ellipse(46, 116, 33, 24, -0.42, 0, Math.PI * 2);
        c.moveTo(70, 112);
        c.lineTo(70, 22);
        c.bezierCurveTo(92, 30, 124, 50, 110, 98);
        c.bezierCurveTo(106, 74, 94, 64, 78, 62);
        c.lineTo(78, 108);
        c.closePath();
      };
      c.lineJoin = 'round';
      // the rim, then the ink
      shape();
      c.lineWidth = 16;
      c.strokeStyle = rim;
      c.stroke();
      shape();
      c.fillStyle = ink;
      c.fill();
      c.lineWidth = 4;
      c.strokeStyle = gold ? '#141414' : '#000000';
      c.stroke();
      // a shine on the head
      c.fillStyle = gold ? 'rgba(20,20,20,0.18)' : 'rgba(255,255,255,0.35)';
      c.beginPath();
      c.ellipse(30, 104, 9, 5, -0.6, 0, Math.PI * 2);
      c.fill();
      // eyes (pie-cut pupils, looking ahead) and a grin
      const eye = (x: number, y: number): void => {
        c.fillStyle = gold ? '#141414' : '#f8f4ea';
        c.beginPath();
        c.ellipse(x, y, 7.5, 10, -0.2, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = gold ? '#f8f4ea' : '#141414';
        c.beginPath();
        c.moveTo(x + 2, y + 1);
        c.arc(x + 2, y + 1, 5, -0.5, Math.PI * 1.6);
        c.closePath();
        c.fill();
      };
      eye(38, 110);
      eye(55, 105);
      c.strokeStyle = gold ? '#141414' : '#f8f4ea';
      c.lineWidth = 3.5;
      c.lineCap = 'round';
      c.beginPath();
      c.arc(48, 120, 10, 0.25, Math.PI - 0.5);
      c.stroke();
      tex.refresh();
    };
    make('duelNote', false);
    make('duelNoteGold', true);
  }

  // ───────────────────────── the recorded song ─────────────────────────

  /** Decode every file of the song (once per session); without them the music box plays its own tune. */
  private loadSong(): void {
    const L = this.level;
    const files = new Set<string>();
    if (L.audio?.intro) files.add(L.audio.intro.file);
    if (L.audio?.outro) files.add(L.audio.outro);
    for (const ph of L.phases) if (ph.audio) [ph.audio.song, ph.audio.loop].forEach((f) => files.add(f));
    if (!files.size || !L.phases.every((ph) => ph.audio)) {
      this.songState = 'none';
      return;
    }
    const all = [...files].map((f) => {
      let p = DuelScene.buffers.get(f);
      if (!p) {
        p = FileSong.load(f);
        DuelScene.buffers.set(f, p);
        p.catch(() => DuelScene.buffers.delete(f));
      }
      return p.then((b) => this.songBufs.set(f, b));
    });
    Promise.all(all).then(
      () => {
        if (this.songState === 'loading') this.songState = 'ready';
      },
      (err) => {
        console.warn('[duel] song not loaded, the music box plays its own tune:', err);
        this.songState = 'none';
      },
    );
  }

  private get songOn(): boolean {
    return this.songState === 'ready';
  }

  /** Play `dur` seconds of a file from `offset`, at ctx time `when` (a few ms of fade at each
   *  end, so the pieces join without a click). */
  private playPiece(file: string, when: number, offset: number, dur: number, rate = 1): void {
    const buf = this.songBufs.get(file);
    if (!buf || dur <= 0) return;
    const ctx = AudioEngine.get().ctx;
    const late = ctx.currentTime - when;
    if (late > 0) {
      when += late;
      offset += late * rate;
      dur -= late;
      if (dur <= 0.02) return;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    const fade = 0.006;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(1, when + fade);
    g.gain.setValueAtTime(1, when + dur);
    g.gain.linearRampToValueAtTime(0, when + dur + fade);
    src.connect(g);
    g.connect(this.songTone);
    src.start(when, Math.max(0, offset));
    src.stop(when + dur + fade);
    const item = { src, g };
    this.playing.push(item);
    src.onended = () => {
      g.disconnect();
      this.playing = this.playing.filter((q) => q !== item);
    };
  }

  /** The audio of a block of the plan: a sung pass from the song, a refrain from the loop file. */
  private queueAudio(p: Block): void {
    const A = this.phase.audio;
    if (!this.songOn || !A) return;
    let stanzaAt = 0;
    for (let k = 0; k < p.sec; k++) stanzaAt += this.phase.sections[k].beats;
    const S = this.phase.sections[p.sec];
    const when = this.t0 + p.start * this.spb;
    const dur = (p.to - p.from) * this.spb;
    if (S.audio) {
      // the stanza's own span of the file, fitted to its beats
      const [a, b] = p.refrain ? S.audio.loop : S.audio.sung;
      const span = b - a;
      const whole = p.refrain ? S.beats - (S.loopFrom ?? 0) : S.beats;
      const from = p.refrain ? 0 : (p.from / whole) * span;
      this.playPiece(p.refrain ? A.loop : A.song, when, a + from, dur, span / (whole * this.spb));
      return;
    }
    const offset = p.refrain && S.loopAt !== undefined ? S.loopAt : A.at + (stanzaAt + p.from) * this.spb;
    this.playPiece(p.refrain ? A.loop : A.song, when, offset, dur);
  }

  /** Stop the song: at once, or like a music box running out of spring (slower, then silent). */
  private stopSong(windDown: boolean, at?: number, fadeLen?: number): void {
    const ctx = AudioEngine.get().ctx;
    const now = Math.max(ctx.currentTime, at ?? 0);
    const len = fadeLen ?? (windDown ? 0.9 : 0.06);
    for (const { src, g } of this.playing) {
      try {
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(g.gain.value, now);
        g.gain.linearRampToValueAtTime(0, now + len);
        if (windDown) {
          src.playbackRate.setValueAtTime(1, now);
          src.playbackRate.linearRampToValueAtTime(0.45, now + len);
        }
        src.stop(now + len + 0.02);
      } catch {
        // (already stopped)
      }
    }
    this.playing = [];
  }

  /** Under the closed lid the song is muffled and quiet. */
  private updateSongTone(): void {
    const h = this.hushNow();
    if (h === this.hushedSong) return;
    this.hushedSong = h;
    const now = AudioEngine.get().ctx.currentTime;
    this.songTone.frequency.setTargetAtTime(h ? 1500 : 20000, now, 0.08);
    this.songBus.gain.setTargetAtTime(h ? SONG_GAIN * 0.85 : SONG_GAIN, now, 0.08);
  }

  // ───────────────────────── update ─────────────────────────

  update(time: number, delta: number): void {
    let dt = Math.min(delta / 1000, 1 / 20);
    const t = time / 1000;
    const i = this.input2;
    i.update();
    if (this.tip) {
      // the game waits for the player to read (a short moment first, so mashing can't skip it)
      const c1 = i.consume('confirm');
      const c2 = i.consume('jump');
      const ok = c1 ?? c2;
      i.consume('parry');
      i.consume('pause');
      if (ok !== null && this.time.now - this.tip.at > 600) this.closeTip();
      return;
    }
    if (i.consume('pause') !== null) {
      // Esc twice to walk out of the music box (once by mistake costs nothing)
      if (this.state === 'dead' || this.state === 'victory' || t - this.leaveAsk < 2.5) {
        this.leave();
        return;
      }
      this.leaveAsk = t;
      this.hud.showJudge('Esc again to leave', 640, 200);
    }
    // a tiny freeze on a good parry (the hit lands)
    if (this.freeze > 0) {
      this.freeze -= dt;
      dt *= 0.15;
    }
    this.stateT += dt;
    if (this.state === 'intro') {
      // her spoken opening (once the song is loaded; without it, the title and straight in)
      const ctx = AudioEngine.get().ctx;
      if (this.songState === 'loading' && this.stateT > 10) this.songState = 'none';
      if (this.songState !== 'loading' && this.introAt < 0) {
        const intro = this.level.audio?.intro;
        const now = ctx.currentTime + 0.1;
        if (this.songOn && intro) {
          this.playPiece(intro.file, now, 0, intro.to);
          this.introAt = now + intro.to;
        } else this.introAt = now + Math.max(0, 2.4 - this.stateT) + 0.5;
      }
      if (this.introAt > 0 && ctx.currentTime >= this.introAt - 0.6) {
        this.showTitle(this.level.phases[0].name, this.level.phases[0].subtitle, 2);
        this.startPhase(0, this.introAt);
      }
    }
    if (this.state === 'play' || this.state === 'windup') this.beat = this.heardBeat();
    if (this.state === 'play') {
      this.scheduleMusic();
      this.planSections();
      this.runEvents();
      this.updateSongTone();
    }
    if (this.state === 'windup') this.updateWindup();
    if (this.state === 'victory') this.updateVictory(dt);
    if (this.state === 'dead' && i.consume('confirm') !== null && this.stateT > 1.8) this.retryPhase();

    const jump = i.consume('jump');
    const parry = i.consume('parry') ?? i.consume('shoot');
    if (this.state !== 'dead') {
      this.tick.update(
        dt,
        { dir: (i.isDown('right') ? 1 : 0) - (i.isDown('left') ? 1 : 0), jumpPressed: jump !== null, jumpHeld: i.isDown('jump'), dashPressed: i.consume('dash') !== null, jumpMultiplier: 1, dashBonusMs: 0 },
        { world: this.world, baseSpeed: 0, autoRun: false, minX: 90, maxX: 1190, allowFlip: true },
      );
      if (jump !== null) {
        sfx('jump');
        if (this.state === 'play') this.minuetStep('jump', jump);
      }
      if (parry !== null && this.state === 'play') this.tryParry(parry);
    }
    this.tick.draw(dt, t, this.beat, 0);
    if (this.tick.onGround) this.standY = this.tick.y;

    this.updateFlyers(t);
    this.updateHazards();
    this.directDancer(dt, t);
    this.stage.lid += ((this.hushNow() ? 0 : 1) - this.stage.lid) * Math.min(1, dt * 5);
    this.stage.update(dt, t, this.beat, this.tableSpin(), this.tick);
    this.drawFx(dt, t);
    this.drawGauge(t);
    this.lyricsUI.setHidden(this.state !== 'play');
    const showHelp = this.state === 'intro' || this.state === 'dead' || (this.state === 'play' && this.phaseIdx === 0 && this.beat < 8 && this.tries === 0);
    this.helpText.setAlpha(Phaser.Math.Clamp(this.helpText.alpha + (showHelp ? dt * 3 : -dt * 2), 0, 1));
    this.lyricsUI.update(this.beat, t);
    this.hud.update(dt, t, Game.diff.playerHits - this.hits, this.combo, (this.phaseIdx + (1 - this.spring)) / this.level.phases.length);
    this.updateFilm(dt);
  }

  /** How fast the turntable turns: with her spinning on it, gently through a minuet, else
   *  hardly at all (off it, she leaves it alone). */
  private tableSpin(): number {
    const d = this.dancer;
    if (Math.abs(d.x - SPOTS.center) > 60 || this.state !== 'play') return 0;
    if (this.minuets.some((m) => this.beat >= m.beat - 0.5 && this.beat < m.beat + 6 * m.every + 0.5)) return 1.4;
    return ['twirl', 'fouette'].includes(d.pose) ? 6 : d.pose === 'stance' ? 0.9 : 0;
  }

  /** Tick standing on the turntable. */
  private onTable(): boolean {
    return this.tick.onGround && Math.abs(this.tick.y - STAGE.danceY) < 4 && Math.abs(this.tick.x - STAGE.tableX) < TABLE_HALF + 10;
  }

  private hushNow(): boolean {
    return !!this.hush && this.beat >= this.hush.from && this.beat < this.hush.to;
  }

  /** Lay out the next section a bar before it starts (the sections take turns). */
  private planSections(): void {
    const secs = this.phase.sections;
    let last = this.plan[this.plan.length - 1];
    // decided a bar ahead (the attacks need their warnings): stay in the refrain while her
    // spring is above the stanza's gate, else on to the next stanza's sung part
    while (this.beat + 4 >= last.start + (last.to - last.from)) {
      const S = secs[last.sec];
      const end = last.start + (last.to - last.from);
      const isLast = last.sec >= secs.length - 1;
      const hasRefrain = S.loopFrom !== undefined && S.loopFrom < S.beats;
      let next: Block;
      if (this.spring > this.gateOf(last.sec) && (hasRefrain || isLast)) {
        // the refrain again (the last stanza without one comes round whole)
        const from = hasRefrain ? S.loopFrom! : 0;
        const passes = this.plan.filter((q) => q.sec === last.sec && q.refrain).length;
        next = { sec: last.sec, start: end, from, to: S.beats, refrain: true, mirror: passes % 2 === 0 };
      } else next = this.firstBlock(Math.min(last.sec + 1, secs.length - 1), end);
      this.plan.push(next);
      this.queueSection(next);
      last = next;
    }
    // show the name of the section playing
    const now = this.sectionAt(this.beat);
    if (now.sec !== this.lastSection && this.beat >= now.start) {
      this.lastSection = now.sec;
      this.tweens.killTweensOf(this.sectionLabel);
      this.sectionLabel.setText(`“${secs[now.sec].name}”`).setAlpha(1);
      this.tweens.add({ targets: this.sectionLabel, alpha: 0, delay: 2200, duration: 600 });
    }
  }

  private queueSection(p: Block): void {
    this.queueAudio(p);
    // the words, on a sung pass only (a refrain has no voice)
    const S = this.phase.sections[p.sec];
    if (!p.refrain && S.lyrics?.length) {
      this.lines.push(...expandLyrics(S.lyrics.map((l) => ({ ...l, beat: l.beat + p.start - p.from }))));
      this.lines.sort((a, c) => a.beat - c.beat);
    }
    const flipTo = { left: 'right', right: 'left', center: 'center' } as const;
    for (const e0 of this.phase.sections[p.sec].events) {
      if (e0.beat < p.from || e0.beat >= p.to) continue;
      let e = e0;
      if (p.mirror) {
        e = { ...e0 };
        if (e.to) e.to = flipTo[e.to];
        if (e.dir) e.dir = -e.dir;
        // (the cushions are not swapped: they are where the sung part left them)
      }
      this.queue.push({ e, ab: p.start + e.beat - p.from, sec: p.sec, done: false });
    }
  }

  /** Start whatever is due (things that need a warning start ahead of their beat). */
  private runEvents(): void {
    const lead: Partial<Record<EventType, number>> = { bourree: 1, note: TRAVEL + 1, twirl: 2.2, sweep: 2.2, dash: 1.2, pins: 1.6, kicks: 1.5, moths: 1, bouquets: 2.5, minuet: 0, move: 0 };
    for (const q of this.queue) {
      if (q.done) continue;
      // something new: stop and explain it just before it starts (once ever)
      const tk = this.tipFor(q.e);
      if (tk && !this.tipsSeen.has(tk) && this.beat >= q.ab - (lead[q.e.type] ?? 0) - 1.5) {
        this.showTip(tk);
        return;
      }
      if (this.beat < q.ab - (lead[q.e.type] ?? 0)) continue;
      q.done = true;
      const e = q.e;
      const n = Math.max(1, e.count ?? 1);
      switch (e.type) {
        case 'note': this.spawnFlyer('note', e.from === 'mirror' && this.mirrorBroken ? 'comb' : e.from ?? 'hand', q.ab, !!e.high, !!e.gold); break;
        case 'sweep': this.sweeps.push({ from: q.ab, to: q.ab + (e.lengthBeats ?? 4), judged: new Set() }); break;
        case 'dash': {
          // she never stops on top of him: if he stands at her mark she spins right past him
          let to = SPOTS[e.to ?? 'center'];
          const dir = Math.sign(to - this.dancer.x) || 1;
          if (Math.abs(to - this.tick.x) < 160) to = this.tick.x + dir * 220;
          // never ending up by a cushion (it would block Tick's way up for the next sweep)
          to = Phaser.Math.Clamp(to, 310, 970);
          // and if that would stop her right on him, she pulls up short of him instead
          if (Math.abs(to - this.tick.x) < 160) to = Phaser.Math.Clamp(this.tick.x - dir * 170, 310, 970);
          this.dash = { from: this.dancer.x, to, b0: q.ab - 1, hit: false };
          break;
        }
        case 'moths': for (let k = 0; k < n; k++) this.spawnFlyer('moth', 'lid', q.ab + 1 + k); break;
        case 'twirl': this.twirls.push({ beat: q.ab, x: this.dancer.x, judged: false }); break;
        case 'pins': this.pins.push({ beat: q.ab, dir: e.dir ?? 1, hit: false }); break;
        case 'kicks': for (let k = 0; k < n; k++) this.kicks.push({ beat: q.ab + k, x: this.dancer.x, judged: false }); break;
        case 'bouquets':
          for (let k = 0; k < n; k++) this.bouquets.push({ beat: q.ab + k, x: -1, img: this.add.image(-200, -200, 'art:tex:mbBouquet').setDepth(46).setScale(0.42), landed: -1 });
          break;
        case 'bourree': this.bourree = { b0: q.ab, n, k: -1, from: this.dancer.x, to: this.dancer.x }; this.leap = null; break;
        case 'minuet': this.minuets.push({ beat: q.ab, every: e.every ?? 1, steps: ['parry', 'parry', 'jump'], done: [false, false, false], told: [false, false, false] }); break;
        case 'move': {
          // never onto Tick: if he is standing there, she lands a good way off, towards the middle
          let to = SPOTS[e.to ?? 'center'];
          if (Math.abs(to - this.tick.x) < 240) to = Phaser.Math.Clamp(this.tick.x + (this.tick.x < 640 ? 280 : -280), 230, 1050);
          this.leap = { from: this.dancer.x, to, b0: q.ab };
          sfx('dash');
          break;
        }
        case 'sing': this.sing = { from: q.ab, to: q.ab + (e.lengthBeats ?? 3) }; break;
        case 'hush': this.hush = { from: q.ab, to: q.ab + (e.lengthBeats ?? 12) }; break;
        case 'cushions': (e.up ?? []).forEach((u, k) => this.stage.setCushion(k, u)); break;
        case 'mirror': {
          const out = e.out !== false;
          if (!this.twin || (out ? 1 : 0) === this.twinGoal || (out && this.mirrorBroken)) break;
          this.twinGoal = out ? 1 : 0;
          if (out) this.twinOutAt = q.ab;
          if (out && this.twinOut < 0.05) this.twinX = this.twinMark();
          // a shiver of glass bells as she steps through
          const now = AudioEngine.get().ctx.currentTime;
          for (let k = 0; k < 6; k++) S.ding(this.bells, now + k * 0.06, out ? 98 - k * 3 : 83 + k * 3);
          this.speak(out ? 'mirrorOut' : 'mirrorIn');
          break;
        }
      }
    }
    this.queue = this.queue.filter((q) => !q.done);
  }

  // ───────────────────────── notes and moths ─────────────────────────

  private spawnFlyer(kind: Flyer['kind'], src: Flyer['src'], arrive: number, high = false, gold = false): void {
    const tex = kind === 'note' ? (gold ? 'duelNoteGold' : 'duelNote') : 'art:tex:mbMoth';
    const img = this.add.image(-200, -200, tex).setDepth(47).setScale(kind === 'note' ? NOTE_SCALE : 0.3).setVisible(false);
    const travel = kind === 'note' ? TRAVEL : 2;
    this.flyers.push({ kind, src, launch: arrive - travel, arrive, from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, img, state: 'wait', high, ticked: false, backT0: 0, backFrom: { x: 0, y: 0 }, dmg: 0, shatter: -1, bodyHit: null, gold });
  }

  private sourceOf(n: Flyer): Pt {
    if (n.src === 'comb') return { x: STAGE.comb.x0 + 30 + Math.random() * (STAGE.comb.x1 - STAGE.comb.x0 - 60), y: STAGE.comb.y };
    if (n.src === 'mirror') {
      // out on the stage, her reflection throws it; in the glass, it leaves the mirror
      if (this.twin && this.twinOut > 0.9) return this.twin.handPos(this.tick.x < this.twinX ? 0 : 1);
      return { x: STAGE.mirror.x + (this.tick.x < 640 ? -60 : 60), y: STAGE.mirror.y + 30 };
    }
    if (n.src === 'lid') return { x: 640 + (Math.random() - 0.5) * 400, y: 150 };
    return this.dancer.handPos(this.tick.x < this.dancer.x ? 0 : 1);
  }

  private tickCenter(): Pt {
    return { x: this.tick.x, y: this.tick.y - 46 };
  }

  /** Where a note aims: Tick's x, at the height of the floor he stands on (it does not jump
   *  with him); a high note at jumping height above it. */
  private aimFor(n: Flyer): Pt {
    return { x: this.tick.x, y: n.high ? this.standY - 46 - 190 : this.standY - 46 };
  }

  private updateFlyers(t: number): void {
    const b = this.beat;
    const late = this.windowMs().ok / 1000 / this.spb;
    for (const n of this.flyers) {
      if (n.state === 'wait' && b >= n.launch) {
        n.state = 'fly';
        n.from = this.sourceOf(n);
        n.to = this.aimFor(n);
        if (n.src === 'comb') this.stage.pluck(n.from.x, t);
        sfx(n.kind === 'note' ? 'pop' : 'hop');
      }
      if (n.state === 'fly') {
        // it follows Tick until the last half beat, then it is committed: he can still step out
        if (b < n.arrive - 0.5) n.to = this.aimFor(n);
        // the countdown: a tick the beat before it lands
        if (!n.ticked && b >= n.arrive - 1) {
          n.ticked = true;
          sfx('tick');
        }
        const f = (b - n.launch) / (n.arrive - n.launch);
        if (f <= 1) {
          const lift = n.kind === 'note' ? 150 + Math.max(0, n.to.y - n.from.y) * 0.2 : 40;
          const wob = n.kind === 'moth' ? Math.sin(b * Math.PI * 2) * 30 * (1 - f) : 0;
          n.img.setVisible(true).setPosition(n.from.x + (n.to.x - n.from.x) * f + wob, n.from.y + (n.to.y - n.from.y) * f - Math.sin(f * Math.PI) * lift);
          if (n.kind === 'note') {
            // it bobs along facing where it flies, stretching on each beat (no spinning: it
            // has a face, and the eye reads its path better)
            const pulse = Math.max(0, Math.cos((b % 1) * Math.PI * 2)) * 0.12;
            n.img.setFlipX(n.to.x < n.from.x).setRotation(Math.sin(b * Math.PI * 2) * 0.22 * (n.to.x < n.from.x ? -1 : 1));
            n.img.setScale(NOTE_SCALE * (1 + Math.max(0, f - 0.5) * 0.3) * (1 - pulse * 0.5), NOTE_SCALE * (1 + Math.max(0, f - 0.5) * 0.3) * (1 + pulse));
          }
          else n.img.setScale(0.3, 0.3 * (0.6 + Math.abs(Math.sin(b * Math.PI * 4)) * 0.4)).setFlipX(n.to.x < n.from.x);
        } else {
          // it has landed: whether it hits is decided right now, against Tick's body where he
          // is on the beat (what the player sees), and it hangs there, pulsing, for the late
          // part of the parry window
          if (n.bodyHit === null) n.bodyHit = this.touchesTick(n.to);
          n.img.setPosition(n.to.x, n.to.y).setScale((n.kind === 'note' ? NOTE_SCALE : 0.3) * (1.2 + Math.sin(b * 40) * 0.06));
        }
        if (f > 1 && b > n.arrive + late) {
          if (n.high) {
            // a high note nobody sent back: she catches it and winds up a little
            n.state = 'gone';
            n.shatter = 0;
            this.spring = Math.min(1, this.spring + 0.03);
            sfx('click');
          } else if (n.bodyHit) {
            this.hurt(n.kind);
            n.state = 'gone';
            n.img.destroy();
          } else {
            // dodged, not sent back: she catches the tune and winds up a touch (no waiting her out)
            n.state = 'gone';
            n.shatter = 0;
            sfx('hop');
            if (n.kind === 'note' && this.state === 'play') this.spring = Math.min(1, this.spring + 0.012);
          }
        }
      }
      if (n.state === 'back') {
        const f = (b - n.backT0) / 1;
        // it goes back to whoever threw it: her, or her reflection out on the stage
        const head = n.src === 'mirror' && this.twin && this.twinOut > 0.9 ? this.twin.headPos() : this.dancer.headPos();
        if (n.kind === 'moth' || f >= 1) {
          if (n.kind === 'note') this.hitHer(n.dmg);
          // a swatted moth was hers too (out of her seams): it costs her a little spring
          else this.hitHer(n.dmg * 0.5, true);
          if (n.kind === 'note' && n.src === 'mirror' && this.twin && this.twinOut > 0.9) this.crackTwin();
          n.state = 'gone';
          n.img.destroy();
        } else {
          n.img.setPosition(n.backFrom.x + (head.x - n.backFrom.x) * f, n.backFrom.y + (head.y - n.backFrom.y) * f - Math.sin(f * Math.PI) * 60).setRotation(-f * 9).setScale(NOTE_SCALE * (1.15 - f * 0.3));
        }
      }
      if (n.state === 'gone' && n.shatter >= 0) {
        n.shatter += 1 / 60;
        n.img.setPosition(n.to.x, Math.min(STAGE.floorY - 10, n.img.y + 8)).setAlpha(Math.max(0, 1 - n.shatter * 3));
        if (n.shatter > 0.4) {
          n.img.destroy();
          n.shatter = -1;
        }
      }
    }
    this.flyers = this.flyers.filter((n) => n.state !== 'gone' || n.shatter >= 0);
  }

  /** Does a note at this spot touch Tick's body (his round case and his legs, plus the note)? */
  private touchesTick(p: Pt): boolean {
    const t = this.tick;
    return Math.abs(p.x - t.x) < 50 && p.y > t.y - 118 && p.y < t.y + 12;
  }

  /** The parry windows: wider than a jump's (it is a swing, not a step). */
  private windowMs(): { perfect: number; good: number; ok: number } {
    const w = Game.diff.hitWindowMs;
    return { perfect: w.perfect * 1.3, good: Math.max(w.good * 1.1, 95), ok: Math.max(w.good * 1.6, 145) };
  }

  /** PARRY: the note or moth reaching Tick nearest to this moment goes back. */
  private tryParry(ctxTime: number): void {
    // still recovering from the last swing (timed on the presses themselves, so a hit pause
    // or a slow frame never eats a quick pair of notes half a beat apart)
    if (ctxTime < this.parryFree) return;
    const pb = this.beatOfPress(ctxTime);
    this.swipe = 1;
    this.parryFree = ctxTime + 0.1;
    if (this.minuetStep('parry', ctxTime)) return;
    const w = this.windowMs();
    const ms = (n: Flyer) => Math.abs(pb - n.arrive) * this.spb * 1000;
    // in reach: the note where it is now, or where it lands, within a swing of his body
    const c = this.tickCenter();
    const reach = (n: Flyer) => Math.min(Math.hypot(c.x - n.img.x, c.y - n.img.y), Math.hypot(c.x - n.to.x, c.y - n.to.y)) < 150;
    const cand = this.flyers
      .filter((n) => n.state === 'fly' && ms(n) <= w.ok && reach(n))
      .sort((a, b) => ms(a) - ms(b))[0];
    // a little early for a note on its way (it still has to come in reach): no penalty, try again
    const early = !cand && this.flyers.some((n) => n.state === 'fly' && n.arrive > pb && (n.arrive - pb) * this.spb * 1000 <= w.ok + 260 && reach(n));
    if (early) {
      this.parryFree = ctxTime + 0.08;
      this.hud.showJudge('early', this.tick.x, this.tick.y - 160);
      return;
    }
    if (!cand) {
      // a swing at nothing costs the combo and a short recovery; mashing (3 swings at nothing
      // in a second and a half) makes him dizzy for a moment
      sfx('dash');
      this.combo = 0;
      this.whiffs = this.whiffs.filter((x) => ctxTime - x < 1.5);
      this.whiffs.push(ctxTime);
      if (this.whiffs.length >= 3) {
        this.whiffs = [];
        this.parryFree = ctxTime + 0.9;
        this.tick.dizzy();
        this.hud.showJudge('DIZZY!', this.tick.x, this.tick.y - 160);
        this.speak('whiff');
      } else {
        this.parryFree = ctxTime + 0.25;
        this.hud.showJudge('MISS', this.tick.x, this.tick.y - 160);
      }
      return;
    }
    this.parries++;
    this.tick.accent();
    const off = ms(cand);
    const grade = off <= w.perfect ? 'PERFECT!' : off <= w.good ? 'GOOD' : 'OK';
    cand.state = 'back';
    cand.backT0 = this.beat;
    cand.backFrom = { x: cand.img.x, y: cand.img.y };
    const d = this.phase.damage;
    cand.dmg = grade === 'PERFECT!' ? d.perfect : grade === 'GOOD' ? d.good : d.good * 0.5;
    this.bumpCombo();
    if (cand.gold && grade !== 'OK') {
      // the golden note: a hit back (or, unhurt, double damage)
      if (this.hits > 0) {
        this.hits--;
        this.hud.showJudge('+1 ♥', this.tick.x, this.tick.y - 160);
      } else {
        cand.dmg *= 2;
        this.hud.showJudge('GOLDEN!', this.tick.x, this.tick.y - 160);
      }
      sfx('bell');
    } else this.hud.showJudge(cand.kind === 'moth' ? 'SWAT!' : grade, this.tick.x, this.tick.y - 160);
    this.sparks.push({ x: cand.img.x, y: cand.img.y, t: 0, big: grade === 'PERFECT!' });
    this.freeze = grade === 'PERFECT!' ? 0.07 : 0.04;
    sfx('jumpBeat');
    sfx('stamp', 0.01);
  }

  /** A minuet step: is there one to dance right now, and was it on its beat? */
  private minuetStep(kind: 'parry' | 'jump', ctxTime: number): boolean {
    const pb = this.beatOfPress(ctxTime);
    const w = this.windowMs();
    for (const m of this.minuets) {
      for (let k = 0; k < 3; k++) {
        const at = m.beat + (3 + k) * m.every;
        const off = Math.abs(pb - at) * this.spb * 1000;
        if (m.done[k] || off > w.ok || m.steps[k] !== kind) continue;
        m.done[k] = true;
        const good = off <= w.good;
        // beside her on the turning table it is a pas de deux: the step counts for more
        const pas = this.onTable() && Math.abs(this.dancer.x - SPOTS.center) < 60;
        this.hud.showJudge(pas ? (good ? 'PAS DE DEUX!' : 'pas de deux') : good ? 'STEP!' : 'step', this.tick.x, this.tick.y - 160);
        this.bumpCombo();
        // a step counts like a note sent back; all three in time, and she takes a bow's worth more
        this.hitHer((good ? this.phase.damage.perfect : this.phase.damage.good * 0.6) * (pas ? 1.5 : 1), true);
        if (m.done.every((x) => x)) {
          this.hitHer(this.phase.damage.perfect * (pas ? 1.5 : 1), true);
          this.hud.showJudge('BRAVO!', this.tick.x, this.tick.y - 200);
          sfx('bell');
        }
        if (pas && !this.saidPas) {
          this.saidPas = true;
          this.speak('pas');
        }
        S.ding(this.bells, AudioEngine.get().ctx.currentTime, [81, 84, 88][k]);
        return true;
      }
    }
    return false;
  }

  private bumpCombo(): void {
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
  }

  private hitHer(dmg: number, soft = false): void {
    if (this.state !== 'play') return;
    // her spring can't run out before the song gets to its last stanza (it would cut the song
    // off): within a stanza it goes down no further than that stanza's gate
    this.spring = Math.max(this.springFloor(), this.spring - dmg);
    if (!soft) {
      this.hurtAt = this.beat;
      // where the note hits her: an impact star on her head
      const hp = this.dancer.headPos();
      this.sparks.push({ x: hp.x, y: hp.y, t: 0, hit: true, big: dmg >= this.phase.damage.perfect });
      sfx('boing');
      this.cameras.main.shake(140, 0.006);
      if (this.spring < 0.25 && !this.saidLow) {
        this.saidLow = true;
        this.speak('low', undefined, true);
      } else if (Math.random() < 0.3) this.speak('nervous');
    }
    if (this.spring <= 0) this.endPhase();
  }

  /** How low her spring can go while the stanza now playing lasts (0 in the last one). */
  private springFloor(): number {
    if (!this.plan.length) return 0;
    const sec = this.sectionAt(this.beat).sec;
    return sec >= this.phase.sections.length - 1 ? 0 : this.gateOf(sec);
  }

  /** She says a line (a card over her head). Chatter waits its turn; `force` lines don't. */
  private speak(kind: LineKind, idx?: number, force = false): void {
    if (!force && idx === undefined && this.beat - this.saidAt < 5) return;
    const pool = LINES[kind];
    let line = idx !== undefined ? pool[Math.min(idx, pool.length - 1)] : pool[Math.floor(Math.random() * pool.length)];
    if (idx === undefined && line === this.lastLine && pool.length > 1) line = pool[(pool.indexOf(line) + 1) % pool.length];
    this.lastLine = line;
    this.saidAt = this.beat;
    this.tweens.killTweensOf(this.bubble);
    this.bubble.setText(line).setAlpha(1).setScale(0.6);
    this.tweens.add({ targets: this.bubble, scale: 1, duration: 260, ease: 'Back.Out' });
    this.tweens.add({ targets: this.bubble, alpha: 0, delay: 1400 + line.length * 45, duration: 300 });
  }

  private hurt(_src: string): void {
    if (this.tick.invulnerable > 0 || this.state !== 'play') return;
    if (!Game.invincible) this.hits++;
    this.combo = 0;
    this.tick.invulnerable = Game.config.player.invulnerableMs;
    this.tick.dizzy();
    this.laughAt = this.beat;
    if (this.hits < Game.diff.playerHits) this.speak('taunt');
    sfx('hit');
    this.cameras.main.shake(200, 0.01);
    if (this.film) this.film.flash = 0.35;
    if (this.hits >= Game.diff.playerHits) {
      this.state = 'dead';
      this.stateT = 0;
      this.stopSong(true);
      sfx('death');
      this.tries++;
      this.speak('dead', undefined, true);
      this.time.delayedCall(1700, () => {
        if (this.state !== 'dead') return;
        this.tweens.killTweensOf(this.bubble);
        this.tweens.add({ targets: this.bubble, alpha: 0, duration: 250 });
        const spare = this.lives - 1;
        this.showTitle(
          spare > 0 ? 'WIND IT BACK!' : 'THE END?',
          spare > 0
            ? `${this.progressText()}\nENTER  play this turn of the key again   ·   ${spare} ${spare === 1 ? 'life' : 'lives'} left   ·   Esc  leave`
            : `${this.progressText()}\nNo lives left.  ENTER  from the first turn of the key   ·   Esc  leave`,
          99,
        );
      });
    }
  }

  /** After losing: with a life to spare, this turn of the key again (and her spring as it
   *  was when it began); with none, the duel over from the first turn, with all lives back. */
  private retryPhase(): void {
    this.hits = 0;
    this.combo = 0;
    this.clearHazards();
    for (const k of [0, 1]) this.stage.setCushion(k, 0);
    this.dancer.x = SPOTS.center;
    sfx('rewind');
    let from = this.phaseIdx;
    if (this.lives > 1) this.lives--;
    else {
      this.lives = Game.diff.duelLives ?? 3;
      from = 0;
    }
    const ph = this.level.phases[from];
    this.showTitle(ph.name, ph.subtitle, 1.6);
    this.stopSong(false);
    this.startPhase(from, AudioEngine.get().ctx.currentTime + 0.8);
  }

  /** How far the duel got, for the end card: how much of her spring was gone in all. */
  private progressText(): string {
    const total = this.level.phases.length;
    const done = (this.phaseIdx + (1 - this.spring)) / total;
    const bar = '█'.repeat(Math.round(done * 12)).padEnd(12, '░');
    return `Her spring  ${bar}  ${Math.round(done * 100)}% wound down  ·  turn ${this.phaseIdx + 1} of ${total}`;
  }

  private clearHazards(): void {
    for (const n of this.flyers) n.img.destroy();
    for (const bq of this.bouquets) bq.img.destroy();
    this.flyers = [];
    this.bouquets = [];
  }

  // ───────────────────────── twirl, pins, kicks, bouquets ─────────────────────────

  /** Standing low: on the floor, the turntable or a cushion that is down (her tulle reaches
   *  all of those; only a raised cushion, or the air, is out of its way). */
  private low(): boolean {
    return this.tick.onGround && this.tick.y > STAGE.floorY - 100;
  }

  /** The cylinder's wave: x of its front at a beat (it crosses the floor in 4 beats). */
  private pinX(p: { beat: number; dir: number }, b: number): number {
    const f = (b - p.beat) / 4;
    return p.dir > 0 ? 100 + f * 1080 : 1180 - f * 1080;
  }

  /** How high the rolling cylinder is off the floor: a bound between beats, down on each beat. */
  private drumHop(p: { beat: number }, b: number): number {
    if (b < p.beat) return 0;
    return Math.sin(((b - p.beat) % 1) * Math.PI) * 14;
  }

  private updateHazards(): void {
    const b = this.beat;
    // twirls: judged just after the beat, so a jump on the beat has already left the floor
    for (const tw of this.twirls) {
      if (!tw.judged && b >= tw.beat + 0.08) {
        tw.judged = true;
        if (this.low()) this.hurt('twirl');
        else this.bumpCombo();
      }
    }
    this.twirls = this.twirls.filter((tw) => b < tw.beat + 1);
    // a long sweep: the tulle covers the whole floor on every beat of it (get up on a cushion)
    for (const sw of this.sweeps) {
      const k = Math.floor(b - sw.from + 0.92);
      const at = sw.from + k;
      if (b >= at + 0.08 && at >= sw.from && at < sw.to && !sw.judged.has(k)) {
        sw.judged.add(k);
        sfx('dash');
        if (this.low()) this.hurt('sweep');
      }
    }
    this.sweeps = this.sweeps.filter((sw) => b < sw.to + 0.5);
    // her spinning dash along the floor: jump over her, or be up high
    if (this.dash) {
      const f = Phaser.Math.Clamp((b - this.dash.b0) / 2, 0, 1);
      // only what is in front of her (she spins away from whoever is behind her as she sets off)
      const ahead = (this.tick.x - this.dancer.x) * Math.sign(this.dash.to - this.dash.from) > -20;
      if (!this.dash.hit && f > 0 && f < 1 && ahead && Math.abs(this.tick.x - this.dancer.x) < 70 && this.low()) {
        this.dash.hit = true;
        this.hurt('dash');
      }
    }
    // touching her hurts (her tutu and legs; over her head is safe)
    const d = this.dancer;
    const feet = d.groundY + this.hopLift;
    if (Math.abs(this.tick.x - d.x) < 44 && this.tick.y > feet - 90 && this.tick.y < feet + 40 && b - this.contactAt > 1) {
      this.contactAt = b;
      this.hurt('touch');
    }
    // pins: the cylinder rolling across the floor hurts whoever it rolls over (its top is
    // within a jump: in the air over it, or up on a cushion or the turntable, he is safe)
    for (const p of this.pins) {
      const x = this.pinX(p, b);
      const bottom = STAGE.floorY - this.drumHop(p, b);
      const top = bottom - 2 * DRUM_R - 10;
      if (!p.hit && b >= p.beat && b <= p.beat + 4 && Math.abs(x - this.tick.x) < DRUM_R + 4 && this.tick.y > top + 6 && this.tick.y < bottom + 30) {
        p.hit = true;
        this.hurt('pins');
      }
      // THUMP on every beat it lands
      const k = Math.floor(b - p.beat);
      if (b >= p.beat && b < p.beat + 4.05 && k !== (p as { k?: number }).k) {
        (p as { k?: number }).k = k;
        sfx('stamp');
        sfx('land', 0.01);
        this.cameras.main.shake(90, 0.0025);
        this.dust.push({ x, y: STAGE.floorY, t: 0 });
        this.thumps.push({ x, t: 0 });
      }
    }
    this.pins = this.pins.filter((p) => b < p.beat + 4.2);
    // kicks: her leg sweeps round her on each beat
    for (const kk of this.kicks) {
      kk.x = this.dancer.x;
      if (!kk.judged && b >= kk.beat + 0.06) {
        kk.judged = true;
        sfx('dash');
        if (Math.abs(this.tick.x - kk.x) < 300 && this.low()) this.hurt('kick');
      }
    }
    this.kicks = this.kicks.filter((kk) => b < kk.beat + 0.6);
    // bouquets: fall where Tick is (they aim 1 beat before), land on their beat
    for (const bq of this.bouquets) {
      if (b < bq.beat - 2) continue;
      // it picks its spot (where Tick is) a beat and a half before it lands, then that spot is
      // marked: there is a beat and a half to get out of the way
      if (b < bq.beat - 1.5 || bq.x < 0) bq.x = this.tick.x;
      if (bq.landed < 0) {
        // it hangs up in the dark gallery over its spot, swinging, then drops in the last beat
        const f = Phaser.Math.Clamp((b - (bq.beat - 1)) / 1, 0, 1);
        bq.img.setVisible(true).setPosition(bq.x, 70 + (STAGE.floorY - 10 - 70) * f * f).setRotation(Math.sin(b * 6) * 0.25);
        if (b >= bq.beat) {
          bq.landed = b;
          sfx('hop');
          if (Math.abs(this.tick.x - bq.x) < 50 && this.tick.y > STAGE.floorY - 90) this.hurt('bouquet');
        }
      } else bq.img.setAlpha(Math.max(0, 1 - (b - bq.landed) / 1.5));
    }
    this.bouquets = this.bouquets.filter((bq) => {
      if (bq.landed >= 0 && b > bq.landed + 1.5) {
        bq.img.destroy();
        return false;
      }
      return true;
    });
    this.minuets = this.minuets.filter((m) => b < m.beat + 6 * m.every + 0.5);
  }

  // ───────────────────────── phases ─────────────────────────

  private endPhase(): void {
    for (const n of this.flyers) {
      if (n.state === 'back') continue;
      n.state = 'gone';
      n.shatter = 0;
    }
    for (const bq of this.bouquets) bq.img.destroy();
    this.bouquets = [];
    this.queue = [];
    this.twirls = [];
    this.pins = [];
    this.kicks = [];
    this.minuets = [];
    this.sweeps = [];
    this.dash = null;
    this.hush = null;
    this.leap = { from: this.dancer.x, to: SPOTS.center, b0: this.beat };
    this.twinGoal = 0;
    for (const k of [0, 1]) this.stage.setCushion(k, 0);
    this.hushedSong = true;
    this.updateSongTone();
    if (this.phaseIdx >= this.level.phases.length - 1) {
      // the last of her spring: the song slows down and stops (and then she sings goodbye)
      this.stopSong(true);
      this.state = 'victory';
      this.stateT = 0;
      this.recordVictory();
      return;
    }
    this.state = 'windup';
    this.windBeat = Math.ceil(this.beat + 0.5);
    // the music never stops between turns: this turn's song plays on to the next beat and the
    // next turn (her "Click! Click! Wind me up again!") takes over right there
    if (this.songOn) this.stopSong(false, this.t0 + this.windBeat * this.spb, 0.2);
    else this.stopSong(true);
    this.speak('windup', undefined, true);
  }

  private updateWindup(): void {
    const ctx = AudioEngine.get().ctx;
    while (this.schedBeat < this.windBeat && this.t0 + this.schedBeat * this.spb < ctx.currentTime + 0.2) this.scheduleMusic();
    // with the recorded song, the next turn starts with her own "Click! Click! Wind me up again!"
    const wl = this.songOn ? 0 : 3;
    const k = Math.floor(this.beat - this.windBeat);
    if (!this.songOn && k >= 0 && k < 3 && this.spring < (k + 1) / 3) {
      this.spring = (k + 1) / 3;
      sfx('click');
      sfx('tick', 0.02);
    }
    if (k === (this.songOn ? 0 : 1) && this.title.alpha < 0.1) {
      const next = this.level.phases[this.phaseIdx + 1];
      this.showTitle(next.name, next.subtitle, 2);
    }
    // (with the song, the next turn is laid out a little ahead so its first bar starts on time)
    if (this.beat >= this.windBeat + wl - (this.songOn ? 0.4 : 0)) {
      // she winds herself up (no hit back: the golden notes are the only cure)
      this.startPhase(this.phaseIdx + 1, this.t0 + (this.windBeat + wl) * this.spb);
    }
  }

  private updateVictory(dt: number): void {
    const ctx = AudioEngine.get().ctx;
    // with the recorded song she sings her winding down first ("Thank you."), then speaks
    const outro = this.songOn ? this.level.audio?.outro : undefined;
    const late = outro ? 7.6 : 0;
    if (this.stateT < dt * 1.5 && outro) {
      this.hushedSong = false;
      this.songTone.frequency.setTargetAtTime(20000, ctx.currentTime, 0.05);
      this.songBus.gain.setTargetAtTime(SONG_GAIN, ctx.currentTime, 0.05);
      const buf = this.songBufs.get(outro);
      if (buf) this.playPiece(outro, ctx.currentTime + 0.4, 0, buf.duration);
      this.showTitle('', '', 0);
    } else if (this.stateT < dt * 1.5) {
      const tune = MELODIES[this.phase.melody] ?? MELODIES.waltz;
      let t = ctx.currentTime + 0.1;
      for (let k = 0; k < 7; k++) {
        const [, notes] = tune[k % tune.length];
        S.ding(this.bells, t, (notes[k % 3] || notes[0]) - k * 0.7);
        t += 0.35 + k * 0.18;
      }
      this.showTitle('', '', 0);
    }
    // wound down at last... and somebody watched
    const at = (sec: number): boolean => this.stateT > sec && this.stateT - dt <= sec;
    if (at(3.6 + late)) this.speakLine('...You stayed.');
    if (at(6.2 + late)) this.speakLine('Nobody ever stayed\nto watch before.');
    if (at(9.4 + late)) this.showResults();
    if (this.results && this.stateT > 10 + late && this.input2.consume('confirm') !== null) this.leave();
  }

  /** A line of her own (the ending). */
  private speakLine(line: string): void {
    this.lastLine = line;
    this.saidAt = this.beat;
    this.tweens.killTweensOf(this.bubble);
    this.bubble.setText(line).setAlpha(1).setScale(0.6);
    this.tweens.add({ targets: this.bubble, scale: 1, duration: 300, ease: 'Back.Out' });
    this.tweens.add({ targets: this.bubble, alpha: 0, delay: 2200, duration: 400 });
  }

  /** The rank: no hits and a long run of returns is an S. */
  private rank(): string {
    if (this.hits === 0 && this.tries === 0) return this.maxCombo >= 15 ? 'S' : 'A';
    return this.hits <= 1 && this.tries === 0 ? 'B' : 'C';
  }

  /** Her ending: the duel goes in the film can (she is freed, and leaves Elias something). */
  private recordVictory(): void {
    const s = Game.save;
    if (!s) return;
    recordLevel(s, this.level.id, true, this.rank());
    if (Game.story.chapters.some((c) => c.feature === this.level.id) && !s.freed.includes(this.level.id)) s.freed.push(this.level.id);
    const lo = this.level.lostObject;
    if (lo && !s.lostObjects.includes(lo.id)) s.lostObjects.push(lo.id);
    s.resume = null;
    Game.persist();
  }

  private showResults(): void {
    const c = this.add.container(640, 360).setDepth(180);
    const card = this.add.graphics();
    card.fillStyle(0x0b0b0b, 0.82);
    card.fillRect(-640, -360, 1280, 720);
    card.lineStyle(6, 0xf4efe4, 1);
    card.strokeRoundedRect(-330, -230, 660, 430, 30);
    const txt = (y: number, t: string, size: number, font = 'Limelight'): Phaser.GameObjects.Text =>
      this.add.text(0, y, t, { fontFamily: `${font}, Georgia, serif`, fontSize: `${size}px`, color: '#f4efe4', stroke: '#141414', strokeThickness: 6, align: 'center' }).setOrigin(0.5);
    const lo = this.level.lostObject;
    c.add([
      card,
      txt(-170, "THAT'S ALL, FOLKS!", 50, 'Rye'),
      txt(-90, `RANK  ${this.rank()}`, 40, 'Rye'),
      txt(-30, `Hits taken: ${this.hits}${this.tries ? `   ·   turns played again: ${this.tries}` : ''}`, 24),
      txt(10, `Notes sent back: ${this.parries}   ·   best combo: ${this.maxCombo}`, 24),
      txt(70, lo ? `Found: ${lo.name}` : '', 22),
      txt(150, `ENTER  ${Game.returnTo === 'hub' ? 'back to the Bijou' : Game.returnTo === 'test' ? 'back to the test stage' : 'continue'}`, 22),
    ]);
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 500 });
    this.results = c;
  }

  /** Out of the music box: back to wherever the duel was entered from. */
  private leave(): void {
    if (this.state === 'intro' && this.stateT < 0.3) return;
    this.cameras.main.fadeOut(300, 11, 11, 11);
    this.stopSong(false);
    const completed = this.state === 'victory';
    this.state = 'dead';
    this.time.delayedCall(320, () => leaveLevel(this, this.level.id, { completed }));
  }

  // ───────────────────────── her acting ─────────────────────────

  private directDancer(dt: number, t: number): void {
    const d = this.dancer;
    const b = this.beat;
    // a grand jeté across the stage: a leap in an arc, in arabesque
    let leaping = false;
    if (this.leap) {
      const f = Phaser.Math.Clamp((b - this.leap.b0) / 1.5, 0, 1);
      d.x = this.leap.from + (this.leap.to - this.leap.from) * (f * f * (3 - 2 * f));
      leaping = f > 0 && f < 1;
      if (f >= 1) this.leap = null;
    }
    if (this.dash) {
      const f = Phaser.Math.Clamp((b - this.dash.b0) / 2, 0, 1);
      d.x = this.dash.from + (this.dash.to - this.dash.from) * f;
      if (f >= 1) this.dash = null;
    }
    // her hunt: on each beat a quick hop on pointe towards where Tick is now
    let hopLift = 0;
    this.hopLift = 0;
    const bo = this.bourree;
    if (bo && b >= bo.b0) {
      const k = Math.floor(b - bo.b0);
      if (k >= bo.n) this.bourree = null;
      else {
        if (k !== bo.k) {
          bo.k = k;
          bo.from = d.x;
          const dx = this.tick.x - d.x;
          // (a hop a beat: shorter at a faster tempo, so she never outruns a jump over her)
          const reach = 100 * Math.min(1, 92 / this.bpm);
          bo.to = Phaser.Math.Clamp(d.x + Math.sign(dx) * Math.min(reach, Math.abs(dx)), 140, 1140);
          sfx('hop');
        }
        // the hop takes the first half of the beat (she lands on the "and")
        const f = Phaser.Math.Clamp((b - bo.b0 - k) / 0.5, 0, 1);
        d.x = bo.from + (bo.to - bo.from) * (f * f * (3 - 2 * f));
        hopLift = Math.sin(f * Math.PI) * 46;
        this.hopLift = hopLift;
      }
    }
    const onTable = Math.abs(d.x - SPOTS.center) < 40;
    const ground = onTable ? STAGE.danceY : STAGE.floorY;
    const hop = (leaping && this.leap ? Math.sin(((b - this.leap.b0) / 1.5) * Math.PI) * 170 : 0) + hopLift;
    d.groundY += (ground - hop - d.groundY) * Math.min(1, dt * 14);
    d.dir = this.tick.x < d.x ? -1 : 1;
    d.lookTarget = { x: this.tick.x, y: this.tick.y - 60 };
    const late = this.songOn && this.level.audio?.outro ? 7.6 : 0;
    d.spring = this.state === 'victory' ? Math.max(0, 1 - this.stateT / (2.5 + late)) : 1;
    let pose: DancerPose = 'stance';
    let mouth = 0;
    const minuet = this.minuets.find((m) => b >= m.beat && b < m.beat + 6 * m.every);
    if (this.state === 'victory') pose = this.stateT < 3.2 + late ? 'windDown' : 'bow';
    else if (this.state === 'windup') pose = 'windUp';
    else if (this.state === 'dead') pose = 'titter';
    else if (leaping) pose = 'arabesque';
    else if (this.bourree && b >= this.bourree.b0 - 1) pose = b < this.bourree.b0 ? 'curtsy' : 'arabesque';
    else if (this.dash || this.sweeps.some((sw) => b > sw.from - 2.2 && b < sw.to)) pose = 'twirl';
    else if (this.kicks.length) pose = 'fouette';
    else if (this.twirls.some((tw) => b > tw.beat - 2.2 && b < tw.beat + 0.7)) pose = 'twirl';
    else if (minuet) {
      // her bar: she dances the steps; Tick's bar: she curtsies and watches
      const k = Math.floor((b - minuet.beat) / minuet.every);
      pose = k < 3 ? (['throw', 'throw', 'twirl'] as DancerPose[])[k] : 'curtsy';
      mouth = k < 3 ? 0.6 : 0;
    } else if (this.flyers.some((n) => n.kind === 'note' && n.src === 'hand' && b > n.launch - 1 && b < n.launch + 0.4)) pose = 'throw';
    else if (b - this.hurtAt < 0.8) pose = 'nervous';
    else if (b - this.laughAt < 1.5) pose = 'titter';
    else if (this.sing && b >= this.sing.from && b < this.sing.to) {
      pose = 'sing';
      mouth = Math.max(0, Math.sin(b * Math.PI)) * 0.9;
    } else if (this.spring < 0.3) pose = 'nervous';
    else if (this.flyers.some((n) => n.state === 'fly')) pose = 'sing';
    // her lips follow the words of the song
    if (this.state === 'play' && mouth === 0) {
      const sung = LyricsUI.mouthAt(this.lines, b);
      if (sung.open > 0) {
        mouth = sung.open * 0.9;
        if (pose === 'stance') pose = 'sing';
      }
    }
    // talking: her lips move while her card is up
    const talking = this.bubble.alpha > 0.5;
    if (talking && mouth === 0 && pose !== 'twirl' && pose !== 'fouette') mouth = 0.25 + Math.abs(Math.sin(t * 13)) * 0.45;
    d.pose = pose;
    d.mouth = mouth;
    d.update(dt, t, b);
    const head = d.headPos();
    this.bubble.setPosition(Phaser.Math.Clamp(head.x, 170, 1110), Math.max(150, head.y - 70));
    const throwing = this.flyers.some((n) => n.src === 'mirror' && b > n.launch - 1 && b < n.launch + 0.4) ? 'throw' : pose;
    const r = this.stage.reflection;
    this.directTwin(dt, t, throwing, mouth);
    if (r) {
      // in the glass while she is in it; gone while she is out on the stage
      // (gone the moment her reflection starts out of the glass: never two of her at once)
      r.setAlpha(this.twinOut > 0.02 ? 0 : 0.55);
      r.pose = throwing;
      r.mouth = mouth;
      r.dir = d.dir;
      r.spring = d.spring;
      r.update(dt, t, b);
    }
    this.coach(dt, b);
  }

  /** What to do right now, in words, at the top of the screen (the minuet, her reflection, a
   *  refrain that will not end): nothing is left for the player to guess. */
  private coach(dt: number, b: number): void {
    const d = this.dancer;
    let msg = '';
    const m = this.state === 'play' ? this.minuets.find((q) => b >= q.beat - 2 && b < q.beat + 6 * q.every) : undefined;
    if (m) {
      // a step of his that slipped by: say so right away (which one, and which key it wanted)
      const late = this.windowMs().ok / 1000 / this.spb;
      m.steps.forEach((st, k) => {
        const at = m.beat + (3 + k) * m.every;
        if (!m.done[k] && !m.told[k] && b > at + late) {
          m.told[k] = true;
          this.hud.showJudge(`missed  ${st === 'parry' ? 'C' : 'Z'}!`, this.tick.x, this.tick.y - 200);
        }
      });
      const yours = b >= m.beat + 3 * m.every - 0.5;
      msg = yours ? 'YOUR TURN!  copy her steps on the beat:   C   C   Z (jump)' : 'MINUET!  watch her three steps...  then copy them';
      if (!this.saidPas && Math.abs(d.x - SPOTS.center) < 60 && !this.onTable()) msg += '\n▲ up on the turntable beside her it is a PAS DE DEUX: each step hurts her more';
    } else if (this.state === 'play' && this.twinOut > 0.5 && b - this.twinOutAt < 8) {
      msg = `HER REFLECTION IS OUT!  send its notes back (C): 3 cracks and it shatters   (${this.twinCracks}/3)`;
    }
    if (msg) this.hint.setText(msg);
    this.hint.setAlpha(Phaser.Math.Clamp(this.hint.alpha + (msg ? dt * 4 : -dt * 3), 0, 1));
    // a refrain coming round again: the song waits for her spring to go down to the notch
    const cur = this.state === 'play' && this.plan.length ? this.sectionAt(b) : null;
    const tip = !!cur && cur.refrain && b >= cur.start && this.spring > this.gateOf(cur.sec) + 0.001;
    this.refrainTip.setAlpha(Phaser.Math.Clamp(this.refrainTip.alpha + (tip ? dt * 3 : -dt * 4), 0, 1));
  }

  /** Which card (if any) explains this event. */
  private tipFor(e: DuelEvent): TipKey | null {
    if (e.type === 'note') return e.gold ? 'gold' : e.high ? 'high' : 'note';
    if (e.type === 'minuet' || e.type === 'moths' || e.type === 'sweep' || e.type === 'pins' || e.type === 'bouquets') return e.type;
    if (e.type === 'mirror' && e.out !== false && this.twin && !this.mirrorBroken) return 'mirror';
    return null;
  }

  /** Stop everything (the song too: its clock is the game's) and explain. */
  private showTip(key: TipKey): void {
    if (this.tip) return;
    const T = TIPS[key];
    const body = this.add
      .text(0, 0, T.body.replace(/\n/g, ' '), { fontFamily: 'Limelight, Georgia, serif', fontSize: '21px', color: '#e8e2d4', align: 'center', lineSpacing: 8, wordWrap: { width: 800 } })
      .setOrigin(0.5, 0);
    const h = 160 + body.height;
    body.setY(-h / 2 + 86);
    const box = this.add.container(640, 330).setDepth(200);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.45);
    g.fillRect(-640, -330, 1280, 720);
    g.fillStyle(0x141414, 0.96);
    g.fillRoundedRect(-450, -h / 2, 900, h, 18);
    g.lineStyle(5, 0xf4efe4, 1);
    g.strokeRoundedRect(-450, -h / 2, 900, h, 18);
    g.lineStyle(2, 0xf4efe4, 0.6);
    g.strokeRoundedRect(-438, -h / 2 + 12, 876, h - 24, 12);
    const title = this.add.text(0, -h / 2 + 46, T.title, { fontFamily: 'Rye, Georgia, serif', fontSize: '36px', color: '#f4efe4', stroke: '#000000', strokeThickness: 6 }).setOrigin(0.5);
    const foot = this.add.text(0, h / 2 - 34, 'Z  or  ENTER  to continue', { fontFamily: 'Limelight, Georgia, serif', fontSize: '18px', color: '#ffffff' }).setOrigin(0.5);
    this.tweens.add({ targets: foot, alpha: 0.35, duration: 500, yoyo: true, repeat: -1 });
    box.add([g, title, body, foot]);
    box.setScale(0.85).setAlpha(0);
    this.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 180, ease: 'Back.Out' });
    this.tip = { box, at: this.time.now };
    this.tipsSeen.add(key);
    try {
      localStorage.setItem(TIPS_KEY, JSON.stringify([...this.tipsSeen]));
    } catch {
      // (private browsing: the cards come back next time)
    }
    void AudioEngine.get().ctx.suspend();
    sfx('select');
  }

  private closeTip(): void {
    if (!this.tip) return;
    const box = this.tip.box;
    this.tip = null;
    this.tweens.add({ targets: box, alpha: 0, scale: 0.9, duration: 140, onComplete: () => box.destroy() });
    void AudioEngine.get().ctx.resume();
  }

  /** One of its own notes sent back to her reflection: a crack; at three, it shatters. */
  private crackTwin(): void {
    if (!this.twin) return;
    this.twinCracks++;
    const h = this.twin.headPos();
    const now = AudioEngine.get().ctx.currentTime;
    if (this.twinCracks < 3) {
      sfx('punch');
      for (let k = 0; k < 3; k++) S.ding(this.bells, now + k * 0.04, 96 - k * 5 - this.twinCracks * 2);
      this.hud.showJudge(this.twinCracks === 1 ? 'CRACK!' : 'CRACK! CRACK!', h.x, h.y - 40);
      return;
    }
    // shattered: a shower of glass, a big blow to her spring, and the lid's mirror stays broken
    sfx('crash');
    for (let k = 0; k < 8; k++) S.ding(this.bells, now + k * 0.035, 100 - k * 4);
    this.hud.showJudge('SHATTERED!', h.x, h.y - 40);
    this.cameras.main.shake(260, 0.012);
    if (this.film) this.film.flash = 0.5;
    const w = this.twin;
    for (let k = 0; k < 26; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = 200 + Math.random() * 420;
      this.shards.push({ x: w.x + (Math.random() - 0.5) * 90, y: w.groundY - 60 - Math.random() * 220, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 220, r: Math.random() * 6, vr: (Math.random() - 0.5) * 14, s: 8 + Math.random() * 16 });
    }
    this.twinGoal = 0;
    this.twinOut = 0;
    this.twin.setVisible(false);
    this.mirrorBroken = true;
    // the flyers it had thrown fall out of the air with it
    for (const n of this.flyers) if (n.src === 'mirror' && n.state === 'fly') { n.state = 'gone'; n.shatter = 0; }
    this.hitHer(0.1);
    this.speak('shatter', undefined, true);
  }

  /** Where her reflection dances: across the stage from her (never right on top of her). */
  private twinMark(): number {
    const x = this.leap ? this.leap.to : this.dancer.x;
    let tx = 1280 - x;
    if (Math.abs(tx - x) < 280) tx = x < 640 ? x + 420 : x - 420;
    return Phaser.Math.Clamp(tx, 200, 1080);
  }

  /** Her reflection out of the mirror: it climbs down out of the lid, grows to her size (a
   *  little smaller, see-through, mirrored) and dances on the far side of the stage, doing what
   *  she does; going back in, it floats up into the glass again. */
  private directTwin(dt: number, t: number, pose: DancerPose, mouth: number): void {
    const w = this.twin;
    if (!w) return;
    const step = dt / (1.6 * this.spb);
    this.twinOut = this.twinGoal > this.twinOut ? Math.min(this.twinGoal, this.twinOut + step) : Math.max(this.twinGoal, this.twinOut - step);
    w.setVisible(this.twinOut > 0.001);
    if (this.twinOut <= 0.001) return;
    // in the glass she is seen from behind, like the reflection; half way out she turns round
    w.turnAround(this.twinOut < 0.4);
    const d = this.dancer;
    this.twinX += (this.twinMark() - this.twinX) * Math.min(1, dt * 2.5);
    const e = this.twinOut * this.twinOut * (3 - 2 * this.twinOut);
    // she slides out sideways along the lid first, then floats down to the floor
    const ex = 1 - Math.pow(1 - this.twinOut, 2.4);
    const mirrorFeet = STAGE.mirror.y + STAGE.mirror.ry - 2;
    // she hovers a little over the velvet: she is only a reflection
    const floorY = STAGE.floorY - 26 + Math.sin(t * 2.2) * 6;
    w.x = STAGE.mirror.x + (this.twinX - STAGE.mirror.x) * ex;
    w.groundY = mirrorFeet + (floorY - mirrorFeet) * Math.pow(this.twinOut, 1.6);
    w.size = 0.17 + 0.35 * e;
    w.setAlpha(0.3 + 0.25 * e + Math.sin(t * 5) * 0.04);
    const b = this.beat;
    w.pose = this.state === 'dead' ? 'titter' : pose;
    w.mouth = mouth;
    w.dir = this.tick.x < w.x ? -1 : 1;
    w.lookTarget = { x: this.tick.x, y: this.tick.y - 60 };
    w.spring = d.spring;
    w.update(dt, t, b);
  }

  // ───────────────────────── drawing ─────────────────────────

  private drawFx(dt: number, t: number): void {
    const g = this.fx;
    g.clear();
    const b = this.beat;
    const floor = STAGE.floorY;
    // twirl: a ring tightens under her feet for 2 beats, then the tulle sweeps the floor on the beat
    for (const tw of this.twirls) {
      const warn = Phaser.Math.Clamp((tw.beat - b) / 2.2, 0, 1);
      if (warn > 0) {
        g.lineStyle(4, 0xffffff, 0.85);
        g.strokeEllipse(tw.x, floor - 8, 260 + warn * 520, 30 + warn * 50);
      }
      if (warn > 0 && this.twinOut > 0.9) {
        g.lineStyle(3, 0xffffff, 0.5);
        g.strokeEllipse(this.twinX, floor - 8, 200 + warn * 360, 24 + warn * 36);
      }
      const f = Phaser.Math.Clamp((b - (tw.beat - 0.5)) / 0.5, 0, 1);
      if (f > 0 && b < tw.beat + 0.4) {
        const a = b > tw.beat ? 1 - (b - tw.beat) / 0.4 : 1;
        const sides: [number, number][] = [[tw.x, -1], [tw.x, 1]];
        if (this.twinOut > 0.9) sides.push([this.twinX, -1], [this.twinX, 1]);
        for (const [cx, side] of sides) {
          const x = cx + side * (120 + f * 620);
          g.fillStyle(0xffffff, 0.6 * a);
          g.fillEllipse(x, floor - 8, 70 + f * 40, 24);
          g.lineStyle(4, 0x141414, a);
          g.strokeEllipse(x, floor - 8, 70 + f * 40, 24);
        }
      }
    }
    // a long sweep: a ring warns for 2 beats, then the floor is a sea of tulle pulsing on each beat
    for (const sw of this.sweeps) {
      if (b < sw.from) {
        const warn = Phaser.Math.Clamp((sw.from - b) / 2.2, 0, 1);
        g.lineStyle(5, 0xffffff, 0.9);
        g.strokeEllipse(this.dancer.x, floor - 8, 1100 * (1 - warn * 0.6), 40);
        continue;
      }
      if (b > sw.to) continue;
      const pulse = Math.pow(1 - (b - Math.floor(b)), 3);
      for (let x = 100; x < 1190; x += 70) {
        const h = 14 + pulse * 22 + Math.sin(x * 0.05 + b * 6) * 4;
        g.fillStyle(0xffffff, 0.35 + pulse * 0.4);
        g.fillEllipse(x, floor - h / 2, 80, h);
        g.lineStyle(3, 0x141414, 0.5 + pulse * 0.4);
        g.strokeEllipse(x, floor - h / 2, 80, h);
      }
    }
    // her hunt: chevrons on the floor from her towards Tick, flashing on each hop
    if (this.bourree && b >= this.bourree.b0 - 1) {
      const dir = Math.sign(this.tick.x - this.dancer.x) || 1;
      const pulse = Math.pow(1 - (b - Math.floor(b)), 2);
      for (let k = 1; k <= 3; k++) {
        const x = this.dancer.x + dir * (50 + k * 46);
        const a = 0.45 + pulse * 0.55;
        for (const [w, col] of [[13, 0x141414], [7, 0xffffff]] as const) {
          g.lineStyle(w, col, a);
          g.lineBetween(x - dir * 22, floor - 40, x, floor - 18);
          g.lineBetween(x, floor - 18, x - dir * 22, floor + 4);
        }
      }
    }
    // her reflection out on the stage: made of glass. Glints slide over her, and every note of
    // hers sent back to her leaves a crack across her (three, and she shatters)
    if (this.twin && this.twinOut > 0.05) {
      const w = this.twin;
      const sc = w.size / 0.52;
      const cx = w.x;
      const cy = w.groundY - 150 * sc;
      const a = Math.min(1, this.twinOut * 1.5);
      const gl = ((this.time.now / 1000) * 0.5) % 1;
      for (const off of [0, 0.14]) {
        const gx = cx - 70 * sc + ((gl + off) % 1) * 140 * sc;
        g.lineStyle(off ? 3 : 6, 0xffffff, 0.5 * a * Math.sin(((gl + off) % 1) * Math.PI));
        g.lineBetween(gx + 20 * sc, cy - 70 * sc, gx - 20 * sc, cy + 20 * sc);
      }
      const cracks = [
        [[0, -40], [-30, 0], [-12, 30], [-48, 80]],
        [[0, -40], [36, -10], [22, 40], [60, 96]],
        [[-30, 0], [10, 10], [36, -10], [70, -50]],
      ];
      for (let k = 0; k < Math.min(3, this.twinCracks); k++) {
        const pts = cracks[k].map(([x, y]) => ({ x: cx + x * sc * 1.4, y: cy + y * sc * 1.4 }));
        g.lineStyle(5, 0x141414, 0.85 * a);
        g.strokePoints(pts);
        g.lineStyle(2, 0xffffff, 0.95 * a);
        g.strokePoints(pts);
      }
    }
    // glass flying from a shattered reflection
    this.shards = this.shards.filter((sh) => sh.y < 760);
    for (const sh of this.shards) {
      sh.vy += 900 * dt;
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
      sh.r += sh.vr * dt;
      const c = Math.cos(sh.r);
      const sn = Math.sin(sh.r);
      const tri = [[0, -1], [0.8, 0.7], [-0.6, 0.5]].map(([x, y]) => ({ x: sh.x + (x * c - y * sn) * sh.s, y: sh.y + (x * sn + y * c) * sh.s }));
      g.fillStyle(0xf4f4f4, 0.9);
      g.lineStyle(2, 0x141414, 0.9);
      g.fillPoints(tri, true);
      g.strokePoints(tri, true);
    }
    // the lid's mirror, broken: a star of cracks across the glass until the next turn of the key
    if (this.mirrorBroken) {
      const M = STAGE.mirror;
      g.lineStyle(4, 0x141414, 0.8);
      for (let k = 0; k < 9; k++) {
        const ang = (k / 9) * Math.PI * 2 + 0.3;
        const r1 = 0.95 - (k % 3) * 0.12;
        g.lineBetween(M.x + 6, M.y + 4, M.x + Math.cos(ang) * M.rx * r1, M.y + Math.sin(ang) * M.ry * r1);
      }
      g.lineStyle(2, 0xffffff, 0.7);
      for (let k = 0; k < 9; k++) {
        const ang = (k / 9) * Math.PI * 2 + 0.3;
        g.lineBetween(M.x + 6, M.y + 4, M.x + Math.cos(ang) * M.rx * 0.8, M.y + Math.sin(ang) * M.ry * 0.8);
      }
    }
    // her spinning dash: a trail of tulle behind her along the floor
    if (this.dash) {
      const dir = Math.sign(this.dash.to - this.dash.from) || 1;
      for (let k = 1; k < 6; k++) {
        g.fillStyle(0xffffff, 0.4 - k * 0.06);
        g.fillEllipse(this.dancer.x - dir * k * 36, floor - 20, 90 - k * 10, 30 - k * 3);
      }
    }
    // the cylinder: first it rattles loose at its wall (an arrow across the floor shows the way
    // it will come), then it rolls across in bounds, pins out, a THUMP and a puff of dust on each beat
    for (const p of this.pins) {
      if (b < p.beat - 1.5) continue;
      const warn = b < p.beat;
      const x = warn ? (p.dir > 0 ? 100 : 1180) + Math.sin(b * 60) * 3 : this.pinX(p, b);
      const cy = floor - this.drumHop(p, b) - DRUM_R - 6;
      if (warn) {
        const a = Math.min(1, (b - (p.beat - 1.5)) / 0.5);
        for (let k = 0; k < 7; k++) {
          const ax = (p.dir > 0 ? 180 : 1100) + p.dir * k * 140;
          const pulse = (b * 2 + k * 0.25) % 1;
          g.fillStyle(0xffffff, a * (0.35 + 0.5 * pulse));
          g.fillTriangle(ax, floor - 30, ax, floor - 6, ax + p.dir * 26, floor - 18);
        }
        g.lineStyle(3, 0xffffff, a * 0.8);
        g.strokeCircle(x, cy, DRUM_R + 26 + Math.sin(b * 12) * 4);
      } else {
        // speed lines behind it
        for (let k = 1; k <= 3; k++) {
          g.lineStyle(4, 0xffffff, 0.5 - k * 0.12);
          g.lineBetween(x - p.dir * (DRUM_R + 14 + k * 22), cy - 24 + k * 14, x - p.dir * (DRUM_R + 60 + k * 30), cy - 24 + k * 14);
        }
      }
      // its shadow on the floor (smaller while it is up in a bound)
      const up = this.drumHop(p, b) / 14;
      g.fillStyle(0x000000, 0.35 - up * 0.15);
      g.fillEllipse(x, floor - 4, (DRUM_R * 2 + 20) * (1 - up * 0.3), 14);
      // the drum: the music box's brass cylinder seen three-quarters on (its back end behind it),
      // turning as it rolls, with its pins all round
      const rot = warn ? Math.sin(b * 40) * 0.08 : ((b - p.beat) * 1080) / 4 / DRUM_R * p.dir;
      const bx = x + 34;
      const by = cy - 22;
      const pinsOn = (ox: number, oy: number, dark: boolean): void => {
        for (let k = 0; k < 16; k++) {
          const ang = rot + (k / 16) * Math.PI * 2;
          const tip = { x: ox + Math.cos(ang) * (DRUM_R + 17), y: oy + Math.sin(ang) * (DRUM_R + 17) };
          const l = { x: ox + Math.cos(ang - 0.1) * (DRUM_R - 2), y: oy + Math.sin(ang - 0.1) * (DRUM_R - 2) };
          const r = { x: ox + Math.cos(ang + 0.1) * (DRUM_R - 2), y: oy + Math.sin(ang + 0.1) * (DRUM_R - 2) };
          g.fillStyle(dark ? 0x9a9488 : 0xf2eee4, 1);
          g.fillTriangle(l.x, l.y, r.x, r.y, tip.x, tip.y);
          g.lineStyle(3, 0x141414, 1);
          g.strokeTriangle(l.x, l.y, r.x, r.y, tip.x, tip.y);
        }
      };
      // back end, the body between the two ends, front end
      pinsOn(bx, by, true);
      g.fillStyle(0x8a8478, 1);
      g.fillCircle(bx, by, DRUM_R);
      const nrm = Math.atan2(by - cy, bx - x) + Math.PI / 2;
      const ox = Math.cos(nrm) * DRUM_R;
      const oy = Math.sin(nrm) * DRUM_R;
      const body = [
        { x: x + ox, y: cy + oy }, { x: bx + ox, y: by + oy }, { x: bx - ox, y: by - oy }, { x: x - ox, y: cy - oy },
      ];
      g.fillStyle(0xa8a092, 1);
      g.fillPoints(body, true);
      g.lineStyle(5, 0x141414, 1);
      g.lineBetween(body[0].x, body[0].y, body[1].x, body[1].y);
      g.lineBetween(body[2].x, body[2].y, body[3].x, body[3].y);
      // rows of pins along the body, turning with it
      for (let k = 0; k < 4; k++) {
        const f = (k + 0.5) / 4;
        const px = x + (bx - x) * f;
        const py = cy + (by - cy) * f;
        const ang = rot * 1.0 + k * 1.3;
        const side = Math.sin(ang);
        const ex = px + ox * side;
        const ey = py + oy * side;
        g.lineStyle(5, 0x141414, 1);
        g.lineBetween(ex, ey, ex + ox * side * 0.32, ey + oy * side * 0.32);
      }
      pinsOn(x, cy, false);
      g.fillStyle(0xc8c0b0, 1);
      g.fillCircle(x, cy, DRUM_R);
      g.lineStyle(6, 0x141414, 1);
      g.strokeCircle(x, cy, DRUM_R);
      g.lineStyle(3, 0x141414, 0.8);
      g.strokeCircle(x, cy, DRUM_R * 0.62);
      for (let k = 0; k < 6; k++) {
        const ang = rot + (k / 6) * Math.PI * 2;
        g.lineBetween(x + Math.cos(ang) * DRUM_R * 0.62, cy + Math.sin(ang) * DRUM_R * 0.62, x + Math.cos(ang) * DRUM_R * 0.95, cy + Math.sin(ang) * DRUM_R * 0.95);
      }
      g.fillStyle(0x141414, 1);
      g.fillCircle(x, cy, 11);
      g.fillStyle(0xffffff, 0.55);
      g.fillEllipse(x - DRUM_R * 0.35, cy - DRUM_R * 0.45, DRUM_R * 0.5, DRUM_R * 0.22);
    }
    // THUMP! over each landing
    this.thumps = this.thumps.filter((u) => (u.t += dt) < 0.6);
    while (this.thumpText.length < this.thumps.length) {
      this.thumpText.push(this.add.text(0, 0, 'THUMP!', { fontFamily: 'Rye, Georgia, serif', fontSize: '40px', color: '#f4efe4', stroke: '#141414', strokeThickness: 8 }).setOrigin(0.5).setDepth(60));
    }
    this.thumpText.forEach((tx, k) => {
      const u = this.thumps[k];
      tx.setVisible(!!u);
      if (!u) return;
      const f = u.t / 0.6;
      tx.setPosition(u.x, floor - 190 - f * 30).setScale(0.7 + Math.min(1, f * 5) * 0.5).setAlpha(1 - f * f).setAngle(Math.sin(u.x) * 8);
    });
    // dust where it lands
    this.dust = this.dust.filter((u) => (u.t += dt) < 0.5);
    for (const u of this.dust) {
      const f = u.t / 0.5;
      g.fillStyle(0xe8e4d8, 0.55 * (1 - f));
      for (const sx of [-1, 1]) g.fillCircle(u.x + sx * (30 + f * 70), u.y - 10 - f * 14, 14 + f * 12);
    }
    // kicks: her leg's sweep, a wide arc round her at floor height on each beat
    for (const kk of this.kicks) {
      const f = 1 - Math.abs(b - kk.beat) / 0.6;
      if (f <= 0) continue;
      g.lineStyle(10, 0xffffff, 0.75 * f);
      g.beginPath();
      g.arc(kk.x, floor - 30, 300, Math.PI * 0.05, Math.PI * 0.95);
      g.strokePath();
      g.lineStyle(4, 0x141414, 0.9 * f);
      g.strokeEllipse(kk.x, floor - 6, 600, 40);
    }
    // bouquets: once a spot is picked, a target on the floor (a ring closing on it and a cross)
    // and a dotted line up to the roses hanging over it
    for (const bq of this.bouquets) {
      if (bq.landed >= 0 || b < bq.beat - 2) continue;
      const locked = b >= bq.beat - 1.5;
      const f = Phaser.Math.Clamp((b - (bq.beat - 1.5)) / 1.5, 0, 1);
      g.fillStyle(0x000000, 0.25 + f * 0.35);
      g.fillEllipse(bq.x, floor - 4, 50 + f * 50, 14);
      if (!locked) continue;
      const blink = Math.floor(b * 4) % 2 === 0 ? 1 : 0.6;
      g.lineStyle(5, 0xffffff, 0.9 * blink);
      g.strokeEllipse(bq.x, floor - 6, 70 + (1 - f) * 140, 20 + (1 - f) * 30);
      g.lineStyle(6, 0x141414, 0.9);
      g.lineBetween(bq.x - 22, floor - 16, bq.x + 22, floor + 4);
      g.lineBetween(bq.x - 22, floor + 4, bq.x + 22, floor - 16);
      g.lineStyle(3, 0xffffff, 1);
      g.lineBetween(bq.x - 20, floor - 15, bq.x + 20, floor + 3);
      g.lineBetween(bq.x - 20, floor + 3, bq.x + 20, floor - 15);
      g.lineStyle(2, 0xffffff, 0.5);
      for (let y = 110; y < floor - 30; y += 24) g.lineBetween(bq.x, y, bq.x, y + 10);
    }
    // the minuet: her steps light up over her, then over Tick when it is his turn
    for (const ic of this.stepIcons) ic.setVisible(false);
    for (const c of this.stepCaps) c.setVisible(false);
    this.stepWho.setVisible(false);
    const m = this.minuets.find((q) => b >= q.beat - 0.5 && b < q.beat + 6 * q.every);
    if (m) {
      const mine = b >= m.beat + 3 * m.every - 0.5;
      const head = this.dancer.headPos();
      m.steps.forEach((s, k) => {
        const ic = this.stepIcons[k];
        const at = m.beat + ((mine ? 3 : 0) + k) * m.every;
        const lit = Math.abs(b - at) < 0.4;
        // hers beside her head, on Tick's side (above it are the bar and the hints); his over him
        const side = this.tick.x < head.x ? -1 : 1;
        const hx = Phaser.Math.Clamp(head.x + side * 190, 130, 1150);
        const x = (mine ? this.tick.x : hx) + (k - 1) * 62;
        const y = (mine ? this.tick.y - 160 : head.y + 10) - (lit ? 8 : 0);
        const done = mine && m.done[k];
        const missed = mine && !done && b > at + 0.4;
        // a key cap: the key to press, and what it does under it
        const sc = lit ? 1.25 : 1;
        g.fillStyle(lit ? 0xffffff : 0x141414, done || missed ? 0.4 : 0.92);
        g.fillRoundedRect(x - 24 * sc, y - 24 * sc, 48 * sc, 48 * sc, 9);
        g.lineStyle(4, lit ? 0x141414 : 0xf4efe4, done || missed ? 0.4 : 1);
        g.strokeRoundedRect(x - 24 * sc, y - 24 * sc, 48 * sc, 48 * sc, 9);
        // on his turn, a ring closes on the step to press, landing on its beat
        if (mine && !done && b < at + 0.4 && b > at - m.every) {
          const f = Phaser.Math.Clamp((at - b) / m.every, 0, 1);
          g.lineStyle(4, 0xffffff, 0.95 - f * 0.5);
          g.strokeCircle(x, y, 32 * sc + f * 46);
        }
        ic.setVisible(true)
          .setText(s === 'parry' ? 'C' : 'Z')
          .setPosition(x, y)
          .setScale(sc)
          .setAlpha(done || missed ? 0.4 : 1)
          .setColor(lit ? '#141414' : '#f4efe4');
        const cap = this.stepCaps[k];
        cap.setVisible(true).setText(done ? '✓' : s === 'parry' ? 'step' : 'turn').setPosition(x, y + 38 * sc).setAlpha(done || missed ? 0.5 : 1);
      });
      // whose turn it is
      const side = this.tick.x < head.x ? -1 : 1;
      this.stepWho
        .setVisible(true)
        .setText(mine ? 'YOU!' : 'HER STEPS')
        .setPosition(mine ? this.tick.x : Phaser.Math.Clamp(head.x + side * 190, 130, 1150), (mine ? this.tick.y - 160 : head.y + 10) - 50);
    }
    // flyers: a halo behind each, and a ring closing on Tick that meets it exactly on its beat
    for (const n of this.flyers) {
      if (n.state !== 'fly' && n.state !== 'back') continue;
      g.fillStyle(0xffffff, 0.28);
      g.fillCircle(n.img.x, n.img.y, n.kind === 'note' ? 44 : 34);
      if (n.gold) {
        // the golden note: a star burst round it, turning (sent back on the beat, a hit back)
        const tw = (this.time.now / 1000) * 3;
        for (let k = 0; k < 8; k++) {
          const a = tw + (k / 8) * Math.PI * 2;
          const r0 = 40;
          const r1 = k % 2 ? 58 : 70;
          g.lineStyle(6, 0x141414, 0.9);
          g.lineBetween(n.img.x + Math.cos(a) * r0, n.img.y + Math.sin(a) * r0, n.img.x + Math.cos(a) * r1, n.img.y + Math.sin(a) * r1);
          g.lineStyle(3, 0xffffff, 1);
          g.lineBetween(n.img.x + Math.cos(a) * r0, n.img.y + Math.sin(a) * r0, n.img.x + Math.cos(a) * r1, n.img.y + Math.sin(a) * r1);
        }
      }
      if (n.state !== 'fly') continue;
      const f = Phaser.Math.Clamp((b - n.launch) / (n.arrive - n.launch), 0, 1);
      const pulse = Math.abs(b - n.arrive) < 0.12 ? 1 : 0;
      g.lineStyle(pulse ? 7 : 4, 0xffffff, 0.35 + f * 0.6);
      g.strokeCircle(n.to.x, n.to.y, 34 + (1 - f) * 110);
      g.lineStyle(2, 0xffffff, 0.5);
      g.strokeCircle(n.to.x, n.to.y, 34);
      if (n.high) {
        for (let y = n.to.y + 40; y < this.standY - 60; y += 22) g.lineBetween(n.to.x, y, n.to.x, y + 10);
        g.fillStyle(0xffffff, 0.9);
        g.fillTriangle(n.to.x - 9, n.to.y + 48, n.to.x + 9, n.to.y + 48, n.to.x, n.to.y + 36);
      }
    }
    // Tick's parry: a big white swing in front of him
    this.swipe = Math.max(0, this.swipe - dt * 5);
    if (this.swipe > 0) {
      const face = this.tick.facing ?? 1;
      g.lineStyle(10, 0xffffff, this.swipe);
      g.beginPath();
      g.arc(this.tick.x + face * 10, this.tick.y - 50, 66, face > 0 ? -1.6 : Math.PI - 1.6, face > 0 ? 1.6 : Math.PI + 1.6);
      g.strokePath();
    }
    // sparks where a note was sent back
    // (a cartoon impact: a white star with an ink rim that pops out and is gone in a few frames,
    // a ring, and ink drops flying off; drawn on twos, like the cel animation)
    this.sparks = this.sparks.filter((s) => (s.t += dt) < 0.36);
    for (const s of this.sparks) {
      const f = Math.floor((s.t / 0.36) * 9) / 9;
      const size = (s.big ? 1.35 : 1) * (s.hit ? 1.2 : 1);
      if (f < 0.5) {
        const r1 = (22 + f * 70) * size;
        const r0 = r1 * 0.45;
        const pts: Pt[] = [];
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2 + s.x;
          const r = k % 2 ? r0 : r1 * (k % 4 === 0 ? 1 : 0.78);
          pts.push({ x: s.x + Math.cos(a) * r, y: s.y + Math.sin(a) * r });
        }
        g.fillStyle(0xffffff, 1);
        g.fillPoints(pts, true);
        g.lineStyle(5, 0x141414, 1);
        g.strokePoints(pts, true);
        if (s.hit) {
          g.fillStyle(0x141414, 1);
          g.fillCircle(s.x, s.y, r0 * 0.45);
        }
      }
      g.lineStyle(4, 0xffffff, 1 - f);
      g.strokeCircle(s.x, s.y, (30 + f * 90) * size);
      g.fillStyle(0x141414, 1 - f);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + s.y;
        g.fillCircle(s.x + Math.cos(a) * (36 + f * 110) * size, s.y + Math.sin(a) * (36 + f * 110) * size + f * f * 40, 6 * (1 - f) + 2);
      }
    }
  }

  private drawGauge(t: number): void {
    const g = this.gauge;
    g.clear();
    const x0 = 440;
    const w = 400;
    const y = 30;
    const total = this.level.phases.length;
    g.fillStyle(0x141414, 0.8);
    g.fillRoundedRect(x0 - 70, y - 18, w + 140, 40, 12);
    for (let k = 0; k < total; k++) {
      const left = k > this.phaseIdx || (k === this.phaseIdx && this.state !== 'victory');
      const kx = x0 - 50 + k * 20;
      g.fillStyle(left ? 0xe8e8e8 : 0x4a4a4a, 1);
      g.fillCircle(kx, y + 2, 7);
      g.fillRect(kx - 2, y + 6, 4, 10);
    }
    g.fillStyle(0x3a3a3a, 1);
    g.fillRoundedRect(x0, y - 6, w, 16, 8);
    const s = this.state === 'victory' ? 0 : this.spring;
    g.fillStyle(0xf4efe4, 1);
    if (s > 0) g.fillRoundedRect(x0, y - 6, Math.max(16, w * s), 16, 8);
    // the stanza's gate: a notch where her spring stops until the song moves on to the next verse
    const floor = this.state === 'play' ? this.springFloor() : 0;
    if (floor > 0) {
      const nx = x0 + w * floor;
      g.fillStyle(0x141414, 1);
      g.fillRect(nx - 2, y - 9, 4, 22);
      g.fillTriangle(nx - 6, y - 12, nx + 6, y - 12, nx, y - 5);
    }
    this.gaugeLabel.setText(this.state === 'victory' ? 'MISS PIROUETTE  ·  wound down' : 'MISS PIROUETTE');
    // Tick's spare lives: little pocket watches by the bar
    for (let k = 0; k < this.lives - 1; k++) {
      const lx = x0 + w + 32 + k * 24;
      g.fillStyle(0xe8e8e8, 1);
      g.fillCircle(lx, y + 2, 8);
      g.lineStyle(3, 0x141414, 1);
      g.strokeCircle(lx, y + 2, 8);
      g.fillRect(lx - 2, y - 10, 4, 5);
      g.lineBetween(lx, y + 2, lx, y - 3);
      g.lineBetween(lx, y + 2, lx + 4, y + 2);
    }
    const sh = (t * 0.8) % 1;
    g.fillStyle(0xffffff, 0.5);
    if (s > 0.05) g.fillRect(x0 + w * s * sh, y - 4, 6, 12);
  }

  private updateFilm(dt: number): void {
    const f = this.film;
    if (!f) return;
    f.damage += ((this.hits / Game.diff.playerHits) * 0.9 - f.damage) * Math.min(1, dt * 4);
    f.flash = Math.max(0, f.flash - dt * 2.5);
    f.dark = (1 - this.stage.lid) * 0.9;
    f.light1 = { x: this.tick.x, y: this.tick.y - 50, r: 170 };
    const head = this.dancer.headPos();
    f.light2 = { x: head.x, y: head.y, r: 150 };
    const n = this.flyers.find((q) => q.state === 'fly');
    f.light3 = n ? { x: n.img.x, y: n.img.y, r: 90 } : { x: -9999, y: -9999, r: 1 };
  }

  private showTitle(a: string, b: string, secs: number): void {
    this.tweens.killTweensOf([this.title, this.sub]);
    this.title.setText(a).setAlpha(1).setScale(1);
    this.sub.setText(b).setAlpha(1);
    if (secs < 50) this.tweens.add({ targets: [this.title, this.sub], alpha: 0, delay: secs * 1000, duration: 500 });
  }
}
