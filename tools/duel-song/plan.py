"""Stanza boundaries in game beats for a duel song (edit `parts`, `rates` and the first word
of each stanza for a new song). Writes plan.json for remap.py."""
import json, math
# part grids (quarter-note bpm, a beat on the grid); game beat = 2 quarters
parts = {1: (187.20, 13.040), 2: (188.02, 104.064), 3: (187.38, 181.192)}
rates = {1: 1.0, 2: 1.1, 3: 1.25}
# (name, first word of the stanza) per phase; the phase ends before `end`
phases = {
 1: dict(start=13.040 + 13 * 3 * 60 / 187.20, end=104.56, stanzas=[
   ("Ping, ping, ping", None), ("Watch me twirl!", 46.62), ("Mirror, mirror on the lid", 62.52),
   ("Close the lid... and hush", 83.28), ("Every night for no one", 91.72)]),
 2: dict(start=104.064, end=181.08, stanzas=[
   ("A minuet must have a partner", None), ("Step and step and turn! Now you!", 123.48),
   ("The velvet cushions rise", 139.34), ("THUMP before your eyes", 147.20), ("Oh... you do it too", 162.86)]),
 3: dict(start=181.192, end=246.78, stanzas=[
   ("Faster, faster, spin me round", None), ("Kick! Kick! Kick!", 196.78), ("Fifty years of dust and moths", 211.82),
   ("Bravo! Bravo!", 222.66), ("The audience that never came", 230.34)]),
}
out = {}
for p, P in phases.items():
    bpm, _ = parts[p]; gb = 2 * 60 / bpm
    T = P["start"]
    starts = [T] + [T + math.floor((w - 0.05 - T) / gb) * gb for _, w in P["stanzas"][1:]]
    endb = math.floor((P["end"] - 0.05 - T) / gb)
    bounds = [round((s - T) / gb) for s in starts] + [endb]
    secs = []
    for i, (name, _) in enumerate(P["stanzas"]):
        beats = bounds[i + 1] - bounds[i]
        R = 12 if beats >= 24 else 6
        secs.append(dict(name=name, startBeat=bounds[i], beats=beats, refrain=R, t=T + bounds[i] * gb, tEnd=T + bounds[i + 1] * gb))
    out[p] = dict(t0=T, tEnd=T + endb * gb, gameBpm=bpm / 2, rate=rates[p], bpmInGame=bpm / 2 * rates[p], sections=secs)
    print(f"phase {p}: start {T:.3f} end {T+endb*gb:.3f} game bpm {bpm/2*rates[p]:.2f}")
    for s in secs: print(f"   {s['name'][:32]:32} beats {s['beats']:3}  refrain {s['refrain']}  {s['t']:.2f}-{s['tEnd']:.2f}")
json.dump(out, open("plan.json", "w"), indent=1)
