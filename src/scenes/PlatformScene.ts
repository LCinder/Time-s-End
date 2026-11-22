// PLATFORM levels between bosses (MAIN.md §6.2): the newsreel, the serial, the
// sing-along short and Elias' memories. Built from an ASCII tile map; everything
// that moves does it on the beat of the level's music.

import Phaser from 'phaser';
import { AudioEngine } from '../audio/AudioEngine';
import { sfx } from '../audio/Sfx';
import { PlaceholderSong } from '../audio/Songs';
import * as S from '../audio/Synth';
import { Conductor } from '../core/Conductor';
import { leaveLevel, markCue } from '../core/flow';
import { Game } from '../core/Game';
import { Input } from '../core/Input';
import { expandLyrics, type ExpandedLine } from '../core/lyrics';
import { addFrame, recordLevel } from '../core/Save';
import type { PlatformLevel } from '../core/types';
import { Player } from '../entities/Player';
import { bake } from '../fx/bake';
import { addFilm, type FilmPipeline } from '../fx/FilmPipeline';
import { INK, Ink, PAPER } from '../rig/Ink';
import { Cards } from '../ui/Cards';
import { LyricsUI } from '../ui/LyricsUI';
import { SolidWorld, type Solid } from '../world/Solids';
import { beatPlankSolid, parseMap, pingPong, TILE, type MapThing, type ParsedMap, type Rect } from '../world/TileMap';

type State = 'cards' | 'play' | 'dying' | 'done' | 'paused';

interface Mover { kind: 'M' | 'V'; x0: number; y0: number; solid: Solid }
interface Swinger { kind: 'S' | 'B'; x: number; rest: number; floor: number; rect: Rect }
interface FrameItem { id: string; x: number; y: number; had: boolean; taken: boolean }
interface Cue { x: number; y: number; index: number; beat: number; on: boolean }
interface TextTrig { x: number; text: string; shown: boolean }
interface WordPlat { text: string; beat: number; x: number; y: number; w: number; solid: Solid; label: Phaser.GameObjects.Text }

const STYLE: Record<PlatformLevel['kind'], { sky: number; block: number; top: number; detail: number }> = {
  newsreel: { sky: 0x8d877b, block: 0x3a3631, top: 0x6b655b, detail: 0x2a2723 },
  serial: { sky: 0x2b2a2e, block: 0x45403a, top: 0x6a6258, detail: 0x2a2622 },
  singalong: { sky: 0x1d1b19, block: 0x5a4636, top: 0x8a7258, detail: 0x3a2c22 },
  memory: { sky: 0xb7ae9c, block: 0x6a6052, top: 0x8f8576, detail: 0x4c443a },
};

export class PlatformScene extends Phaser.Scene {
  private L!: PlatformLevel;
  private map!: ParsedMap;
  private state: State = 'cards';
  private input2!: Input;
  private conductor!: Conductor;
  private song: PlaceholderSong | null = null;
  private loopOffset = 0;
  private lines: ExpandedLine[] = [];
  private lyricsUI: LyricsUI | null = null;
  private world = new SolidWorld();
  private player!: Player;
  private film: FilmPipeline | null = null;
  private dyn!: Phaser.GameObjects.Graphics;
  private dynInk!: Ink;
  private planks: { group: 'a' | 'b'; solid: Solid }[] = [];
  private movers: Mover[] = [];
  private swingers: Swinger[] = [];
  private spikes: Rect[] = [];
  private frames: FrameItem[] = [];
  private cues: Cue[] = [];
  private texts: TextTrig[] = [];
  private words: WordPlat[] = [];
  private exit!: { x: number; y: number };
  private lostObj: { x: number; y: number; taken: boolean } | null = null;
  private reel: { x: number; y: number; spin: number; gone: boolean } | null = null;
  private train = { x: 0, active: false };
  private camX = 0;
  private lastBeat = 0;
  private cueIndex = 0;
  private deaths = 0;
  private newFrames = 0;
  private cards: Cards | null = null;
  private banner!: Phaser.GameObjects.Container;
  private bannerText!: Phaser.GameObjects.Text;
  private bannerTimer = 0;
  private hudFrames!: Phaser.GameObjects.Text;
  private judgeText!: Phaser.GameObjects.Text;
  private lastJump: string = '';
  private overlay: Phaser.GameObjects.Container | null = null;
  private startCue = 0;

  constructor() {
    super('Platform');
  }

  init(data: { levelId: string; cue?: number }): void {
    this.L = Game.platformLevels[data.levelId];
    this.startCue = data.cue ?? 0;
    this.state = 'cards';
    this.world = new SolidWorld();
    this.planks = [];
    this.movers = [];
    this.swingers = [];
    this.spikes = [];
    this.frames = [];
    this.cues = [];
    this.texts = [];
    this.words = [];
    this.lostObj = null;
    this.reel = null;
    this.train = { x: 0, active: false };
    this.loopOffset = 0;
    this.deaths = 0;
    this.newFrames = 0;
    this.overlay = null;
    this.cards = null;
    this.song = null;
    this.lyricsUI = null;
  }

