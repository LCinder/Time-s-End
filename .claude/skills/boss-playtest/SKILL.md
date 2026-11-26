---
name: boss-playtest
description: Measure how hard a boss of Time's End is by playing it with autopilots (perfect, human-like and sloppy) and checking it against the game's bar for bosses (implacable, souls-like + Cuphead + Billie Bust Up). Use after any change to a boss level, its attacks or its data (public/data/levels/*.json, src/scenes/DuelScene.ts, ChaseScene events), or when asked whether a boss is too easy, too hard or unfair.
---

# Boss playtest (difficulty)

Time's End bosses must be **implacable**: a souls-like mixed with Cuphead and Billie Bust Up.
That means, for every boss:

- **Clearable by perfect play** — an autopilot hitting every action on the beat wins, and gets
  hit **0 times**. Any hit it takes is a spot to explain: an autopilot mistake, or an unfair
  attack (no way to dodge, a telegraph too short, two answers needed at once that the body can't
  give). Fix unfair attacks; never "fix" by making the boss easier everywhere.
- **Punishing for sloppy play** — ±70 ms timing and 15 % missed reactions must **lose**,
  normally before the last phase. If sloppy play wins, the boss is too easy.
- **A real wall for a decent first-timer** — ±35 ms and 5 % missed should usually lose too
  (people learn the patterns over several tries, like a Souls boss). Winning sometimes is fine.
- **Dense and layered** — each phase adds pressure: more attacks per bar, attacks on top of
  each other (jump and parry on the same beat, notes while the floor is covered, a hunt while
  notes fly), faster tempo. No phase should be a breather except short telegraphed lulls.
- **Fair** — every attack is announced (sound, ring, warning shape) before it lands, follows
  the beat, and has an answer. Three hits for the whole fight; dying restarts the fight.

## Steps

1. Build and run the static checks (both must pass):
   ```bash
   npm run build && npm run check -- --quiet && npm test
   ```
2. Play it. Duels (Miss Pirouette and later duel bosses) use the duel harness. The runs are
   long (a full perfect run takes 15–30 min of real time), so start them **in the background**
   and in parallel, each with its own output folder in the scratchpad:
   ```bash
   node tools/playtest/duel.cjs --level pirouette --mode perfect --out $SCRATCH/pt_perfect > $SCRATCH/pt_perfect.json
   node tools/playtest/duel.cjs --level pirouette --mode human  --seed 1 > $SCRATCH/pt_human1.json
   node tools/playtest/duel.cjs --level pirouette --mode sloppy --seed 1 --out $SCRATCH/pt_sloppy > $SCRATCH/pt_sloppy1.json
   node tools/playtest/duel.cjs --level pirouette --mode sloppy --seed 2 > $SCRATCH/pt_sloppy2.json
   ```
   To look at one phase only: `--phase 2` (0-based) starts at that turn of the key.
   Each run prints a JSON report: `result` (victory / dead / timeout), `phaseReached`,
   `progress` (0–1 of the whole fight), `hitsTaken`, `hurts` (what hit Tick, where and when),
   `deaths`, `errors` (page errors: must be empty).
3. Static density, from the level JSON: for each phase count attacks per 24-beat section,
   how many beats have two answers at once, and the share of beats with nothing happening.
   Compare phases: each must be denser than the one before.
4. Judge against the bar above and write the report (in Spanish for the user):
   - a table: mode → result, phase reached, progress, hits;
   - every hit of the perfect run with its cause (open the death / hurt screenshots);
   - the verdict: **implacable and fair**, **too easy** (say where it lets up), or **unfair**
     (say which attack, at which beat, and why);
   - concrete fixes, in the level JSON first (density, layering, tempo), code second.
5. If you change the boss, run it again. Note the final numbers in MAIN.md (the boss's
   "Probado" line).

## Notes

- The harness runs the real game on a virtual audio clock: results are exact and repeatable
  for a given `--seed`. `--retry` keeps playing after a death (counts tries to win).
- Autopilot mistakes look like hits in odd places (walking into her, jumping late over a
  dash). Check the screenshot before calling an attack unfair, and improve
  `tools/playtest/duel.cjs` when the autopilot is at fault.
- Chase bosses (Old Smokestack) have no autopilot yet: use `npm run check` (its fairness
  report) and the visual review skill; say so in the report.
