// The puppet viewer: `?puppet=<id>` shows a character made with `npm run art -- <id>`
// alive, in a grid of cells that each act out something different (expressions,
// singing, gestures, the charge, the long reach), so a new enemy can be checked
// at a glance before it gets a level of its own. ← → change the character.

import Phaser from 'phaser';
import { Game } from '../core/Game';
import { visemeAt } from '../core/visemes';
import { Pirouette, type DancerPose } from '../entities/Pirouette';
import { Smokestack } from '../entities/Smokestack';
import type { ActName } from '../entities/SmokestackActs';

interface Cell {
  label: string;
  act?: ActName;
  setup?: (b: Smokestack, t: number, beat: number) => void;
}

const WORDS = ['tick', 'tock', 'little', 'clock', 'end', 'of', 'the', 'line', 'choo', 'choo'];

const CELLS: Cell[] = [
  { label: 'resting', setup: () => {} },
  {
    label: 'singing to you',
    setup: (b, _t, beat) => {
      const w = WORDS[Math.floor(beat) % WORDS.length];
      const f = beat - Math.floor(beat);
      b.mouth = f < 0.8 ? 0.8 : 0.05;
      b.viseme = visemeAt(w, Math.min(0.99, f / 0.8));
      b.gaze = 'camera';
    },
  },
  { label: 'cackle', act: 'cackle' },
  { label: 'stare', act: 'stare' },
  { label: 'fake sob', act: 'fakeSob' },
  { label: 'wink', act: 'wink' },
  { label: 'tip the hat', act: 'tipHat' },
  { label: 'timetable', act: 'timetable' },
  { label: 'warning: look up!', setup: (b) => { b.arm = 'point'; } },
  { label: 'the charge', setup: (b, t) => { b.charge = 0.6 + Math.sin(t * 3) * 0.3; b.arm = 'fist'; } },
  { label: 'shocked', act: 'doubleTake' },
  { label: 'panic', act: 'panic' },
];

/** Miss Pirouette's cells: her dances and moods. */
const DANCER_CELLS: { label: string; pose: DancerPose; sing?: boolean; spring?: number }[] = [
  { label: 'music box', pose: 'stance' },
  { label: 'singing', pose: 'sing', sing: true },
  { label: 'pirouette', pose: 'twirl' },
  { label: 'fouetté kicks', pose: 'fouette' },
  { label: 'arabesque', pose: 'arabesque' },
  { label: 'throwing a note', pose: 'throw' },
  { label: 'winding herself up', pose: 'windUp' },
  { label: 'a dainty laugh', pose: 'titter' },
  { label: 'losing her balance', pose: 'nervous' },
  { label: 'curtsy', pose: 'curtsy' },
  { label: 'winding down', pose: 'windDown', spring: 0.15 },
  { label: 'the last bow', pose: 'bow', spring: 0 },
];

export class PuppetViewerScene extends Phaser.Scene {
  private puppets: { b: Smokestack; cell: Cell }[] = [];
  private dancers: { d: Pirouette; cell: (typeof DANCER_CELLS)[number] }[] = [];
  private ids: string[] = [];
  private index = 0;
  private title!: Phaser.GameObjects.Text;

  constructor() {
    super('PuppetViewer');
  }

  init(data: { id?: string }): void {
    this.ids = Object.keys(Game.art);
    if (Pirouette.available(this)) this.ids.push('pirouette');
    this.index = Math.max(0, this.ids.indexOf(data.id ?? ''));
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#cfc8b8');
    this.title = this.add
      .text(640, 22, '', { fontFamily: 'Rye, Georgia, serif', fontSize: '26px', color: '#141414' })
      .setOrigin(0.5, 0)
      .setDepth(100);
    if (!this.ids.length) {
      this.title.setText('No characters yet: put a parts sheet in art/<id>/ and run  npm run art -- <id>');
      return;
    }
    this.build();
    this.input.keyboard?.on('keydown-RIGHT', () => this.switchTo(1));
    this.input.keyboard?.on('keydown-LEFT', () => this.switchTo(-1));
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('Test'));
  }

  private switchTo(d: number): void {
    this.index = (this.index + d + this.ids.length) % this.ids.length;
    this.build();
  }

  private build(): void {
    for (const p of this.puppets) p.b.destroy();
    for (const p of this.dancers) p.d.destroy();
    this.children.list.filter((o) => o.getData('cellLabel')).forEach((o) => o.destroy());
    this.puppets = [];
    this.dancers = [];
    const id = this.ids[this.index];
    if (id === 'pirouette') {
      this.title.setText(`Miss Pirouette   (${this.index + 1}/${this.ids.length})   ← → other characters`);
      const cols = 4;
      const cw = 1280 / cols;
      const ch = 220;
      DANCER_CELLS.forEach((cell, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const d = new Pirouette(this);
        d.size = 0.3;
        d.x = col * cw + cw / 2;
        d.groundY = 70 + (row + 1) * ch - 14;
        d.pose = cell.pose;
        d.spring = cell.spring ?? 1;
        d.lookTarget = { x: d.x - 300, y: d.groundY - 100 };
        this.add.rectangle(col * cw + cw / 2, d.groundY + 4, cw - 10, 3, 0x141414).setData('cellLabel', true);
        this.add
          .text(col * cw + 10, 70 + row * ch + 4, cell.label, { fontFamily: 'Georgia, serif', fontSize: '15px', color: '#141414' })
          .setDepth(100)
          .setData('cellLabel', true);
        this.dancers.push({ d, cell });
      });
      return;
    }
    this.title.setText(`${id}   (${this.index + 1}/${this.ids.length})   ← → other characters`);
    const cols = 4;
    const cw = 1280 / cols;
    const ch = 220;
    CELLS.forEach((cell, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const b = new Smokestack(this, id);
      b.size = 0.42;
      b.screenX = col * cw + cw * 0.78;
      b.groundY = 70 + (row + 1) * ch - 12;
      b.lookTarget = { x: b.screenX + 200, y: b.groundY - 40 };
      this.add.rectangle(col * cw + cw / 2, b.groundY + 4, cw - 10, 3, 0x141414).setData('cellLabel', true);
      this.add
        .text(col * cw + 10, 70 + row * ch + 4, cell.label, { fontFamily: 'Georgia, serif', fontSize: '15px', color: '#141414' })
        .setDepth(100)
        .setData('cellLabel', true);
      this.puppets.push({ b, cell });
    });
  }

  update(time: number, delta: number): void {
    const t = time / 1000;
    const dt = Math.min(delta / 1000, 0.1);
    const beat = t * (134 / 60);
    for (const { d, cell } of this.dancers) {
      // a waltz is slower: about 100 beats a minute
      const wbeat = t * (100 / 60);
      d.mouth = cell.sing ? Math.max(0, Math.sin(wbeat * Math.PI)) * 0.9 : 0;
      d.update(dt, t, wbeat);
    }
    for (const { b, cell } of this.puppets) {
      b.mouth = 0;
      b.viseme = 'rest';
      b.arm = 'idle';
      b.charge = 0;
      b.gaze = 'tick';
      b.wheelAngle += dt * 6;
      cell.setup?.(b, t, beat);
      if (cell.act && !b.performing) b.perform(cell.act, 2.6);
      b.update(dt, t, beat);
    }
  }
}