  create(): void {
    const L = this.L;
    this.map = parseMap(L.map);
    this.input2 = new Input(this, Game.controls);
    this.lines = L.lyrics ? expandLyrics(L.lyrics) : [];
    this.conductor = new Conductor([{ beat: 0, bpm: L.music.bpm }], L.music.beatsPerBar);
    this.conductor.offsetSec = Game.audioOffsetMs / 1000;
    this.cameras.main.setBackgroundColor(STYLE[L.kind].sky);
    this.cameras.main.setBounds(0, 0, this.map.width, this.map.height);

    this.drawBackground();
    this.buildWorld();
    this.drawStatic();
    this.dyn = this.add.graphics().setDepth(30);
    this.dynInk = new Ink(this.dyn);

    const start = this.thing('P');
    this.player = new Player(this, start.x + TILE / 2, start.y + TILE, Game.config.player);
    this.player.onJump = () => this.onJump();
    this.player.onLand = () => sfx('land');

    if (L.kind === 'singalong') this.lyricsUI = new LyricsUI(this, this.lines, 662, true);
    this.buildHud();
    this.film = addFilm(this, L.era);
    if (this.film) this.film.dark = L.kind === 'serial' ? 0.15 : 0;

    // resume at a cue mark
    const cue = this.cues.find((c) => c.index === this.startCue - 1);
    if (cue) this.activateCue(cue, true);

    this.events.once('shutdown', () => {
      this.song?.stop();
      AudioEngine.get().unsilence();
    });

    const intro = cue ? [] : (L.intro ?? []);
    if (intro.length) this.cards = new Cards(this, this.input2, intro, () => this.begin());
    else this.begin();
  }

  private thing(ch: string): MapThing {
    const t = this.map.things.find((x) => x.ch === ch);
    if (!t) throw new Error(`${this.L.id}: no ${ch} in the map`);
    return t;
  }

  // ───────────────────────── world ─────────────────────────

  private buildWorld(): void {
    const m = this.map;
    for (const r of m.solids) this.world.add({ ...r, active: true });
    for (const r of m.planks) this.world.add({ ...r, oneWay: true, active: true });
    for (const p of m.beatPlanks) this.planks.push({ group: p.group, solid: this.world.add({ ...p.rect, oneWay: true, active: true }) });
    let shoutIdx = 0;
    const shouted = this.lines.flatMap((l) => l.words).filter((w) => w.shout);
    for (const t of m.things) {
      const cx = t.x + TILE / 2;
      switch (t.ch) {
        case 'M':
        case 'V':
          this.movers.push({ kind: t.ch, x0: t.x, y0: t.y + TILE - 14, solid: this.world.add({ x: t.x, y: t.y + TILE - 14, w: TILE * 3, h: 14, oneWay: true, active: true }) });
          break;
        case '^':
          this.spikes.push({ x: t.x + 4, y: t.y + 18, w: TILE - 8, h: TILE - 18 });
          break;
        case 'S':
        case 'B': {
          const floor = this.floorBelow(cx, t.y + TILE);
          const w = t.ch === 'S' ? 72 : 44;
          const h = t.ch === 'S' ? 56 : 52;
          this.swingers.push({ kind: t.ch, x: cx, rest: t.y, floor, rect: { x: cx - w / 2, y: t.y, w, h } });
          break;
        }
        case '*':
          {
            const id = `${this.L.id}:${t.index}`;
            const had = !!Game.save?.frames.includes(id);
            this.frames.push({ id, x: cx, y: t.y + TILE / 2, had, taken: had });
          }
          break;
        case 'C':
          this.cues.push({ x: cx, y: t.y + TILE, index: t.index, beat: 0, on: false });
          break;
        case 'T':
          this.texts.push({ x: t.x, text: this.L.texts?.[t.index] ?? '', shown: false });
          break;
        case 'E':
          this.exit = { x: cx, y: t.y + TILE };
          break;
        case 'O':
          this.lostObj = { x: cx, y: t.y + TILE, taken: !!Game.save?.lostObjects.includes(this.L.lostObject?.id ?? '') };
          break;
        case 'R':
          this.reel = { x: cx, y: t.y + TILE - 30, spin: 0, gone: false };
          break;
        case 'W': {
          const w = shouted[shoutIdx++];
          if (!w) break;
          const label = this.add
            .text(cx, 0, w.text, { fontFamily: 'Rye, Georgia, serif', fontSize: '30px', color: '#141414' })
            .setOrigin(0.5, 0.5)
            .setDepth(32)
            .setVisible(false);
          const width = Math.max(120, label.width + 36);
          const y = t.y + TILE - 14;
          this.words.push({ text: w.text, beat: w.beat, x: cx, y, w: width, label, solid: this.world.add({ x: cx - width / 2, y, w: width, h: 14, oneWay: true, active: false }) });
          break;
        }
      }
    }
    // sing-along: each cue mark rewinds the song to a few beats before the next word
    for (const c of this.cues) {
      const next = this.words.find((w) => w.x > c.x);
      c.beat = next ? Math.max(0, next.beat - 4) : 0;
    }
  }

  private floorBelow(x: number, y: number): number {
    let best = this.map.height + 200;
    for (const s of this.world.solids) {
      if (x >= s.x && x <= s.x + s.w && s.y >= y && s.y < best) best = s.y;
    }
    return best;
  }

  // ───────────────────────── start / music ─────────────────────────

  private begin(): void {
    this.cards = null;
    this.startMusic(this.cues.find((c) => c.on)?.beat ?? 0);
    this.state = 'play';
    this.camX = Phaser.Math.Clamp(this.player.x - 400, 0, this.map.width - 1280);
  }

