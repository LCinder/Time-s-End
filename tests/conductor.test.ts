import { describe, expect, it } from 'vitest';
import { Conductor } from '../src/core/Conductor';

describe('Conductor tempo maths', () => {
  const c = new Conductor([{ beat: 0, bpm: 120 }, { beat: 8, bpm: 60 }, { beat: 12, bpm: 240 }]);

  it('converts beats to seconds across tempo changes', () => {
    expect(c.beatToSec(0)).toBe(0);
    expect(c.beatToSec(8)).toBeCloseTo(4); // 8 beats at 0.5 s
    expect(c.beatToSec(10)).toBeCloseTo(6); // + 2 beats at 1 s
    expect(c.beatToSec(16)).toBeCloseTo(9); // 4 at 1 s, then 4 at 0.25 s
  });

  it('secToBeat is the inverse of beatToSec', () => {
    for (const b of [0, 1.5, 7.99, 8, 9.25, 12, 13.75, 30]) expect(c.secToBeat(c.beatToSec(b))).toBeCloseTo(b, 9);
  });

  it('reports the seconds per beat of the segment', () => {
    expect(c.secondsPerBeat(3)).toBeCloseTo(0.5);
    expect(c.secondsPerBeat(9)).toBeCloseTo(1);
    expect(c.secondsPerBeat(20)).toBeCloseTo(0.25);
  });
});
