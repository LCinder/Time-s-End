"""Rebuild smokestack.json from the real song analysis.
Usage: python -I gen_level.py beats.json aligned.json level.json [phase_ms]
"""
import json
import sys

import numpy as np

beats = np.array(json.load(open(sys.argv[1]))["beats"])
aligned = json.load(open(sys.argv[2]))["lines"]
level_path = sys.argv[3]
phase_ms = float(sys.argv[4]) if len(sys.argv) > 4 else 0.0
level = json.load(open(level_path, encoding="utf-8"))

# ── smooth the tracked beats (they are quantised to ~23 ms frames) with a local linear fit
raw = beats.copy()
sm = np.empty_like(raw)
n = len(raw)
W = 12
for k in range(n):
    a, b = max(0, k - W), min(n, k + W + 1)
    ii = np.arange(a, b)
    p = np.polyfit(ii, raw[a:b], 1)
    sm[k] = np.polyval(p, k)
dev = np.abs(sm - raw) * 1000
print(f"smoothing deviation: mean {dev.mean():.1f} ms, max {dev.max():.1f} ms")
beats = sm

# ── tempo map: one point per bar (4 beats), from the smoothed beat times
tempo = []
for k in range(0, len(beats) - 4, 4):
    spb = (beats[k + 4] - beats[k]) / 4
    tempo.append({"beat": k, "bpm": round(60 / spb, 2)})
offset_ms = round(beats[0] * 1000 + phase_ms, 1)

# ── lyrics (skip the unreliable outro line)
fix = {("v2", 0): 146.1}  # "I've" was not recognised
lyrics = []
for li, l in enumerate(aligned):
    if l["section"] == "out":
        continue
    bts = list(l["beats"])
    if l["section"] == "v2" and l["text"].startswith("I've"):
        bts[0] = fix[("v2", 0)]
    start = round(bts[0] * 20) / 20
    at = [max(0.0, round((b - start) * 20) / 20) for b in bts]
    # keep words strictly increasing
    for i in range(1, len(at)):
        if at[i] <= at[i - 1]:
            at[i] = round(at[i - 1] + 0.1, 2)
    lyrics.append({"beat": start, "text": l["text"], "at": at})


def E(type_, beat, **kw):
    d = {"type": type_, "beat": beat}
    d.update(kw)
    return d


events = [
    E("sign", 4, text="JUMP ON THE BEAT!", x=1000),
    E("gap", 12, lengthBeats=1), E("gap", 16, lengthBeats=1), E("gap", 24, lengthBeats=1), E("gap", 28, lengthBeats=1),
    # VERSE 1
    E("gap", 36, lengthBeats=1, comment="VERSE 1"), E("gap", 44, lengthBeats=1), E("gap", 52, lengthBeats=1.5), E("gap", 60, lengthBeats=1),
    E("groundWave", 69, travelBeats=2, comment="TOOT! at 67 -> the wave reaches you on 69"),
    E("coal", 72, count=1, only=["hard"]),
    E("lyricObject", 76, word="BOXCAR", x=760, height=140, lifeBeats=8),
    E("drop", 80, object="boxcar", x="player", telegraphBeats=3),
    E("gap", 86, lengthBeats=1), E("gap", 88, lengthBeats=1),
    E("lyricObject", 93.5, word="COAL", x=820, height=150, lifeBeats=6),
    E("coal", 95, count=3, spacingBeats=1),
    # CHORUS 1
    E("gap", 102, lengthBeats=1, comment="CHORUS 1"), E("gap", 110, lengthBeats=1),
    E("bossLunge", 114, telegraphBeats=2, distance=230),
    E("smokeRing", 118, travelBeats=2), E("smokeRing", 120, travelBeats=2),
    E("gap", 126, lengthBeats=1),
    E("groundWave", 131, travelBeats=2), E("groundWave", 132, travelBeats=2),
    # INTERLUDE
    E("coal", 136, count=3, spacingBeats=1, comment="INTERLUDE"), E("gap", 140, lengthBeats=1), E("gap", 142, lengthBeats=1),
    E("smokeRing", 144, travelBeats=2, only=["hard"]),
    # VERSE 2
    E("gap", 150, lengthBeats=1, comment="VERSE 2"), E("gap", 158, lengthBeats=1),
    E("coal", 160, count=2, spacingBeats=2),
    E("gap", 166, lengthBeats=1),
    E("lyricObject", 171.75, word="TRUNK", x=800, height=150, lifeBeats=8),
    E("drop", 176, object="trunk", x="player", telegraphBeats=3), E("drop", 178, object="trunk", x="player", telegraphBeats=2),
    E("gap", 182, lengthBeats=1),
    E("lyricObject", 187.5, word="PIANO", x=900, height=150, lifeBeats=6),
    E("drop", 192, object="piano", x="player", telegraphBeats=3),
    E("smokeRing", 196, travelBeats=2), E("smokeRing", 198, travelBeats=2), E("smokeRing", 200, travelBeats=2),
    E("gap", 204, lengthBeats=1),
    E("bossLunge", 208, telegraphBeats=2, distance=240),
    # CHORUS 2
    E("gap", 214, lengthBeats=1, comment="CHORUS 2"), E("coal", 216, count=3, spacingBeats=1), E("gap", 222, lengthBeats=1),
    E("bossLunge", 226, telegraphBeats=2, distance=250),
    E("smokeRing", 230, travelBeats=2), E("smokeRing", 232, travelBeats=2),
    E("gap", 238, lengthBeats=1),
    E("groundWave", 243, travelBeats=2), E("groundWave", 244, travelBeats=2),
    # INTERLUDE 2
    E("gap", 248, lengthBeats=1, comment="INTERLUDE 2"), E("gap", 252, lengthBeats=1.5),
    E("coal", 250, count=2, spacingBeats=1, only=["hard"]),
    # BRIDGE - THE TUNNEL
    E("tunnel", 256, lengthBeats=36, comment="BRIDGE - THE TUNNEL"),
    E("gap", 262, lengthBeats=1), E("gap", 270, lengthBeats=1),
    E("gap", 278, lengthBeats=0.5, comment="tick-tick"), E("gap", 280, lengthBeats=0.5), E("gap", 282, lengthBeats=0.5),
    E("lyricObject", 289.25, word="QUICK!", x=900, height=160, lifeBeats=6),
    E("bossLunge", 290, telegraphBeats=2, distance=300),
    # FINAL CHORUS
    E("gap", 300, lengthBeats=1, comment="FINAL CHORUS"), E("smokeRing", 304, travelBeats=2),
    E("coal", 304, count=2, spacingBeats=1, only=["hard"]),
    E("gap", 308, lengthBeats=1), E("smokeRing", 312, travelBeats=2),
    E("sign", 317, text="BRIDGE OUT!", x=1100),
    E("gap", 321, lengthBeats=12, comment="The chasm: the sung words are the stepping stones"),
    E("lyricObject", 321.75, word="BRIDGE", x=560, height=60, lifeBeats=12),
    E("lyricObject", 323.75, word="OUT?!", x=560, height=95, lifeBeats=12),
    E("lyricObject", 325.75, word="NO!", x=560, height=70, lifeBeats=12),
    E("lyricObject", 327.75, word="NO!", x=560, height=105, lifeBeats=12),
    E("lyricObject", 329.75, word="NO!", x=560, height=70, lifeBeats=12),
    E("lyricObject", 331.75, word="NO!", x=560, height=100, lifeBeats=10),
    E("bossFall", 323.75, crashBeat=333.4, comment="Runs on thin air, notices, waves goodbye... KER-RASH!"),
]