  private startMusic(fromBeat: number): void {
    this.song?.stop();
    const L = this.L;
    this.song = new PlaceholderSong(this.conductor, L.music.placeholder, this.lines, L.music.beatsPerBar, { voice: !!L.music.voice });
    this.loopOffset = 0;
    this.conductor.start(fromBeat, 0.25);
    this.song.start(fromBeat, 0);
    this.lastBeat = fromBeat;
  }

  private keepLooping(beat: number): void {
    if (!this.song || this.L.kind === 'singalong') return;
    const len = this.song.lengthBeats;
    if (beat >= this.loopOffset + len - 0.25) {
      this.loopOffset += len;
      this.song.start(this.loopOffset, this.loopOffset);
    }
  }

  // ───────────────────────── frame ─────────────────────────

  update(_t: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.1); // Tick splits long frames into steps
    const time = this.time.now / 1000;
    this.input2.update();
    if (this.cards) {
      this.cards.update(delta);
      return;
    }
    if (this.state === 'paused') return this.pauseInput();
    if (this.state === 'done') return;

    const beat = this.state === 'play' ? this.conductor.beat : this.lastBeat;
    if (this.state === 'play') {
      if (this.input2.consume('pause') !== null) return this.pause();
      this.keepLooping(beat);
      this.updateBeatThings(beat);
      this.updatePlayer(dt, beat);
      this.checkThings(beat);
      this.updateCamera(beat, dt);
      this.lastBeat = beat;
    }
    this.drawDynamic(beat, time);
    this.player.draw(dt, time, beat, 0);
    this.lyricsUI?.update(beat, time);
    this.updateBanner(dt);
    this.hudFrames.setText(`${this.frames.filter((f) => f.taken).length} / ${this.frames.length}`);
    if (this.film) this.film.flash = Math.max(0, this.film.flash - dt * 2);
  }

  private updateBeatThings(beat: number): void {
    for (const p of this.planks) p.solid.active = beatPlankSolid(p.group, beat);
    for (const m of this.movers) {
      const f = pingPong(beat, 8) * TILE * 4;
      const nx = m.kind === 'M' ? m.x0 + f : m.x0;
      const ny = m.kind === 'V' ? m.y0 - f : m.y0;
      // carry the player standing on it
      const p = this.player;
      const on = p.onGround && Math.abs(p.y - m.solid.y) < 3 && p.x > m.solid.x - 16 && p.x < m.solid.x + m.solid.w + 16;
      if (on) {
        p.x += nx - m.solid.x;
        p.y += ny - m.solid.y;
      }
      m.solid.x = nx;
      m.solid.y = ny;
    }
    for (const s of this.swingers) s.rect.y = this.swingerTop(s, beat);
    const life = this.L.wordLifeBeats ?? 8;
    for (const w of this.words) {
      const appear = beat >= w.beat - 0.75 && beat < w.beat + life;
      w.solid.active = beat >= w.beat - 0.1 && beat < w.beat + life - 0.25;
      w.label.setVisible(appear);
      if (appear) {
        const fall = Phaser.Math.Clamp((w.beat - beat) / 0.75, 0, 1);
        const crumble = Phaser.Math.Clamp((beat - (w.beat + life - 1)) / 1, 0, 1);
        w.label.setPosition(w.x, w.y - 22 - fall * fall * 320 + crumble * 30).setAlpha(1 - crumble);
      }
    }
  }

  /** Top of a stomper / sandbag for this beat (they land exactly on the beat). */
  private swingerTop(s: Swinger, beat: number): number {
    const low = s.floor - s.rect.h;
    if (s.kind === 'S') {
      const t = ((beat % 2) + 2) % 2; // lands on every even beat
      if (t >= 1.5) {
        const f = (t - 1.5) / 0.5;
        return s.rest + (low - s.rest) * f * f;
      }
      if (t < 0.5) return low;
      if (t < 1.25) return low + (s.rest - low) * ((t - 0.5) / 0.75);
      return s.rest + Math.sin(beat * 60) * 2; // shaking: about to drop
    }
    const t = ((beat % 4) + 4) % 4; // sandbag: lands on beat 1 of every bar
    if (t >= 3.5) {
      const f = (t - 3.5) / 0.5;
      return s.rest + (low - s.rest) * f * f;
    }
    if (t < 0.6) return low;
    if (t < 1.6) return -200; // gone (hauled back up)
    return s.rest + (1 - Math.min(1, (t - 1.6) / 0.6)) * -80;
  }

  private swingerDangerous(s: Swinger, beat: number): boolean {
    const t = s.kind === 'S' ? ((beat % 2) + 2) % 2 : ((beat % 4) + 4) % 4;
    return s.kind === 'S' ? t >= 1.55 || t < 0.5 : t >= 3.55 || t < 0.6;
  }

  private updatePlayer(dt: number, beat: number): void {
    const i = this.input2;
    const jumpT = i.consume('jump');
    let mult = 1;
    if (jumpT !== null) {
      const b = this.conductor.beatAtCtxTime(jumpT, Game.inputOffsetMs);
      const off = Math.abs(b - Math.round(b)) * this.conductor.secondsPerBeat(b) * 1000;
      const w = Game.diff.hitWindowMs;
      this.lastJump = off <= w.perfect ? 'PERFECT!' : off <= w.good ? 'GOOD' : '';
      if (this.lastJump) mult = Game.diff.onBeatJumpMultiplier;
    }
    const dashT = i.consume('dash');
    if (dashT !== null) sfx('dash');
    const auto = this.L.autoscroll ?? 0;
    this.player.update(
      dt,
      {
        dir: (i.isDown('right') ? 1 : 0) - (i.isDown('left') ? 1 : 0),
        jumpPressed: jumpT !== null,
        jumpHeld: i.isDown('jump'),
        dashPressed: dashT !== null,
        jumpMultiplier: mult,
        dashBonusMs: 0,
      },
      { world: this.world, baseSpeed: 0, autoRun: false, minX: auto ? this.camX + 24 : 24, maxX: auto ? this.camX + 1256 : this.map.width - 24 },
    );
    void beat;
  }

  private onJump(): void {
    if (this.lastJump === 'PERFECT!') this.player.accent();
    if (this.lastJump) {
      sfx('jumpBeat');
      this.judgeText.setText(this.lastJump).setPosition(this.player.x, this.player.y - 130).setAlpha(1).setScale(1.2);
      this.tweens.add({ targets: this.judgeText, alpha: 0, y: this.player.y - 170, scale: 1, duration: 600 });
    } else sfx('jump');
    this.lastJump = '';
  }

  private checkThings(beat: number): void {
    const p = this.player;
    const hb = p.hurtbox;
    const overlaps = (r: Rect): boolean => hb.right > r.x && hb.left < r.x + r.w && hb.bottom > r.y && hb.top < r.y + r.h;

    // dangers
    if (p.y > this.map.height + 120) return this.die('fall');
    if (this.spikes.some(overlaps)) return this.die('hit');
    if (this.swingers.some((s) => this.swingerDangerous(s, beat) && overlaps(s.rect))) return this.die('hit');
    if (this.L.autoscroll && p.x <= this.camX + 26 && this.world.near(p.x - 18, p.x + 18).some((s) => !s.oneWay && p.y > s.y + 4 && p.y - p.h < s.y + s.h)) {
      return this.die('hit'); // squashed by the edge of the picture
    }

    // pick-ups
    for (const f of this.frames) {
      if (f.taken) continue;
      if (Math.abs(p.x - f.x) < 34 && p.y - 50 > f.y - 60 && p.y - 50 < f.y + 60) {
        f.taken = true;
        if (Game.save && addFrame(Game.save, f.id)) {
          this.newFrames++;
          Game.persist();
        }
        sfx('onBeat');
        this.flashBanner('FILM FRAME!', 1);
      }
    }
    for (const c of this.cues) {
      if (!c.on && Math.abs(p.x - c.x) < 30 && Math.abs(p.y - c.y) < 60) this.activateCue(c, false);
    }
    for (const t of this.texts) {
      if (!t.shown && p.x >= t.x) {
        t.shown = true;
        this.flashBanner(t.text, this.L.kind === 'newsreel' ? 3 : 4.5);
      }
    }
    const lo = this.lostObj;
    if (lo && !lo.taken && Math.abs(p.x - lo.x) < 40 && Math.abs(p.y - lo.y) < 80) this.takeLostObject();
    if (p.x >= this.exit.x - 20 && Math.abs(p.y - this.exit.y) < 200) this.finish();
  }

  private activateCue(c: Cue, silent: boolean): void {
    for (const o of this.cues) o.on = o === c;
    this.cueIndex = c.index + 1;
    if (!silent) {
      sfx('click');
      this.flashBanner('CUE MARK', 1);
      markCue(this.L.id, this.cueIndex);
    } else {
      this.player.x = c.x;
      this.player.y = c.y;
    }
  }

  private takeLostObject(): void {
    const lo = this.lostObj;
    const info = this.L.lostObject;
    if (!lo || !info) return;
    lo.taken = true;
    if (Game.save && !Game.save.lostObjects.includes(info.id)) {
      Game.save.lostObjects.push(info.id);
      Game.persist();
    }
    sfx('select');
    this.state = 'paused';
    this.cards = new Cards(this, this.input2, [info.text], () => {
      this.cards = null;
      this.state = 'play';
    }, { opaque: false, caption: info.name.toUpperCase() });
  }

  private updateCamera(beat: number, dt: number): void {
    const auto = this.L.autoscroll ?? 0;
    const maxX = this.map.width - 1280;
    if (auto) {
      this.camX = Math.min(maxX, this.camX + (beat - this.lastBeat) * auto);
      // let the player run ahead a little, the picture catches up
      const ahead = this.player.x - (this.camX + 760);
      if (ahead > 0) this.camX = Math.min(maxX, this.camX + ahead * Math.min(1, dt * 3));
    } else {
      const target = Phaser.Math.Clamp(this.player.x - 520 + this.player.facing * 60, 0, maxX);
      this.camX += (target - this.camX) * Math.min(1, dt * 5);
    }
    this.cameras.main.scrollX = this.camX;
  }

  // ───────────────────────── death / respawn ─────────────────────────

  private die(kind: 'fall' | 'hit'): void {
    if (this.state !== 'play') return;
    this.state = 'dying';
    this.deaths++;
    sfx(kind === 'fall' ? 'fall' : 'hit');
    this.player.dead = true;
    if (this.film) this.film.flash = 0.4;
    this.cameras.main.shake(200, 0.01);
    this.time.delayedCall(520, () => {
      sfx('rewind');
      if (this.film) this.tweens.add({ targets: this.film, roll: 1.2, duration: 380, yoyo: true });
      this.time.delayedCall(420, () => this.respawn());
    });
  }

  private respawn(): void {
    const c = this.cues.find((x) => x.on);
    const start = this.thing('P');
    const x = c ? c.x : start.x + TILE / 2;
    const y = c ? c.y : start.y + TILE;
    Object.assign(this.player, { x, y, vx: 0, vy: 0, dead: false, invulnerable: 600 });
    if (this.L.kind === 'singalong') this.startMusic(c?.beat ?? 0);
    if (this.L.autoscroll) this.camX = Phaser.Math.Clamp(x - 300, 0, this.map.width - 1280);
    if (this.reel && !this.reel.gone) this.reel.x = Math.max(this.reel.x, x + 300);
    this.input2.clear();
    this.state = 'play';
  }

  // ───────────────────────── end ─────────────────────────

  private finish(): void {
    if (this.state !== 'play') return;
    this.state = 'done';
    sfx('victory');
    if (this.reel) {
      this.reel.gone = true;
      S.steamWhistle(AudioEngine.get().sfx, AudioEngine.get().ctx.currentTime + 0.2, 0.6);
    }
    this.train.active = true;
    if (Game.save) {
      recordLevel(Game.save, this.L.id, true);
      Game.persist();
    }
    const outro = this.L.outro ?? [];
    this.time.delayedCall(900, () => {
      this.song?.stop();
      const results = () => this.showResults();
      if (outro.length) this.cards = new Cards(this, this.input2, outro, () => { this.cards = null; results(); });
      else results();
    });
  }

  private showResults(): void {
    const got = this.frames.filter((f) => f.taken).length;
    const c = this.add.container(0, 0).setDepth(250).setScrollFactor(0, 0, true);
    const g = this.add.graphics();
    g.fillStyle(0x0b0b0b, 0.88);
    g.fillRect(0, 0, 1280, 720);
    g.lineStyle(6, PAPER, 1);
    g.strokeRoundedRect(330, 170, 620, 380, 28);
    c.add(g);
    const t = (y: number, s: string, size: number, font = 'Limelight') =>
      c.add(this.add.text(640, y, s, { fontFamily: `${font}, Georgia, serif`, fontSize: `${size}px`, color: '#f4efe4', align: 'center' }).setOrigin(0.5));
    t(240, 'THE END', 64, 'Rye');
    t(330, `Film frames: ${got} / ${this.frames.length}${this.newFrames ? `   (+${this.newFrames} new)` : ''}`, 30);
    t(375, this.deaths ? `Rewinds: ${this.deaths}` : 'Not a single rewind!', 26);
    if (this.lostObj?.taken && this.L.lostObject) t(420, `Found: ${this.L.lostObject.name}`, 24);
    t(500, 'ENTER  -  back to the Bijou', 22);
    this.input2.clear();
    const wait = (): void => {
      this.input2.update();
      if (this.input2.consume('confirm') !== null || this.input2.consume('jump') !== null) {
        this.events.off('update', wait);
        this.cameras.main.fadeOut(300, 11, 11, 11);
        this.time.delayedCall(320, () => leaveLevel(this, this.L.id, { completed: true }));
      }
    };
    this.time.delayedCall(500, () => this.events.on('update', wait));
  }

  // ───────────────────────── pause ─────────────────────────

  private pause(): void {
    this.state = 'paused';
    AudioEngine.get().ctx.suspend();
    const c = this.add.container(0, 0).setDepth(260).setScrollFactor(0, 0, true);
    c.add(this.add.rectangle(640, 360, 1280, 720, 0x0b0b0b, 0.75));
    c.add(this.add.text(640, 280, 'INTERMISSION', { fontFamily: 'Rye, Georgia, serif', fontSize: '68px', color: '#f4efe4' }).setOrigin(0.5));
    ['ESC / ENTER  -  resume', 'R  -  back to the last cue mark', 'Q  -  back to the Bijou'].forEach((s, k) =>
      c.add(this.add.text(640, 380 + k * 42, s, { fontFamily: 'Limelight, Georgia, serif', fontSize: '28px', color: '#cfc8b8' }).setOrigin(0.5)),
    );
    this.overlay = c;
    this.input2.clear();
  }

  private pauseInput(): void {
    const kb = this.input.keyboard;
    const resume = (): void => {
      this.overlay?.destroy();
      this.overlay = null;
      this.input2.clear();
      AudioEngine.get().resume().then(() => (this.state = 'play'));
    };
    if (!this.overlay) return; // a lost-object card is open
    if (this.input2.consume('pause') !== null || this.input2.consume('confirm') !== null) resume();
    else if (kb?.checkDown(kb.addKey('R'), 9999)) {
      resume();
      this.time.delayedCall(50, () => this.die('hit'));
    } else if (kb?.checkDown(kb.addKey('Q'), 9999)) {
      AudioEngine.get().resume();
      this.overlay?.destroy();
      this.state = 'done';
      leaveLevel(this, this.L.id);
    }
  }

  // ───────────────────────── HUD ─────────────────────────

  private buildHud(): void {
    this.add.image(40, 38, 'film_0').setDepth(200).setScrollFactor(0);
    this.hudFrames = this.add
      .text(70, 22, '', { fontFamily: 'Rye, Georgia, serif', fontSize: '28px', color: '#f4efe4', stroke: '#141414', strokeThickness: 7 })
      .setDepth(200)
      .setScrollFactor(0);
    this.add
      .text(1260, 24, `${this.L.title}`, { fontFamily: 'Limelight, Georgia, serif', fontSize: '20px', color: '#f4efe4', stroke: '#141414', strokeThickness: 5 })
      .setOrigin(1, 0)
      .setDepth(200)
      .setScrollFactor(0);
    this.judgeText = this.add
      .text(0, 0, '', { fontFamily: 'Rye, Georgia, serif', fontSize: '26px', color: '#f4efe4', stroke: '#141414', strokeThickness: 7 })
      .setOrigin(0.5)
      .setDepth(96)
      .setAlpha(0);
    // banner for headlines / intertitles / pick-ups
    this.banner = this.add.container(640, 110).setDepth(210).setScrollFactor(0, 0, true).setAlpha(0);
    const bg = this.add.graphics();
    this.banner.add(bg);
    this.bannerText = this.add
      .text(0, 0, '', { fontFamily: 'Limelight, Georgia, serif', fontSize: '30px', color: '#f4efe4', align: 'center', wordWrap: { width: 900 } })
      .setOrigin(0.5);
    this.banner.add(this.bannerText);
    this.banner.setData('bg', bg);
  }

  private flashBanner(text: string, sec: number): void {
    this.bannerText.setText(text);
    const news = this.L.kind === 'newsreel' && sec > 2;
    this.bannerText.setFontFamily(news ? 'Rye, Georgia, serif' : 'Limelight, Georgia, serif').setColor(news ? '#141414' : '#f4efe4');
    const bg = this.banner.getData('bg') as Phaser.GameObjects.Graphics;
    const w = Math.min(1000, this.bannerText.width + 70);
    const h = this.bannerText.height + 36;
    bg.clear();
    bg.fillStyle(news ? 0xe8e1d0 : 0x0b0b0b, 0.95);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
    bg.lineStyle(3, news ? INK : PAPER, 1);
    bg.strokeRoundedRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12, 8);
    this.banner.setAlpha(1).setScale(news ? 0.2 : 1).setAngle(news ? -720 : 0);
    if (news) this.tweens.add({ targets: this.banner, scale: 1, angle: -3, duration: 500, ease: 'Back.Out' });
    this.bannerTimer = sec;
  }

  private updateBanner(dt: number): void {
    if (this.bannerTimer <= 0) return;
    this.bannerTimer -= dt;
    if (this.bannerTimer <= 0) this.tweens.add({ targets: this.banner, alpha: 0, duration: 300 });
  }

  // ───────────────────────── drawing ─────────────────────────

  private drawBackground(): void {
    const kind = this.L.kind;
    const W = this.map.width;
    const far = this.add.graphics().setDepth(1).setScrollFactor(0.25, 0);
    const near = this.add.graphics().setDepth(2).setScrollFactor(0.55, 0);
    const ink = new Ink(far);
    const ink2 = new Ink(near);
    const rnd = new Phaser.Math.RandomDataGenerator([this.L.id]);
    const span = (f: number): number => W * f + 1400;
    if (kind === 'serial') {
      ink.circle(980, 150, 60, 0xe8e1d0, 4);
      for (let i = 0; i < 70; i++) far.fillStyle(PAPER, 0.7).fillCircle(rnd.between(0, span(0.25)), rnd.between(20, 320), rnd.between(1, 3));
    }
    if (kind === 'memory') {
      for (let i = 0; i < 6; i++) ink.cloud(rnd.between(0, span(0.25)), rnd.between(80, 220), rnd.between(40, 70), 0xd6cfbf);
    }
    if (kind === 'newsreel') {
      for (let i = 0; i < 18; i++) {
        const x = rnd.between(0, span(0.25));
        far.fillStyle(0xa39c8f, 1).fillRect(x, 120, 2, 400); // film scratches on the sky
      }
    }
    // skyline / houses
    let x = -40;
    const col = kind === 'serial' ? 0x1f1e22 : kind === 'memory' ? 0x8f8676 : kind === 'singalong' ? 0x2a2420 : 0x6f695e;
    while (x < span(0.55)) {
      const w = rnd.between(120, 240);
      const h = rnd.between(140, 340);
      ink2.rrect(x, 560 - h, w, h + 200, 6, col, 3);
      if (kind !== 'singalong') {
        for (let wy = 560 - h + 30; wy < 520; wy += 56) {
          for (let wx = x + 22; wx < x + w - 30; wx += 46) {
            near.fillStyle(kind === 'serial' && rnd.frac() < 0.3 ? 0xd8c98a : 0x000000, kind === 'serial' ? 0.9 : 0.25).fillRect(wx, wy, 18, 26);
          }
        }
      }
      if (kind === 'memory' && rnd.frac() < 0.5) ink2.line(x + w / 2, 560 - h, x + w / 2, 560 - h - 40, 6, INK);
      x += w + rnd.between(10, 60);
    }
    if (kind === 'singalong') {
      // curtains at both sides of the screen
      const cur = this.add.graphics().setDepth(80).setScrollFactor(0);
      const ci = new Ink(cur);
      for (const side of [0, 1]) {
        const x0 = side ? 1180 : 0;
        ci.rrect(x0, -20, 100, 760, 0, 0x3a2a24, 4);
        for (let k = 1; k < 4; k++) ci.line(x0 + k * 25, 0, x0 + k * 25 + (side ? -6 : 6), 720, 3, 0x241a16);
      }
      ci.rrect(-20, -20, 1320, 60, 0, 0x3a2a24, 4);
      bake(this, cur, { width: 1280, height: 720, depth: 80, scrollFactor: 0 });
    }
    // static scenery: bake it once (Phaser would re-process every shape each frame)
    bake(this, far, { width: Math.ceil(span(0.25)), height: 720, depth: 1, scrollFactor: 0.25 });
    bake(this, near, { width: Math.ceil(span(0.55)), height: 720, depth: 2, scrollFactor: 0.55 });
  }

  private drawStatic(): void {
    const st = STYLE[this.L.kind];
    const g = this.add.graphics().setDepth(20);
    const k = new Ink(g);
    for (const r of this.map.solids) {
      k.rrect(r.x, r.y, r.w, r.h + 4, 4, st.block, 4);
      g.fillStyle(st.top, 1).fillRect(r.x + 4, r.y + 4, r.w - 8, 10);
      // bricks / boards
      g.lineStyle(2, st.detail, 0.8);
      for (let yy = r.y + 26; yy < r.y + r.h; yy += 22) {
        g.lineBetween(r.x + 6, yy, r.x + r.w - 6, yy);
        for (let xx = r.x + ((yy / 22) % 2 ? 20 : 40); xx < r.x + r.w - 10; xx += 40) g.lineBetween(xx, yy, xx, yy + 22);
      }
    }
    for (const r of this.map.planks) this.plank(k, r, 1);
    for (const s of this.spikes) {
      g.fillStyle(0xd8d2c4, 1);
      for (let i = 0; i < 3; i++) {
        const sx = s.x + i * (s.w / 3);
        g.fillTriangle(sx, s.y + s.h, sx + s.w / 6, s.y, sx + s.w / 3, s.y + s.h);
      }
      g.lineStyle(2, INK, 1).strokeRect(s.x, s.y + s.h - 2, s.w, 3);
    }
    // exit marker
    const e = this.exit;
    const label = this.L.kind === 'memory' ? 'PLATFORM 3' : this.L.kind === 'serial' ? 'TO THE TRAIN' : this.L.kind === 'singalong' ? 'EXIT' : 'THE END';
    k.line(e.x, e.y, e.x, e.y - 150, 6, INK);
    k.rrect(e.x - 90, e.y - 200, 180, 56, 8, PAPER, 4);
    this.add.text(e.x, e.y - 172, label, { fontFamily: 'Rye, Georgia, serif', fontSize: '22px', color: '#141414' }).setOrigin(0.5).setDepth(21);
    bake(this, g, { width: this.map.width, height: this.map.height, depth: 20 });
  }

  private plank(k: Ink, r: Rect, alpha: number): void {
    k.rrect(r.x, r.y, r.w, r.h + 6, 4, alpha < 1 ? 0x8a7a64 : 0xa08a6c, 3, INK, alpha);
  }

  private drawDynamic(beat: number, time: number): void {
    const g = this.dyn;
    const k = this.dynInk;
    g.clear();
    k.seed = Math.floor(time * 8) % 3;
    const pulse = Math.pow(1 - (beat - Math.floor(beat)), 3);
    // only what is on screen (plus a margin) is drawn
    const L0 = this.camX - 160;
    const R0 = this.camX + 1440;
    const vis = (x: number, w = 0): boolean => x + w > L0 && x < R0;

    // beat planks (flicker in the last half beat before vanishing)
    for (const p of this.planks) {
      if (!vis(p.solid.x, p.solid.w)) continue;
      const solidNow = p.solid.active;
      const warn = solidNow && !beatPlankSolid(p.group, beat + 0.5);
      if (solidNow) {
        if (!warn || Math.floor(time * 14) % 2 === 0) this.plank(k, p.solid, 1);
      } else {
        g.lineStyle(2, PAPER, 0.35).strokeRect(p.solid.x, p.solid.y, p.solid.w, p.solid.h);
      }
    }
    for (const m of this.movers) if (vis(m.solid.x, m.solid.w)) this.plank(k, m.solid, 1);

    // stompers ("1 TON" weights) and sandbags, with their ropes
    for (const s of this.swingers) {
      const r = s.rect;
      if (r.y < -100 || !vis(r.x, r.w)) continue;
      k.line(s.x, -10, s.x, r.y, 3, INK);
      if (s.kind === 'S') {
        k.poly([{ x: r.x + 10, y: r.y }, { x: r.x + r.w - 10, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }], 0x2a2a2a, 4);
        g.fillStyle(PAPER, 1);
        this.tinyText(g, s.x, r.y + r.h * 0.62, '1 TON');
      } else {
        k.ellipse(s.x, r.y + r.h * 0.58, r.w / 2, r.h / 2, 0xb8a888, 4);
        k.line(s.x - 10, r.y + 6, s.x + 10, r.y + 6, 4, INK);
      }
    }

    // film frames: bob on the beat
    for (const f of this.frames) {
      if ((f.taken && !f.had) || !vis(f.x - 20, 40)) continue;
      const y = f.y - pulse * 6;
      const a = f.had ? 0.3 : 1;
      k.rrect(f.x - 16, y - 20, 32, 40, 4, 0x141414, 3, PAPER, a);
      g.fillStyle(PAPER, 0.85 * a).fillRect(f.x - 9, y - 12, 18, 24);
      for (let i = 0; i < 4; i++) {
        g.fillStyle(PAPER, a).fillRect(f.x - 14, y - 16 + i * 10, 3, 5);
        g.fillStyle(PAPER, a).fillRect(f.x + 11, y - 16 + i * 10, 3, 5);
      }
    }

    // cue marks: a post with the round cue dot of old film reels
    for (const c of this.cues) {
      if (!vis(c.x - 20, 40)) continue;
      k.line(c.x, c.y, c.x, c.y - 70, 4, INK);
      k.circle(c.x, c.y - 84, 16, c.on ? PAPER : 0x3a3631, 4);
      if (c.on) g.fillStyle(INK, 1).fillCircle(c.x, c.y - 84, 6);
    }

    // word platforms (sing-along)
    for (const w of this.words) {
      if (!w.label.visible) continue;
      const y = w.label.y + 22;
      k.rrect(w.x - w.w / 2, y - 40, w.w, 46, 10, PAPER, 4, INK, w.label.alpha);
    }

    // lost object: a ticket that glints
    const lo = this.lostObj;
    if (lo && !lo.taken) {
      const y = lo.y - 30 - pulse * 8;
      k.rrect(lo.x - 26, y - 14, 52, 28, 3, 0xe8e1d0, 3);
      g.lineStyle(2, INK, 1).lineBetween(lo.x - 6, y - 12, lo.x - 6, y + 12);
      g.fillStyle(PAPER, 0.8).fillCircle(lo.x + 22, y - 18, 3 + pulse * 4);
    }

    this.drawReel(beat, time);
    this.drawTrain(time);
  }

  private tinyText(g: Phaser.GameObjects.Graphics, x: number, y: number, s: string): void {
    // blocky letters so the weight label needs no Text object per frame
    g.fillStyle(PAPER, 1);
    g.fillRect(x - 22, y - 6, 44, 12);
    g.fillStyle(INK, 1);
    for (let i = 0; i < s.length; i++) g.fillRect(x - 19 + i * 8, y - 3, 5, 6);
  }

  private drawReel(beat: number, time: number): void {
    const r = this.reel;
    if (!r) return;
    const dt = 1 / 60;
    if (r.gone) {
      r.x += 900 * dt;
      r.y -= 200 * dt;
    } else if (this.state === 'play') {
      const gap = r.x - this.player.x;
      const speed = gap < 260 ? 380 : gap > 760 ? 0 : 240;
      r.x = Math.min(this.exit.x - 40, r.x + speed * dt);
      const ground = this.floorBelow(r.x, r.y - 10);
      if (ground < this.map.height) r.y += (ground - 34 - r.y) * 0.2;
      r.spin += speed * dt * 0.05;
    }
    const k = this.dynInk;
    const hop = Math.abs(Math.sin(beat * Math.PI)) * 22;
    const y = r.y - hop;
    k.circle(r.x, y, 34, 0x2a2a2a, 5);
    for (let i = 0; i < 3; i++) {
      const a = r.spin + (i / 3) * Math.PI * 2;
      k.circle(r.x + Math.cos(a) * 18, y + Math.sin(a) * 18, 7, PAPER, 3);
    }
    k.circle(r.x, y, 6, PAPER, 3);
    // cheeky eyes looking back at Tick
    const look = this.player.x < r.x ? -3 : 3;
    k.pieEye(r.x - 10, y - 46, 7, 10, look, 0, Math.floor(time * 2) % 7 === 0);
    k.pieEye(r.x + 10, y - 46, 7, 10, look, 0, Math.floor(time * 2) % 7 === 0);
  }

  private drawTrain(time: number): void {
    if (this.L.kind !== 'memory' && this.L.kind !== 'serial') return;
    const e = this.exit;
    if (!this.train.active && this.player.x > e.x - 900) this.train.active = true;
    if (this.train.x === 0) this.train.x = e.x - 200;
    if (this.train.active) this.train.x += 110 / 60;
    if (this.train.x > this.camX + 1500 || this.train.x + 1100 < this.camX - 100) return;
    const k = this.dynInk;
    const baseY = e.y + (this.L.kind === 'memory' ? 0 : 40);
    for (let car = 0; car < 4; car++) {
      const x = this.train.x + car * 230;
      k.rrect(x, baseY - 150, 220, 120, 10, 0x2a2a2a, 4);
      for (let w = 0; w < 3; w++) this.dyn.fillStyle(0xd8c98a, 0.7).fillRect(x + 20 + w * 66, baseY - 130, 40, 34);
      k.circle(x + 50, baseY - 26, 22, 0x1c1c1c, 4);
      k.circle(x + 170, baseY - 26, 22, 0x1c1c1c, 4);
    }
    // the engine at the front, puffing
    k.rrect(this.train.x + 920, baseY - 190, 150, 160, 12, 0x1c1c1c, 4);
    k.cloud(this.train.x + 1000, baseY - 240 - Math.sin(time * 6) * 8, 26, 0xd8d2c4);
  }
}
