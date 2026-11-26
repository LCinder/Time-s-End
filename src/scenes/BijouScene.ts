// THE BIJOU (MAIN.md §6.1): the empty picture palace as a world Tick walks around.
// Posters, the organ and Elias' coat open the levels between bosses; frames found
// there splice the reel; the projector is threaded once and the screen leads into
// the boss. Every boss that gets their ending takes a seat, adds an instrument to
// the organ, moves the watch forward and turns the season outside the window.

import Phaser from 'phaser';
import { sfx } from '../audio/Sfx';
import { startLevel } from '../core/flow';
import { Game } from '../core/Game';
import { Input } from '../core/Input';
import { addFrame, clockText, framesAvailable, newSave, type SaveData } from '../core/Save';
import { Pirouette } from '../entities/Pirouette';
import { Player } from '../entities/Player';
import { Smokestack } from '../entities/Smokestack';
import { ACTS, fillerAct, type ActName } from '../entities/SmokestackActs';
import { addFilm, type FilmPipeline } from '../fx/FilmPipeline';
import { drawHub, drawSeats, LENS, MARQUEE, SCREEN, WINDOW } from '../hub/HubArt';
import { buildHubMap, FLOOR, HUB_OBJECTS, HUB_SPAWN, LADDER_TOP, RAFTER_END_COL, type HubObject } from '../hub/HubLayout';
import { HubMusic } from '../hub/HubMusic';
import { INK, Ink, PAPER } from '../rig/Ink';
import { Cards } from '../ui/Cards';
import { SolidWorld, type Solid } from '../world/Solids';
import { beatPlankSolid, parseMap, pingPong, TILE, type ParsedMap } from '../world/TileMap';

const SEASONS = ['autumn', 'winter', 'spring', 'summer'] as const;
const DUST_FLOORS = [
  { y: FLOOR.booth, c1: 1, c2: 22 },
  { y: FLOOR.lobby, c1: 1, c2: 26 },
  { y: FLOOR.lobby, c1: 28, c2: 56 },
  { y: FLOOR.stage, c1: 60, c2: 70 },
];

interface Step {
  text: string;
  run?: () => void;
}

export class BijouScene extends Phaser.Scene {
  private save!: SaveData;
  private map!: ParsedMap;
  private world = new SolidWorld();
  private input2!: Input;
  private player!: Player;
  private music: HubMusic | null = null;
  private film: FilmPipeline | null = null;
  private dyn!: Phaser.GameObjects.Graphics;
  private ink!: Ink;
  private planks: { group: 'a' | 'b'; solid: Solid }[] = [];
  private mover!: { x0: number; solid: Solid };
  private bags: { x: number; rest: number; floor: number; y: number }[] = [];
  private frames: { id: string; x: number; y: number; taken: boolean }[] = [];
  private prompt!: Phaser.GameObjects.Text;
  private box: Phaser.GameObjects.Container | null = null;
  private boxText!: Phaser.GameObjects.Text;
  private boxQueue: Step[] = [];
  private boxOpenedAt = 0;
  private cards: Cards | null = null;
  private hudClock!: Phaser.GameObjects.Text;
  private hudFrames!: Phaser.GameObjects.Text;
  private hudGfx!: Phaser.GameObjects.Graphics;
  private marqueeText!: Phaser.GameObjects.Text;
  private screenText!: Phaser.GameObjects.Text;
  private camX = 0;
  private camY = 0;
  private lockedUntil = 0;
  private mirrorTrail: { x: number; y: number; f: number }[] = [];
  private seated: Smokestack | null = null;
  /** Miss Pirouette, freed, dancing on top of the lost and found box */
  private dancer: Pirouette | null = null;
  private seatTween: { x: number } | null = null;
  private particles: { x: number; y: number; vx: number; vy: number; r: number }[] = [];
  private dustDirty = false;
  private wasUp = false;
  private nextSeatAct = 0;
  private lastSeatAct: ActName | null = null;
  private seatsRT: Phaser.GameObjects.RenderTexture[] = [];
  private dustRT: Phaser.GameObjects.RenderTexture[] = [];
  private dustDrawn = -1;
  private lastSaveAt = 0;
  // what the scene shows, which can lag behind the save during the chapter ending
  private shownFreed = 0;
  private shownSeconds = 0;
  private entering = false;
  private pauseMenu: { c: Phaser.GameObjects.Container; items: Phaser.GameObjects.Text[]; sel: number } | null = null;
  private from: string | undefined;
  private completed = false;

  constructor() {
    super('Bijou');
  }

  init(data: { from?: string; completed?: boolean }): void {
    this.from = data?.from;
    this.completed = !!data?.completed;
    this.world = new SolidWorld();
    this.planks = [];
    this.bags = [];
    this.frames = [];
    this.box = null;
    this.boxQueue = [];
    this.cards = null;
    this.mirrorTrail = [];
    this.seated = null;
    this.dancer = null;
    this.seatTween = null;
    this.particles = [];
    this.entering = false;
    this.pauseMenu = null;
  }

