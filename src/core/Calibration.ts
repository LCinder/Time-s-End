// Per-player latency calibration, saved in the browser (localStorage).
// The values are *added* to game.json's audioOffsetMs / inputOffsetMs, so the
// JSON stays the shared baseline and each machine stores only its own tweak.

export interface CalibrationData {
  audioOffsetMs: number;
  inputOffsetMs: number;
}

const KEY = 'timesend.calibration.v1';
export const OFFSET_LIMIT_MS = 500;

export function clampOffset(ms: number): number {
  return Math.round(Math.max(-OFFSET_LIMIT_MS, Math.min(OFFSET_LIMIT_MS, ms)));
}

export function loadCalibration(): CalibrationData {
  const empty: CalibrationData = { audioOffsetMs: 0, inputOffsetMs: 0 };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return empty;
    const o = JSON.parse(raw) as Partial<CalibrationData>;
    const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? clampOffset(v) : 0);
    return { audioOffsetMs: num(o.audioOffsetMs), inputOffsetMs: num(o.inputOffsetMs) };
  } catch {
    return empty;
  }
}

export function saveCalibration(d: CalibrationData): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    // storage blocked (private window etc.): the values still apply this session
  }
}
