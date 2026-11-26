// The test stage: jump straight to any level, cue mark or set piece of a song, with or
// without lives, and to the puppet viewer. Reached from the splash screen with T, so it
// also works where the address can't carry ?level= / ?beat= (the shared test link).
// Nothing played from here is saved.

import Phaser from 'phaser';
import { sfx } from '../audio/Sfx';
import { Game } from '../core/Game';
import { Input } from '../core/Input';
import { spawnBeatOf } from '../core/timing';
import type { LevelEvent } from '../core/types';
import { addFilm } from '../fx/FilmPipeline';

interface Row {
  label: () => string;
  right?: () => string;
  run?: () => void;
  change?: (dir: -1 | 1) => void;
}

/** The song moments worth jumping to, with a readable name. */
const MOMENTS: Record<string, string> = {
  ticketCheck: 'Tickets, please',
  holePunch: 'The ticket punch',
  crossing: 'Level crossing',
  cuckoos: 'Cuckoo clocks',
  pendulum: 'Grandfather pendulum',
  trackSwitch: 'Track switch',
  waterStop: 'Water tower',
  unwindKey: 'Unwind key',
  ghostWatches: 'Ghost watches',
  silence: 'Silence solo',
  redSignal: 'Red signal',
  pianoKeys: 'Funeral piano',
  roofRun: 'Roof run',
  timeStop: 'Time stop',
  tunnelListen: 'Tunnel, listening',
  tunnel: 'Tunnel',
  bossFall: 'The broken bridge',
};

const VISIBLE = 11;
const ROW_H = 40;
const TOP = 200;

/** A few beats before the moment shows up, so its scenery arrives as in the real run. */
export function testStartBeat(e: LevelEvent): number {
  if (e.type === 'bossFall') return Math.max(0, Math.floor(e.beat - 10));
  // stopping time needs a run of on-beat jumps first: start at the cue mark before it
  if (e.type === 'timeStop') return Math.max(0, Math.floor(e.beat - 16));
  return Math.max(0, Math.floor(Math.min(e.beat - 8, spawnBeatOf(e, Game.diff) - 2)));
}

export class TestScene extends Phaser.Scene {
  private input2!: Input;
  private rows: Row[] = [];
  private sel = 0;
  private top = 0;
  private texts: { l: Phaser.GameObjects.Text; r: Phaser.GameObjects.Text }[] = [];
  private title!: Phaser.GameObjects.Text;
  private page: string | null = null;
  private leaving = false;

  constructor() {
    super('Test');
  }

  init(data: { page?: string }): void {
    this.page = data?.page && Game.levels[data.page] ? data.page : null;
    this.sel = 0;
    this.top = 0;
    this.leaving = false;
  }

  create(): void {
    // test runs never touch the film cans
    Game.save = null;
    this.cameras.main.setBackgroundColor('#1b1a17');
    const g = this.add.graphics();
    g.lineStyle(6, 0xf4efe4, 1).strokeRoundedRect(60, 40, 1160, 640, 30);
    g.lineStyle(2, 0xf4efe4, 1).strokeRoundedRect(76, 56, 1128, 608, 22);
    this.title = this.add
      .text(640, 104, '', { fontFamily: 'Rye, Georgia, serif', fontSize: '52px', color: '#f4efe4', stroke: '#141414', strokeThickness: 9 })
      .setOrigin(0.5);
    this.add
      .text(640, 640, '▲ ▼ choose   ·   ENTER go   ·   ◀ ▶ change   ·   ESC back   ·   in a level: F2 lives on/off, R restart', {
        fontFamily: 'Limelight, Georgia, serif',
        fontSize: '17px',
        color: '#cfc8b8',
      })
      .setOrigin(0.5);
    for (let i = 0; i < VISIBLE; i++) {
      const y = TOP + i * ROW_H;
      this.texts.push({
        l: this.add.text(150, y, '', { fontFamily: 'Rye, Georgia, serif', fontSize: '26px', color: '#f4efe4', stroke: '#141414', strokeThickness: 6 }).setOrigin(0, 0.5),
        r: this.add.text(1130, y, '', { fontFamily: 'Limelight, Georgia, serif', fontSize: '20px', color: '#cfc8b8' }).setOrigin(1, 0.5),
      });
    }
    this.input2 = new Input(this, Game.controls);
    addFilm(this, 'bw1928');
    this.build();
  }

  private build(): void {
    this.rows = this.page ? this.levelRows(this.page) : this.mainRows();
    this.title.setText(this.page ? Game.levels[this.page].title : 'TEST STAGE');
    this.sel = Math.min(this.sel, this.rows.length - 1);
    this.refresh();
  }