level["song"] = {
    "file": "audio/smokestack/song.mp3",
    "offsetMs": offset_ms,
    "beatsPerBar": 4,
    "lengthBeats": 341,
    "tempoMap": tempo,
}
level["lyrics"] = lyrics
level["events"] = events
level["placeholderMusic"]["sections"] = [
    {"name": "intro", "bars": 8, "chords": ["i", "i", "iv", "V7"], "intensity": 1, "train": True, "mood": "dark"},
    {"name": "verse1", "bars": 16, "chords": ["i", "i", "iv", "iv", "i", "i", "II7", "V7"], "intensity": 2},
    {"name": "chorus1", "bars": 8, "chords": ["i", "V7", "V7", "i", "iv", "i", "II7", "V7"], "intensity": 3, "train": True},
    {"name": "interlude1", "bars": 4, "chords": ["i", "iv", "V7", "V7"], "intensity": 2, "train": True},
    {"name": "verse2", "bars": 16, "chords": ["i", "i", "iv", "iv", "i", "i", "II7", "V7"], "intensity": 2},
    {"name": "chorus2", "bars": 8, "chords": ["i", "V7", "V7", "i", "iv", "i", "II7", "V7"], "intensity": 3, "train": True},
    {"name": "interlude2", "bars": 4, "chords": ["i", "iv", "V7", "V7"], "intensity": 2, "train": True},
    {"name": "bridge", "bars": 9, "chords": ["i", "i", "iv", "iv", "i", "i", "V7", "V7", "V7"], "intensity": 1, "train": True, "mood": "dark"},
    {"name": "final", "bars": 11, "chords": ["i", "V7", "V7", "i", "iv", "i", "II7", "V7", "V7", "V7", "i"], "intensity": 3, "train": True},
    {"name": "outro", "bars": 2, "chords": ["i", "i"], "intensity": 1},
]
level["placeholderMusic"]["key"] = "E"


def dump(o):
    # readable formatting: one lyric/event per line, compact tempo map
    lines = ["{"]
    keys = list(o.keys())
    for i, k in enumerate(keys):
        comma = "," if i < len(keys) - 1 else ""
        v = o[k]
        if k in ("lyrics", "events"):
            lines.append(f'  "{k}": [')
            for j, item in enumerate(v):
                c = "," if j < len(v) - 1 else ""
                lines.append("    " + json.dumps(item, ensure_ascii=False) + c)
            lines.append("  ]" + comma)
        elif k == "song":
            lines.append('  "song": {')
            sk = [x for x in v if x != "tempoMap"]
            for x in sk:
                lines.append(f'    "{x}": {json.dumps(v[x])},')
            lines.append('    "tempoMap": [')
            tm = v["tempoMap"]
            for j in range(0, len(tm), 4):
                chunk = ", ".join(json.dumps(t) for t in tm[j : j + 4])
                lines.append("      " + chunk + ("," if j + 4 < len(tm) else ""))
            lines.append("    ]")
            lines.append("  }" + comma)
        elif k == "placeholderMusic":
            lines.append('  "placeholderMusic": {')
            lines.append(f'    "key": {json.dumps(v["key"])},')
            lines.append(f'    "swing": {json.dumps(v["swing"])},')
            lines.append('    "sections": [')
            for j, s in enumerate(v["sections"]):
                lines.append("      " + json.dumps(s) + ("," if j < len(v["sections"]) - 1 else ""))
            lines.append("    ]")
            lines.append("  }" + comma)
        else:
            body = json.dumps(v, ensure_ascii=False, indent=2).replace("\n", "\n  ")
            lines.append(f'  "{k}": {body}{comma}')
    lines.append("}")
    return "\n".join(lines) + "\n"


open(level_path, "w", encoding="utf-8", newline="\n").write(dump(level))
print("offsetMs", offset_ms, "tempo points", len(tempo), "lyrics", len(lyrics), "events", len(events))
