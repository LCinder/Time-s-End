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
    case 'holePunch': return e.beat - n('biteBeats', 1.5) - 1.4;
    // set pieces standing by the track: created while still off-screen, so they arrive with the scenery
    case 'crossing': return e.beat - 11;
    case 'cuckoos': return e.beat - 11;
    case 'pendulum': return e.beat - 11;
    case 'waterStop': return e.beat - 11;
    case 'trackSwitch': return e.beat - 11;
    case 'unwindKey': return e.beat - 1.5;
    case 'ghostWatches': return e.beat - 0.5;
    case 'redSignal': return e.beat - 11;
    case 'timeStop': return e.beat - 3;
    case 'tunnelListen': return e.beat - 3;
    case 'pianoKeys': return e.beat - 3;
    case 'roofRun': return e.beat - 9;
    default: return e.beat;
  }
}
