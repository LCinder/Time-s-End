// Checks a duel level (data/levels/<id>.json, "type": "duel") beyond its shape: every event is
// one the duel knows, inside its section, with sensible options. Used by `npm run check` and
// the tests (the duel scene itself trusts the file).

export interface DuelIssue {
  level: 'error' | 'warning';
  where: string;
  message: string;
}

const TYPES = ['note', 'twirl', 'sing', 'hush', 'cushions', 'pins', 'kicks', 'moths', 'bouquets', 'minuet', 'move', 'sweep', 'dash', 'mirror', 'bourree'];
const FROM = ['hand', 'comb', 'mirror'];
const SPOTS = ['left', 'center', 'right'];

type Raw = Record<string, unknown>;

/** `exists` (optional) tells whether a file under public/ is there (the song's audio files). */
export function checkDuel(raw: unknown, exists?: (file: string) => boolean): DuelIssue[] {
  const out: DuelIssue[] = [];
  const err = (where: string, message: string): void => void out.push({ level: 'error', where, message });
  const warn = (where: string, message: string): void => void out.push({ level: 'warning', where, message });
  const phases = ((raw as Raw)?.phases ?? []) as Raw[];
  phases.forEach((ph, pi) => {
    const pw = `phase ${pi + 1}`;
    if (typeof ph.bpm !== 'number' || ph.bpm < 40 || ph.bpm > 240) err(pw, 'bpm must be a number between 40 and 240');
    const dmg = ph.damage as Raw | undefined;
    if (!dmg || typeof dmg.perfect !== 'number' || typeof dmg.good !== 'number') err(pw, 'damage needs "perfect" and "good" numbers');
    const secs = (ph.sections ?? []) as Raw[];
    if (!secs.length) err(pw, 'needs at least one section');
    if (ph.encoreFrom !== undefined && (typeof ph.encoreFrom !== 'number' || ph.encoreFrom < 0 || ph.encoreFrom >= secs.length)) err(pw, `encoreFrom must be a section index (0 … ${secs.length - 1})`);
    const A = ph.audio as Raw | undefined;
    if (A !== undefined) {
      if (typeof A.song !== 'string' || typeof A.loop !== 'string') err(pw, 'audio needs "song" and "loop" files');
      else if (exists) for (const f of [A.song, A.loop] as string[]) if (!exists(f)) err(pw, `audio file ${f} not found in public/`);
      if (typeof A.at !== 'number' || A.at < 0) err(pw, 'audio "at" (seconds into the song of the phase\'s beat 0) must be 0 or more');
    }
    let parryable = 0;
    // the cushions as the phase plays on (a sweep covers everything low: one must be up)
    let up = [0, 0];
    secs.forEach((sec, si) => {
      const sw = `${pw}, section ${si + 1} "${String(sec.name ?? '')}"`;
      const beats = sec.beats as number;
      if (typeof beats !== 'number' || beats <= 0) err(sw, 'beats must be a positive number');
      if (sec.loopFrom !== undefined && (typeof sec.loopFrom !== 'number' || sec.loopFrom <= 0 || sec.loopFrom >= beats)) err(sw, `loopFrom (where the refrain starts) must be inside the stanza (1 … ${beats - 1})`);
      const SA = sec.audio as { sung?: unknown; loop?: unknown } | undefined;
      const span = (x: unknown): boolean => Array.isArray(x) && x.length === 2 && typeof x[0] === 'number' && typeof x[1] === 'number' && x[0] >= 0 && x[1] > x[0];
      if (SA !== undefined && (!span(SA.sung) || !span(SA.loop))) err(sw, 'audio needs "sung" and "loop" spans: [start, end] in seconds, end after start');
      if (sec.loopAt !== undefined && (typeof sec.loopAt !== 'number' || sec.loopAt < 0)) err(sw, 'loopAt (seconds into the loop file) must be 0 or more');
      if (sec.until !== undefined && (typeof sec.until !== 'number' || sec.until < 0 || sec.until > 1)) err(sw, '"until" (her spring to move on) must be between 0 and 1');
      // a refrain repeats until her spring is down to the gate: with nothing to send back in it,
      // a player who gets there with too much spring left would hear it for ever
      if (typeof sec.loopFrom === 'number' && sec.loopFrom < beats) {
        const dmg = ph.damage as { perfect?: number; good?: number } | undefined;
        const inRef = ((sec.events ?? []) as Raw[]).filter((e) => typeof e.beat === 'number' && (e.beat as number) >= (sec.loopFrom as number));
        const perPass = inRef.reduce((x, e) => x + (e.type === 'note' ? (dmg?.perfect ?? 0) : e.type === 'minuet' ? 4 * (dmg?.perfect ?? 0) : 0), 0);
        if (perPass <= 0) err(sw, 'the refrain has nothing to send back (no note or minuet): it could loop for ever');
        else if (perPass < 0.08) warn(sw, `the refrain takes only ${perPass.toFixed(3)} of her spring per pass at best: a player stuck there waits a long time`);
      }
      for (const e of [...((sec.events ?? []) as Raw[])].sort((a, b) => (a.beat as number) - (b.beat as number))) {
        const ew = `${sw}, ${String(e.type)} at beat ${String(e.beat)}`;
        if (!TYPES.includes(e.type as string)) {
          err(ew, `unknown event type (known: ${TYPES.join(', ')})`);
          continue;
        }
        if (typeof e.beat !== 'number' || e.beat < 0 || e.beat >= beats) err(ew, `beat must be within the section (0 … ${beats})`);
        if (e.type === 'note') {
          parryable++;
          if (e.from !== undefined && !FROM.includes(e.from as string)) err(ew, `"from" must be one of ${FROM.join(', ')}`);
          if (typeof e.beat === 'number' && e.beat < 3 && si === 0) warn(ew, 'a note needs 3 beats of warning: this one starts before the section does');
        }
        if (e.type === 'moths') parryable += (e.count as number) ?? 1;
        if ((e.type === 'move' || e.type === 'dash') && e.to !== undefined && !SPOTS.includes(e.to as string)) err(ew, `"to" must be one of ${SPOTS.join(', ')}`);
        if (e.type === 'cushions' && (!Array.isArray(e.up) || e.up.some((u) => u !== 0 && u !== 1))) err(ew, '"up" must be a list of 0 / 1 (left, right)');
        else if (e.type === 'cushions') up = [0, 1].map((k) => ((e.up as number[])[k] ?? up[k]));
        if (e.type === 'sweep' && !up.some((u) => u === 1)) err(ew, 'the sweep covers everything low and no cushion is up: there is nowhere to stand');
        if (e.type === 'bourree' && (typeof e.count !== 'number' || e.count < 1 || e.count > 8)) err(ew, '"count" (hops) must be 1 … 8');
        if (e.type === 'pins' && e.dir !== undefined && e.dir !== 1 && e.dir !== -1) err(ew, '"dir" must be 1 or -1');
        if (e.type === 'mirror' && e.out !== undefined && typeof e.out !== 'boolean') err(ew, '"out" must be true or false');
        if (e.every !== undefined && (e.type !== 'minuet' || typeof e.every !== 'number' || e.every < 1 || e.every > 4)) err(ew, '"every" is for the minuet: beats between steps, 1 … 4');
        if (e.gold !== undefined && (e.type !== 'note' || typeof e.gold !== 'boolean')) err(ew, '"gold" is for notes, true or false');
      }
    });
    // a refrain plays over and over: a sweep in it needs a raised cushion on every pass, not
    // only the first
    secs.forEach((sec, si) => {
      const lf = sec.loopFrom as number | undefined;
      if (lf === undefined) return;
      const evs = [...((sec.events ?? []) as Raw[])].sort((a, b) => (a.beat as number) - (b.beat as number));
      let st = [0, 0];
      const apply = (e: Raw): void => {
        if (e.type === 'cushions' && Array.isArray(e.up)) st = [0, 1].map((k) => ((e.up as number[])[k] ?? st[k]));
      };
      // the state when the refrain first starts: everything before it in the phase, then the sung part
      for (const s2 of secs.slice(0, si)) for (const e of [...((s2.events ?? []) as Raw[])].sort((a, b) => (a.beat as number) - (b.beat as number))) apply(e);
      for (const e of evs) if ((e.beat as number) < lf) apply(e);
      for (const e of evs) {
        if ((e.beat as number) < lf) continue;
        apply(e);
      }
      const sw = `${pw}, section ${si + 1} "${String(sec.name ?? '')}"`;
      // second pass: sweeps with the cushions as the first pass left them (raise them inside the
      // refrain if it lowers them)
      st = [...st];
      for (const e of evs) {
        if ((e.beat as number) < lf) continue;
        apply(e);
        if (e.type === 'sweep' && !st.some((u) => u === 1)) err(sw, `the sweep at beat ${String(e.beat)} has no raised cushion when the refrain comes round again`);
      }
    });
    if (parryable === 0) warn(pw, 'nothing to send back: her spring can only run down through the minuet');
  });
  return out;
}
