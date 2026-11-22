// "Press any key" card: browsers only allow audio after a user gesture.

import Phaser from 'phaser';
import { AudioEngine } from '../audio/AudioEngine';
import { sfx } from '../audio/Sfx';
import { Game } from '../core/Game';
import { addFilm } from '../fx/FilmPipeline';

export class SplashScene extends Phaser.Scene {
  private skipTo?: string;

  constructor() {
    super('Splash');
  }

  init(data: { skipTo?: string }): void {
    this.skipTo = data.skipTo;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1b1a17');
    addFilm(this, 'bw1928');
    const g = this.add.graphics();
    g.lineStyle(6, 0xf4efe4, 1);
    g.strokeRoundedRect(240, 150, 800, 420, 40);
    g.lineStyle(2, 0xf4efe4, 1);
    g.strokeRoundedRect(256, 166, 768, 388, 30);
    this.add.text(640, 250, 'BIJOU PICTURES', { fontFamily: 'Limelight, Georgia, serif', fontSize: '54px', color: '#f4efe4' }).setOrigin(0.5);
    this.add.text(640, 310, 'presents', { fontFamily: 'Limelight, Georgia, serif', fontSize: '28px', color: '#cfc8b8' }).setOrigin(0.5);
    const press = this.add.text(640, 450, 'PRESS ANY KEY', { fontFamily: 'Rye, Georgia, serif', fontSize: '40px', color: '#f4efe4' }).setOrigin(0.5);
    this.tweens.add({ targets: press, alpha: 0.2, yoyo: true, repeat: -1, duration: 600 });

    let started = false;
    const go = async (): Promise<void> => {
      if (started) return;
      started = true;
      const e = AudioEngine.get();
      await e.resume();
      e.configure({ master: Game.config.masterVolume, music: Game.settings.music, sfx: Game.settings.sfx, vintage: Game.config.vintageAudio });
      sfx('select');
      if (this.skipTo && Game.levels[this.skipTo]) this.scene.start('Chase', { levelId: this.skipTo });
      else if (this.skipTo && Game.platformLevels[this.skipTo]) this.scene.start('Platform', { levelId: this.skipTo });
      else this.scene.start('Title');
    };
    this.input.keyboard?.once('keydown', go);
    this.input.once('pointerdown', go);
    this.input.gamepad?.once('down', go);
  }
}