  create(): void {
    if (!Game.save) Game.save = newSave('A'); // dev shortcut (?hub=1): a scratch save
    this.save = Game.save;
    Game.returnTo = 'hub';
    if (this.from === 'thread' && this.completed && !this.save.flags.threaded.includes(Game.chapter.feature)) {
      this.save.flags.threaded.push(Game.chapter.feature);
      this.save.flags.ritualSeen = true;
      Game.persist();
    }
    this.map = parseMap(buildHubMap());
    this.input2 = new Input(this, Game.controls);
    this.cameras.main.setBackgroundColor('#141312');
    this.cameras.main.setBounds(0, 0, this.map.width, this.map.height);

    drawHub(this, this.map);
    this.buildWorld();
    this.seatsRT = drawSeats(this);
    this.dustRT = DUST_FLOORS.map((f) => this.add.renderTexture(f.c1 * TILE, f.y - 8, (f.c2 - f.c1 + 1) * TILE, 16).setOrigin(0).setDepth(8));
    this.dustDrawn = -1;
    this.dyn = this.add.graphics().setDepth(25);
    this.ink = new Ink(this.dyn);
    this.ink.amp = 0.8;

    const ch = Game.chapter;
    const feature = ch.feature;
    const endingDue = this.completed && this.from === feature && this.save.freed.includes(feature) && !this.save.flags.endingsSeen.includes(feature);
    this.shownFreed = this.save.freed.length - (endingDue ? 1 : 0);
    this.shownSeconds = Math.min(59, this.shownFreed * Game.story.secondsPerBoss);

    this.player = new Player(this, HUB_SPAWN.x, HUB_SPAWN.y, Game.config.player);
    this.player.onLand = () => sfx('land');
    this.placePlayer();

    this.marqueeText = this.add.text(MARQUEE.x + MARQUEE.w / 2, MARQUEE.y + MARQUEE.h / 2, '', {
      fontFamily: 'Rye, Georgia, serif', fontSize: '15px', color: '#141414', align: 'center', wordWrap: { width: MARQUEE.w - 16 },
    }).setOrigin(0.5).setDepth(27);
    this.screenText = this.add.text(SCREEN.x + SCREEN.w / 2, SCREEN.y + SCREEN.h / 2, '', {
      fontFamily: 'Rye, Georgia, serif', fontSize: '34px', color: '#141414', align: 'center', wordWrap: { width: SCREEN.w - 30 },
    }).setOrigin(0.5).setDepth(27);
    this.prompt = this.add.text(0, 0, '', {
      fontFamily: 'Rye, Georgia, serif', fontSize: '18px', color: '#141414', backgroundColor: '#e8e1d0', padding: { x: 10, y: 5 },
    }).setOrigin(0.5, 1).setDepth(60).setVisible(false);
    this.buildHud();
    this.film = addFilm(this, 'bw1928');

    if (this.shownFreed >= 1 && !endingDue) this.seatSmokestack(false);
    if (this.save.freed.includes('pirouette') && !(endingDue && feature === 'pirouette')) this.placeDancer();
    this.startMusic(this.shownFreed);
    this.events.once('shutdown', () => {
      this.music?.stop();
      this.persistNow();
    });

    this.cameras.main.fadeIn(400, 11, 11, 11);
    if (endingDue) this.time.delayedCall(700, () => this.chapterEnding());
    else if (!this.save.flags.introSeen) {
      this.save.flags.introSeen = true;
      this.persistNow();
      this.time.delayedCall(600, () => this.say([
        { text: 'Tick woke up. The Bijou was dark, dusty and silent.' },
        { text: '← → walk    Z / SPACE jump    ▲ look at things and use them' },
        { text: 'The projection window is open... and the stairs door seems stuck.' },
      ]));
    } else this.afterLevelMessage();
  }

  // ───────────────────────── world ─────────────────────────

  private buildWorld(): void {
    const m = this.map;
    for (const r of m.solids) this.world.add({ ...r, active: true });
    for (const p of m.beatPlanks) this.planks.push({ group: p.group, solid: this.world.add({ ...p.rect, oneWay: true, active: true }) });
    for (const t of m.things) {
      if (t.ch === 'M') this.mover = { x0: t.x, solid: this.world.add({ x: t.x, y: t.y + TILE - 14, w: TILE * 3, h: 14, oneWay: true, active: true }) };
      if (t.ch === 'B') this.bags.push({ x: t.x + 20, rest: t.y, floor: FLOOR.rafters, y: t.y });
      if (t.ch === '*') {
        const id = `bijou:${t.index}`;
        this.frames.push({ id, x: t.x + 20, y: t.y + 20, taken: this.save.frames.includes(id) });
      }
    }
  }

  private placePlayer(): void {
    const from = this.from;
    const obj = from ? HUB_OBJECTS.find((o) => o.level === from || o.game === from || (from === 'thread' && o.kind === 'projector')) : undefined;
    if (this.from === 'smokestack' && this.completed) {
      this.player.x = 44 * TILE;
      this.player.y = FLOOR.lobby;
    } else if (obj && obj.kind !== 'seat') {
      // beside the lost and found box, so Miss Pirouette on top of it can be seen
      this.player.x = obj.col * TILE + 20 + (obj.kind === 'lostfound' ? 80 : 0);
      this.player.y = obj.floor;
    } else {
      this.player.x = this.save.hub.x;
      this.player.y = this.save.hub.y;
    }
    this.camX = Phaser.Math.Clamp(this.player.x - 640, 0, this.map.width - 1280);
    this.camY = Phaser.Math.Clamp(this.player.y - 460, 0, this.map.height - 720);
  }

  private startMusic(friends: number): void {
    this.music?.stop();
    const gifts = Game.story.chapters.filter((c, i) => i < friends).map((c) => c.organGift);
    this.music = new HubMusic(friends, gifts);
    this.music.start();
  }

  // ───────────────────────── frame ─────────────────────────

  update(_t: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.1); // Tick splits long frames into steps
    const time = this.time.now / 1000;
    this.input2.update();
    const beat = this.music?.beat ?? 0;

    if (this.cards) this.cards.update(delta);
    else if (this.pauseMenu) this.pauseInput();
    else if (this.box) this.boxInput();
    else if (!this.entering && time * 1000 > this.lockedUntil) this.play(dt, beat);

