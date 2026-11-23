import { describe, expect, it } from 'vitest';
import { EXPRESSIONS, NEUTRAL, expression, glideFace } from '../src/entities/FaceRig';
import { ACT_FACE } from '../src/entities/SmokestackActs';

describe('face rig', () => {
  it('every act has an expression that exists', () => {
    for (const [act, f] of Object.entries(ACT_FACE)) expect(EXPRESSIONS[f.face], `${act} -> ${f.face}`).toBeDefined();
  });

  it('expressions only use known controls, in sensible ranges', () => {
    for (const [name, e] of Object.entries(EXPRESSIONS)) {
      for (const [k, v] of Object.entries(e)) {
        expect(k in NEUTRAL, `${name}.${k}`).toBe(true);
        expect(Math.abs(v as number), `${name}.${k}`).toBeLessThanOrEqual(1.6);
      }
    }
  });

  it('glides towards the target without overshooting, whatever the frame rate', () => {
    const face = { ...NEUTRAL };
    const target = expression('cackle');
    for (let i = 0; i < 6; i++) glideFace(face, target, 1 / 60);
    expect(face.lidL).toBeGreaterThan(NEUTRAL.lidL);
    expect(face.lidL).toBeLessThan(target.lidL);
    glideFace(face, target, 1);
    expect(face.lidL).toBeCloseTo(target.lidL);
  });
});
