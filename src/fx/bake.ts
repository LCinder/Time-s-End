// Phaser re-processes every Graphics command on every frame. Scenery that never
// changes (walls, wallpaper, furniture, tiles, skylines) is drawn once and baked
// into RenderTextures, in chunks so no texture exceeds what any GPU can hold.

import type Phaser from 'phaser';

const CHUNK = 2048;

export interface BakeOptions {
  /** Size of the area to capture, in the graphics' own coordinates (starting at 0,0). */
  width: number;
  height: number;
  depth: number;
  scrollFactor?: number;
  /** Where the captured area's top-left corner goes in the world (default 0,0). */
  at?: { x: number; y: number };
}

/** Draws `g` into chunked RenderTextures placed where `g` was, then destroys `g`. */
export function bake(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics, o: BakeOptions): Phaser.GameObjects.RenderTexture[] {
  const out: Phaser.GameObjects.RenderTexture[] = [];
  const sf = o.scrollFactor ?? 1;
  g.setScrollFactor(1).setPosition(0, 0).setVisible(true);
  for (let x = 0; x < o.width; x += CHUNK) {
    for (let y = 0; y < o.height; y += CHUNK) {
      const w = Math.min(CHUNK, o.width - x);
      const h = Math.min(CHUNK, o.height - y);
      const rt = scene.add.renderTexture((o.at?.x ?? 0) + x, (o.at?.y ?? 0) + y, w, h).setOrigin(0).setDepth(o.depth).setScrollFactor(sf);
      rt.draw(g, -x, -y);
      out.push(rt);
    }
  }
  g.destroy();
  return out;
}
