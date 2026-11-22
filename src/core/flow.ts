// Moving between the Bijou, the levels and the menus, keeping the save in step
// (CONTINUE must always be able to put the player back where they were, §6.3).

import type Phaser from 'phaser';
import { Game, type ReturnTo } from './Game';

export function isPlatformLevel(id: string): boolean {
  return id in Game.platformLevels;
}

/** Enter a level through its title card. `cue` resumes from a cue mark. */
export function startLevel(scene: Phaser.Scene, levelId: string, returnTo: ReturnTo, cue = 0): void {
  Game.returnTo = returnTo;
  if (Game.save) {
    Game.save.resume = { levelId, cue };
    Game.persist();
  }
  scene.scene.start('TitleCard', { levelId, cue });
}

/** Leave a level (finished, quit, or after the results card). */
export function leaveLevel(scene: Phaser.Scene, levelId: string, info: { completed: boolean } = { completed: false }): void {
  if (Game.save) {
    Game.save.resume = null;
    Game.persist();
  }
  switch (Game.returnTo) {
    case 'hub':
      scene.scene.start('Bijou', { from: levelId, completed: info.completed });
      break;
    case 'programme':
      scene.scene.start('Programme');
      break;
    default:
      scene.scene.start('Title');
  }
}

/** Remember the cue mark reached, so CONTINUE resumes there. */
export function markCue(levelId: string, cue: number): void {
  if (!Game.save) return;
  Game.save.resume = { levelId, cue };
  Game.persist();
}
