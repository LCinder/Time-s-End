import { describe, expect, it } from 'vitest';
import { Acting, faceWarp } from '../src/rig/Acting';

const calm = { singing: false, accent: false, nervous: 0, idle: false };

describe('secondary acting', () => {
  it('turns the head towards where the character looks, and stays stable on slow frames', () => {
    const a = new Acting();
    for (let i = 0; i < 20; i++) a.update(0.1, i * 0.2, { ...calm, look: 0.8 }); // 10 fps
    expect(a.turn).toBeGreaterThan(0.6);
    expect(a.turn).toBeLessThan(1.16);
  });

  it('blinks when the head turns a long way', () => {
    const a = new Acting();
    a.update(1 / 60, 0, { ...calm, look: -0.8 });
    a.update(1 / 60, 0, { ...calm, look: 0.8 });
    expect(a.blinking).toBe(true);
  });

  it('snaps round to the audience, nods and raises the brows on an accent', () => {
    const a = new Acting();
    for (let i = 0; i < 30; i++) a.update(1 / 60, i / 60, { ...calm, look: 0.9 });
    a.update(1 / 60, 0.5, { ...calm, look: 0.9, accent: true });
    expect(a.brow).toBeGreaterThan(0.9);
    expect(a.nod).toBeGreaterThan(5);
    for (let i = 0; i < 12; i++) a.update(1 / 60, 0.5, { ...calm, look: 0.9 });
    expect(Math.abs(a.turn)).toBeLessThan(0.6); // heading to the audience during the glance
  });

  it('slides the middle of the face further than the edge when turning (fake 3D)', () => {
    const a = new Acting();
    a.turn = 1;
    const w = faceWarp(a, 0, 0, 100, null);
    const middle = w(0, 0).x;
    const edge = w(90, 0).x - 90;
    expect(middle).toBeGreaterThan(edge);
  });
});
