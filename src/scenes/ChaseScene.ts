// CHASE level: the camera scrolls with the music, the boss chases from behind,
// and every hazard is announced by the boss's song and lands on the beat.

import Phaser from 'phaser';
import { AudioEngine } from '../audio/AudioEngine';
import { sfx } from '../audio/Sfx';
import { FileSong, PlaceholderSong, type SongSource } from '../audio/Songs';
import * as S from '../audio/Synth';
import { Conductor } from '../core/Conductor';
import { leaveLevel, markCue } from '../core/flow';
import { Game, type GhostSample } from '../core/Game';
import { recordLevel } from '../core/Save';
import { Input } from '../core/Input';
import { expandLyrics, type ExpandedLine } from '../core/lyrics';
import { visemeAt } from '../core/visemes';
import type { LevelData, LevelEvent } from '../core/types';
import {
  CoalHazard, DropHazard, GroundWaveHazard, LungeHazard, LyricWordHazard, SmokeRingHazard,
  spawnBeatOf, type ChaseCtx, type Hazard,
} from '../entities/hazards';
import { Player, type PlayerControls } from '../entities/Player';
import { Smokestack } from '../entities/Smokestack';
import { ACTS, actForLine, fillerAct, type ActName } from '../entities/SmokestackActs';
import { addFilm, type FilmPipeline } from '../fx/FilmPipeline';
import { boilKey } from '../fx/Textures';
import { Hud } from '../ui/Hud';
import { LyricsUI } from '../ui/LyricsUI';
import { Scenery } from '../world/Scenery';
import { SolidWorld } from '../world/Solids';
import { Track } from '../world/Track';

type State = 'loading' | 'play' | 'paused' | 'dead' | 'won';

interface Particle {
  img: Phaser.GameObjects.Image;
  wx: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  grow: number;
  base: string;
}

const GROUND_Y = 600;
/** Rewinds per cue mark in this session (3 at the same spot offer a rehearsal). */
const deathsAt: Record<string, number> = {};

export class ChaseScene extends Phaser.Scene {
  private level!: LevelData;
  private conductor!: Conductor;
  private song: SongSource | null = null;
  private lines: ExpandedLine[] = [];
  private film: FilmPipeline | null = null;
  private input2!: Input;
  private player!: Player;
  private boss!: Smokestack;
  private world!: SolidWorld;
  private track!: Track;
  private scenery!: Scenery;
  private lyricsUI!: LyricsUI;
  private hud!: Hud;
  private hazards: Hazard[] = [];
  private pending: { e: LevelEvent; spawn: number }[] = [];
  private pendingIdx = 0;
  private particles: Particle[] = [];
  private state: State = 'loading';
  private camX = 0;
  private beat = 0;
  private lastWholeBeat = -999;
  private hits = 0;
  private combo = 0;
  private bestCombo = 0;
  private onBeatCount = 0;
  private beatActions = 0;
  private lastJumpJudge: { mult: number; label: string } = { mult: 1, label: '' };
  private bossFallBeat: number | null = null;
  private bossCrashBeat = 0;
  private bossCrashed = false;
  private flash = 0;
  private overlay: Phaser.GameObjects.Container | null = null;
  private debugText: Phaser.GameObjects.Text | null = null;
  private showDebug = false;
  private startBeat = 0;
  private dark = 0;
  // ── cue marks, rehearsal (MAIN.md §6.3)
  private cueBeats: number[] = [];
  /** Cue marks passed in this run (0 = none: restart from the beginning). */
  private cueIndex = 0;
  private startCue = 0;
  private rehearsal = false;
  private rehearsalEnd: number | null = null;
  // ── silence solos (idea 9)
  private silences: { start: number; end: number; warned: boolean; scheduled: boolean }[] = [];
  // ── wind-up spring (idea 10)
  private spring = 0.75;
  private slowUntilBeat: number | null = null;
  private springGfx!: Phaser.GameObjects.Graphics;
  private banner!: Phaser.GameObjects.Text;
  // ── ghost of the previous try (idea 11)
  private ghostRec: GhostSample[] = [];
  private ghostPrev: GhostSample[] | null = null;
  private ghost: Player | null = null;
  private ghostIdx = 0;
  // ── the boss's repertoire director
  private lastAct: ActName | null = null;
  private lastLine = -1;
  private nextFiller = 0;
  private comboAct = 0;
  private wasCharging = false;

  constructor() {
    super('Chase');
  }

  init(data: { levelId?: string; cue?: number; rehearsal?: boolean }): void {
    this.level = Game.levels[data.levelId ?? 'smokestack'];
    this.cueBeats = this.level.events.filter((e) => e.type === 'cue').map((e) => e.beat).sort((a, b) => a - b);
    this.startCue = Math.min(data.cue ?? 0, this.cueBeats.length);
    this.cueIndex = this.startCue;
    this.rehearsal = !!data.rehearsal;
    this.rehearsalEnd = this.rehearsal ? (this.cueBeats[this.startCue] ?? this.level.song.lengthBeats) : null;
    this.spring = 0.75;
    this.slowUntilBeat = null;
    this.ghostRec = [];
    this.ghostIdx = 0;
    this.ghost = null;
    this.hazards = [];
    this.particles = [];
    this.pendingIdx = 0;
    this.state = 'loading';
    this.hits = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.onBeatCount = 0;
    this.beatActions = 0;
    this.bossFallBeat = null;
    this.bossCrashBeat = 0;
    this.bossCrashed = false;
    this.overlay = null;
    this.lastWholeBeat = -999;
    this.lastAct = null;
    this.lastLine = -1;
    this.nextFiller = 0;
    this.comboAct = 0;
    this.wasCharging = false;
    this.flash = 0;
    this.dark = 0;
    this.startBeat = this.startCue > 0 ? this.cueBeats[this.startCue - 1] : Game.startBeat;
    // cue marks already behind the starting point count as passed (no banner for them)
    this.cueIndex = this.cueBeats.filter((b) => b <= this.startBeat + 0.01).length;
    this.showDebug = Game.config.debug;
  }

