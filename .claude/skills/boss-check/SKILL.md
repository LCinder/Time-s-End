---
name: boss-check
description: The full test pass for a boss of Time's End after every step forward on it - static checks and unit tests, then the difficulty playtest and the visual review run in parallel by two agents, and one combined verdict. Use whenever work on a boss (its level data, attacks, puppet, art or scene) reaches a point worth showing, before reporting to the user or publishing the test build.
---

# Boss check (run after every step on a boss)

1. **Static:** `npm run build && npm run check -- --quiet && npm test`. Stop and fix if any
   fails.
2. **In parallel**, launch the two testing agents (Agent tool, background), giving each the
   boss id, what changed, and a scratchpad folder of its own:
   - `boss-difficulty-tester` → follows the `boss-playtest` skill (perfect / human / sloppy
     autopilots, density) and returns the difficulty verdict;
   - `boss-visual-reviewer` → follows the `boss-visual-review` skill (attack screenshots,
     poses, contact sheets read with vision) and returns the visual problems.
   While they run, keep working or wait for their notifications; don't poll.
   (Agent definitions load when a session starts: if those agent types are not offered, launch
   a `general-purpose` agent and tell it to read and follow `.claude/agents/<name>.md`.)
   The playtests share one build and one preview server: build once before launching them, and
   tell the agents not to rebuild while others are running.
3. **Combine** their reports into one verdict for the user (in Spanish):
   - difficulty table and verdict (implacable and fair / too easy / unfair spots);
   - visual problems by priority, with the contact sheets sent via SendUserFile;
   - what you fixed already, and what is left.
4. Fix what they found (data first, then code), and run the parts that changed again.
5. Update MAIN.md: the boss's "Probado" line with the latest numbers, and any rule that
   changed. Then republish the test build if the user follows it there.

The bar for bosses (from the user): **implacable** — a souls-like mixed with Cuphead and
Billie Bust Up. Perfect play wins with no hits; sloppy play loses; a decent first-timer
usually loses and learns the patterns. Three hits for the whole fight; dying restarts it.
