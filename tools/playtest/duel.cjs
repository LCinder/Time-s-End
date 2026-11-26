// Plays a boss duel in a real browser on a virtual clock (fast and repeatable) with an
// autopilot, and reports how it went as JSON. Used by the boss testing skills
// (.claude/skills/boss-playtest, boss-visual-review) — see MAIN.md §11.8.
//
//   node tools/playtest/duel.cjs --mode perfect            the autopilot plays every action on the beat
//   node tools/playtest/duel.cjs --mode sloppy             timing off by ±70 ms, 15 % of reactions missed
//   node tools/playtest/duel.cjs --mode human              ±35 ms, 5 % missed (a decent first-time player)
//   node tools/playtest/duel.cjs --mode events --out dir   screenshots of every kind of attack (for review)
//   options: --level pirouette  --phase 2 (start at the third turn)  --seed 7  --jitter 50  --miss 0.1
//            --max 420 (seconds of game time)  --out dir (screenshots: start, each death, the end)
//            --retry (keep going after a death, like a player would; default: stop at the first death)
//
// It needs `npm run build` first (it serves dist/ with vite preview on :4173).

const { chromium } = require('playwright');
const fs = require('node:fs');
const { ensureServer, URL } = require('./server.cjs');

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const flag = (k) => process.argv.includes(`--${k}`);
const MODE = arg('mode', 'perfect');
const PRESETS = { perfect: [0, 0], human: [35, 0.05], sloppy: [70, 0.15], events: [0, 0] };
const [J0, M0] = PRESETS[MODE] ?? PRESETS.perfect;
const OPT = {
  level: arg('level', 'pirouette'),
  phase: Number(arg('phase', 0)),
  seed: Number(arg('seed', 1)),
  jitter: Number(arg('jitter', J0)),
  miss: Number(arg('miss', M0)),
  max: Number(arg('max', MODE === 'events' ? 260 : 420)),
  out: arg('out', ''),
  retry: flag('retry'),
  // play like a show-off (for clips): always on the move, dashes, somersaults; still perfect
  show: flag('show'),
  // record a clip: frames + the song pieces played (see tools/clip/make_clip.py)
  record: arg('record', ''),
  recFrom: Number(arg('rec-from', 0)),
  recLen: Number(arg('rec-len', 20)),
  fps: Number(arg('fps', 30)),
  events: MODE === 'events',
};

