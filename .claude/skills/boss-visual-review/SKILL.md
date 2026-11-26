---
name: boss-visual-review
description: Look at a boss of Time's End the way a player sees it — capture screenshots of every attack, the boss's poses and its scene, make contact sheets, and review them with vision against the game's art and readability rules (1930s rubber hose, telegraphs, nothing static that should move, no overlaps). Use after any change to a boss's art, puppet, poses, effects or attacks, or when asked how a boss looks.
---

# Boss visual review

The player must read every attack at a glance and the boss must look like a hand-drawn
1930s cartoon (rubber hose, black and white for the 1928 era, super fluid). Screenshots are the
only way to check that: look at them, don't assume.

## Steps

1. Build: `npm run build`.
2. Capture (in the background, in parallel; outputs in the scratchpad):
   - **Every attack in play** (duels):
     ```bash
     node tools/playtest/duel.cjs --level pirouette --mode events --out $SCRATCH/vr_events > $SCRATCH/vr_events.json
     ```
     It saves `ev_<name>.png` the first time each thing is on screen: the warning and the hit
     of each attack (note, highNote, twirlWarn/twirl, sweepWarn/sweep, dash, huntWarn/hunt,
     pins, kicks, moths, bouquets, minuet, hush, twinOut), a parry, Tick hurt, a line she says,
     the wind-up, the victory and the results card. `eventsMissing` lists what never showed up.
   - **The boss's poses**: the puppet viewer, `http://localhost:4173/?puppet=<boss>` (all the
     poses in a grid). Take one screenshot after 6 s, then 8 more 90 ms apart, and crop a
     moving pose (spins, kicks) into a strip to check the motion frame by frame.
   - **Chase bosses**: `?level=<id>&beat=<n>` at each cue mark / set piece (see the test stage
     list in src/scenes/TestScene.ts).
3. Make contact sheets and read them (the Read tool shows images):
   ```bash
   python3 tools/playtest/sheet.py $SCRATCH/vr_attacks.jpg $SCRATCH/vr_events/ev_*.png --cols 3
   ```
4. **Details first — this is a requirement, not a nice-to-have.** The game is meant to be
   sold: a reversed hand or a wrong reflection is a bug as serious as a crash, because players
   notice it at once and it makes the whole game look cheap. Past misses that must never come
   back: gloves on the wrong hands (the train's and the dancer's), a mirror reflection showing
   her face when the mirror is behind her, arms drawn straight across her face. For **every
   character** in the frames, crop and enlarge (PIL, 3–4×) its hands, feet, face and props, and
   check each item, writing down for each one what you checked and what you saw:
   - **Handedness:** for each glove, is it a left or a right hand, seen from the palm or the
     back? With the palm towards us, the thumb points towards the body's middle when the arm is
     raised and away from it when the arm hangs down; with the back towards us it is the other
     way round. Both hands of one figure must agree (both palms or both backs, unless the pose
     says otherwise). Fists and pointing hands too.
   - **Facing:** a character facing us shows its face; seen from behind, hair / back / key. A
     figure in profile has its nose, feet and hands pointing the way it faces.
   - **Mirrors and reflections:** where is the mirror, where is the viewer? A mirror behind a
     figure shows its back, same way round on screen; a mirror beside it shows it mirrored. A
     shadow falls away from the light.
   - **Limbs:** arms and legs leave the body at the shoulders and hips, don't cross the face
     or the body unless the pose wants it, bend at plausible places, feet touch the floor they
     stand on (no floating, no sinking), pointe shoes point down on pointe.
   - **Props in hands:** held by the glove (fingers round them), not floating beside it.
   - **Consistency:** the same character looks the same from frame to frame (sizes, which side
     the key / tiara / curl is on), and the same in the game as in the puppet viewer.
5. Review every image against this checklist and note each problem with its file name:
   - **Telegraphs:** every attack is announced before it lands (ring, shadow, warning shape,
     her pose) and the warning is visible against the background, also in the dark (hush).
   - **Readability:** Tick is always visible; hazards, notes and her body don't hide each
     other; the hit area matches what is drawn (a wave you can see, a body you can touch).
   - **Text:** titles, her speech card, judgements and hints never overlap each other, her
     face, Tick or the HUD; nothing is cut off at the screen edge.
   - **On model:** the boss looks like its sheet (art/<boss>/01.jpg), with gloves and shoes
     the right way round; no part detached, stretched or floating.
   - **Motion:** nothing stays static that should move with the body (e.g. hair that does not
     turn with the head was a real bug: Miss Pirouette's spins are now "paper turns" of the
     whole drawing); no popping between poses; rubber limbs stay smooth.
   - **Style:** 1930s rubber hose, ink lines, film grain; black and white in the 1928 era.
6. Report (in Spanish for the user): first the detail checks (step 4) character by
   character, then the other problems by priority with the frame name, and what looks right.
   Send the contact sheets and the detail crops with SendUserFile. Fix what you can and
   capture again to show the fix.
