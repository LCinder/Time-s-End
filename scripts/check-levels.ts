// `npm run check`: validates every JSON file in public/data and runs the
// fairness checker on each level. Exits with code 1 if anything is broken.
//   npm run check -- --quiet         only errors
//   npm run check -- --level <id>    only that level

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkLevel, formatIssue } from '../src/core/levelCheck';
import { checkDuel } from '../src/core/duelCheck';
import { checkPlatformMap } from '../src/core/mapCheck';
import { DataError, validateControls, validateDifficulties, validateDuel, validateGameConfig, validateLevel, validatePlatformLevel, validateStory } from '../src/core/validate';

const root = resolve(import.meta.dirname, '..');
const quiet = process.argv.includes('--quiet');
const levelArg = process.argv.indexOf('--level');
const only = levelArg >= 0 ? process.argv[levelArg + 1] : undefined;
const read = (rel: string): unknown => {
  const file = resolve(root, 'public', rel);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new DataError(rel, [`could not be read as JSON: ${(err as Error).message}`]);
  }
};

let errors = 0;
let warnings = 0;
try {
  const game = validateGameConfig(read('data/config/game.json'));
  const diffs = validateDifficulties(read('data/config/difficulty.json'));
  validateControls(read('data/config/controls.json'));
  console.log('config: game.json, difficulty.json, controls.json OK');

  if (only && !game.levels.includes(only)) throw new DataError('data/config/game.json', [`level "${only}" is not in "levels"`]);
  for (const id of game.levels.filter((l) => !only || l === only)) {
    const rel = `data/levels/${id}.json`;
    let level;
    try {
      level = validateLevel(read(rel), rel);
    } catch (err) {
      if (!(err instanceof DataError)) throw err;
      console.log(`\n${rel}: INVALID`);
      err.problems.forEach((p) => console.log(`  ERROR  ${p}`));
      errors += err.problems.length;
      continue;
    }
    const issues = checkLevel(level, diffs, game.player);
    const e = issues.filter((i) => i.level === 'error').length;
    const w = issues.length - e;
    errors += e;
    warnings += w;
    console.log(`\n${rel}: ${level.events.length} events, ${e} error(s), ${w} warning(s)`);
    for (const i of issues) if (!quiet || i.level === 'error') console.log('  ' + formatIssue(i));
  }

  // the story (chapters) and the platform levels between bosses
  const story = validateStory(read('data/story.json'), 'data/story.json');
  console.log(`\ndata/story.json: ${story.chapters.length} chapter(s) OK`);
  for (const ch of story.chapters) {
    if (!game.levels.includes(ch.feature) && (!only || only === ch.feature)) {
      // not a chase: it must be a duel level of its own
      const rel = `data/levels/${ch.feature}.json`;
      try {
        const raw = read(rel);
        const D = validateDuel(raw, rel);
        const issues = checkDuel(raw, (f) => existsSync(resolve(root, 'public', f)));
        const e = issues.filter((i) => i.level === 'error').length;
        errors += e;
        warnings += issues.length - e;
        console.log(`${rel}: duel, ${D.phases.length} phases, ${e} error(s), ${issues.length - e} warning(s)`);
        for (const i of issues) if (!quiet || i.level === 'error') console.log(`  ${i.level === 'error' ? 'ERROR  ' : 'warning'}  ${i.where}: ${i.message}`);
      } catch (err) {
        if (!(err instanceof DataError)) throw err;
        console.log(`  ERROR  chapter ${ch.id}: feature "${ch.feature}" is neither in game.json "levels" nor a valid duel (${rel})`);
        err.problems.forEach((p) => console.log(`  ERROR  ${p}`));
        errors += 1 + err.problems.length;
      }
    }
    for (const id of ch.interludes.filter((l) => !only || l === only)) {
      const rel = `data/levels/${id}.json`;
      try {
        const P = validatePlatformLevel(read(rel), rel);
        const issues = checkPlatformMap(P, game.player);
        const e = issues.filter((i) => i.level === 'error').length;
        errors += e;
        warnings += issues.length - e;
        const frames = P.map.join('').split('*').length - 1;
        console.log(`${rel}: ${P.kind}, ${P.map[0].length}x${P.map.length} tiles, ${frames} frames, ${e} error(s), ${issues.length - e} warning(s)`);
        for (const i of issues) if (!quiet || i.level === 'error') console.log(`  ${i.level === 'error' ? 'ERROR  ' : 'warning'}  ${i.type.padEnd(11)} ${i.message}`);
      } catch (err) {
        if (!(err instanceof DataError)) throw err;
        console.log(`${rel}: INVALID`);
        err.problems.forEach((p) => console.log(`  ERROR  ${p}`));
        errors += err.problems.length;
      }
    }
    const total = ch.interludes.reduce((n, id) => {
      try {
        return n + ((read(`data/levels/${id}.json`) as { map: string[] }).map.join('').split('*').length - 1);
      } catch {
        return n;
      }
    }, 3 + 2 * ch.minigameFrames); // + the Bijou rafters + minigames
    if (total < ch.framesNeeded) {
      console.log(`  ERROR  chapter ${ch.id}: needs ${ch.framesNeeded} frames but only ${total} exist`);
      errors++;
    } else console.log(`chapter ${ch.id}: ${total} frames to find, ${ch.framesNeeded} needed for the reel`);
  }
} catch (err) {
  if (err instanceof DataError) {
    console.log(`\n${err.file}: INVALID`);
    err.problems.forEach((p) => console.log(`  ERROR  ${p}`));
    process.exit(1);
  }
  throw err;
}
console.log(`\n${errors} error(s), ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);