  create(): void {
    const L = this.level;
    const ppb = L.chase.pixelsPerBeat;
    this.conductor = new Conductor(L.song.tempoMap, L.song.beatsPerBar);
    this.conductor.offsetSec = Game.audioOffsetMs / 1000;
    this.lines = expandLyrics(L.lyrics);
    this.input2 = new Input(this, Game.controls);

    this.world = new SolidWorld();
    const diffName = Game.difficulty;
    const events = L.events.filter((e) => !e.only || e.only.includes(diffName));
    this.scenery = new Scenery(this, GROUND_Y, {
      config: L.scenery,
      ppb,
      tunnels: events
        .filter((e) => e.type === 'tunnel')
        .map((e) => ({ x1: e.beat * ppb + L.chase.anchorX, x2: (e.beat + Number(e.lengthBeats)) * ppb + L.chase.anchorX })),
    });
    this.track = new Track(this, this.world, events, {
      groundY: GROUND_Y,
      ppb,
      anchorX: L.chase.anchorX,
      gapLeadPx: L.chase.gapLeadPx,
      endBeat: L.song.lengthBeats,
    });

    this.boss = new Smokestack(this);
    this.boss.screenX = L.chase.bossFrontX;
    this.boss.groundY = GROUND_Y;

    const startCam = this.startBeat * ppb;
    let px = startCam + L.chase.anchorX;
    while (this.world.groundAt(px, GROUND_Y - 5) === null) px += 20;
    this.player = new Player(this, px, GROUND_Y, Game.config.player);
    this.player.onJump = () => this.onPlayerJump();
    this.player.onLand = (hard) => {
      sfx('land');
      if (hard) this.dust(this.player.x - this.camX, GROUND_Y, 1);
    };

    this.lyricsUI = new LyricsUI(this, this.lines, 648);
    this.hud = new Hud(this, Game.diff.playerHits);

    // events sorted by the moment they must appear
    const instant = new Set(['gap', 'sign', 'tunnel']);
    this.pending = events
      .filter((e) => !instant.has(e.type))
      .map((e) => ({ e, spawn: spawnBeatOf(e, Game.diff) }))
      .filter((p) => p.spawn >= this.startBeat - 0.01)
      .sort((a, b) => a.spawn - b.spawn);
    // practice mode: if we start after the boss already ran off the cliff, keep that state
    const fall = events.find((e) => e.type === 'bossFall' && e.beat < this.startBeat);
    if (fall) {
      this.bossFallBeat = fall.beat;
      this.bossCrashBeat = typeof fall.crashBeat === 'number' ? fall.crashBeat : fall.beat + 4;
    }

    this.film = addFilm(this, L.era);

    this.silences = events
      .filter((e) => e.type === 'silence' && e.beat + Number(e.lengthBeats) > this.startBeat)
      .map((e) => ({ start: e.beat, end: e.beat + Number(e.lengthBeats), warned: false, scheduled: false }));
    this.springGfx = this.add.graphics().setDepth(95);
    this.banner = this.add
      .text(640, 150, '', { fontFamily: 'Rye, Georgia, serif', fontSize: '44px', color: '#f4efe4', stroke: '#141414', strokeThickness: 9, align: 'center' })
      .setOrigin(0.5)
      .setDepth(120)
      .setAlpha(0);
    this.ghostPrev = Game.settings.ghost ? (Game.ghosts[L.id] ?? null) : null;
    if (this.ghostPrev?.length) {
      this.ghost = new Player(this, -200, GROUND_Y, Game.config.player);
      this.ghost.gfx.setDepth(45);
    }
    if (this.rehearsal) this.showBanner('REHEARSAL\nno harm done: practise this bit', 3);
    else if (this.startCue > 0) this.showBanner('FROM THE CUE MARK', 1.6);

    this.debugText = this.add
      .text(12, 70, '', { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', backgroundColor: '#000000aa' })
      .setDepth(200)
      .setVisible(this.showDebug);
    this.input.keyboard?.on('keydown-F1', () => {
      this.showDebug = !this.showDebug;
      this.debugText?.setVisible(this.showDebug);
    });
    this.input.keyboard?.on('keydown-R', () => {
      if (this.state === 'play' || this.state === 'paused') this.restart(false, this.rehearsal ? this.startCue : 0, this.rehearsal);
    });
    // debug: nudge the audio offset live with [ ] (or - +), saved like a calibration
    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => {
      if (!this.showDebug) return;
      const d = ev.key === '[' || ev.key === '-' ? -5 : ev.key === ']' || ev.key === '+' ? 5 : 0;
      if (!d) return;
      Game.setOffsets(Game.audioOffsetMs + d, Game.inputOffsetMs);
      this.conductor.offsetSec = Game.audioOffsetMs / 1000;
      this.toast(`AUDIO OFFSET ${Game.audioOffsetMs > 0 ? '+' : ''}${Game.audioOffsetMs} ms`);
    });

    this.events.once('shutdown', () => this.cleanup());
    this.loadSongAndStart();
  }

  private async loadSongAndStart(): Promise<void> {
    const L = this.level;
    let song: SongSource | null = null;
    if (L.song.file) {
      try {
        const buf = await FileSong.load(L.song.file);
        song = new FileSong(buf, this.conductor, L.song.offsetMs);
        console.info(`[song] using ${L.song.file}`);
      } catch {
        console.info(`[song] "${L.song.file}" not found or unreadable – using the placeholder band`);
      }
    }
    if (!song) song = new PlaceholderSong(this.conductor, L.placeholderMusic, this.lines, L.song.beatsPerBar);
    if (!this.scene.isActive()) return;
    this.song = song;
    await AudioEngine.get().resume();
    this.conductor.start(this.startBeat, 0.4);
    song.start(this.startBeat);
    this.state = 'play';
  }

  // ───────────────────────── frame ─────────────────────────

  update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.1); // Tick splits long frames into steps
    const time = this.time.now / 1000;
    this.input2.update();

