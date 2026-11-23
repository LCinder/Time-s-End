// When each event appears on screen (its warning starts), shared by the game
// (ChaseScene spawns hazards at this beat) and the level checker.

import type { DifficultySpec, LevelEvent } from './types';

/** Beat at which the event is spawned / starts warning the player. */
export function spawnBeatOf(e: LevelEvent, diff: DifficultySpec): number {
  const n = (k: string, d: number): number => (typeof e[k] === 'number' ? (e[k] as number) : d);
  switch (e.type) {
    case 'drop': return e.beat - n('telegraphBeats', diff.telegraphBeats);
    case 'lyricObject': return e.beat - 0.75;
    case 'groundWave': return e.beat - n('travelBeats', 2) / diff.hazardSpeedMultiplier;
    case 'coal': return e.beat - 1;
    case 'smokeRing': return e.beat - n('travelBeats', 2) / diff.hazardSpeedMultiplier;
    case 'bossLunge': return e.beat - n('telegraphBeats', diff.telegraphBeats);
    case 'ticketCheck': return e.beat - 3;
    case 'holePunch': return e.beat - n('biteBeats', 1.5) - 1.2;
    case 'crossing': return e.beat - 5;
    case 'cuckoos': return e.beat - 5;
    case 'pendulum': return e.beat - 6;
    default: return e.beat;
  }
}
