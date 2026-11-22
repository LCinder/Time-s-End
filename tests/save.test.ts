import { describe, expect, it } from 'vitest';
import { addFrame, clockText, daysAway, framesAvailable, newSave, normalizeSave, recordLevel } from '../src/core/Save';

describe('saved games', () => {
  it('starts empty in the booth at 11:59:00', () => {
    const s = newSave('B');
    expect(s.slot).toBe('B');
    expect(s.freed).toEqual([]);
    expect(clockText(s, 7)).toBe('11:59:00');
  });

  it('counts each frame once and spends them on reels', () => {
    const s = newSave('A');
    expect(addFrame(s, 'newsreel-1:0')).toBe(true);
    expect(addFrame(s, 'newsreel-1:0')).toBe(false);
    addFrame(s, 'newsreel-1:1');
    s.framesSpent = 1;
    expect(framesAvailable(s)).toBe(1);
  });

  it('keeps the best rank and counts plays', () => {
    const s = newSave('A');
    recordLevel(s, 'smokestack', true, 'B');
    recordLevel(s, 'smokestack', true, 'S');
    recordLevel(s, 'smokestack', true, 'C');
    recordLevel(s, 'smokestack', false);
    expect(s.levels.smokestack).toEqual({ completed: true, rank: 'S', plays: 4 });
  });

  it('moves the watch forward for every boss freed, up to 59 seconds', () => {
    const s = newSave('A');
    s.freed = ['smokestack'];
    expect(clockText(s, 7)).toBe('11:59:07');
    s.freed = Array(20).fill('x');
    expect(clockText(s, 7)).toBe('11:59:59');
  });

  it('fills in fields missing from older saves and rejects unknown versions', () => {
    const old = { version: 1, slot: 'A', freed: ['smokestack'], flags: { introSeen: true } };
    const s = normalizeSave(old, 'C')!;
    expect(s.slot).toBe('C');
    expect(s.freed).toEqual(['smokestack']);
    expect(s.flags.introSeen).toBe(true);
    expect(s.flags.threaded).toEqual([]);
    expect(normalizeSave({ version: 99 }, 'A')).toBeNull();
    expect(normalizeSave('garbage', 'A')).toBeNull();
  });

  it('knows how long the player has been away', () => {
    const s = newSave('A');
    s.updated = Date.now() - 4 * 86_400_000;
    expect(daysAway(s)).toBeCloseTo(4, 1);
  });
});
