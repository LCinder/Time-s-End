"""Fit the duel to the song's real beats: stanza cuts on real downbeats, 8-bar loops, events on
the strong beat, lyrics on the warped grid. Writes the level in place."""
import json, sys, numpy as np, librosa
LVL = sys.argv[1]
L = json.load(open(LVL))
T = json.load(open('tracks.json'))
W = [w for s in json.load(open('new_words.json')) for w in s['words']]
FS = {1: 1.9, 2: 104.064, 3: 181.192}; RATE = {1: 1.0, 2: 1.1, 3: 1.25}
FIRST = {1: [31.22, 46.62, 62.52, 83.28, 91.72, 104.56], 2: [None, 123.48, 139.34, 147.20, 162.86, 181.08], 3: [None, 196.78, 211.82, 222.66, 230.34, 246.78]}
HIT = {'note', 'twirl', 'sweep', 'dash', 'pins', 'kicks', 'moths', 'bouquets', 'bourree', 'minuet'}
for p in (1, 2, 3):
    ph = L['phases'][p - 1]
    bt = np.array(T[str(p)]['beats']); v = np.array(T[str(p)]['bass']); n = len(bt)
    ft = lambda t: (t - FS[p]) / RATE[p]
    idx_le = lambda t: int(np.searchsorted(bt, t, side='right') - 1)
    def phase_k(a, b):
        sc = [v[a:b][(np.arange(a, b) % 3) == k].mean() for k in range(3)]
        return int(np.argmax(sc))
    def down_le(t, k):
        i = idx_le(t)
        while i % 3 != k: i -= 1
        return i
    # stanza start indices
    fw = FIRST[p]
    starts = []
    for i in range(5):
        if fw[i] is None:
            k0 = phase_k(0, min(n, 48)); s = k0
        else:
            t = ft(fw[i]); i0 = idx_le(t)
            k = phase_k(max(0, i0 - 6), min(n, i0 + 30))
            s = down_le(t - 0.05, k)
            if p == 1 and i == 0: s -= 18          # six bars of the music box before she sings
        starts.append(s)
    tend = ft(fw[5]); kE = phase_k(max(0, idx_le(tend) - 30), idx_le(tend)); end = down_le(tend - 0.05, kE)
    starts.append(end)
    q = np.median(np.diff(bt[starts[0]:end]))
    spb = 2 * q; bpm = 60 / spb
    ph['bpm'] = round(bpm, 4)
    yl, sr = librosa.load(f'dec_p{p}-loop.wav', sr=22050)
    C = librosa.feature.chroma_cqt(y=yl, sr=sr, hop_length=512); fr = sr / 512
    def seg(t):
        i = int(t * fr); x = C[:, i:i + int(1.0 * fr)].mean(axis=1); return x / (np.linalg.norm(x) + 1e-9)
    print(f'phase {p}: bpm {bpm:.3f}')
    for si, sec in enumerate(ph['sections']):
        s, e = starts[si], starts[si + 1]
        nq = e - s; beats = nq / 2
        Rb = 8 if nq >= 40 else 4; R = Rb * 1.5
        lf = beats - R
        old_b, old_lf = sec['beats'], sec['loopFrom']
        # the loop: Rb bars of the instrumental that join up best with where the next stanza comes in
        k = s % 3
        best = None
        for j in range(max(0, e - Rb * 3 - 60), min(n - Rb * 3 - 1, e - Rb * 3 + 60) + 1):
            if j % 3 != e % 3: continue
            a, b = bt[j], bt[j + Rb * 3]
            sc = min(seg(a) @ seg(bt[e]), seg(b) @ seg(bt[e]), seg(b) @ seg(a)) - 0.004 * abs(j - (e - Rb * 3)) / 3
            if not best or sc > best[0]: best = (sc, j)
        j = best[1]
        sec['audio'] = {'sung': [round(bt[s], 4), round(bt[e], 4)], 'loop': [round(bt[j], 4), round(bt[j + Rb * 3], 4)]}
        sec.pop('loopAt', None)
        # strong beats of this stanza, in its game beats
        downs = [(qq - s) / 2 for qq in range(s, e) if qq % 3 == s % 3]
        quarters = [(qq - s) / 2 for qq in range(s, e)]
        evs = []
        for ev in sec['events']:
            b = ev['beat']
            if b >= old_lf: nb = b - old_lf + lf
            else: nb = b * lf / old_lf if old_lf else b
            ev = dict(ev); ev['beat'] = nb; evs.append(ev)
        # hits land on the strong beat (one per bar where possible; else the nearest free quarter)
        taken = {}
        for ev in sorted(evs, key=lambda x: x['beat']):
            if ev['type'] not in HIT:
                ev['beat'] = round(ev['beat'] * 2) / 2; continue
            limit = lf if ev['beat'] < lf else beats
            lo = 0 if ev['beat'] < lf else lf
            cands = [d for d in downs if lo <= d < limit] or [d for d in quarters if lo <= d < limit]
            key = ev['type'] == 'note'
            for c in sorted(cands, key=lambda d: abs(d - ev['beat'])):
                if not key or taken.get(c, 0) < 1: break
            else:
                c = min((d for d in quarters if lo <= d < limit and taken.get(d, 0) < 1), key=lambda d: abs(d - ev['beat']))
            if key: taken[c] = taken.get(c, 0) + 1
            ev['beat'] = c
            if ev['type'] == 'minuet': ev['every'] = 1.5
        for ev in evs: ev['beat'] = min(ev['beat'], beats - 0.5)
        sec['beats'] = beats; sec['loopFrom'] = lf
        sec['events'] = sorted(evs, key=lambda x: x['beat'])
        # lyrics: each word on the warped grid
        qi = lambda t: np.interp(t, bt, np.arange(n))
        lines = []
        for l in sec.get('lyrics', []):
            pass
        sec['_s'] = s
        print(f"  {sec['name'][:30]:30} beats {beats:5} loopFrom {lf:5} rate {(bt[e]-bt[s])/(beats*spb):.4f} loop seam {best[0]:.2f} downbeat k {s%3}")
    L['phases'][p - 1] = ph
json.dump(L, open(LVL, 'w'), indent=2); open(LVL, 'a').write('\n')
