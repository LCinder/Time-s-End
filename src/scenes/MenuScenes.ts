// Small menu scenes: Resume ("pick up where you left off?"), Slot (the three film
// cans), Programme (the cinema programme as a level select) and Options.

import Phaser from 'phaser';
import { sfx } from '../audio/Sfx';
import { startLevel } from '../core/flow';
import { Game } from '../core/Game';
import { Input } from '../core/Input';
import { deleteSave, loadSave, newSave, SLOTS, type SlotId } from '../core/Save';
import { addFilm } from '../fx/FilmPipeline';
import { INK, Ink, PAPER } from '../rig/Ink';
import { Menu } from '../ui/Menu';
import { applySettings } from './BootScene';
import { continueGame, saveSummary } from './TitleScene';

abstract class MenuScene extends Phaser.Scene {
  protected input2!: Input;
  protected menu!: Menu;
  protected leaving = false;
  private t0 = 0;

  protected frame(title: string, sub = ''): void {
    this.leaving = false;
    this.cameras.main.setBackgroundColor('#1b1a17');
    const g = this.add.graphics();
    g.lineStyle(6, PAPER, 1).strokeRoundedRect(60, 40, 1160, 640, 30);
    g.lineStyle(2, PAPER, 1).strokeRoundedRect(76, 56, 1128, 608, 22);
    this.add.text(640, 110, title, { fontFamily: 'Rye, Georgia, serif', fontSize: '58px', color: '#f4efe4', stroke: '#141414', strokeThickness: 9 }).setOrigin(0.5);
    if (sub) this.add.text(640, 168, sub, { fontFamily: 'Limelight, Georgia, serif', fontSize: '22px', color: '#cfc8b8', align: 'center' }).setOrigin(0.5);
    this.input2 = new Input(this, Game.controls);
    addFilm(this, 'bw1928');
    this.t0 = this.time.now;
  }

  protected go(scene: string, data: object = {}): void {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(300, 11, 11, 11);
    this.time.delayedCall(320, () => this.scene.start(scene, data));
  }

  protected back(): void {}

  update(): void {
    this.input2.update();
    if (this.leaving) return;
    if (this.input2.consume('pause') !== null) {
      sfx('select');
      this.back();
      return;
    }
    const beat = (this.time.now - this.t0) / 500;
    this.menu?.update(this.input2, beat - Math.floor(beat));
  }
}

// ───────────────────────── Resume ─────────────────────────

export class ResumeScene extends MenuScene {
  private d!: { levelId: string; cue: number };

  constructor() {
    super('Resume');
  }

  init(data: { levelId: string; cue: number }): void {
    this.d = data;
  }

  create(): void {
    const L = Game.levels[this.d.levelId] ?? Game.platformLevels[this.d.levelId];
    this.frame('WELCOME BACK', `You left in the middle of "${L.title}".`);
    this.menu = new Menu(this, [
      { label: this.d.cue > 0 ? 'RESUME FROM THE CUE MARK' : 'RESUME', select: () => this.leaveTo(() => startLevel(this, this.d.levelId, 'hub', this.d.cue)) },
      {
        label: 'BACK TO THE BIJOU',
        select: () => this.leaveTo(() => {
          if (Game.save) {
            Game.save.resume = null;
            Game.persist();
          }
          this.scene.start('Bijou');
        }),
      },
    ], { y: 330, spacing: 80 });
  }

  private leaveTo(fn: () => void): void {
    this.leaving = true;
    this.cameras.main.fadeOut(300, 11, 11, 11);
    this.time.delayedCall(320, fn);
  }

  protected back(): void {
    this.go('Title');
  }
}

// ───────────────────────── Slot (film cans) ─────────────────────────

export class SlotScene extends MenuScene {
  private mode: 'new' | 'load' = 'new';
  private armed: SlotId | null = null;
  private cans!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Slot');
  }

  init(data: { mode: 'new' | 'load' }): void {
    this.mode = data.mode;
    this.armed = null;
  }

  create(): void {
    this.frame(this.mode === 'new' ? 'NEW GAME' : 'LOAD GAME', this.mode === 'new' ? 'Choose a film can for your story.' : 'Choose a film can to load.');
    this.cans = this.add.graphics();
    this.menu = new Menu(this, SLOTS.map((slot) => ({
      label: () => `REEL ${slot}`,
      sub: () => {
        const s = loadSave(slot);
        if (this.armed === slot) return 'This reel has a story on it. ENTER again to record over it!';
        return s ? saveSummary(s) : '(empty)';
      },
      enabled: () => this.mode === 'new' || !!loadSave(slot),
      select: () => this.pick(slot),
    })), { y: 270, spacing: 120, size: 40 });
  }

  private pick(slot: SlotId): void {
    const existing = loadSave(slot);
    if (this.mode === 'load') {
      if (existing) {
        this.leaving = true;
        this.cameras.main.fadeOut(300, 11, 11, 11);
        this.time.delayedCall(320, () => continueGame(this, existing));
      }
      return;
    }
    if (existing && this.armed !== slot) {
      this.armed = slot;
      sfx('boing');
      return;
    }
    deleteSave(slot);
    Game.save = newSave(slot);
    Game.settings.lastSlot = slot;
    Game.saveSettings();
    Game.persist();
    this.go('Intertitle', { cards: Game.story.intro, next: 'Bijou' });
  }

  update(): void {
    super.update();
    const g = this.cans;
    g.clear();
    const k = new Ink(g);
    SLOTS.forEach((slot, i) => {
      const y = 270 + i * 120;
      const on = this.menu.sel === i;
      k.circle(330, y + 6, on ? 44 : 38, loadSave(slot) ? 0x8a8478 : 0x3a3631, 4);
      for (let h = 0; h < 5; h++) {
        const a = (h / 5) * Math.PI * 2 + (on ? this.time.now / 600 : 0);
        g.fillStyle(INK, 1).fillCircle(330 + Math.cos(a) * 22, y + 6 + Math.sin(a) * 22, 6);
      }
    });
  }

  protected back(): void {
    this.go('Title');
  }
}

