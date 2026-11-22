// Axis-aligned solids the player collides with (track pieces, fallen objects, word platforms).

export interface Solid {
  x: number; // left
  y: number; // top
  w: number;
  h: number;
  /** One-way platforms can be jumped through from below. */
  oneWay?: boolean;
  active: boolean;
  /** Optional tag (e.g. "lyric") for effects when landing. */
  tag?: string;
  /** Called when the player lands on it. */
  onLand?: () => void;
}

export class SolidWorld {
  solids: Solid[] = [];

  add(s: Solid): Solid {
    this.solids.push(s);
    return s;
  }

  remove(s: Solid): void {
    s.active = false;
    const i = this.solids.indexOf(s);
    if (i >= 0) this.solids.splice(i, 1);
  }

  /** Solids overlapping a horizontal range. */
  near(x1: number, x2: number): Solid[] {
    return this.solids.filter((s) => s.active && s.x < x2 && s.x + s.w > x1);
  }

  /** Top Y of the highest solid surface at x (below y), or null. */
  groundAt(x: number, belowY = -Infinity): number | null {
    let best: number | null = null;
    for (const s of this.solids) {
      if (!s.active || s.oneWay) continue;
      if (x >= s.x && x <= s.x + s.w && s.y >= belowY) {
        if (best === null || s.y < best) best = s.y;
      }
    }
    return best;
  }
}