    this.updateBeatThings(beat);
    this.updateCamera(dt);
    this.drawDynamic(beat, time, dt);
    this.player.draw(dt, time, beat, 0);
    if (this.seated) {
      if (this.seatTween) this.seated.screenX = this.seatTween.x;
      // in his seat he can't keep still: a little performance every few seconds
      if (!this.seatTween && !this.seated.performing && time > this.nextSeatAct) {
        const near = Math.abs(this.player.x - this.seated.screenX) < 260 && Math.abs(this.player.y - FLOOR.lobby) < 20;
        const act: ActName = near && Math.random() < 0.5 ? 'tipHat' : fillerAct(this.lastSeatAct);
        this.seated.perform(act, ACTS[act].beats * (60 / 92));
        this.lastSeatAct = act;
        this.nextSeatAct = time + 4 + Math.random() * 4;
      }
      this.seated.lookTarget = { x: this.player.x, y: this.player.y - 60 };
      this.seated.update(dt, time, beat);
    }
    if (this.dancer) {
      // her music box pose, turning slowly; a curtsy when Tick comes near
      const near = Math.abs(this.player.x - this.dancer.x) < 120 && Math.abs(this.player.y - FLOOR.lobby) < 20;
      this.dancer.pose = near ? 'curtsy' : 'stance';
      this.dancer.dir = this.player.x < this.dancer.x ? -1 : 1;
      this.dancer.lookTarget = { x: this.player.x, y: this.player.y - 60 };
      this.dancer.update(dt, time, beat);
    }
    this.updateLights();
    this.updateHud(time);
  }

  private play(dt: number, beat: number): void {
    const i = this.input2;
    if (i.consume('pause') !== null) return this.openPause();
    const nearNow = this.findNear();
    const up = i.consume('up');
    if (nearNow && up !== null) {
      i.consume('jump'); // ▲ also means jump: here it means "use"
      this.use(nearNow);
      return;
    }
    const jumpT = i.consume('jump');
    this.player.update(dt, {
      dir: (i.isDown('right') ? 1 : 0) - (i.isDown('left') ? 1 : 0),
      jumpPressed: jumpT !== null,
      jumpHeld: i.isDown('jump'),
      dashPressed: i.consume('dash') !== null,
      jumpMultiplier: 1,
      dashBonusMs: 0,
    }, { world: this.world, baseSpeed: 0, autoRun: false, minX: 60, maxX: this.map.width - 60 });
    if (jumpT !== null) sfx('jump');
    void beat;

    // rafters: sandbags knock Tick off the beam, frames, the rope ladder shortcut
    const p = this.player;
    for (const b of this.bags) {
      if (Math.abs(p.x - b.x) < 34 && p.y > b.y && p.y - p.h < b.y + 52 && b.y > b.rest + 20 && p.invulnerable <= 0) {
        sfx('hit');
        p.vy = -500;
        p.vx = (p.x < b.x ? -1 : 1) * 400;
        p.invulnerable = 900;
      }
    }
    for (const f of this.frames) {
      if (!f.taken && Math.abs(p.x - f.x) < 34 && Math.abs(p.y - 50 - f.y) < 64) {
        f.taken = true;
        addFrame(this.save, f.id);
        this.persistNow();
        sfx('onBeat');
        this.flashHud();
      }
    }
    // fell off the rafters before the stairs were opened: say how to get back up
    if (Math.abs(p.y - FLOOR.rafters) < 4) this.wasUp = true;
    if (this.wasUp && p.onGround && p.y > FLOOR.booth + 100 && !this.save.flags.stairsOpen && !this.save.flags.hints.includes('fell')) {
      this.wasUp = false;
      this.save.flags.hints.push('fell');
      this.persistNow();
      this.say([{ text: 'Bump! Down in the auditorium.' }, { text: 'The STAIRS door at the far left of the lobby leads back up to the booth. Give it a kick!' }]);
      return;
    }
    if (!this.save.flags.rafterLadder && Math.abs(p.y - FLOOR.rafters) < 4 && p.x > RAFTER_END_COL * TILE) {
      this.save.flags.rafterLadder = true;
      this.persistNow();
      sfx('boing');
      this.say([{ text: 'You untie a rope ladder and let it fall to the stage below. A shortcut back up here!' }]);
    }
    this.clearDust();
    if (this.time.now - this.lastSaveAt > 4000) {
      this.save.hub = { x: Math.round(p.x), y: Math.round(p.y) };
      this.persistNow();
    }
    this.mirrorTrail.push({ x: p.x, y: p.y, f: p.facing });
    if (this.mirrorTrail.length > 40) this.mirrorTrail.shift();
  }

  private findNear(): HubObject | null {
    const p = this.player;
    let best: HubObject | null = null;
    if (p.onGround) {
      for (const o of HUB_OBJECTS) {
        if (o.kind === 'seat' && !this.save.freed.includes(o.level ?? '')) continue;
        if (Math.abs(p.y - o.floor) < 6 && Math.abs(p.x - (o.col * TILE + 20)) < 42) best = o;
      }
    }
    if (best && !this.box) {
      const done = best.level && this.save.levels[best.level]?.completed;
      this.prompt.setText(`▲ ${best.label}${done ? '  ★' : ''}`).setPosition(best.col * TILE + 20, best.floor - 175).setVisible(true);
    } else this.prompt.setVisible(false);
    return best;
  }

  // ───────────────────────── using things ─────────────────────────

  private use(o: HubObject): void {
    const s = this.save;
    const ch = Game.chapter;
    const title = Game.levels[ch.feature]?.title ?? ch.nowShowing;
    const spliced = s.flags.spliced.includes(ch.feature);
    const threaded = s.flags.threaded.includes(ch.feature);
    const need = ch.framesNeeded;
    const have = framesAvailable(s);
    sfx('select');
    switch (o.kind) {
      case 'stairsBooth':
        if (s.flags.stairsOpen) this.teleport(2 * TILE + 20, FLOOR.lobby);
        else this.say([{ text: "The door is stuck! It won't budge from this side." }]);
        break;
      case 'stairsLobby':
        if (s.flags.stairsOpen) this.teleport(2 * TILE + 20, FLOOR.booth);
        else {
          s.flags.stairsOpen = true;
          this.persistNow();
          this.cameras.main.shake(180, 0.006);
          sfx('crash');
          this.say([{ text: 'You give the old door a good kick... CREAK! It opens.' }, { text: 'A shortcut up to the projection booth!' }]);
        }
        break;
      case 'hatch':
        this.say([{ text: 'A hatch up to the roof. It is locked tight.' }, { text: 'A note says: "Not before midnight."' }]);
        break;
      case 'desk': {
        const found = [...Object.values(Game.platformLevels), ...Object.values(Game.duels)].filter((l) => l.lostObject && s.lostObjects.includes(l.lostObject.id)).map((l) => l.lostObject!);
        this.say(found.length
          ? [{ text: "Elias' desk." }, ...found.map((f) => ({ text: `${f.name}.\n${f.text}` }))]
          : [{ text: "Elias' desk. Nothing on it but dust..." }, { text: '...and an old photograph of the Bijou on opening night, the hall full of people.' }]);
        break;
      }
      case 'window': {
        const season = SEASONS[this.shownFreed % 4];
        const txt = {
          autumn: 'Outside, autumn leaves drift down the empty street.',
          winter: 'Outside, snow falls softly on the empty street.',
          spring: 'Outside, the first blossoms of spring.',
          summer: 'Outside, a warm summer night.',
        }[season];
        this.say([{ text: txt }]);
        break;
      }
      case 'coat':
        this.say([{ text: "Elias' coat. Something rustles in the pocket..." }, { text: 'Remember?', run: () => this.goLevel(o.level!) }]);
        break;
      case 'splicer':
        if (ch.entry === 'lostfound' && !s.freed.includes(ch.feature)) this.say([{ text: 'The splicer. No reel to mend tonight...' }, { text: 'But listen: a tinkling waltz, down in the lobby. The lost and found?' }]);
        else if (spliced) this.say([{ text: `The reel of ${title} is whole again.` }]);
        else if (have >= need) {
          s.framesSpent += need;
          s.flags.spliced.push(ch.feature);
          this.persistNow();
          sfx('pop');
          this.say([{ text: 'Snip... snip... SPLICED!' }, { text: `The reel of ${title} is whole again. Thread it in the projector.` }]);
        } else this.say([{ text: `The splicer. You need ${need} film frames to mend the reel of ${title}.` }, { text: `You have ${have}. Look in the newsreel, the serial, the sing-along, a memory... and up in the rafters.` }]);
        break;
      case 'projector':
        if (ch.entry === 'lostfound' && !s.freed.includes(ch.feature)) this.say([{ text: 'The projector is quiet tonight.' }, { text: 'The music is coming from the lost and found, down in the lobby.' }]);
        else if (threaded) this.say([{ text: `The projector hums. ${title} is on the screen!` }, { text: 'Go down to the stage and jump into the picture.' }]);
        else if (spliced) {
          this.say([{ text: 'Thread the film through the projector... on the beat!', run: () => this.goMinigame('thread') }]);
        } else this.say([{ text: `The projector is empty. The reel of ${title} is missing frames: ${have} / ${need}.` }, { text: 'Find film frames around the Bijou and mend it at the splicer.' }]);
        break;
      case 'screen':
        if (threaded) this.enterScreen(o.level!);
        else this.say([{ text: spliced ? 'The screen is dark. Thread the projector up in the booth.' : 'The screen is dark and dusty.' }]);
        break;
      case 'ladder':
        if (s.flags.rafterLadder) this.teleport(LADDER_TOP.x, LADDER_TOP.y);
        else this.say([{ text: 'A rope ladder is rolled up high on the rafters, out of reach.' }]);
        break;
      case 'poster':
      case 'organ':
        this.goLevel(o.level!);
        break;
      case 'popcorn':
      case 'tickets':
        this.goMinigame(o.game!);
        break;
      case 'clock':
        this.say([{ text: 'The grandfather clock says 11:59, like you.' }, { text: 'Its pendulum hangs still... for now.' }]);
        break;
      case 'mirror':
        this.say([{ text: 'Your reflection waves back...' }, { text: '...a moment after you do.' }]);
        break;
      case 'lostfound': {
        const box = Game.story.chapters.find((c) => c.entry === 'lostfound');
        const open = !!box && (Game.chapter === box || s.freed.includes(box.feature));
        if (!box || !open) this.say([{ text: 'Inside the box, something tiny plays a tinkling waltz.' }, { text: 'A music box! The lid is stuck shut... for now.' }]);
        else if (s.freed.includes(box.feature)) {
          this.say([{ text: 'Miss Pirouette dances on her music box, the lid wide open.' }, { text: '"Another dance, little clock?"  (▲ / ENTER: yes)', run: () => this.goLevel(box.feature) }]);
        } else {
          this.say([
            { text: 'Under a heap of lost umbrellas and odd gloves... a music box. Its lid creaks open by itself!' },
            { text: 'A tinkling waltz, and a tiny voice: "Who\'s there? Nobody ever comes to watch..."' },
            { text: 'Climb inside the music box?  (▲ / ENTER: yes)', run: () => this.goLevel(box.feature) },
          ]);
        }
        break;
      }
      case 'darkroom':
        this.say([{ text: 'DARKROOM - KEEP OUT.' }, { text: 'A red light glows under the door. It will open when the colours change.' }]);
        break;
      case 'seat':
        this.say([{ text: '"TOOT! That was some ride, little ticker!"' }, { text: '"Fancy another go?"  (▲ / ENTER: yes)', run: () => this.goLevel(o.level!) }]);
        break;
      case 'marquee':
        break;
    }
  }

  private teleport(x: number, y: number): void {
    this.lockedUntil = this.time.now + 500;
    this.cameras.main.fadeOut(220, 11, 11, 11);
    sfx('click');
    this.time.delayedCall(230, () => {
      Object.assign(this.player, { x, y, vx: 0, vy: 0 });
      this.camX = Phaser.Math.Clamp(x - 640, 0, this.map.width - 1280);
      this.camY = Phaser.Math.Clamp(y - 460, 0, this.map.height - 720);
      this.cameras.main.fadeIn(260, 11, 11, 11);
    });
  }

  private goLevel(id: string): void {
    this.entering = true;
    this.save.hub = { x: Math.round(this.player.x), y: Math.round(this.player.y) };
    this.persistNow();
    this.cameras.main.fadeOut(400, 11, 11, 11);
    this.time.delayedCall(420, () => startLevel(this, id, 'hub'));
  }

  private goMinigame(kind: string): void {
    this.entering = true;
    this.save.hub = { x: Math.round(this.player.x), y: Math.round(this.player.y) };
    this.persistNow();
    this.cameras.main.fadeOut(300, 11, 11, 11);
    this.time.delayedCall(320, () => this.scene.start('Minigame', { kind }));
  }

  /** The screen: Tick runs at it and leaps into the picture. */
  private enterScreen(levelId: string): void {
    this.entering = true;
    this.prompt.setVisible(false);
    const p = this.player;
    sfx('boing');
    this.tweens.add({
      targets: p,
      x: SCREEN.x + SCREEN.w / 2,
      y: SCREEN.y + SCREEN.h * 0.6,
      duration: 650,
      ease: 'Quad.Out',
      onComplete: () => {
        if (this.film) this.tweens.add({ targets: this.film, flash: 1, duration: 300 });
        sfx('rewind');
        this.time.delayedCall(320, () => this.goLevel(levelId));
      },
    });
  }

  // ───────────────────────── messages ─────────────────────────

  private say(steps: Step[]): void {
    this.boxQueue = [...steps];
    if (!this.box) this.openBox();
    this.nextBox();
  }

  private openBox(): void {
    const c = this.add.container(0, 0).setDepth(220).setScrollFactor(0, 0, true);
    const g = this.add.graphics();
    g.fillStyle(0x0b0b0b, 0.92).fillRoundedRect(140, 540, 1000, 150, 18);
    g.lineStyle(4, PAPER, 1).strokeRoundedRect(150, 550, 980, 130, 12);
    c.add(g);
    this.boxText = this.add.text(640, 610, '', {
      fontFamily: 'Limelight, Georgia, serif', fontSize: '28px', color: '#f4efe4', align: 'center', wordWrap: { width: 920 },
    }).setOrigin(0.5);
    c.add(this.boxText);
    c.add(this.add.text(1110, 668, '▼', { fontFamily: 'Georgia', fontSize: '18px', color: '#cfc8b8' }).setOrigin(1));
    this.box = c;
    this.prompt.setVisible(false);
  }

  private nextBox(): void {
    const step = this.boxQueue[0];
    if (!step) {
      this.box?.destroy();
      this.box = null;
      this.input2.clear();
      return;
    }
    this.boxText.setText(step.text);
    this.boxOpenedAt = this.time.now;
  }

  private boxInput(): void {
    const pressed = this.input2.consume('jump') !== null || this.input2.consume('confirm') !== null || this.input2.consume('up') !== null;
    if (!pressed || this.time.now - this.boxOpenedAt < 250) return;
    const step = this.boxQueue.shift();
    this.nextBox();
    step?.run?.();
  }

  private afterLevelMessage(): void {
    if (!this.from) return;
    const ch = Game.chapter;
    const have = framesAvailable(this.save);
    if (this.from === 'thread' && this.completed) {
      this.say([{ text: 'Clack-clack-clack... the projector whirs to life!' }, { text: 'A beam of light shoots across the hall. Go down to the screen and jump in!' }]);
    } else if (this.completed && Game.platformLevels[this.from] && !this.save.flags.spliced.includes(ch.feature)) {
      const msg = have >= ch.framesNeeded ? 'Enough frames to mend the reel! Take them to the splicer in the booth.' : `Film frames: ${have} / ${ch.framesNeeded}.`;
      this.say([{ text: msg }]);
    } else if (this.from === 'popcorn' || this.from === 'tickets') {
      this.flashHud();
    }
  }

  // ───────────────────────── the chapter ending ─────────────────────────

  private chapterEnding(): void {
    const ch = Game.chapter.feature === this.from ? Game.chapter : Game.story.chapters.find((c) => c.feature === this.from)!;
    if (ch.feature === 'pirouette') return this.pirouetteEnding(ch);
    const steps: Step[] = [
      { text: 'Old Smokestack rolls off the screen and takes a seat in the Bijou.', run: () => undefined },
      { text: 'The organ remembers a new tune.', run: () => this.startMusic(this.shownFreed) },
      { text: "Tick's hands move forward. Seven seconds closer to midnight." },
      { text: 'Outside, the first snow begins to fall.' },
      { text: `The marquee changes: COMING SOON... ${ch.comingSoon}`, run: () => this.finishEnding(ch.feature, ch.endCards) },
    ];
    this.seatSmokestack(true);
    this.shownFreed = this.save.freed.length;
    this.say(steps);
    // tick the watch forward while the first cards are read
    const target = Math.min(59, this.shownFreed * Game.story.secondsPerBoss);
    this.time.addEvent({
      delay: 600,
      repeat: Math.max(0, target - this.shownSeconds - 1),
      startAt: 0,
      callback: () => {
        this.shownSeconds++;
        sfx('click');
      },
    });
  }

  /** Miss Pirouette's ending: she climbs out on top of her box, and leaves the lid open. */
  private pirouetteEnding(ch: (typeof Game.story.chapters)[number]): void {
    const lo = Game.duels[ch.feature]?.lostObject;
    const steps: Step[] = [
      { text: 'The lid of the music box swings open... and Miss Pirouette steps out on top of it.', run: () => this.placeDancer() },
      { text: 'For the first time in fifty years, somebody is watching her dance.' },
      { text: 'The organ remembers a new tune.', run: () => this.startMusic(this.shownFreed) },
      { text: "Tick's hands move forward. Seven seconds closer to midnight." },
      { text: 'Outside, the snow melts. Spring is coming.' },
      ...(lo ? [{ text: `Something was left in the music box, under the velvet: ${lo.name.toLowerCase()}. Tick takes it up to Elias' desk.` }] : []),
      { text: `The marquee changes: COMING SOON... ${ch.comingSoon}`, run: () => this.finishEnding(ch.feature, ch.endCards) },
    ];
    this.shownFreed = this.save.freed.length;
    this.say(steps);
    const target = Math.min(59, this.shownFreed * Game.story.secondsPerBoss);
    this.time.addEvent({
      delay: 600,
      repeat: Math.max(0, target - this.shownSeconds - 1),
      startAt: 0,
      callback: () => {
        this.shownSeconds++;
        sfx('click');
      },
    });
  }

  /** Miss Pirouette, tiny, on the lost and found box (freed: a friend now). */
  private placeDancer(): void {
    if (this.dancer || !Pirouette.available(this)) return;
    const d = new Pirouette(this);
    d.size = 0.13;
    d.x = 342;
    d.groundY = 1177;
    d.setDepth(23);
    this.dancer = d;
    sfx('bell');
  }

  private finishEnding(feature: string, endCards: string[]): void {
    this.save.flags.endingsSeen.push(feature);
    this.persistNow();
    this.time.delayedCall(400, () => {
      this.cards = new Cards(this, this.input2, endCards, () => {
        this.cards = null;
      });
    });
  }

  private seatSmokestack(animate: boolean): void {
    const seatX = 41 * TILE + 60;
    const s = new Smokestack(this);
    s.size = 0.3;
    s.gfx.setDepth(22);
    s.groundY = FLOOR.lobby - 18;
    s.screenX = animate ? SCREEN.x + 120 : seatX;
    s.anger = -0.6;
    s.villain = false; // he got his ending: a friend now
    this.seated = s;
    if (animate) {
      this.seatTween = { x: s.screenX };
      sfx('whistle');
      this.tweens.add({ targets: this.seatTween, x: seatX, duration: 2600, ease: 'Sine.InOut', onComplete: () => (this.seatTween = null) });
    }
  }

  // ───────────────────────── pause ─────────────────────────

  private openPause(): void {
    const c = this.add.container(0, 0).setDepth(240).setScrollFactor(0, 0, true);
    c.add(this.add.rectangle(640, 360, 1280, 720, 0x0b0b0b, 0.8));
    c.add(this.add.text(640, 200, 'INTERMISSION', { fontFamily: 'Rye, Georgia, serif', fontSize: '64px', color: '#f4efe4' }).setOrigin(0.5));
    const labels = ['RESUME', 'PROGRAMME', 'OPTIONS', 'SAVE & QUIT TO TITLE'];
    const items = labels.map((l, k) => {
      const t = this.add.text(640, 320 + k * 60, l, { fontFamily: 'Rye, Georgia, serif', fontSize: '36px', color: '#f4efe4', stroke: '#141414', strokeThickness: 6 }).setOrigin(0.5);
      c.add(t);
      return t;
    });
    this.pauseMenu = { c, items, sel: 0 };
    this.input2.clear();
  }

  private pauseInput(): void {
    const m = this.pauseMenu!;
    const i = this.input2;
    if (i.consume('up') !== null) m.sel = (m.sel + m.items.length - 1) % m.items.length;
    if (i.consume('down') !== null) m.sel = (m.sel + 1) % m.items.length;
    i.consume('jump');
    m.items.forEach((t, k) => t.setAlpha(k === m.sel ? 1 : 0.45).setScale(k === m.sel ? 1.08 : 1));
    if (i.consume('pause') !== null) return this.closePause();
    if (i.consume('confirm') === null) return;
    sfx('select');
    this.save.hub = { x: Math.round(this.player.x), y: Math.round(this.player.y) };
    this.persistNow();
    switch (m.sel) {
      case 0: return this.closePause();
      case 1: this.scene.start('Programme', { back: 'Bijou' }); break;
      case 2: this.scene.start('Options', { back: 'Bijou' }); break;
      case 3: this.scene.start('Title'); break;
    }
  }

  private closePause(): void {
    this.pauseMenu?.c.destroy();
    this.pauseMenu = null;
    this.input2.clear();
  }

  // ───────────────────────── upkeep ─────────────────────────

  private persistNow(): void {
    if (this.player) this.save.hub = { x: Math.round(this.player.x), y: Math.round(this.player.y) };
    Game.persist();
    this.lastSaveAt = this.time?.now ?? 0;
    this.dustDirty = false;
  }

  private clearDust(): void {
    const p = this.player;
    if (!p.onGround) return;
    const col = Math.floor(p.x / TILE);
    DUST_FLOORS.forEach((f, fi) => {
      if (Math.abs(p.y - f.y) > 4 || col < f.c1 || col > f.c2) return;
      const id = fi * 100 + col;
      if (!this.save.dust.includes(id)) {
        this.save.dust.push(id);
        this.dustDirty = true;
      }
    });
    if (this.dustDirty && this.time.now - this.lastSaveAt > 2000) this.persistNow();
  }

  private updateBeatThings(beat: number): void {
    for (const p of this.planks) p.solid.active = beatPlankSolid(p.group, beat);
    const nx = this.mover.x0 + pingPong(beat, 8) * TILE * 4;
    const p = this.player;
    if (p.onGround && Math.abs(p.y - this.mover.solid.y) < 3 && p.x > this.mover.solid.x - 16 && p.x < this.mover.solid.x + this.mover.solid.w + 16) p.x += nx - this.mover.solid.x;
    this.mover.solid.x = nx;
    for (const b of this.bags) {
      const t = ((beat % 4) + 4) % 4;
      const low = b.floor - 52;
      b.y = t >= 3.5 ? b.rest + (low - b.rest) * ((t - 3.5) / 0.5) ** 2 : t < 0.6 ? low : t < 1.6 ? b.rest - 400 : b.rest;
    }
  }

  private updateCamera(dt: number): void {
    const tx = Phaser.Math.Clamp(this.player.x - 640, 0, this.map.width - 1280);
    // on the stage, frame the whole screen; elsewhere keep the floor in the lower third
    const onStage = this.player.x > 2380 && this.player.y > FLOOR.rafters + 100;
    const ty = onStage ? 480 : Phaser.Math.Clamp(this.player.y - 460, 0, this.map.height - 720);
    this.camX += (tx - this.camX) * Math.min(1, dt * 5);
    this.camY += (ty - this.camY) * Math.min(1, dt * 5);
    this.cameras.main.setScroll(this.camX, this.camY);
  }

  private updateLights(): void {
    const f = this.film;
    if (!f) return;
    const p = this.player;
    const inBooth = p.y <= FLOOR.booth + 4 && p.x < 1060;
    f.dark = inBooth ? 0.12 : Math.max(0.12, 0.55 - 0.15 * this.shownFreed);
    f.light1 = { x: p.x - this.camX, y: p.y - 60 - this.camY, r: 300 };
    const threaded = this.save.flags.threaded.includes(Game.chapter.feature) || this.shownFreed > 0;
    f.light2 = threaded
      ? { x: SCREEN.x + SCREEN.w / 2 - this.camX, y: SCREEN.y + SCREEN.h / 2 - this.camY, r: 420 }
      : { x: MARQUEE.x + MARQUEE.w / 2 - this.camX, y: MARQUEE.y - this.camY, r: 200 };
  }

  // ───────────────────────── HUD ─────────────────────────

  private buildHud(): void {
    this.hudGfx = this.add.graphics().setDepth(200).setScrollFactor(0);
    this.hudClock = this.add.text(92, 26, '', { fontFamily: 'Rye, Georgia, serif', fontSize: '30px', color: '#f4efe4', stroke: '#141414', strokeThickness: 7 }).setDepth(201).setScrollFactor(0);
    this.hudFrames = this.add.text(1240, 26, '', { fontFamily: 'Rye, Georgia, serif', fontSize: '26px', color: '#f4efe4', stroke: '#141414', strokeThickness: 7 }).setOrigin(1, 0).setDepth(201).setScrollFactor(0);
  }

  private flashHud(): void {
    this.tweens.add({ targets: this.hudFrames, scale: { from: 1.4, to: 1 }, duration: 500, ease: 'Back.Out' });
  }

  private updateHud(time: number): void {
    const sec = Math.round(this.shownSeconds);
    this.hudClock.setText(clockText({ ...this.save, freed: Array(Math.ceil(sec / Game.story.secondsPerBoss)).fill('x') }, Game.story.secondsPerBoss).replace(/\d\d$/, String(sec).padStart(2, '0')));
    const ch = Game.chapter;
    const s = this.save;
    const allDone = s.freed.length >= Game.story.chapters.length && s.flags.endingsSeen.includes(ch.feature);
    this.hudFrames.setText(
      allDone ? 'TO BE CONTINUED...'
        : ch.entry === 'lostfound' ? '♪ THE LOST & FOUND'
        : s.flags.threaded.includes(ch.feature) ? 'NOW SHOWING!'
          : s.flags.spliced.includes(ch.feature) ? 'REEL READY'
            : `FRAMES  ${framesAvailable(s)} / ${ch.framesNeeded}`,
    );
    // pocket watch: hands at 11:59, the second hand at the shown seconds
    const g = this.hudGfx;
    g.clear();
    const k = new Ink(g);
    k.seed = Math.floor(time * 8) % 3;
    k.circle(52, 44, 30, 0xd8c17a, 4);
    k.circle(52, 44, 23, PAPER, 3);
    const hand = (a: number, len: number, w: number): void => {
      g.lineStyle(w, INK, 1).lineBetween(52, 44, 52 + Math.sin(a) * len, 44 - Math.cos(a) * len);
    };
    hand((11.98 / 12) * Math.PI * 2, 12, 4);
    hand((59 / 60) * Math.PI * 2, 18, 3);
    g.lineStyle(1.5, 0x8a2f2a, 1).lineBetween(52, 44, 52 + Math.sin((sec / 60) * Math.PI * 2) * 20, 44 - Math.cos((sec / 60) * Math.PI * 2) * 20);
    k.circle(52, 12, 5, 0xd8c17a, 3);
  }

  // ───────────────────────── live drawing ─────────────────────────

  private drawDynamic(beat: number, time: number, dt: number): void {
    const g = this.dyn;
    const k = this.ink;
    g.clear();
    k.seed = Math.floor(time * 8) % 3;
    const ph = beat - Math.floor(beat);
    const pulse = Math.pow(1 - ph, 3);
    const s = this.save;
    const ch = Game.chapter;
    const threaded = s.flags.threaded.includes(ch.feature);

    // dust on the floors (cleared where Tick has walked): redrawn only when it changes
    if (this.dustDrawn !== s.dust.length) {
      this.dustDrawn = s.dust.length;
      const dg = this.make.graphics({}, false);
      DUST_FLOORS.forEach((f, fi) => {
        dg.clear();
        dg.fillStyle(0x9a948a, 0.55);
        for (let c = f.c1; c <= f.c2; c++) {
          if (s.dust.includes(fi * 100 + c)) continue;
          for (let i = 0; i < 5; i++) dg.fillCircle((c - f.c1) * TILE + ((i * 13 + c * 7) % 38), 11 - ((i * 5 + c) % 3), 2 + ((i + c) % 2));
        }
        this.dustRT[fi].clear().draw(dg, 0, 0);
      });
      dg.destroy();
    }

    // window: the season outside
    const season = SEASONS[this.shownFreed % 4];
    g.fillStyle(season === 'winter' ? 0x8a8f96 : season === 'summer' ? 0x3a3f5a : 0x9a8f80, 1).fillRect(WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h);
    if (Math.random() < dt * 8) this.particles.push({ x: WINDOW.x + Math.random() * WINDOW.w, y: WINDOW.y, vx: (Math.random() - 0.5) * 20, vy: 25 + Math.random() * 25, r: 2 + Math.random() * 3 });
    this.particles = this.particles.filter((q) => {
      q.x += q.vx * dt + Math.sin(time * 2 + q.y * 0.05) * (season === 'autumn' ? 0.8 : 0.2);
      q.y += q.vy * dt;
      if (q.y > WINDOW.y + WINDOW.h) return false;
      const col = season === 'winter' ? PAPER : season === 'spring' ? 0xe8d8d8 : season === 'summer' ? 0xd8c98a : 0x6b4a2a;
      g.fillStyle(col, 1).fillCircle(Phaser.Math.Clamp(q.x, WINDOW.x + 2, WINDOW.x + WINDOW.w - 2), q.y, q.r);
      return true;
    });
    g.lineStyle(4, INK, 1).lineBetween(WINDOW.x + WINDOW.w / 2, WINDOW.y, WINDOW.x + WINDOW.w / 2, WINDOW.y + WINDOW.h).lineBetween(WINDOW.x, WINDOW.y + WINDOW.h / 2, WINDOW.x + WINDOW.w, WINDOW.y + WINDOW.h / 2);

    // the bare bulb in the booth, swinging on the beat
    const sw = Math.sin(beat * Math.PI) * 0.25;
    const bx = 600 + Math.sin(sw) * 50;
    const by = 330 + Math.cos(sw) * 50;
    k.line(600, 320, bx, by, 2, INK);
    k.circle(bx, by + 10, 10, 0xf4ecc8, 3);

    // projector reels (spinning once threaded) and the beam
    const spin = threaded ? time * 4 : 0;
    for (const [x, y] of [[752, 416], [826, 404]] as const) {
      k.circle(x, y, 32, 0x3a3a3a, 4);
      for (let i = 0; i < 3; i++) {
        const a = spin + (i / 3) * Math.PI * 2;
        k.circle(x + Math.cos(a) * 16, y + Math.sin(a) * 16, 6, PAPER, 2);
      }
    }
    if (threaded || this.shownFreed > 0) {
      const flick = 0.12 + Math.random() * 0.04;
      g.fillStyle(0xf4ecc8, flick);
      g.fillTriangle(LENS.x, LENS.y - 6, SCREEN.x, SCREEN.y, SCREEN.x, SCREEN.y + SCREEN.h);
      g.fillTriangle(LENS.x, LENS.y + 6, SCREEN.x, SCREEN.y + SCREEN.h, SCREEN.x + SCREEN.w, SCREEN.y + SCREEN.h);
    }
    // the screen
    const lit = threaded && !s.freed.includes(ch.feature);
    g.fillStyle(lit ? 0xe8e1d0 : this.shownFreed > 0 ? 0xbdb6a8 : 0x3a3732, 1).fillRect(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h);
    this.screenText.setText(lit ? `${(Game.levelInfo(ch.feature)?.subtitle ?? '').toUpperCase()}\nin\n"${Game.levelInfo(ch.feature)?.title ?? ''}"` : this.shownFreed > 0 ? 'THE BIJOU\n\nintermission' : '');
    this.screenText.setScale(lit ? 1 + pulse * 0.03 : 1).setAlpha(lit ? 0.85 + Math.random() * 0.15 : 0.6);

    // marquee with chasing bulbs
    const m = MARQUEE;
    k.rrect(m.x - 10, m.y - 10, m.w + 20, m.h + 20, 8, 0x2a2a2a, 4);
    g.fillStyle(0xe8e1d0, 1).fillRect(m.x, m.y, m.w, m.h);
    const bulbs = 14;
    for (let i = 0; i < bulbs; i++) {
      const on = (i + Math.floor(beat * 2)) % 3 === 0;
      const bxm = m.x - 4 + (i / (bulbs - 1)) * (m.w + 8);
      g.fillStyle(on ? 0xfff4c0 : 0x5a5650, 1).fillCircle(bxm, m.y - 6, 4).fillCircle(bxm, m.y + m.h + 6, 4);
    }
    this.marqueeText.setText(this.shownFreed > 0 && s.flags.endingsSeen.includes(ch.feature) || s.freed.includes(ch.feature) && this.shownFreed > 0
      ? `COMING SOON\n${ch.comingSoon}` : `NOW SHOWING\n${ch.nowShowing}`);

    // darkroom: red light under the door
    g.fillStyle(0xb02a20, 0.35 + pulse * 0.25).fillRect(190, FLOOR.lobby - 6, 60, 6);
    // popcorn hopping on the beat
    for (let i = 0; i < 6; i++) {
      const hop = Math.abs(Math.sin((beat + i * 0.37) * Math.PI)) * 30;
      g.fillStyle(0xf4ecc8, 1).fillCircle(876 + i * 10, 1150 - hop, 5);
    }
    // mirror: the reflection lags behind
    const p = this.player;
    if (Math.abs(p.y - FLOOR.lobby) < 10 && Math.abs(p.x - 420) < 260) {
      const lag = this.mirrorTrail[0] ?? { x: p.x, y: p.y, f: p.facing };
      const rx = 420 + (lag.x - 420) * 0.12;
      g.fillStyle(0x8a8478, 0.25).fillEllipse(420, 1150, 66, 110);
      k.circle(rx, 1150, 16, 0xd8c17a, 2);
      k.line(rx - 6, 1166, rx - 10, 1192, 3, INK);
      k.line(rx + 6, 1166, rx + 10, 1192, 3, INK);
    }

    // seats, bouncing on the beat
    for (const rt of this.seatsRT) rt.setY(1144 - pulse * 3);
    // organ pipes swell on the beat
    for (let i = 0; i < 7; i++) g.fillStyle(0xf4ecc8, 0.15 * pulse).fillRect(2130 + i * 18, 990 - (i % 4) * 26, 14, 20);

    // rafters: beat planks, moving beam, sandbags, frames
    for (const pl of this.planks) {
      const r = pl.solid;
      const warn = r.active && !beatPlankSolid(pl.group, beat + 0.5);
      if (r.active && (!warn || Math.floor(time * 14) % 2 === 0)) k.rrect(r.x, r.y, r.w, r.h + 6, 3, 0xa08a6c, 3);
      else if (!r.active) g.lineStyle(2, PAPER, 0.3).strokeRect(r.x, r.y, r.w, r.h);
    }
    const mv = this.mover.solid;
    k.rrect(mv.x, mv.y, mv.w, mv.h + 6, 3, 0xa08a6c, 3);
    k.line(mv.x + 10, 120, mv.x + 10, mv.y, 2, INK);
    k.line(mv.x + mv.w - 10, 120, mv.x + mv.w - 10, mv.y, 2, INK);
    for (const b of this.bags) {
      if (b.y < b.rest - 100) continue;
      k.line(b.x, 120, b.x, b.y, 3, INK);
      k.ellipse(b.x, b.y + 30, 22, 26, 0xb8a888, 4);
    }
    for (const f of this.frames) {
      if (f.taken) continue;
      const y = f.y - pulse * 6;
      k.rrect(f.x - 16, y - 20, 32, 40, 4, 0x141414, 3, PAPER);
      g.fillStyle(PAPER, 0.85).fillRect(f.x - 9, y - 12, 18, 24);
    }
    // the rope ladder (rolled up, or hanging down to the stage)
    if (s.flags.rafterLadder) {
      for (const dx of [-12, 12]) k.line(2780 + dx, FLOOR.rafters, 2780 + dx, FLOOR.stage, 3, 0x8a7a54);
      for (let y = FLOOR.rafters + 20; y < FLOOR.stage; y += 34) k.line(2768, y, 2792, y, 3, 0x8a7a54);
    } else k.ellipse(2780, FLOOR.rafters + 14, 18, 12, 0x8a7a54, 3);

    // lost objects on Elias' desk
    if (s.lostObjects.includes('ticket-1912')) {
      k.rrect(318, 566, 34, 14, 2, 0xe8e1d0, 2);
    }
  }
}