  private mainRows(): Row[] {
    const rows: Row[] = [];
    const names = Game.difficultyNames();
    rows.push({
      label: () => `Lives: ${Game.invincible ? 'OFF (nothing hurts)' : 'ON'}`,
      run: () => { Game.invincible = !Game.invincible; },
      change: () => { Game.invincible = !Game.invincible; },
    });
    rows.push({
      label: () => `Difficulty: ${Game.difficulty}`,
      change: (d) => { Game.difficulty = names[(names.indexOf(Game.difficulty) + d + names.length) % names.length]; },
      run: () => { Game.difficulty = names[(names.indexOf(Game.difficulty) + 1) % names.length]; },
    });
    for (const [id, L] of Object.entries(Game.levels)) {
      rows.push({ label: () => `${L.title}`, right: () => 'boss chase  ▶', run: () => { this.page = id; this.sel = 0; this.top = 0; this.build(); } });
    }
    for (const [id, P] of Object.entries(Game.platformLevels)) {
      rows.push({ label: () => P.title, right: () => P.kind, run: () => this.leave(() => { Game.returnTo = 'test'; this.scene.start('Platform', { levelId: id }); }) });
    }
    for (const [id, D] of Object.entries(Game.duels)) {
      rows.push({ label: () => D.title, right: () => 'boss duel', run: () => this.leave(() => { Game.returnTo = 'test'; this.scene.start('Duel', { levelId: id }); }) });
    }
    if (this.textures.exists('art:tex:musicboxBack')) {
      rows.push({ label: () => 'Miss Pirouette: the music box', right: () => 'stage preview', run: () => this.leave(() => this.scene.start('MusicBox')) });
    }
    if (Object.keys(Game.art).length) {
      rows.push({ label: () => 'Puppet viewer', right: () => 'characters from npm run art', run: () => this.leave(() => this.scene.start('PuppetViewer', {})) });
    }
    rows.push({ label: () => 'Back to the title', run: () => this.leave(() => this.scene.start('Title')) });
    return rows;
  }

  private levelRows(id: string): Row[] {
    const L = Game.levels[id];
    const go = (beat: number): void =>
      this.leave(() => {
        Game.startBeat = beat;
        Game.returnTo = 'test';
        this.scene.start('Chase', { levelId: id });
      });
    const points: { beat: number; label: string; at: number }[] = [{ beat: 0, label: 'From the start', at: 0 }];
    let cue = 0;
    for (const e of [...L.events].sort((a, b) => a.beat - b.beat)) {
      if (e.type === 'cue') points.push({ beat: e.beat, label: `Cue mark ${++cue}`, at: e.beat });
      else if (MOMENTS[e.type]) points.push({ beat: testStartBeat(e), label: MOMENTS[e.type], at: e.beat });
    }
    points.sort((a, b) => a.at - b.at);
    return [
      ...points.map((p) => ({ label: () => p.label, right: () => (p.at ? `beat ${Math.round(p.at)}` : ''), run: () => go(p.beat) })),
      { label: () => '◀ Back', run: () => { this.page = null; this.sel = 0; this.top = 0; this.build(); } },
    ];
  }

  private refresh(): void {
    if (this.sel < this.top) this.top = this.sel;
    if (this.sel >= this.top + VISIBLE) this.top = this.sel - VISIBLE + 1;
    this.texts.forEach((t, i) => {
      const r = this.rows[this.top + i];
      const on = this.top + i === this.sel;
      t.l.setText(r ? `${on ? '▶ ' : '   '}${r.label()}` : '');
      t.l.setColor(on ? '#ffffff' : '#bfb8a8');
      t.l.setScale(on ? 1.06 : 1);
      t.r.setText(r?.right?.() ?? '');
    });
  }

  private leave(fn: () => void): void {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(250, 11, 11, 11);
    this.time.delayedCall(270, fn);
  }

  update(): void {
    this.input2.update();
    if (this.leaving) return;
    const n = this.rows.length;
    let moved = false;
    if (this.input2.consume('up') !== null) { this.sel = (this.sel - 1 + n) % n; moved = true; }
    if (this.input2.consume('down') !== null) { this.sel = (this.sel + 1) % n; moved = true; }
    this.input2.consume('jump');
    const r = this.rows[this.sel];
    if (this.input2.consume('left') !== null && r.change) { r.change(-1); moved = true; }
    if (this.input2.consume('right') !== null && r.change) { r.change(1); moved = true; }
    if (this.input2.consume('confirm') !== null && r.run) {
      sfx('select');
      r.run();
      if (!this.leaving) this.refresh();
      return;
    }
    if (this.input2.consume('pause') !== null) {
      sfx('select');
      if (this.page) { this.page = null; this.sel = 0; this.top = 0; this.build(); }
      else this.leave(() => this.scene.start('Title'));
      return;
    }
    if (moved) {
      sfx('select');
      this.refresh();
    }
  }
}
