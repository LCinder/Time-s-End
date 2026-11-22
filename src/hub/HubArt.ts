// Static drawing of the Bijou: walls, furniture, posters, the stage. Drawn once;
// everything that moves or dances is drawn by BijouScene every frame.

import Phaser from 'phaser';
import { INK, Ink, PAPER } from '../rig/Ink';
import type { ParsedMap } from '../world/TileMap';
import { FLOOR } from './HubLayout';

const WALL_BOOTH = 0x4a4540;
const WALL_LOBBY = 0x5b5650;
const WALL_HALL = 0x2e2b28;
const WOOD = 0x6b5a48;
const BRASS = 0xb59a5a;

export const SCREEN = { x: 2480, y: 520, w: 320, h: 480 };
export const WINDOW = { x: 370, y: 380, w: 100, h: 130 };
export const LENS = { x: 872, y: 410 };
export const MARQUEE = { x: 880, y: 945, w: 190, h: 62 };

const font = (size: number, color = '#141414', family = 'Rye'): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: `${family}, Georgia, serif`,
  fontSize: `${size}px`,
  color,
  align: 'center',
});

export function drawHub(scene: Phaser.Scene, map: ParsedMap): void {
  const bg = scene.add.graphics().setDepth(5);
  const k = new Ink(bg);
  k.amp = 0.6;

  // ── rooms
  bg.fillStyle(WALL_BOOTH, 1).fillRect(40, 320, 1000, 320);
  bg.fillStyle(WALL_LOBBY, 1).fillRect(40, 720, 1040, 520);
  bg.fillStyle(WALL_HALL, 1).fillRect(1080, 120, 1760, 1120);
  // booth bricks
  bg.lineStyle(2, 0x3a3631, 0.9);
  for (let y = 340; y < 640; y += 26) {
    bg.lineBetween(40, y, 1040, y);
    for (let x = 40 + ((y / 26) % 2 ? 0 : 30); x < 1040; x += 60) bg.lineBetween(x, y, x, y + 26);
  }
  // lobby wallpaper: art-deco fans
  for (let x = 70; x < 1080; x += 90) {
    for (let y = 760; y < 1180; y += 110) {
      bg.lineStyle(2, 0x6c665f, 1);
      bg.beginPath();
      bg.arc(x, y + 40, 34, Math.PI, Math.PI * 2);
      bg.strokePath();
      for (let a = 0; a < 5; a++) {
        const ang = Math.PI + (a + 0.5) * (Math.PI / 5);
        bg.lineBetween(x, y + 40, x + Math.cos(ang) * 34, y + 40 + Math.sin(ang) * 34);
      }
    }
  }
  bg.fillStyle(0x3a3631, 1).fillRect(40, 1180, 1040, 60); // wainscot
  // auditorium pilasters
  for (let x = 1180; x < 2400; x += 200) {
    bg.fillStyle(0x3a3632, 1).fillRect(x, 160, 34, 1080);
    bg.fillStyle(BRASS, 0.5).fillRect(x + 6, 160, 4, 1080);
  }

  // ── solids (floors, walls, rafters, stage) from the map
  for (const r of map.solids) {
    k.rrect(r.x, r.y, r.w, r.h + 2, 2, 0x26231f, 3);
    bg.fillStyle(0x4c463f, 1).fillRect(r.x + 3, r.y + 3, r.w - 6, 8);
  }
  // floorboards
  for (const [y, x1, x2] of [[FLOOR.booth, 40, 1080], [FLOOR.lobby, 40, 2840]] as const) {
    bg.fillStyle(WOOD, 1).fillRect(x1, y, x2 - x1, 12);
    bg.lineStyle(2, INK, 0.6);
    for (let x = x1; x < x2; x += 48) bg.lineBetween(x, y, x, y + 12);
  }

  // ── booth furniture
  // stairs door
  door(k, bg, 100, FLOOR.booth, 'STAIRS');
  // roof hatch in the ceiling
  k.rrect(140, 312, 80, 14, 2, WOOD, 3);
  bg.fillStyle(BRASS, 1).fillCircle(208, 319, 4);
  // desk + lamp
  k.rrect(238, 578, 124, 16, 3, WOOD, 3);
  k.line(250, 594, 250, 640, 6, INK);
  k.line(350, 594, 350, 640, 6, INK);
  k.line(260, 578, 278, 540, 3, INK);
  k.poly([{ x: 266, y: 540 }, { x: 292, y: 540 }, { x: 286, y: 524 }, { x: 272, y: 524 }], BRASS, 3);
  // coat rack with Elias' coat and hat
  k.line(540, 640, 540, 470, 6, INK);
  k.line(520, 640, 560, 640, 6, INK);
  k.poly([{ x: 516, y: 490 }, { x: 564, y: 490 }, { x: 574, y: 600 }, { x: 506, y: 600 }], 0x2f2b2a, 3);
  k.line(540, 494, 540, 596, 2, 0x5a5550);
  k.ellipse(540, 470, 30, 8, 0x262322, 3);
  k.rrect(524, 446, 32, 24, 6, 0x262322, 3);
  // splicer bench
  k.rrect(606, 586, 108, 14, 3, WOOD, 3);
  k.line(616, 600, 616, 640, 5, INK);
  k.line(704, 600, 704, 640, 5, INK);
  k.rrect(640, 556, 40, 30, 4, 0x8a8478, 3);
  k.line(660, 556, 676, 536, 4, INK);
  // projector: a tall machine with its lens at the window
  k.rrect(718, 430, 148, 210, 10, 0x2c2c2c, 4);
  k.rrect(840, 392, 34, 36, 6, 0x1c1c1c, 4);
  bg.fillStyle(PAPER, 0.4).fillCircle(872, 410, 9);
  k.rrect(734, 470, 40, 26, 4, BRASS, 3);
  // shelf of film cans
  k.line(80, 470, 220, 470, 5, INK);
  for (let i = 0; i < 4; i++) k.ellipse(98 + i * 34, 456, 15, 13, 0x8a8478, 3);
  // window frame (contents drawn live)
  k.rrect(WINDOW.x - 8, WINDOW.y - 8, WINDOW.w + 16, WINDOW.h + 16, 4, null, 6);

  // ── lobby furniture
  door(k, bg, 100, FLOOR.lobby, 'STAIRS');
  door(k, bg, 220, FLOOR.lobby, 'DARKROOM');
  // lost & found box
  k.rrect(300, 1176, 84, 64, 4, WOOD, 4);
  bg.fillStyle(PAPER, 1).fillRect(312, 1192, 60, 18);
  scene.add.text(342, 1201, 'LOST & FOUND', font(9)).setOrigin(0.5).setDepth(6);
  // mirror frame
  k.ellipse(420, 1150, 34, 56, null, 6);
  k.ellipse(420, 1150, 40, 62, null, 3);
  // grandfather clock (stopped at 11:59)
  k.rrect(506, 1000, 68, 240, 8, 0x3b2f26, 4);
  k.circle(540, 1046, 26, PAPER, 4);
  k.line(540, 1046, 538, 1026, 4, INK);
  k.line(540, 1046, 536, 1028, 2, INK);
  k.rrect(522, 1090, 36, 110, 6, 0x2a221c, 3);
  k.line(540, 1096, 540, 1176, 3, BRASS);
  k.circle(540, 1180, 9, BRASS, 3);
  // posters
  poster(scene, k, 660, 'BIJOU\nNEWS', 'newsreel No. 1');
  poster(scene, k, 780, 'THE\nRUNAWAY\nREEL', 'chapter one');
  // popcorn machine
  k.rrect(862, 1160, 76, 80, 6, 0x8a2f2a, 4);
  k.rrect(866, 1090, 68, 72, 6, null, 4);
  k.rrect(858, 1076, 84, 18, 6, 0x8a2f2a, 4);
  scene.add.text(900, 1200, 'POP\nCORN', font(14, '#f4efe4')).setOrigin(0.5).setDepth(6);
  // ticket booth
  k.rrect(974, 1060, 92, 180, 10, 0x6b2f2a, 4);
  k.rrect(986, 1100, 68, 50, 20, 0x1c1c1c, 3);
  k.rrect(970, 1040, 100, 26, 10, BRASS, 4);
  scene.add.text(1020, 1053, 'TICKETS', font(14)).setOrigin(0.5).setDepth(6);
  // the doorway into the auditorium
  k.rrect(1076, 1110, 48, 10, 2, BRASS, 3);

  // ── auditorium
  // organ console + pipes
  for (let i = 0; i < 7; i++) k.rrect(2130 + i * 18, 1000 - (i % 4) * 26, 14, 120 + (i % 4) * 26, 6, 0x8a7a54, 3);
  k.rrect(2120, 1150, 140, 90, 10, 0x3b2f26, 4);
  k.rrect(2130, 1140, 120, 14, 3, PAPER, 3);
  for (let i = 0; i < 10; i++) bg.fillStyle(INK, 1).fillRect(2134 + i * 12, 1141, 5, 8);
  // stage front, screen frame and curtains
  for (let x = 2410; x < 2840; x += 60) k.line(x, 1086, x, 1236, 2, 0x3a3631);
  k.rrect(SCREEN.x - 14, SCREEN.y - 14, SCREEN.w + 28, SCREEN.h + 28, 6, 0x1c1c1c, 5);
  for (const [x0, dir] of [[2420, 1], [2830, -1]] as const) {
    k.poly([{ x: x0, y: 470 }, { x: x0 + dir * 56, y: 470 }, { x: x0 + dir * 38, y: 1080 }, { x: x0, y: 1080 }], 0x5a2a26, 4);
    for (let i = 1; i < 3; i++) k.line(x0 + dir * i * 16, 480, x0 + dir * i * 12, 1070, 2, 0x3a1a18);
  }
  k.rrect(2400, 440, 450, 44, 8, 0x5a2a26, 4);
  // exit signs
  for (const x of [1200, 2300]) {
    k.rrect(x - 40, 760, 80, 30, 4, 0x1c1c1c, 3);
    scene.add.text(x, 775, 'EXIT', font(18, '#f4efe4')).setOrigin(0.5).setDepth(6);
  }
}

function door(k: Ink, g: Phaser.GameObjects.Graphics, x: number, floor: number, label: string): void {
  k.rrect(x - 34, floor - 128, 68, 128, 6, 0x3b2f26, 4);
  k.rrect(x - 24, floor - 116, 48, 48, 4, null, 2);
  g.fillStyle(0xb59a5a, 1).fillCircle(x + 22, floor - 60, 5);
  k.rrect(x - 42, floor - 158, 84, 22, 4, 0xe8e1d0, 3);
  const t = k.g.scene.add.text(x, floor - 147, label, font(12)).setOrigin(0.5).setDepth(6);
  void t;
}

function poster(scene: Phaser.Scene, k: Ink, x: number, title: string, sub: string): void {
  k.rrect(x - 52, 1010, 104, 150, 4, 0xe8e1d0, 5);
  k.rrect(x - 44, 1018, 88, 134, 2, null, 2);
  scene.add.text(x, 1070, title, font(17)).setOrigin(0.5).setDepth(6);
  scene.add.text(x, 1138, sub, font(11, '#3a3631', 'Limelight')).setOrigin(0.5).setDepth(6);
}
