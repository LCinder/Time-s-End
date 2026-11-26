import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkDuel } from '../src/core/duelCheck';
import { DataError, validateDuel, validateStory } from '../src/core/validate';
import { readJson } from './helpers';

const duel = (events: object[], extra: object = {}): any => ({
  id: 'd', type: 'duel', title: 'T', subtitle: 'S',
  phases: [{ name: 'P', subtitle: 's', bpm: 100, melody: 'waltz', damage: { perfect: 0.05, good: 0.03 }, sections: [{ name: 'a', beats: 24, events }], ...extra }],
});
const errors = (raw: unknown): string[] => checkDuel(raw).filter((i) => i.level === 'error').map((i) => i.message);

describe('duel levels', () => {
  it('accept the shipped duel, and the chapter that opens it from the lost and found', () => {
    const story = validateStory(readJson('data/story.json'), 'story');
    const ch = story.chapters.find((c) => c.feature === 'pirouette');
    expect(ch?.entry).toBe('lostfound');
    const raw = readJson('data/levels/pirouette.json');
    expect(() => validateDuel(raw, 'pirouette')).not.toThrow();
    expect(errors(raw)).toEqual([]);
  });

  it('every phase of Miss Pirouette has something to send back, and her reflection comes out in the last', () => {
    const raw = readJson('data/levels/pirouette.json') as any;
    expect(checkDuel(raw).filter((i) => /nothing to send back/.test(i.message))).toEqual([]);
    const last = raw.phases[raw.phases.length - 1];
    const mirror = last.sections.flatMap((s: any) => s.events).filter((e: any) => e.type === 'mirror');
    expect(mirror.some((e: any) => e.out !== false)).toBe(true);
  });

  it('explain broken events', () => {
    expect(errors(duel([{ type: 'spin', beat: 3 }]))[0]).toMatch(/unknown event type/);
    expect(errors(duel([{ type: 'note', beat: 30 }]))[0]).toMatch(/within the section/);
    expect(errors(duel([{ type: 'note', beat: 6, from: 'foot' }]))[0]).toMatch(/"from"/);
    expect(errors(duel([{ type: 'cushions', beat: 6, up: [2] }]))[0]).toMatch(/"up"/);
    expect(errors(duel([{ type: 'mirror', beat: 6, out: 'yes' }]))[0]).toMatch(/"out"/);
    expect(errors(duel([{ type: 'note', beat: 6 }], { encoreFrom: 4 }))[0]).toMatch(/encoreFrom/);
    expect(errors(duel([{ type: 'bourree', beat: 6, count: 0 }]))[0]).toMatch(/"count"/);    expect(errors(duel([{ type: 'note', beat: 6, every: 2 }]))[0]).toMatch(/"every"/);
    expect(errors(duel([{ type: 'minuet', beat: 6, every: 9 }]))[0]).toMatch(/"every"/);
    expect(errors(duel([{ type: 'note', beat: 6 }], { audio: { song: 'a.mp3', at: 0 } }))[0]).toMatch(/audio needs/);
  });

  it('the recorded song: every phase of Miss Pirouette has one, and its files are there', () => {
    const raw = readJson('data/levels/pirouette.json') as any;
    expect(raw.phases.every((ph: any) => ph.audio?.song && ph.audio?.loop)).toBe(true);
    const seen: string[] = [];
    const issues = checkDuel(raw, (f) => (seen.push(f), existsSync(resolve(__dirname, '..', 'public', f))));
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(seen.length).toBe(6);
    // every stanza has a refrain to loop (the song's own bars without the voice)
    for (const ph of raw.phases) for (const s of ph.sections) expect(s.loopFrom).toBeGreaterThan(0);
  });

  it('a sweep needs a raised cushion to stand on', () => {
    expect(errors(duel([{ type: 'sweep', beat: 6, lengthBeats: 3 }]))[0]).toMatch(/nowhere to stand/);
    expect(errors(duel([{ type: 'cushions', beat: 2, up: [0, 1] }, { type: 'sweep', beat: 6, lengthBeats: 3 }]))).toEqual([]);
    // the cushions stay as the last section left them
    expect(errors(duel([{ type: 'cushions', beat: 2, up: [1, 1] }, { type: 'cushions', beat: 4, up: [0, 0] }, { type: 'sweep', beat: 6 }]))[0]).toMatch(/nowhere/);
  });

  it('a refrain must stay fair when it comes round again', () => {
    // the refrain (beats 12 …) lowers the cushions after its sweep: on the next pass the sweep has nowhere to stand
    const loop = (extra: object[] = []): any => duel([{ type: 'cushions', beat: 2, up: [1, 1] }, { type: 'sweep', beat: 14 }, { type: 'cushions', beat: 18, up: [0, 0] }, ...extra], {});
    const bad = loop();
    bad.phases[0].sections[0].loopFrom = 12;
    expect(errors(bad).join()).toMatch(/comes round again/);
    const good = loop([{ type: 'cushions', beat: 12, up: [1, 1] }, { type: 'note', beat: 16 }, { type: 'note', beat: 20 }, { type: 'note', beat: 22 }]);
    good.phases[0].sections[0].loopFrom = 12;
    expect(errors(good)).toEqual([]);
    const outside = loop();
    outside.phases[0].sections[0].loopFrom = 30;
    expect(errors(outside).join()).toMatch(/loopFrom/);
  });

  it('a refrain must have something to send back (else it loops for ever)', () => {
    const raw = duel([{ type: 'note', beat: 3 }, { type: 'twirl', beat: 14 }]);
    raw.phases[0].sections[0].loopFrom = 12;
    expect(errors(raw).some((m) => /loop for ever/.test(m))).toBe(true);
    raw.phases[0].sections[0].events.push({ type: 'note', beat: 16 }, { type: 'note', beat: 18 });
    expect(errors(raw).some((m) => /loop for ever/.test(m))).toBe(false);
  });

  it('refuse a file that is not a duel', () => {
    expect(() => validateDuel({ id: 'x', title: 'T', subtitle: 'S', type: 'chase', phases: [] }, 'x')).toThrow(DataError);
  });
});
