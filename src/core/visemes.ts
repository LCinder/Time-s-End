// Lip sync by phoneme ("visemes"): a sung word becomes a little sequence of mouth
// shapes, so the boss's mouth follows the actual sounds of the lyrics instead of
// just flapping. Spelling is a good-enough guide for cartoon lip sync.

export type Viseme = 'rest' | 'closed' | 'teeth' | 'open' | 'wide' | 'mid' | 'round' | 'small';

// longest patterns first; vowels weigh 2 (they last longer when sung)
const RULES: [RegExp, Viseme, number][] = [
  [/^(igh|ai|ay|ie)/, 'wide', 2],
  [/^(ee|ea|ey)/, 'mid', 2],
  [/^(oo|ew|ue)/, 'small', 2],
  [/^(ou|ow|aw|au|oa|oi|oy)/, 'round', 2],
  [/^(th)/, 'teeth', 1],
  [/^(sh|ch)/, 'small', 1],
  [/^[mbp]/, 'closed', 1],
  [/^[fv]/, 'teeth', 1],
  [/^[ai]/, 'wide', 2],
  [/^[ey]/, 'mid', 2],
  [/^o/, 'round', 2],
  [/^[uw]/, 'small', 2],
  [/^[jq]/, 'small', 1],
  [/^[a-z]/, 'open', 1],
];

export function visemesOf(word: string): { v: Viseme; w: number }[] {
  let s = word.toLowerCase().replace(/[^a-z]/g, '');
  const out: { v: Viseme; w: number }[] = [];
  while (s.length) {
    const rule = RULES.find(([re]) => re.test(s))!;
    const m = rule[0].exec(s)!;
    const last = out[out.length - 1];
    if (last && last.v === rule[1]) last.w += rule[2];
    else out.push({ v: rule[1], w: rule[2] });
    s = s.slice(m[0].length);
  }
  // a silent final "e" ("time", "line") shouldn't end the word on a smile
  if (out.length > 1 && /[^aeiou]e$/i.test(word.replace(/[^a-z]/gi, '')) && out[out.length - 1].v === 'mid') out.pop();
  return out.length ? out : [{ v: 'open', w: 1 }];
}

/** Mouth shape `f` (0-1) of the way through singing `word`. */
export function visemeAt(word: string, f: number): Viseme {
  const seq = visemesOf(word);
  const total = seq.reduce((n, s) => n + s.w, 0);
  let acc = 0;
  const target = Math.min(0.999, Math.max(0, f)) * total;
  for (const s of seq) {
    acc += s.w;
    if (target < acc) return s.v;
  }
  return seq[seq.length - 1].v;
}
