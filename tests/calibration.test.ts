import { describe, expect, it } from 'vitest';
import { clampOffset, OFFSET_LIMIT_MS } from '../src/core/Calibration';

describe('calibration', () => {
  it('rounds and clamps offsets to the allowed range', () => {
    expect(clampOffset(12.6)).toBe(13);
    expect(clampOffset(9999)).toBe(OFFSET_LIMIT_MS);
    expect(clampOffset(-9999)).toBe(-OFFSET_LIMIT_MS);
  });
});
