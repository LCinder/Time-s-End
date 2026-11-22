import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DifficultySpec, GameConfig, LevelData } from '../src/core/types';

const root = resolve(import.meta.dirname, '..');
export const readJson = (rel: string): any => JSON.parse(readFileSync(resolve(root, 'public', rel), 'utf8'));
export const gameConfig = (): GameConfig => readJson('data/config/game.json');
export const difficulties = (): Record<string, DifficultySpec> => readJson('data/config/difficulty.json');

/** A tiny valid chase level at 120 BPM (1 beat = 0.5 s) to build test cases on. */
export function miniLevel(over: Partial<LevelData> = {}): any {
  return {
    id: 'mini',
    title: 'MINI',
    subtitle: 'Test',
    boss: 'smokestack',
    type: 'chase',
    era: 'bw1928',
    song: { offsetMs: 0, beatsPerBar: 4, tempoMap: [{ beat: 0, bpm: 120 }], lengthBeats: 64 },
    chase: { pixelsPerBeat: 110, anchorX: 440, bossFrontX: 250, gapLeadPx: 40, autoRun: true },
    lyrics: [
      { beat: 4, text: 'If a ^BOXCAR came tumblin down', at: [0, 0.5, 1, 2, 3, 3.5] },
      { beat: 12, text: '^TOOT! ^TOOT! no no', at: [0, 1, 2, 3] },
    ],
    events: [],
    placeholderMusic: { key: 'C', swing: 0.5, sections: [{ name: 'a', bars: 16, chords: ['I'] }] },
    ...over,
  };
}
