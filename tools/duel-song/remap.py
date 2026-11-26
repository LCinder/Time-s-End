"""Fit the level's stanzas to the song: beats / loopFrom from plan.json, events moved with them,
bpm and the audio files of each phase.  python -I remap.py level.json out.json"""
import json, math, sys
plan = json.load(open('plan.json'))
W = [w for s in json.load(open('new_words.json')) for w in s['words']]
lvl_path = sys.argv[1]
d = json.load(open(lvl_path))
snap = lambda x: round(x * 2) / 2
for pi, ph in enumerate(d['phases']):
    P = plan[str(pi + 1)]
    gb = 2 * 60 / (P['gameBpm'] * 2)   # orig seconds per game beat
    T = P['t0']
    print(f"\n=== {ph['name']}  bpm {P['bpmInGame']:.2f}")
    for si, (sec, ps) in enumerate(zip(ph['sections'], P['sections'])):
        beats = ps['beats']; R = 12 if beats >= 20 else 6; lf = beats - R
        new = []
        for e in sec['events']:
            b = e['beat']
            if b < 12:
                nb = b + (lf - 12) if lf >= 12 else snap(b * lf / 12)
            else:
                if R == 6 and b >= 18: continue
                nb = b - 12 + lf
            e = dict(e); e['beat'] = nb; new.append(e)
        sec['name'] = ps['name']; sec['beats'] = beats; sec['loopFrom'] = lf; sec['events'] = sorted(new, key=lambda e: e['beat'])
        words = [(round((w['s'] - ps['t']) / gb, 1), w['w'].strip()) for w in W if ps['t'] <= w['s'] < ps['tEnd']]
        print(f"-- {si} {ps['name']}  beats {beats} loopFrom {lf}")
        print('   words:', ' '.join(f"{w}@{b}" for b, w in words))
        print('   events:', ' '.join(f"{e['type']}@{e['beat']}" for e in sec['events']))
    ph['bpm'] = round(P['bpmInGame'], 3)
    ph['audio'] = {'song': f'audio/pirouette/p{pi+1}.mp3', 'loop': f'audio/pirouette/p{pi+1}-loop.mp3', 'at': round(T - (1.9 if pi == 0 else T), 4)}
d['audio'] = {'intro': {'file': 'audio/pirouette/p1.mp3', 'to': round(13.040 - 1.9, 4)}, 'outro': 'audio/pirouette/outro.mp3'}
json.dump(d, open(sys.argv[2], 'w'), indent=2)
