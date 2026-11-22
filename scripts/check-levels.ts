// `npm run check`: validates every JSON file in public/data and runs the
// fairness checker on each level. Exits with code 1 if anything is broken.
//   npm run check -- --quiet         only errors
//   npm run check -- --level <id>    only that level

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkLevel, formatIssue } from '../src/core/levelCheck';
import { DataError, validateControls, validateDifficulties, validateGameConfig, validateLevel } from '../src/core/validate';

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