// ───────────────────────── Programme (level select) ─────────────────────────

export class ProgrammeScene extends MenuScene {
  private backTo = 'Title';

  constructor() {
    super('Programme');
  }

  init(data: { back?: string }): void {
    this.backTo = data?.back ?? 'Title';
  }

  create(): void {
    this.frame('THE PROGRAMME', "Tonight at the Bijou. Pick anything you've already seen.");
    const s = Game.save;
    const entries: { kind: string; id: string; title: string }[] = [];
    for (const ch of Game.story.chapters) {
      for (const id of ch.interludes) {
        const P = Game.platformLevels[id];
        const kind = { newsreel: 'NEWSREEL', serial: 'SERIAL', singalong: 'SING-ALONG', memory: 'MEMORY' }[P.kind];
        entries.push({ kind, id, title: P.kind === 'serial' ? `${P.title}, ${P.subtitle.split(':')[0]}` : P.kind === 'memory' ? P.subtitle : P.title });
      }
      entries.push({ kind: 'THE FEATURE', id: ch.feature, title: Game.levels[ch.feature].title });
    }
    const unlocked = (id: string): boolean => !!s && (!!s.levels[id] || s.flags.threaded.includes(id) || s.freed.includes(id));
    const framesOf = (id: string): string => {
      const P = Game.platformLevels[id];
      if (!P || !s) return '';
      const total = P.map.join('').split('*').length - 1;
      const got = s.frames.filter((f) => f.startsWith(`${id}:`)).length;
      return `  ·  frames ${got}/${total}`;
    };
    this.menu = new Menu(this, [
      ...entries.map((e) => ({
        label: () => (unlocked(e.id) ? e.title : '? ? ?'),
        sub: () => {
          const r = s?.levels[e.id];
          return `${e.kind}${r?.completed ? '  ·  ★ seen' : ''}${r?.rank ? `  ·  rank ${r.rank}` : ''}${unlocked(e.id) ? framesOf(e.id) : ''}`;
        },
        enabled: () => unlocked(e.id),
        select: () => {
          this.leaving = true;
          this.cameras.main.fadeOut(300, 11, 11, 11);
          this.time.delayedCall(320, () => startLevel(this, e.id, 'programme'));
        },
      })),
      { label: 'BACK', select: () => this.back() },
    ], { y: 225, spacing: 62, size: 30 });
  }

  protected back(): void {
    this.go(this.backTo);
  }
}

// ───────────────────────── Options ─────────────────────────

export class OptionsScene extends MenuScene {
  private backTo = 'Title';

  constructor() {
    super('Options');
  }

  init(data: { back?: string }): void {
    this.backTo = data?.back ?? 'Title';
  }

  create(): void {
    this.frame('OPTIONS');
    const st = Game.settings;
    const vol = (v: number): string => '█'.repeat(Math.round(v * 10)) + '░'.repeat(10 - Math.round(v * 10));
    const save = (): void => {
      Game.saveSettings();
      applySettings();
    };
    const names = Game.difficultyNames();
    this.menu = new Menu(this, [
      { label: () => `DIFFICULTY   <  ${Game.diff.label}  >`, change: (d) => { Game.difficulty = names[(names.indexOf(Game.difficulty) + d + names.length) % names.length]; st.difficulty = Game.difficulty; save(); } },
      { label: () => `MUSIC   ${vol(st.music)}`, change: (d) => { st.music = Phaser.Math.Clamp(Math.round((st.music + d * 0.1) * 10) / 10, 0, 1); save(); } },
      { label: () => `EFFECTS   ${vol(st.sfx)}`, change: (d) => { st.sfx = Phaser.Math.Clamp(Math.round((st.sfx + d * 0.1) * 10) / 10, 0, 1); save(); } },
      { label: () => `GHOST OF YOUR LAST TRY   ${st.ghost ? 'ON' : 'OFF'}`, sub: () => 'a see-through Tick replays your previous attempt', change: () => { st.ghost = !st.ghost; save(); }, select: () => { st.ghost = !st.ghost; save(); } },
      { label: () => `REDUCE FLICKER   ${st.reduceFlicker ? 'ON' : 'OFF'}`, sub: () => 'calmer film effects and flashes (photosensitivity)', change: () => { st.reduceFlicker = !st.reduceFlicker; save(); }, select: () => { st.reduceFlicker = !st.reduceFlicker; save(); } },
      { label: 'CALIBRATE...', select: () => this.go('Calibrate') },
      { label: 'BACK', select: () => this.back() },
    ], { y: 240, spacing: 62, size: 30 });
  }

  protected back(): void {
    this.go(this.backTo, this.backTo === 'Title' ? { select: 'options' } : {});
  }
}