    if (this.state === 'paused') {
      this.handlePauseInput();
      return;
    }
    if (this.state === 'dead' || this.state === 'won') {
      this.flash = Math.max(0, this.flash - dt * 2.5);
      if (this.film) this.film.flash = this.flash;
      this.handleEndInput();
      this.updateParticles(dt, time);
      this.player.draw(dt, time, this.beat, this.camX);
      return;
    }
    if (this.input2.consume('pause') !== null && this.state === 'play') {
      this.pause();
      return;
    }

    const L = this.level;
    const ppb = L.chase.pixelsPerBeat;
    this.beat = this.state === 'loading' ? this.startBeat - 1 : this.conductor.beat;
    const beat = this.beat;
    this.camX = beat * ppb;
    const spb = this.conductor.secondsPerBeat(Math.max(0, beat));
    const camSpeed = ppb / spb;

    const ctx = this.makeCtx(dt, time);

    // spawn events
    if (this.state === 'play') {
      while (this.pendingIdx < this.pending.length && this.pending[this.pendingIdx].spawn <= beat) {
        this.spawn(this.pending[this.pendingIdx++].e, ctx);
      }
    }

    // player input & rhythm judgement
    const c = this.readControls();
    this.player.update(dt, c, {
      world: this.world,
      baseSpeed: camSpeed,
      autoRun: L.chase.autoRun,
      minX: this.camX + 24,
      maxX: this.camX + 1250,
    });

    // boss
    this.updateBoss(dt, time, beat, camSpeed);

    // boss catches you
    if (this.bossFallBeat === null && this.state === 'play') {
      const hb = this.player.hurtbox;
      if (hb.left - this.camX < this.boss.noseX - 12) {
        this.hurt('train');
        this.player.x = this.camX + this.boss.noseX + 80;
        this.player.vx = camSpeed + 500;
        this.player.vy = -760;
      }
    }

    // fell into a gap
    if (this.player.y > GROUND_Y + 260 && this.state === 'play') {
      this.hurt('fall', true);
      let x = this.camX + L.chase.anchorX + 60;
      while (this.world.groundAt(x, GROUND_Y - 5) === null) x += 20;
      this.player.x = x;
      this.player.y = GROUND_Y - 420;
      this.player.vy = 0;
      this.player.vx = camSpeed;
    }

    // hazards
    this.hazards = this.hazards.filter((h) => {
      const alive = h.update(ctx);
      if (!alive) h.destroy();
      return alive;
    });

    // puffs on every beat
    const whole = Math.floor(beat);
    if (whole !== this.lastWholeBeat) {
      this.lastWholeBeat = whole;
      if (!this.bossCrashed && this.state === 'play') this.emitPuff();
    }

    // darkness (tunnel)
    this.dark = this.darknessAt(beat);
    AudioEngine.get().setDark(this.dark * 0.6);

    // visuals
    this.scenery.update(this.camX, beat, time, this.dark);
    this.track.update(this.camX, time, GROUND_Y);
    this.lyricsUI.update(beat, time);
    this.updateParticles(dt, time);
    this.player.draw(dt, time, beat, this.camX);
    this.hud.update(dt, time, Game.diff.playerHits - this.hits, this.combo, beat / L.song.lengthBeats);
    this.updateFilm(dt);
    this.updateDebug(beat);

    if (this.state === 'play') this.themeUpdate(beat, dt);

