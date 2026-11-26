import json, re, sys, difflib
import numpy as np
TR = json.load(open('tracks.json'))
FS = {1: 1.9, 2: 104.064, 3: 181.192}; RATE = {1: 1.0, 2: 1.1, 3: 1.25}
W = [w for s in json.load(open('new_words.json')) for w in s['words']]
txt = open(sys.argv[1]).read().splitlines()
lvl_path = sys.argv[2]
L = json.load(open(lvl_path))
# stanza blocks of lyrics.txt: [header] then lines; skip intro/winding down
blocks = []; cur = None
for ln in txt:
    if ln.startswith('#') or not ln.strip(): continue
    if ln.startswith('['):
        name = ln.strip('[]')
        cur = None if name in ('intro', 'winding down') else []
        if cur is not None: blocks.append(cur)
        continue
    if cur is not None: cur.append(ln.strip())
assert len(blocks) == 15, len(blocks)
norm = lambda w: re.sub(r'[^a-z]', '', w.lower().replace('^', ''))
k = 0
for pi in range(3):
    PN = pi + 1; bt = np.array(TR[str(PN)]['beats']); gb = 0.5
    for si, sec in enumerate(L['phases'][pi]['sections']):
        lines = blocks[k]; k += 1
        a0, a1 = sec['audio']['sung']
        s_idx = float(np.interp(a0, bt, np.arange(len(bt))))
        ps = {'t': a0 * RATE[PN] + FS[PN], 'tEnd': a1 * RATE[PN] + FS[PN]}
        ws = [w for w in W if ps['t'] - 0.6 <= w['s'] < ps['tEnd'] - 0.05]
        # whisper splits "ping-ping" etc: split tokens on hyphens
        heard = []
        for w in ws:
            parts = [p for p in re.split(r'[-\s]+', w['w'].strip()) if norm(p)]
            for j, p in enumerate(parts):
                heard.append((norm(p), w['s'] + j * (w['e'] - w['s']) / max(1, len(parts))))
        toks = []  # (line idx, raw word)
        for li, l in enumerate(lines):
            for raw in l.split():
                for j, p in enumerate(raw.split('-')):
                    if norm(p): toks.append((li, p if j == 0 else p, raw.startswith('^') and j == 0))
        sm = difflib.SequenceMatcher(a=[norm(t[1]) for t in toks], b=[h[0] for h in heard], autojunk=False)
        times = [None] * len(toks)
        for a, b, n in sm.get_matching_blocks():
            for j in range(n): times[a + j] = heard[b + j][1]
        # fill gaps by interpolation (or a quarter beat after the last)
        for i in range(len(times)):
            if times[i] is None:
                prev = next((times[j] for j in range(i - 1, -1, -1) if times[j] is not None), None)
                nxt = next(((j, times[j]) for j in range(i + 1, len(times)) if times[j] is not None), None)
                if prev is not None and nxt: times[i] = prev + (nxt[1] - prev) / (nxt[0] - i + 1)
                elif prev is not None: times[i] = prev + gb * 0.5
                else: times[i] = nxt[1] - gb * 0.5
        beats = [(float(np.interp((t - FS[PN]) / RATE[PN], bt, np.arange(len(bt)))) - s_idx) / 2 for t in times]
        out = []
        for li in range(len(lines)):
            idx = [i for i, t in enumerate(toks) if t[0] == li]
            if not idx: continue
            b0 = round(max(0, beats[idx[0]]), 2)
            words = [('^' if toks[i][2] else '') + toks[i][1].replace('^', '') for i in idx]
            at = [round(max(0, beats[i]) - b0, 2) for i in idx]
            # keep the words in order (whisper can jumble a little)
            for j in range(1, len(at)): at[j] = max(at[j], at[j - 1] + 0.12)
            out.append({'beat': b0, 'text': ' '.join(words), 'at': [round(a, 2) for a in at]})
        matched = sum(t is not None for t in [times[a + j] for a, b, n in sm.get_matching_blocks() for j in range(n)])
        print(f"p{pi+1}s{si} {sec['name'][:26]:26} words {len(toks)} heard-match {sum(n for a,b,n in sm.get_matching_blocks())}  first {out[0]["beat"]} last {out[-1]["beat"]+out[-1]["at"][-1]:.1f} / {sec['beats']}")
        sec['lyrics'] = out
json.dump(L, open(lvl_path, 'w'), indent=2); open(lvl_path, 'a').write('\n')
