import { describe, expect, it, vi } from 'vitest';

// a fake audio clock we can move by hand
const clock = { currentTime: 10 };
vi.mock('../src/audio/AudioEngine', () => ({
  AudioEngine: { get: () => ({ ctx: clock, outputLatency: () => 0 }) },
}));

const { Conductor } = await import('../src/core/Conductor');

describe('Conductor with a variable rate (the wind-up spring)', () => {
  it('runs at normal speed, slows down, and stays continuous', () => {
    const c = new Conductor([{ beat: 0, bpm: 120 }]);
    c.start(0, 0); // beat 0 at t=10, 0.5 s per beat
    clock.currentTime = 11;
    expect(c.beat).toBeCloseTo(2);
    c.setRate(0.5, 11);
    expect(c.beat).toBeCloseTo(2); // no jump when the rate changes
    clock.currentTime = 12;
    expect(c.beat).toBeCloseTo(3); // one second at half speed = one beat
    expect(c.ctxTimeOfBeat(4)).toBeCloseTo(13);
    c.setRate(1, 12);
    clock.currentTime = 12.5;
    expect(c.beat).toBeCloseTo(4);
  });
});