    // the end of the song = you escaped!
    if (this.state === 'play' && beat >= L.song.lengthBeats) {
      if (this.rehearsal) this.endRehearsal();
      else this.win();
    }
  }

  private makeCtx(dt: number, time: number): ChaseCtx {
    const ppb = this.level.chase.pixelsPerBeat;
    return {
      scene: this,
      beat: this.beat,
      time,
      dt,
      camX: this.camX,
      ppb,
      groundY: GROUND_Y,
      anchorX: this.level.chase.anchorX,
      player: this.player,
      boss: this.boss,
      world: this.world,
      conductor: this.conductor,
      diff: Game.diff,
      hurt: (s) => this.hurt(s),
      shake: (i, ms) => this.cameras.main.shake(ms, i),
      dust: (x, y, n) => this.dust(x, y, n),
      camXAtBeat: (b) => b * ppb,
    };
  }

  private spawn(e: LevelEvent, ctx: ChaseCtx): void {
    switch (e.type) {
      case 'drop': this.hazards.push(new DropHazard(ctx, e)); break;
      case 'lyricObject': this.hazards.push(new LyricWordHazard(ctx, e)); break;
      case 'groundWave': this.hazards.push(new GroundWaveHazard(ctx, e)); break;
      case 'coal': this.hazards.push(new CoalHazard(ctx, e)); break;
      case 'smokeRing': this.hazards.push(new SmokeRingHazard(ctx, e)); break;
      case 'bossLunge': this.hazards.push(new LungeHazard(ctx, e)); break;
      case 'bossFall':
        this.bossFallBeat = e.beat;
        this.bossCrashBeat = typeof e.crashBeat === 'number' ? e.crashBeat : e.beat + 4;
        break;
      case 'shake': {
        const durB = typeof e.durationBeats === 'number' ? e.durationBeats : 1;
        this.cameras.main.shake(durB * this.conductor.secondsPerBeat(e.beat) * 1000, typeof e.intensity === 'number' ? e.intensity : 0.01);
        break;
      }
    }
  }

  // ───────────────────────── rhythm ─────────────────────────

  private judge(ctxTime: number): { label: 'PERFECT!' | 'GOOD' | ''; ms: number } {
    const b = this.conductor.beatAtCtxTime(ctxTime, Game.inputOffsetMs);
    const off = Math.abs(b - Math.round(b)) * this.conductor.secondsPerBeat(b) * 1000;
    const w = Game.diff.hitWindowMs;
    if (off <= w.perfect) return { label: 'PERFECT!', ms: off };
    if (off <= w.good) return { label: 'GOOD', ms: off };
    return { label: '', ms: off };
  }

  private readControls(): PlayerControls {
    const i = this.input2;
    const dir = (i.isDown('right') ? 1 : 0) - (i.isDown('left') ? 1 : 0);
    const jumpT = this.state === 'play' ? i.consume('jump') : null;
    const dashT = this.state === 'play' ? i.consume('dash') : null;
    let jumpMultiplier = 1;
    if (jumpT !== null) {
      const j = this.judge(jumpT);
      jumpMultiplier = j.label ? Game.diff.onBeatJumpMultiplier : 1;
      this.lastJumpJudge = { mult: jumpMultiplier, label: j.label };
    }
    let dashBonusMs = 0;
    if (dashT !== null) {
      const j = this.judge(dashT);
      this.beatActions++;
      if (j.label) {
        dashBonusMs = Game.diff.onBeatDashBonusMs;
        this.registerOnBeat(j.label);
      } else this.combo = 0;
      sfx('dash');
      this.dust(this.player.x - this.camX, this.player.y, 1);
    }
    return {
      dir,
      jumpPressed: jumpT !== null,
      jumpHeld: i.isDown('jump'),
      dashPressed: dashT !== null,
      jumpMultiplier,
      dashBonusMs,
    };
  }

  private onPlayerJump(): void {
    this.beatActions++;
    if (this.lastJumpJudge.label === 'PERFECT!') this.player.accent();
    if (this.lastJumpJudge.label) {
      sfx('jumpBeat');
      this.registerOnBeat(this.lastJumpJudge.label);
    } else {
      sfx('jump');
      this.combo = 0;
    }
    this.lastJumpJudge = { mult: 1, label: '' };
  }

  /** Pick what the boss acts out: the lyrics, fillers in the instrumental bars, reactions. */
  private directBoss(beat: number): void {
    const b = this.boss;
    if (this.state !== 'play') return;
    const spb = this.conductor.secondsPerBeat(beat);
    const play = (name: ActName): void => {
      b.perform(name, ACTS[name].beats * spb);
      this.lastAct = name;
    };
    // a new lyric line: act it out
    const idx = this.lines.findIndex((l) => beat >= l.beat - 0.2 && beat <= l.end);
    if (idx >= 0 && idx !== this.lastLine) {
      this.lastLine = idx;
      const act = actForLine(this.lines[idx].words.map((w) => w.text).join(' '), this.lastAct);
      if (act) play(act);
    }
    // nobody singing and nothing going on: improvise a little
    if (idx < 0 && !b.performing && b.arm === 'idle' && beat >= this.nextFiller) {
      const f = fillerAct(this.lastAct);
      play(f);
      this.nextFiller = beat + ACTS[f].beats + 2;
    }
    // the player is doing too well: a double take, then steam out of the ears
    if (this.combo >= 6 && this.comboAct < 1) {
      this.comboAct = 1;
      play('doubleTake');
    } else if (this.combo >= 12 && this.comboAct < 2) {
      this.comboAct = 2;
      play('steamEars');
    } else if (this.combo === 0) this.comboAct = 0;
    // Tick looks back over his shoulder when the engine winds up a charge
    const charging = b.charge > 0.3;
    if (charging && !this.wasCharging) this.player.startle();
    this.wasCharging = charging;
    this.player.lookBias = charging ? -0.9 : null;
  }

  private registerOnBeat(label: string): void {
    this.windSpring(label === 'PERFECT!' ? this.springTune.perfect : this.springTune.good);
    this.onBeatCount++;
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const sx = this.player.x - this.camX;
    this.hud.showJudge(label, sx, this.player.y - 130);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.random();
      this.particles.push(this.particle('star', this.player.x + Math.cos(a) * 20, this.player.y - 60, Math.cos(a) * 160, Math.sin(a) * 160 - 60, 0.45, 0));
    }
  }

  // ───────────────────────── boss ─────────────────────────

  private updateBoss(dt: number, time: number, beat: number, camSpeed: number): void {
    const b = this.boss;
    const L = this.level;
    if (this.bossFallBeat !== null && beat >= this.bossFallBeat) {
      // Classic cartoon gag: keep running on thin air, notice, look at the audience, wave… then drop.
      const crash = this.bossCrashBeat;
      const noticeAt = crash - 1.5;
      const dropAt = crash - 0.5;
      b.lunge += (0 - b.lunge) * Math.min(1, dt * 6);
      b.charge = 0;
      let runSpeed = camSpeed;
      if (beat < noticeAt) {
        // still singing & chasing on thin air, getting more and more nervous
        b.screenX = L.chase.bossFrontX + b.lunge;
        b.arm = 'fist';
        b.nervous = Math.min(1, (beat - this.bossFallBeat) / Math.max(1, noticeAt - this.bossFallBeat));
        const m = LyricsUI.mouthAt(this.lines, beat);
        b.mouth += (m.open - b.mouth) * Math.min(1, dt * 25);
        runSpeed = camSpeed * 2.2;
      } else if (beat < dropAt) {
        // freeze, look down… wave goodbye
        b.screenX = L.chase.bossFrontX;
        b.arm = 'wave';
        b.nervous = 1;
        b.mouth = 0.5 + Math.sin(time * 18) * 0.2;
        b.fallY = Math.sin((beat - noticeAt) * Math.PI * 6) * 2;
        runSpeed = 0;
      } else {
        const d = Math.min(1, (beat - dropAt) / 0.5);
        b.screenX = L.chase.bossFrontX;
        b.fallY = d * d * 760;
        b.tilt = d * 0.35;
        b.mouth = 1;
        runSpeed = 0;
      }
      b.wheelAngle += (runSpeed / 58) * dt;
      if (!this.bossCrashed && beat >= crash) {
        this.bossCrashed = true;
        sfx('bigCrash');
        this.cameras.main.shake(600, 0.03);
        const cx = b.screenX - 150;
        for (let k = 0; k < 10; k++) this.dust(cx - 200 + Math.random() * 400, GROUND_Y + 40, 1);
        const burst = this.add.image(Math.max(140, cx), GROUND_Y - 30, 'burst_0').setDepth(60).setScale(0.2);
        this.tweens.add({ targets: burst, scale: 2.4, alpha: 0, duration: 800, onComplete: () => burst.destroy() });
      }
      b.gfx.setVisible(!this.bossCrashed);
    } else {
      b.screenX = L.chase.bossFrontX + b.lunge;
      const m = LyricsUI.mouthAt(this.lines, beat);
      b.mouth += (m.open - b.mouth) * Math.min(1, dt * 25);
      b.viseme = m.word ? visemeAt(m.word, m.f) : 'rest';
      // a puff of smoke out of the mouth on every shouted word
      if (m.shout && !b.shouting && this.state === 'play') {
        b.accent(); // a held "hit" pose on every shouted word
        const mp = b.mouthPos;
        for (let k = 0; k < 3; k++) {
          this.particles.push(this.particle('puff', mp.x + this.camX + 30, mp.y, 160 + Math.random() * 120, -60 + Math.random() * 80, 0.8, 0.6));
        }
      }
      b.shouting = m.shout;
      this.directBoss(beat);
      b.nervous += ((this.combo >= 8 ? 0.7 : 0) - b.nervous) * Math.min(1, dt * 3);
      b.wheelAngle += ((camSpeed + (b.charge > 0.5 ? 400 : 0)) / 58) * dt;
    }
    b.lookTarget = { x: this.player.x - this.camX, y: this.player.y - 60 };
    // his eyes burn in the tunnel and at night
    b.dark = Math.max(this.dark, this.scenery.night * 0.6);
    b.update(dt, time, beat);
  }

  // ───────────────────────── damage / death / victory ─────────────────────────

  private hurt(source: string, ignoreInvuln = false): void {
    if (this.state !== 'play') return;
    if (!ignoreInvuln && (this.player.invulnerable > 0 || this.player.isDashing)) return;
    if (ignoreInvuln && this.player.invulnerable > 0 && source !== 'fall') return;
    this.hits++;
    this.combo = 0;
    this.player.invulnerable = Game.config.player.invulnerableMs;
    sfx(source === 'fall' ? 'fall' : 'hit');
    this.flash = 0.35;
    this.cameras.main.shake(220, 0.012);
    this.boss.laugh();
    this.player.dizzy();
    this.windSpring(-this.springTune.hit);
    if (this.rehearsal) {
      this.hits = Math.min(this.hits, Game.diff.playerHits - 1);
      return;
    }
    if (this.hits >= Game.diff.playerHits) this.die();
  }

  private die(): void {
    this.state = 'dead';
    this.song?.stop();
    this.conductor.stop();
    AudioEngine.get().setDark(0);
    this.player.dead = true;
    this.player.invulnerable = 0;
    sfx('death');
    this.saveResults(false);
    this.keepGhost();
    AudioEngine.get().unsilence();
    const key = `${this.level.id}:${this.cueIndex}`;
    deathsAt[key] = (deathsAt[key] ?? 0) + 1;
    if (this.film) {
      this.tweens.add({ targets: this.film, burn: 1, duration: 2200, delay: 900, ease: 'Quad.In' });
    }
    this.time.delayedCall(this.film ? 3400 : 1200, () => {
      const key = `${this.level.id}:${this.cueIndex}`;
      const opts = this.cueIndex > 0
        ? ['ENTER  -  rewind to the last cue mark', 'S  -  rewind to the very start']
        : ['ENTER  -  rewind the reel & try again'];
      if ((deathsAt[key] ?? 0) >= 3) opts.push('R  -  REHEARSAL: practise this bit, no harm done');
      opts.push(`ESC  -  ${this.leaveLabel()}`);
      this.showOverlay('THE END?', opts, this.hitsSummary(false));
    });
  }

  private win(): void {
    this.state = 'won';
    // the real song keeps playing its outro under the results card
    if (!(this.song instanceof FileSong)) this.song?.stop();
    this.conductor.stop();
    sfx('victory');
    const res = this.saveResults(true);
    this.keepGhost();
    this.recordVictory(res.rank);
    // iris out on Tick
    const black = this.add.rectangle(640, 360, 1280, 720, 0x0b0b0b).setDepth(150);
    const circle = this.make.graphics({}, false);
    const mask = circle.createGeometryMask();
    mask.setInvertAlpha(true);
    black.setMask(mask);
    const iris = { r: 900 };
    const px = this.player.x - this.camX;
    const py = this.player.y - 60;
    this.tweens.add({
      targets: iris,
      r: 70,
      duration: 1400,
      ease: 'Quad.InOut',
      onUpdate: () => {
        circle.clear();
        circle.fillStyle(0xffffff);
        circle.fillCircle(px, py, iris.r);
      },
      onComplete: () => {
        this.time.delayedCall(700, () => {
          this.tweens.add({
            targets: iris,
            r: 0,
            duration: 300,
            onUpdate: () => {
              circle.clear();
              circle.fillStyle(0xffffff);
              circle.fillCircle(px, py, iris.r);
            },
            onComplete: () => {
              this.showOverlay("THAT'S A WRAP!", [`ENTER  -  ${this.leaveLabel()}`, 'R  -  play again'], [
                `RANK  ${res.rank}`,
                `Hits taken: ${res.hitsTaken}`,
                `On-beat moves: ${res.onBeat} / ${res.beatActions}`,
                `Best combo: ${res.bestCombo}`,
              ]);
            },
          });
        });
      },
    });
  }

  private hitsSummary(victory: boolean): string[] {
    const L = this.level;
    const pct = Math.round((this.beat / L.song.lengthBeats) * 100);
    return victory ? [] : [`You made it ${Phaser.Math.Clamp(pct, 0, 100)}% of the way.`];
  }

  private saveResults(victory: boolean): NonNullable<typeof Game.lastResults> {
    const pct = this.beatActions ? this.onBeatCount / this.beatActions : 0;
    let rank = 'C';
    if (victory) {
      if (this.hits === 0 && pct >= 0.6) rank = 'S';
      else if (this.hits === 0) rank = 'A';
      else if (this.hits === 1) rank = 'B';
    } else rank = '-';
    const res = {
      levelId: this.level.id,
      victory,
      hitsTaken: this.hits,
      onBeat: this.onBeatCount,
      beatActions: this.beatActions,
      bestCombo: this.bestCombo,
      rank,
    };
    Game.lastResults = res;
    return res;
  }

  private showOverlay(title: string, options: string[], details: string[]): void {
    const c = this.add.container(640, 360).setDepth(180);
    // the card lives under the film filter too: clear the burn so it can be seen
    if (this.film) {
      this.tweens.killTweensOf(this.film);
      this.film.burn = 0;
    }
    const card = this.add.graphics();
    card.fillStyle(0x0b0b0b, this.state === 'dead' ? 1 : 0.85);
    card.fillRect(-640, -360, 1280, 720);
    card.lineStyle(6, 0xf4efe4, 1);
    card.strokeRoundedRect(-420, -230, 840, 460, 30);
    card.lineStyle(2, 0xf4efe4, 1);
    card.strokeRoundedRect(-404, -214, 808, 428, 22);
    c.add(card);
    const t = this.add
      .text(0, -140, title, { fontFamily: 'Rye, Georgia, serif', fontSize: '76px', color: '#f4efe4', stroke: '#141414', strokeThickness: 10 })
      .setOrigin(0.5);
    c.add(t);
    details.forEach((d, i) => {
      c.add(
        this.add
          .text(0, -50 + i * 38 + (i > 0 && details[0].startsWith('RANK') ? 14 : 0), d, { fontFamily: 'Limelight, Georgia, serif', fontSize: i === 0 && d.startsWith('RANK') ? '40px' : '28px', color: '#f4efe4' })
          .setOrigin(0.5),
      );
    });
    options.forEach((o, i) => {
      c.add(
        this.add
          .text(0, 196 - (options.length - i) * 38, o, { fontFamily: 'Limelight, Georgia, serif', fontSize: '26px', color: '#cfc8b8' })
          .setOrigin(0.5),
      );
    });
    if (this.state !== 'dead') {
      c.setAlpha(0);
      this.tweens.add({ targets: c, alpha: 1, duration: 400 });
    }
    this.tweens.add({ targets: t, scale: { from: 1.3, to: 1 }, duration: 600, ease: 'Elastic.Out' });
    this.overlay = c;
    this.input2.clear();
  }

  private handleEndInput(): void {
    if (!this.overlay) return;
    const kb = this.input.keyboard;
    const key = (k: string): boolean => !!kb && kb.checkDown(kb.addKey(k), 99999);
    if (this.state === 'won') {
      if (this.input2.consume('confirm') !== null) this.quitToTitle();
      else if (key('R')) this.restart(true, 0);
      return;
    }
    const deaths = deathsAt[`${this.level.id}:${this.cueIndex}`] ?? 0;
    if (this.input2.consume('confirm') !== null) this.restart(true, this.cueIndex);
    else if (key('S')) this.restart(true, 0);
    else if (deaths >= 3 && key('R')) this.restart(true, this.cueIndex, true);
    else if (this.input2.consume('pause') !== null) this.quitToTitle();
  }

  private leaveLabel(): string {
    return Game.returnTo === 'hub' ? 'back to the Bijou' : Game.returnTo === 'programme' ? 'back to the programme' : 'back to the title';
  }

  // ───────────────────────── theme mechanics ─────────────────────────

  private get springTune(): { drainPerBeat: number; perfect: number; good: number; hit: number; slowRate: number; slowBeats: number } {
    return { drainPerBeat: 0.006, perfect: 0.09, good: 0.05, hit: 0.18, slowRate: 0.85, slowBeats: 4, ...(Game.diff.spring ?? {}) };
  }

  private windSpring(d: number): void {
    this.spring = Phaser.Math.Clamp(this.spring + d, 0, 1);
  }

  private themeUpdate(beat: number, dt: number): void {
    const prevBeat = this.ghostRec.length ? this.ghostRec[this.ghostRec.length - 1].b : beat;
    // cue marks: remember the last one passed
    while (this.cueIndex < this.cueBeats.length && beat >= this.cueBeats[this.cueIndex]) {
      this.cueIndex++;
      if (this.rehearsal && this.rehearsalEnd !== null && beat >= this.rehearsalEnd) return this.endRehearsal();
      if (!this.rehearsal) {
        markCue(this.level.id, this.cueIndex);
        this.showBanner('CUE MARK', 1.2);
        sfx('click');
      }
    }
    // silence solos: the band stops, only Tick's ticking and the hazards keep the beat
    for (const si of this.silences) {
      if (!si.warned && beat >= si.start - 3) {
        si.warned = true;
        // stays up for the whole solo
        this.showBanner('KEEP TIME!', (this.conductor.beatToSec(si.end) - this.conductor.beatToSec(beat)));
      }
      if (!si.scheduled && beat >= si.start - 1) {
        si.scheduled = true;
        const e = AudioEngine.get();
        e.silence(this.conductor.ctxTimeOfBeat(si.start), this.conductor.ctxTimeOfBeat(si.end));
        for (let b = Math.ceil(si.start); b < si.end; b++) S.woodblock(e.sfx, this.conductor.ctxTimeOfBeat(b), b % 2 ? 72 : 79);
      }
    }
    this.lyricsUI.setHidden(this.silences.some((si) => beat >= si.start && beat < si.end));
    // the spring runs down; empty, the world slows like a watch that stops
    this.windSpring(-(beat - prevBeat) * this.springTune.drainPerBeat);
    if (this.spring <= 0 && this.slowUntilBeat === null) {
      const t = this.springTune;
      this.slowUntilBeat = beat + t.slowBeats;
      this.setRate(t.slowRate);
      this.showBanner('WIND ME UP!', 1.6);
      sfx('fall');
    }
    if (this.slowUntilBeat !== null && beat >= this.slowUntilBeat) {
      this.slowUntilBeat = null;
      this.setRate(1);
      this.spring = 0.4;
    }
    this.drawSpring(beat);
    // ghost: record this try, replay the last one
    const sx = this.player.x - this.camX;
    this.ghostRec.push({ b: beat, x: sx, y: this.player.y, g: this.player.onGround, f: this.player.facing });
    this.drawGhost(beat, dt);
  }

  private setRate(rate: number): void {
    const now = AudioEngine.get().ctx.currentTime;
    this.conductor.setRate(rate, now);
    if (this.song instanceof FileSong) this.song.setRate(rate, now);
  }

  private drawSpring(beat: number): void {
    const g = this.springGfx;
    g.clear();
    const x = 1196;
    const y = 104;
    const low = this.spring < 0.25;
    const shake = low ? Math.sin(beat * 40) * 1.5 : 0;
    g.lineStyle(5, 0x141414, 1).strokeCircle(x + shake, y, 22);
    g.fillStyle(0xd8c17a, 1).fillCircle(x + shake, y, 20);
    g.lineStyle(6, low ? 0x8a2f2a : 0xf4efe4, 1);
    g.beginPath();
    g.arc(x + shake, y, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.spring);
    g.strokePath();
    // the winding key on top turns with the beat
    const a = this.slowUntilBeat !== null ? 0 : beat * Math.PI * 0.5;
    g.lineStyle(5, 0x141414, 1).lineBetween(x - Math.cos(a) * 12, y - 34, x + Math.cos(a) * 12, y - 34);
    g.lineBetween(x, y - 22, x, y - 34);
  }

  private drawGhost(beat: number, dt: number): void {
    const prev = this.ghostPrev;
    const gp = this.ghost;
    if (!prev || !gp) return;
    while (this.ghostIdx < prev.length - 1 && prev[this.ghostIdx + 1].b <= beat) this.ghostIdx++;
    const smp = prev[this.ghostIdx];
    if (!smp || smp.b > beat + 0.1 || beat > prev[prev.length - 1].b) {
      gp.gfx.setVisible(false);
      return;
    }
    gp.ghostStep(dt, this.camX + smp.x, smp.y, smp.g, smp.f);
    gp.draw(dt, this.time.now / 1000, beat, this.camX);
    gp.gfx.setVisible(true).setAlpha(0.28);
  }

  private keepGhost(): void {
    if (this.ghostRec.length > 30 && !this.rehearsal) Game.ghosts[this.level.id] = this.ghostRec;
  }

  private showBanner(text: string, sec: number): void {
    this.tweens.killTweensOf(this.banner);
    this.banner.setText(text).setAlpha(1).setScale(1.25);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 300, ease: 'Back.Out' });
    this.tweens.add({ targets: this.banner, alpha: 0, delay: sec * 1000, duration: 400 });
  }

  private endRehearsal(): void {
    this.state = 'won';
    this.song?.stop();
    this.conductor.stop();
    sfx('select');
    this.showBanner('REHEARSAL OVER!\nNow for real...', 2);
    this.time.delayedCall(2200, () => this.restart(true, this.startCue));
  }

  private recordVictory(rank: string): void {
    const s = Game.save;
    if (!s) return;
    recordLevel(s, this.level.id, true, rank);
    const isFeature = Game.story.chapters.some((c) => c.feature === this.level.id);
    if (isFeature && !s.freed.includes(this.level.id)) s.freed.push(this.level.id);
    s.resume = null;
    Game.persist();
  }

  private restart(rewind: boolean, cue = 0, rehearsal = false): void {
    AudioEngine.get().unsilence();
    this.restartData = { levelId: this.level.id, cue, rehearsal };
    this.restartInner(rewind);
  }

  private restartData: { levelId: string; cue: number; rehearsal: boolean } = { levelId: '', cue: 0, rehearsal: false };

  private restartInner(rewind: boolean): void {
    if (this.state === 'paused') AudioEngine.get().resume();
    this.song?.stop();
    this.conductor.stop();
    if (rewind && this.film) {
      sfx('rewind');
      this.state = 'won'; // freeze gameplay while rewinding
      this.overlay?.destroy();
      this.overlay = null;
      this.add.text(640, 360, '<< REWINDING', { fontFamily: 'Rye, Georgia, serif', fontSize: '48px', color: '#f4efe4', stroke: '#141414', strokeThickness: 8 }).setOrigin(0.5).setDepth(190);
      this.tweens.add({ targets: this.film, roll: 4, burn: 0, duration: 1000, ease: 'Quad.In', onComplete: () => this.scene.restart(this.restartData) });
    } else {
      this.scene.restart(this.restartData);
    }
  }

  private quitToTitle(): void {
    if (this.state === 'paused') AudioEngine.get().resume();
    this.song?.stop();
    this.conductor.stop();
    AudioEngine.get().unsilence();
    if (this.state !== 'won' && this.state !== 'dead') this.keepGhost();
    leaveLevel(this, this.level.id, { completed: this.state === 'won' });
  }

  // ───────────────────────── pause ─────────────────────────

  private pause(): void {
    this.state = 'paused';
    AudioEngine.get().ctx.suspend();
    const c = this.add.container(640, 360).setDepth(180);
    const bg = this.add.rectangle(0, 0, 1280, 720, 0x0b0b0b, 0.7);
    c.add(bg);
    c.add(this.add.text(0, -80, 'INTERMISSION', { fontFamily: 'Rye, Georgia, serif', fontSize: '72px', color: '#f4efe4', stroke: '#141414', strokeThickness: 10 }).setOrigin(0.5));
    ['ESC / ENTER  -  resume', 'R  -  restart', `Q  -  ${this.leaveLabel()}`].forEach((s, i) =>
      c.add(this.add.text(0, 20 + i * 42, s, { fontFamily: 'Limelight, Georgia, serif', fontSize: '28px', color: '#cfc8b8' }).setOrigin(0.5)),
    );
    this.overlay = c;
    this.input.keyboard?.once('keydown-Q', () => {
      if (this.state === 'paused') this.quitToTitle();
    });
  }

  private handlePauseInput(): void {
    if (this.input2.consume('pause') !== null || this.input2.consume('confirm') !== null) {
      this.overlay?.destroy();
      this.overlay = null;
      this.input2.clear();
      AudioEngine.get().resume().then(() => {
        this.state = 'play';
      });
    }
  }

  // ───────────────────────── effects ─────────────────────────

  private darknessAt(beat: number): number {
    let d = 0;
    for (const e of this.level.events) {
      if (e.type !== 'tunnel') continue;
      const len = Number(e.lengthBeats);
      const a = Phaser.Math.Clamp(beat - e.beat, 0, 1);
      const b = Phaser.Math.Clamp(e.beat + len - beat, 0, 1);
      d = Math.max(d, Math.min(a, b));
    }
    return d;
  }

  private updateFilm(dt: number): void {
    const f = this.film;
    if (!f) return;
    const targetDamage = (this.hits / Game.diff.playerHits) * 0.9;
    f.damage += (targetDamage - f.damage) * Math.min(1, dt * 4);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    f.flash = this.flash * (Game.settings.reduceFlicker ? 0.25 : 1);
    // the tunnel is pitch black; the night only dims the picture (lamps still cut through)
    f.dark = Math.max(this.dark * 0.94, this.scenery.night * (this.level.scenery?.nightDark ?? 0.45));
    f.light1 = { x: this.player.x - this.camX, y: this.player.y - 60, r: 190 };
    const lamp = this.boss.lamp;
    f.light2 = { x: lamp.x + 280, y: lamp.y + 230, r: 330 };
    // in the dark, two burning eyes
    const eyes = this.boss.eyesPos;
    f.light3 = this.boss.dark > 0.3 && !this.bossCrashed ? { x: eyes.x, y: eyes.y, r: 80 } : { x: -9999, y: -9999, r: 1 };
  }

  private emitPuff(): void {
    const ch = this.boss.chimneyTop;
    this.particles.push(this.particle('puff', ch.x + this.camX, ch.y, -40 - Math.random() * 40, -120, 1.6, 0.9));
  }

  private dust(screenX: number, screenY: number, count = 1): void {
    for (let i = 0; i < count; i++) {
      this.particles.push(
        this.particle('dust', screenX + this.camX + (Math.random() - 0.5) * 30, screenY - 10, (Math.random() - 0.5) * 120, -60 - Math.random() * 60, 0.6, 0.8),
      );
    }
  }

  private particle(base: string, wx: number, y: number, vx: number, vy: number, life: number, grow: number): Particle {
    const img = this.add.image(wx - this.camX, y, `${base}_0`).setDepth(base === 'puff' ? 35 : 55);
    if (base === 'puff') img.setScale(0.5);
    if (base === 'star') img.setScale(0.7);
    return { img, wx, y, vx, vy, life, max: life, grow, base };
  }

  private updateParticles(dt: number, time: number): void {
    this.particles = this.particles.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) {
        p.img.destroy();
        return false;
      }
      p.wx += p.vx * dt;
      p.y += p.vy * dt;
      p.vy *= 0.98;
      const f = 1 - p.life / p.max;
      p.img.setPosition(p.wx - this.camX, p.y);
      p.img.setTexture(boilKey(p.base, time));
      if (p.base === 'puff') p.img.setScale(0.5 + f * 1.2);
      else if (p.base === 'dust') p.img.setScale(0.6 + f * p.grow);
      p.img.setAlpha(Math.min(1, (1 - f) * 1.6));
      return true;
    });
  }

  private toastText: Phaser.GameObjects.Text | null = null;

  /** Short message in the corner (debug feedback). */
  private toast(msg: string): void {
    if (!this.toastText || !this.toastText.active) {
      this.toastText = this.add
        .text(12, 186, '', { fontFamily: 'monospace', fontSize: '20px', color: '#ffffff', backgroundColor: '#000000cc', padding: { x: 8, y: 4 } })
        .setDepth(201);
    }
    this.tweens.killTweensOf(this.toastText);
    this.toastText.setText(msg).setAlpha(1);
    this.tweens.add({ targets: this.toastText, alpha: 0, delay: 900, duration: 400 });
  }

  private updateDebug(beat: number): void {
    if (!this.showDebug || !this.debugText) return;
    const bpb = this.level.song.beatsPerBar;
    const next = this.pending.slice(this.pendingIdx, this.pendingIdx + 4).map((p) => `${p.e.type}@${p.e.beat}`);
    this.debugText.setText(
      [
        `beat ${beat.toFixed(2)}   bar ${Math.floor(beat / bpb) + 1}.${Math.floor(beat % bpb) + 1}`,
        `fps ${Math.round(this.game.loop.actualFps)}   hits ${this.hits}/${Game.diff.playerHits}   diff ${Game.difficulty}`,
        `player x ${Math.round(this.player.x - this.camX)} (screen)   ground ${this.player.onGround}`,
        `next: ${next.join(', ')}`,
        `latency ${(AudioEngine.get().outputLatency() * 1000).toFixed(0)}ms   audio offset ${Game.audioOffsetMs}ms   input offset ${Game.inputOffsetMs}ms`,
        `[F1 hide]  [R restart]  [ [ / ] or - / + ] audio offset -/+5ms`,
      ].join('\n'),
    );
  }

  private cleanup(): void {
    this.song?.stop();
    this.hazards.forEach((h) => h.destroy());
    this.hazards = [];
    AudioEngine.get().setDark(0);
  }
}