(async () => {
  const stop = await ensureServer();
  if (OPT.out) fs.mkdirSync(OPT.out, { recursive: true });
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // a virtual clock for the audio: the game runs as fast as the machine can render it
  await page.addInitScript(() => {
    const desc = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'currentTime');
    window.__manual = false;
    window.__vt = 0;
    Object.defineProperty(BaseAudioContext.prototype, 'currentTime', {
      configurable: true,
      get() {
        const real = desc.get.call(this);
        if (!window.__manual) return real;
        if (this.__shift === undefined) this.__shift = window.__vt - real;
        return window.__vt - this.__shift;
      },
    });
  });
  // the autopilots have read the cards that explain each new thing (they would stop the game)
  await page.addInitScript(() => localStorage.setItem('timesend.duelTips', JSON.stringify(['note', 'minuet', 'moths', 'mirror', 'gold', 'high', 'sweep', 'pins', 'bouquets'])));
  await page.goto(`${URL}?duel=${OPT.level}`);
  await page.waitForFunction(() => window.game && window.game.scene.isActive('Duel'), null, { timeout: 30000 });
  await page.evaluate((O) => {
    const d = window.game.scene.getScene('Duel');
    const inp = d.input2;
    // a small seeded random, so a run can be repeated exactly
    let s = O.seed * 9301 + 49297;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 0.5;
    const isDown = inp.isDown.bind(inp);
    let holdUntil = 0;
    let goal = null;
    let forced = null; // { x, until }: a move that wins over the rest (getting past her)
    inp.isDown = (a) => {
      if (a === 'jump' && window.__vt * 1000 < holdUntil) return true;
      const g = forced && d.beat < forced.until ? forced.x : goal;
      if (g !== null && (a === 'left' || a === 'right')) {
        const dx = g - d.tick.x;
        if (Math.abs(dx) > 12) return a === (dx > 0 ? 'right' : 'left');
        return false;
      }
      return isDown(a);
    };
    const done = new Set();
    const log = (window.__log = { hurts: [], actions: 0, missed: 0, deaths: [] });
    const h0 = d.hurt.bind(d);
    d.hurt = (src) => {
      if (d.tick.invulnerable <= 0 && d.state === 'play') log.hurts.push({ src, phase: d.phaseIdx, beat: +d.beat.toFixed(2), x: Math.round(d.tick.x), y: Math.round(d.tick.y), herX: Math.round(d.dancer.x) });
      h0(src);
      if (d.state === 'dead') log.deaths.push({ phase: d.phaseIdx, spring: +d.spring.toFixed(3), beat: +d.beat.toFixed(1) });
    };
    // a press at a beat, with the player's timing error, or none at all (a missed reaction)
    const press = (action, b) => {
      log.actions++;
      if (O.miss > 0 && rnd() < O.miss) {
        log.missed++;
        return;
      }
      const C = -d.beatOfPress(0) * d.spb;
      inp.pressed.set(action, b * d.spb + C + (O.jitter ? (gauss() * O.jitter) / 1000 : 0));
      if (action === 'jump') holdUntil = window.__vt * 1000 + 230;
    };
    const jumpAt = (b) => {
      press('jump', b);
      // (showing off: most jumps become a somersault)
      if (O.show && rnd() < 0.65) flipAt = b + 0.3 / d.spb;
    };
    // a second press while in the air: Tick's somersault (longer and further)
    let flipAt = null;
    const somersault = (b) => { flipAt = b; };
    const parryAt = (b) => press('parry', b);
    d.events.on('preupdate', () => {
      if (d.state !== 'play') return;
      const b = d.beat;
      const t = d.tick;
      if (flipAt !== null && b >= flipAt) { flipAt = null; if (!t.onGround) press('jump', b); }
      const cush = d.stage.cushions;
      // 1. floor sweeps: get to a raised cushion and up onto it
      const sw = d.sweeps.find((q) => b > q.from - 3.5 && b < q.to + 0.3);
      if (sw) {
        const ks = [0, 1].filter((k) => cush[k].target > 0.5);
        if (ks.length) {
          const k = ks.sort((p, q) => Math.abs(cush[p].x - t.x) - Math.abs(cush[q].x - t.x))[0];
          goal = cush[k].x;
          if (Math.abs(t.x - goal) < 90 && t.onGround && t.y > 600 && !done.has('cl' + Math.floor(b))) { done.add('cl' + Math.floor(b)); jumpAt(b); }
        }
      } else if (d.minuets.some((m) => b > m.beat - 3 && b < m.beat + 6 * (m.every || 1)) && Math.abs(d.dancer.x - 640) < 60) {
        // 2. the minuet beside her on the turntable (a pas de deux)
        goal = 760;
        if (Math.abs(t.x - 760) < 60 && t.onGround && t.y > 600 && !done.has('tb' + Math.floor(b))) { done.add('tb' + Math.floor(b)); jumpAt(b); }
      } else if (d.bourree && b >= d.bourree.b0 - 1) {
        // 3. her hunt: run from her; when she gets close (or Tick is cornered), leap over her
        //    the moment she lands (she stands still for the second half of each beat)
        const bo = d.bourree;
        const her = d.dancer.x;
        const dist = her - t.x;
        goal = t.x > her || (t.x === her && her < 640) ? 1120 : 160; // run away on his own side of her
        const cornered = (t.x < 250 && dist > 0) || (t.x > 1030 && dist < 0);
        const ph = b - Math.floor(b);
        // (and at once if she is close enough to land on him with her next hop)
        if (t.onGround && ((ph > 0.5 && ph < 0.75 && Math.abs(dist) < (cornered ? 230 : 160)) || Math.abs(dist) < 105) && !done.has('bo' + Math.floor(b))) {
          done.add('bo' + Math.floor(b));
          forced = { x: Math.max(120, Math.min(1160, her + Math.sign(dist || 1) * 200)), until: b + 1.4 };
          jumpAt(b);
          somersault(b + 0.28 / d.spb);
        }
      } else if (d.kicks.length) {
        // 3b. her fouettés sweep 300 px round her: get out of reach (and jump if caught inside)
        // (out on his own side of her: never through her)
        const away = t.x >= d.dancer.x ? Math.min(1150, d.dancer.x + 360) : Math.max(130, d.dancer.x - 360);
        goal = away;
      } else goal = t.y < 600 && !d.flyers.some((n) => n.high && n.state === 'fly') ? (t.x < d.dancer.x ? 340 : 940) : null; // step off the turntable away from her
      // 3c. showing off: never standing still. A new spot every two beats on his side of her,
      //     often with a dash or a hop on the way
      if (O.show && goal === null) {
        const slot = Math.floor(b / 2);
        if (window.__wanderSlot !== slot) {
          window.__wanderSlot = slot;
          const side = t.x < d.dancer.x ? -1 : 1;
          const lo = side < 0 ? 140 : d.dancer.x + 170;
          const hi = side < 0 ? d.dancer.x - 170 : 1140;
          const to = hi > lo ? lo + rnd() * (hi - lo) : t.x;
          window.__wander = to;
          if (Math.abs(to - t.x) > 220 && t.onGround) { t.facing = to > t.x ? 1 : -1; press('dash', b + 0.05); }
          else if (rnd() < 0.35 && t.onGround) jumpAt(b + 0.05);
        }
        goal = window.__wander;
      }
      // 4. never walk into her: hop over when about to touch her
      const toward = goal !== null && Math.sign(goal - t.x) === Math.sign(d.dancer.x - t.x);
      // (on the floor, or up on the turntable with her: wherever his feet are at her level)
      // (the game's contact band: from 90 px above her feet to 40 below)
      const feet = d.dancer.groundY + (d.hopLift || 0);
      const herLevel = t.y > feet - 95 && t.y < feet + 45;
      // (already inside her: get out at once, over her the short way)
      if (Math.abs(d.dancer.x - t.x) < 50 && herLevel && t.onGround && !done.has('out' + Math.floor(b * 2))) {
        done.add('out' + Math.floor(b * 2));
        forced = { x: Math.max(120, Math.min(1160, d.dancer.x + (t.x < d.dancer.x ? -170 : 170))), until: b + 1 };
        jumpAt(b);
      }
      if (toward && Math.abs(d.dancer.x - t.x) < 100 && t.onGround && herLevel && !done.has('ov' + Math.floor(b * 2))) {
        done.add('ov' + Math.floor(b * 2));
        forced = { x: d.dancer.x + (t.x < d.dancer.x ? 150 : -150), until: b + 1 };
        jumpAt(b);
      }
      // 5. notes and moths: high ones need a jump; every one is sent back on its beat
      for (const n of d.flyers) {
        if (n.high && n.state === 'fly' && !done.has('h' + n.arrive)) {
          const at = n.arrive - 0.34 / d.spb;
          if (b >= at - 0.03) { done.add('h' + n.arrive); jumpAt(at); }
        }
        if (n.state === 'fly' && !done.has(n) && b >= n.arrive - 0.03) { done.add(n); parryAt(n.arrive); }
      }
      // 6. the floor hazards: jump them on their beat
      if (d.dash && !done.has('d' + d.dash.b0)) {
        const f = (t.x - d.dash.from) / ((d.dash.to - d.dash.from) || 1);
        if (f > 0 && f < 1.05) { const at = d.dash.b0 + 2 * f - 0.5; if (b >= at) { done.add('d' + d.dash.b0); jumpAt(at); } }
      }
      for (const tw of d.twirls) if (!done.has(tw) && b >= tw.beat - 0.12) { done.add(tw); jumpAt(tw.beat - 0.1); }
      for (const kk of d.kicks) if (!done.has(kk) && b >= kk.beat - 0.2 && Math.abs(t.x - kk.x) < 330 && (t.onGround || kk.beat - (window.__lastKickJump ?? -9) > 1.2)) { done.add(kk); window.__lastKickJump = kk.beat; jumpAt(kk.beat - 0.18); }
      for (const bq of d.bouquets) if (!done.has(bq) && b >= bq.beat - 0.3) { done.add(bq); jumpAt(bq.beat - 0.28); }
      for (const p of d.pins) {
        const f = p.dir > 0 ? (t.x - 100) / 1080 : (1180 - t.x) / 1080;
        const at = p.beat + 4 * f;
        if (!done.has(p) && b >= at - 0.25) { done.add(p); jumpAt(at - 0.22); }
      }
      // 7. the minuet: repeat her three steps
      for (const m of d.minuets) for (let k = 0; k < 3; k++) {
        const at = m.beat + (3 + k) * (m.every || 1);
        const key = at + 'm';
        if (!done.has(key) && b >= at - 0.03) { done.add(key); if (m.steps[k] === 'parry') parryAt(at); else jumpAt(at); }
      }
    });
    // every piece of the song the game schedules (for a recorded clip's soundtrack)
    window.__pieces = [];
    const pp = d.playPiece.bind(d);
    d.playPiece = (file, when, offset, dur, rate = 1) => { window.__pieces.push({ file, when, offset, dur, rate }); pp(file, when, offset, dur, rate); };
    const ss = d.stopSong.bind(d);
    d.stopSong = (windDown, at, len) => { window.__pieces.push({ stop: Math.max(d.bells.context.currentTime, at ?? 0), len: len ?? (windDown ? 0.9 : 0.06) }); ss(windDown, at, len); };
    window.game.loop.sleep();
    window.game.loop.smoothStep = false;
    window.__vt = performance.now() / 1000;
    window.__manual = true;
  }, OPT);

  const STEP = 1 / 20;
  const step = (sec, stepSize = STEP) =>
    page.evaluate(
      ([sec, STEP]) => {
        for (let i = 0; i < Math.max(1, Math.round(sec / STEP)); i++) {
          window.__vt += STEP;
          window.game.loop.step(window.__vt * 1000);
        }
        const d = window.game.scene.getScene('Duel');
        return { state: d.state, phase: d.phaseIdx, spring: d.spring, hits: d.hits, beat: d.beat, phases: d.level.phases.length, lives: d.lives };
      },
      [sec, stepSize],
    );
  const shot = async (name) => { if (OPT.out) await page.screenshot({ path: `${OPT.out}/${name}.png` }); };

  // start at a later turn of the key if asked
  for (let k = 0; k < 200; k++) {
    const st = await step(0.1);
    if (st.state === 'play') break;
  }
  // (the song of the turn it skips is stopped first: a clip must not play two songs at once)
  if (OPT.phase > 0) await page.evaluate((ph) => { const d = window.game.scene.getScene('Duel'); const at = d.t0 + (Math.ceil(d.beat) + 2) * d.spb; d.stopSong(false, at, 0.05); d.startPhase(ph, at); }, OPT.phase);
  await shot('start');

  // events mode: a screenshot the first time each kind of thing is on screen
  const conds = {
    note: "d.flyers.some((n) => n.kind === 'note' && n.state === 'fly' && d.beat > n.arrive - 0.6)",
    parry: "d.flyers.some((n) => n.state === 'back' && d.beat > n.backT0 + 0.2)",
    highNote: "d.flyers.some((n) => n.high && n.state === 'fly' && d.beat > n.arrive - 0.4)",
    twirlWarn: 'd.twirls.some((tw) => d.beat > tw.beat - 1.2 && d.beat < tw.beat - 0.4)',
    twirl: 'd.twirls.some((tw) => Math.abs(d.beat - tw.beat) < 0.1)',
    sweepWarn: 'd.sweeps.some((q) => d.beat > q.from - 1.5 && d.beat < q.from)',
    sweep: 'd.sweeps.some((q) => d.beat > q.from + 1 && d.beat < q.to - 0.5)',
    dash: 'd.dash && d.beat > d.dash.b0 + 0.8',
    huntWarn: 'd.bourree && d.beat > d.bourree.b0 - 0.8 && d.beat < d.bourree.b0',
    hunt: 'd.bourree && d.beat > d.bourree.b0 + 1.3',
    pins: 'd.pins.some((p) => d.beat > p.beat + 1.5)',
    kicks: 'd.kicks.some((k) => Math.abs(d.beat - k.beat) < 0.08)',
    moths: "d.flyers.some((n) => n.kind === 'moth' && n.state === 'fly' && d.beat > n.launch + 0.8)",
    bouquets: 'd.bouquets.some((b) => b.landed < 0 && d.beat > b.beat - 0.5)',
    minuetHer: 'd.minuets.some((m) => d.beat > m.beat + 1.1 && d.beat < m.beat + 2)',
    minuetTick: 'd.minuets.some((m) => d.beat > m.beat + 4.05 * (m.every || 1) && d.beat < m.beat + 4.6 * (m.every || 1))',
    hush: 'd.hush && d.beat > d.hush.from + 2 && d.beat < d.hush.to - 1',
    twinOut: "d.twinOut >= 1 && d.flyers.some((n) => n.src === 'mirror' && n.state === 'fly')",
    windup: "d.state === 'windup'",
    hurt: 'd.tick.invulnerable > 1.2',
    line: 'd.bubble.alpha > 0.95 && d.bubble.scale > 0.98',
    victory: "d.state === 'victory' && d.stateT > 4",
    results: 'd.results && d.stateT > 10.5',
  };
  const got = {};
  let last = null;
  const t0 = Date.now();
  let gameSec = 0;
  let deathsSeen = 0;
  let frame = 0;
  let recStart = null;
  if (OPT.record) fs.mkdirSync(OPT.record, { recursive: true });
  while (gameSec < OPT.max) {
    const recording = OPT.record && gameSec >= OPT.recFrom && gameSec < OPT.recFrom + OPT.recLen;
    const sec = recording ? 1 / OPT.fps : OPT.events ? 0.15 : 1;
    last = await step(sec, recording ? 1 / OPT.fps : STEP);
    gameSec += sec;
    if (recording) {
      if (recStart === null) recStart = await page.evaluate(() => window.game.scene.getScene('Duel').bells.context.currentTime);
      await page.screenshot({ path: `${OPT.record}/f${String(frame++).padStart(5, '0')}.png` });
    } else if (OPT.record && gameSec >= OPT.recFrom + OPT.recLen) {
      const pieces = await page.evaluate(() => window.__pieces);
      fs.writeFileSync(`${OPT.record}/clip.json`, JSON.stringify({ fps: OPT.fps, start: recStart, frames: frame, pieces }, null, 1));
      break;
    }
    if (OPT.events) {
      const hit = await page.evaluate((conds) => {
        const d = window.game.scene.getScene('Duel');
        const out = [];
        for (const [k, c] of Object.entries(conds)) { try { if (eval(c)) out.push(k); } catch { /* not yet */ } }
        return out;
      }, conds);
      for (const k of hit) if (!got[k]) { got[k] = gameSec; await shot(`ev_${k}`); }
      if (Object.keys(got).length === Object.keys(conds).length) break;
    }
    if (last.state === 'dead') {
      deathsSeen++;
      await shot(`death${deathsSeen}`);
      // a life lost: the turn of the key again, as a player would (the game counts the lives)
      if (last.lives > 1) {
        await page.evaluate(() => { const d = window.game.scene.getScene('Duel'); d.stateT = 2; d.retryPhase(); });
        continue;
      }
      if (!OPT.retry || OPT.events) {
        if (OPT.events) {
          // keep going so every kind of thing gets seen: wind it back
          await page.evaluate(() => { const d = window.game.scene.getScene('Duel'); d.stateT = 2; d.retryPhase(); });
          continue;
        }
        break;
      }
      await page.evaluate(() => { const d = window.game.scene.getScene('Duel'); d.stateT = 2; d.retryPhase(); });
    }
    if (last.state === 'victory') {
      await step(11);
      await shot('end');
      break;
    }
  }
  const log = await page.evaluate(() => window.__log);
  const report = {
    level: OPT.level,
    mode: MODE,
    jitterMs: OPT.jitter,
    missRate: OPT.miss,
    seed: OPT.seed,
    result: last.state === 'victory' ? 'victory' : last.state === 'dead' ? 'dead' : 'timeout',
    phaseReached: last.phase + 1,
    springLeft: +last.spring.toFixed(3),
    progress: +((last.phase + (last.state === 'victory' ? 1 : 1 - last.spring)) / last.phases).toFixed(3),
    hitsTaken: log.hurts.length,
    hurts: log.hurts,
    deaths: log.deaths,
    livesLost: deathsSeen,
    actions: log.actions,
    missedOnPurpose: log.missed,
    gameSeconds: Math.round(gameSec),
    realSeconds: Math.round((Date.now() - t0) / 1000),
    eventsSeen: OPT.events ? Object.keys(got) : undefined,
    eventsMissing: OPT.events ? Object.keys(conds).filter((k) => !got[k]) : undefined,
    errors,
  };
  console.log(JSON.stringify(report, null, 1));
  await browser.close();
  stop();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
