// Parallax background where EVERYTHING dances to the beat:
// hills breathe, trees & poles sway left/right on alternate beats, clouds bob.

import Phaser from 'phaser';
import { boilKey } from '../fx/Textures';

interface Prop {
  img: Phaser.GameObjects.Image;
  base: string;
  worldX: number;
  factor: number;
  y: number;
  scale: number;
  phaseOffset: number;
}

export class Scenery {
  private sky: Phaser.GameObjects.Graphics;
  private far: Phaser.GameObjects.TileSprite;
  private hills: Phaser.GameObjects.TileSprite;
  private props: Prop[] = [];
  private clouds: Prop[] = [];

  constructor(scene: Phaser.Scene, groundY: number) {
    this.sky = scene.add.graphics().setDepth(0);
    this.sky.fillGradientStyle(0xbfbdb2, 0xbfbdb2, 0xeeeae0, 0xeeeae0, 1);
    this.sky.fillRect(0, 0, 1280, groundY + 10);

    this.far = scene.add.tileSprite(640, groundY - 120, 1280, 260, 'farhills_0').setOrigin(0.5, 1).setDepth(2);
    this.hills = scene.add.tileSprite(640, groundY + 4, 1280, 220, 'hills_0').setOrigin(0.5, 1).setDepth(4);

    for (let i = 0; i < 4; i++) {
      this.clouds.push({
        img: scene.add.image(0, 0, 'cloud_0').setDepth(1),
        base: 'cloud',
        worldX: i * 420 + 120,
        factor: 0.05,
        y: 90 + (i % 2) * 70,
        scale: 0.8 + (i % 3) * 0.15,
        phaseOffset: i,
      });
    }
    // trees & poles (mid layer) and bushes (near layer)
    let x = 0;
    for (let i = 0; i < 9; i++) {
      const isPole = i % 3 === 2;
      x += 220 + ((i * 97) % 140);
      this.props.push({
        img: scene.add.image(0, 0, isPole ? 'pole_0' : 'tree_0').setOrigin(0.5, 1).setDepth(6),
        base: isPole ? 'pole' : 'tree',
        worldX: x,
        factor: 0.55,
        y: groundY - 18,
        scale: isPole ? 0.75 : 0.62 + ((i * 31) % 20) / 100,
        phaseOffset: i,
      });
    }
    x = 0;
    for (let i = 0; i < 6; i++) {
      x += 260 + ((i * 53) % 160);
      this.props.push({
        img: scene.add.image(0, 0, 'bush_0').setOrigin(0.5, 1).setDepth(8),
        base: 'bush',
        worldX: x,
        factor: 0.85,
        y: groundY - 6,
        scale: 0.8,
        phaseOffset: i + 0.5,
      });
    }
  }

  update(camX: number, beat: number, time: number, dark: number): void {
    const phase = beat - Math.floor(beat);
    const pulse = Math.pow(1 - phase, 3);
    const side = Math.floor(beat) % 2 === 0 ? 1 : -1;

    this.far.tilePositionX = camX * 0.12;
    this.far.setScale(1, 1 + pulse * 0.02);
    this.hills.tilePositionX = camX * 0.3;
    this.hills.setScale(1, 1 + pulse * 0.05);
    const hk = Math.floor(time * 8) % 3;
    this.hills.setTexture(`hills_${hk}`);
    this.far.setTexture(`farhills_${hk}`);

    const wrapW = 2400;
    for (const p of [...this.props, ...this.clouds]) {
      let sx = p.worldX - camX * p.factor;
      sx = ((sx % wrapW) + wrapW) % wrapW - 300;
      p.img.x = sx;
      p.img.setTexture(boilKey(p.base, time, Math.floor(p.phaseOffset)));
      if (p.base === 'cloud') {
        p.img.y = p.y - pulse * 8 + Math.sin(beat * Math.PI * 0.5 + p.phaseOffset) * 4;
        p.img.setScale(p.scale * (1 + pulse * 0.04));
      } else {
        // dance! sway to alternate sides on each beat and squash on the downbeat
        const alt = Math.round(p.phaseOffset) % 2 === 0 ? side : -side;
        const sway = alt * (0.07 - 0.05 * (1 - pulse));
        p.img.y = p.y;
        p.img.setRotation(p.base === 'pole' ? sway * 0.4 : sway);
        p.img.setScale(p.scale * (1 + pulse * 0.05), p.scale * (1 - pulse * 0.08));
      }
    }
    this.sky.setAlpha(1 - dark * 0.2);
  }
}
