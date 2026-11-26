"""For every stanza, find the bars of the instrumental (loop file) that join up best with the
song when its refrain repeats: the loop's first and last bars should sound like (have the same
harmony as) the moment the next stanza comes in. Writes `loopAt` into the level when other bars
than the stanza's own fit better.

  python -I loops.py public/data/levels/pirouette.json <decoded loop wavs dir>
  (the dir holds p1-loop.wav, p2-loop.wav ... decoded from public/audio/<boss>/pN-loop.mp3)
"""
import json, sys, numpy as np, librosa

P, D = sys.argv[1], sys.argv[2]
L = json.load(open(P))
for pi, ph in enumerate(L['phases']):
    y, sr = librosa.load(f'{D}/p{pi+1}-loop.wav', sr=22050)
    C = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=512); fr = sr / 512; dur = len(y) / sr
    def seg(t):
        i = int(t * fr); v = C[:, i:i + int(1.0 * fr)].mean(axis=1); return v / np.linalg.norm(v)
    spb = 60 / ph['bpm']; bar = 1.5 * spb; at = ph['audio']['at']; acc = 0
    lo = at if pi == 0 else 0.3
    for s in ph['sections']:
        R = s['beats'] - s['loopFrom']; N0 = at + (acc + s['beats']) * spb; ln = R * spb
        best = None
        for j in range(-40, 41):
            la = N0 - ln + j * bar
            if la < lo or la + ln > dur - 0.3: continue
            sc = min(seg(la) @ seg(N0), seg(la + ln) @ seg(N0), seg(la + ln) @ seg(la)) - 0.004 * abs(j)
            if not best or sc > best[0]: best = (sc, j, la)
        sc, j, la = best
        print(f"p{pi+1} {s['name'][:30]:30} seam {sc + 0.004*abs(j):.2f} (bars {j:+d})")
        if j: s['loopAt'] = round(la, 4)
        else: s.pop('loopAt', None)
        acc += s['beats']
json.dump(L, open(P, 'w'), indent=2); open(P, 'a').write('\n')
