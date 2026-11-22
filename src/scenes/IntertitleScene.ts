// A full-screen sequence of silent-film cards (the intro, "Previously at the
// Bijou…"), then on to the next scene. Hold JUMP / ENTER to skip.

import Phaser from 'phaser';
import { Game } from '../core/Game';
import { Input } from '../core/Input';
import { addFilm } from '../fx/FilmPipeline';
import { Cards } from '../ui/Cards';

export interface IntertitleData {
  cards: string[];
  next: string;
  nextData?: object;
}

export class IntertitleScene extends Phaser.Scene {
  private cards: Cards | null = null;
  private input2!: Input;
  private d!: IntertitleData;

  constructor() {
    super('Intertitle');
  }

  init(data: IntertitleData): void {
    this.d = data;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0b0b0b');
    this.input2 = new Input(this, Game.controls);
    addFilm(this, 'bw1928');
    this.cards = new Cards(this, this.input2, this.d.cards, () => {
      this.cards = null;
      this.cameras.main.fadeOut(300, 11, 11, 11);
      this.time.delayedCall(320, () => this.scene.start(this.d.next, this.d.nextData ?? {}));
    }, { autoSec: 5 });
  }

  update(_t: number, delta: number): void {
    this.input2.update();
    this.cards?.update(delta);
  }
}
