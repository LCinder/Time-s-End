// CHASE level: the camera scrolls with the music, the boss chases from behind,
// and every hazard is announced by the boss's song and lands on the beat.

import Phaser from 'phaser';
import { AudioEngine } from '../audio/AudioEngine';
import { sfx } from '../audio/Sfx';
import { FileSong, PlaceholderSong, type SongSource } from '../audio/Songs';
import { Conductor } from '../core/Conductor';
import { Game } from '../core/Game';
import { Input } from '../core/Input';
import { expandLyrics, type ExpandedLine } from '../core/lyrics';
import type { LevelData, LevelEvent } from '../core/types';
import {
  CoalHazard, DropHazard, GroundWaveHazard, LungeHazard, LyricWordHazard, SmokeRingHazard,
  spawnBeatOf, type ChaseCtx, type Hazard,
} from '../entities/hazards';
import { Player, type PlayerControls } from '../entities/Player';
import { Smokestack } from '../entities/Smokestack';
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

  constructor() {
    super('Chase');
  }

  init(data: { levelId?: string }): void {
    this.level = Game.levels[data.levelId ?? 'smokestack'];
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
    this.flash = 0;
    this.dark = 0;
    this.startBeat = Game.startBeat;
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
    this.scenery = new Scenery(this, GROUND_Y);
    const diffName = Game.difficulty;
    const events = L.events.filter((e) => !e.only || e.only.includes(diffName));
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

    this.debugText = this.add
      .text(12, 70, '', { fontFamily: 'monospace', fontSize: '14px', color: '#ffffff', backgroundColor: '#000000aa' })
      .setDepth(200)
      .setVisible(this.showDebug);
    this.input.keyboard?.on('keydown-F1', () => {
      this.showDebug = !this.showDebug;
      this.debugText?.setVisible(this.showDebug);
    });
    this.input.keyboard?.on('keydown-R', () => {
      if (this.state === 'play' || this.state === 'paused') this.restart(false);
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
    const dt = Math.min(delta / 1000, 1 / 30);
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

    // the end of the song = you escaped!
    if (this.state === 'play' && beat >= L.song.lengthBeats) this.win();
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
    if (this.lastJumpJudge.label) {
      sfx('jumpBeat');
      this.registerOnBeat(this.lastJumpJudge.label);
    } else {
      sfx('jump');
      this.combo = 0;
    }
    this.lastJumpJudge = { mult: 1, label: '' };
  }

  private registerOnBeat(label: string): void {
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
      b.mouthWide = m.index % 2 === 0;
      // a puff of smoke out of the mouth on every shouted word
      if (m.shout && !b.shouting && this.state === 'play') {
        const mp = b.mouthPos;
        for (let k = 0; k < 3; k++) {
          this.particles.push(this.particle('puff', mp.x + this.camX + 30, mp.y, 160 + Math.random() * 120, -60 + Math.random() * 80, 0.8, 0.6));
        }
      }
      b.shouting = m.shout;
      b.nervous += ((this.combo >= 8 ? 0.7 : 0) - b.nervous) * Math.min(1, dt * 3);
      b.wheelAngle += ((camSpeed + (b.charge > 0.5 ? 400 : 0)) / 58) * dt;
    }
    b.lookTarget = { x: this.player.x - this.camX, y: this.player.y - 60 };
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
    if (this.film) {
      this.tweens.add({ targets: this.film, burn: 1, duration: 2200, delay: 900, ease: 'Quad.In' });
    }
    this.time.delayedCall(this.film ? 3400 : 1200, () => {
      this.showOverlay('THE END?', [
        'ENTER  -  rewind the reel & try again',
        'ESC  -  back to the title',
      ], this.hitsSummary(false));
    });
  }

  private win(): void {
    this.state = 'won';
    // the real song keeps playing its outro under the results card
    if (!(this.song instanceof FileSong)) this.song?.stop();
    this.conductor.stop();
    sfx('victory');
    const res = this.saveResults(true);
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
              this.showOverlay("THAT'S A WRAP!", ['ENTER  -  play again', 'ESC  -  back to the title'], [
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
          .text(0, 130 + i * 40, o, { fontFamily: 'Limelight, Georgia, serif', fontSize: '26px', color: '#cfc8b8' })
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
    if (this.input2.consume('confirm') !== null) this.restart(true);
    else if (this.input2.consume('pause') !== null) this.quitToTitle();
  }

  private restart(rewind: boolean): void {
    if (this.state === 'paused') AudioEngine.get().resume();
    this.song?.stop();
    this.conductor.stop();
    if (rewind && this.film) {
      sfx('rewind');
      this.state = 'won'; // freeze gameplay while rewinding
      this.overlay?.destroy();
      this.overlay = null;
      this.add.text(640, 360, '<< REWINDING', { fontFamily: 'Rye, Georgia, serif', fontSize: '48px', color: '#f4efe4', stroke: '#141414', strokeThickness: 8 }).setOrigin(0.5).setDepth(190);
      this.tweens.add({ targets: this.film, roll: 4, burn: 0, duration: 1000, ease: 'Quad.In', onComplete: () => this.scene.restart({ levelId: this.level.id }) });
    } else {
      this.scene.restart({ levelId: this.level.id });
    }
  }

  private quitToTitle(): void {
    if (this.state === 'paused') AudioEngine.get().resume();
    this.song?.stop();
    this.conductor.stop();
    this.scene.start('Title');
  }

  // ───────────────────────── pause ─────────────────────────

  private pause(): void {
    this.state = 'paused';
    AudioEngine.get().ctx.suspend();
    const c = this.add.container(640, 360).setDepth(180);
    const bg = this.add.rectangle(0, 0, 1280, 720, 0x0b0b0b, 0.7);
    c.add(bg);
    c.add(this.add.text(0, -80, 'INTERMISSION', { fontFamily: 'Rye, Georgia, serif', fontSize: '72px', color: '#f4efe4', stroke: '#141414', strokeThickness: 10 }).setOrigin(0.5));
    ['ESC / ENTER  -  resume', 'R  -  restart', 'Q  -  quit to title'].forEach((s, i) =>
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
    f.flash = this.flash;
    f.dark = this.dark * 0.94;
    f.light1 = { x: this.player.x - this.camX, y: this.player.y - 60, r: 190 };
    const lamp = this.boss.lamp;
    f.light2 = { x: lamp.x + 280, y: lamp.y + 230, r: 330 };
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
