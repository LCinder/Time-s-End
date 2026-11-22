"""Align the intended lyric lines with whisper word timings and the beat grid.
Usage: python -I align.py beats.json words.json out.json
"""
import difflib
import json
import re
import sys

import numpy as np

beats_d = json.load(open(sys.argv[1]))
words = json.load(open(sys.argv[2]))
B = np.array(beats_d["beats"])

LINES = [
    ("intro", "All aboard!"),
    ("intro", "Tickets, please..."),
    ("v1", "Well, howdy there, little ticker, ain't you runnin' kinda slow?"),
    ("v1", "I'm the meanest hunk of iron on the midnight railroad!"),
    ("v1", "Got a furnace in my belly and a whistle in my throat,"),
    ("v1", "So listen close, my little clock, here comes my favorite note... ^TOOT!"),
    ("v1", "Now wouldn't it be a pity? Wouldn't it be a crime,"),
    ("v1", "If a ^BOXCAR came a-tumblin' down and flattened you in time?"),
    ("v1", "And wouldn't it be tragic? Wouldn't it be grim,"),
    ("v1", "If a pile of burnin' ^COAL came a-hoppin' on your limbs?"),
    ("c1", "It's the end of the line! Chugga chugga choo! Chugga chugga choo!"),
    ("c1", "The end of the line! I'm comin' for you!"),
    ("c1", "Tick-tock, little clock, your ticket's overdue,"),
    ("c1", "It's the end of the line! ^TOOT! ^TOOT! Choo-choo!"),
    ("v2", "I've flattened forty pocket-watches, sixty cuckoo clocks,"),
    ("v2", "I ran down a grandfather and I crushed his tick-a-tocks!"),
    ("v2", "So wouldn't it be dreadful? Wouldn't it be sad,"),
    ("v2", "If a ^TRUNK fell off the luggage rack? Golly, that'd be bad!"),
    ("v2", "And wouldn't it be awful? Wouldn't it be cruel,"),
    ("v2", "If a ^PIANO from the freight car played your funeral, you fool?"),
    ("v2", "I'll derail your little gears, kid, I'll unwind your spring,"),
    ("v2", "'Cause a watch ain't worth a nickel when it's lost its ting-a-ling!"),
    ("c2", "It's the end of the line! Chugga chugga choo! Chugga chugga choo!"),
    ("c2", "The end of the line! I'm comin' for you!"),
    ("c2", "Tick-tock, little clock, your ticket's overdue,"),
    ("c2", "It's the end of the line! ^TOOT! ^TOOT! Choo-choo!"),
    ("br", "Here comes the tunnel... and it's dark as tar..."),
    ("br", "Can't see the tracks, kid... can't see how far..."),
    ("br", "But I can hear you tick-tick, tick-tick, tick-tick..."),
    ("br", "So run, little ticker, 'cause I'm comin' up ^QUICK!"),
    ("c3", "And it's the end of the line! Chugga chugga choo! Chugga chugga choo!"),
    ("c3", "The end of the line! I'm almost onto you!"),
    ("c3", "Tick-tock, little clock, your time is... wait... what's ^THAT?!"),
    ("c3", "The ^BRIDGE is ^OUT?! Oh no, no, no, no... ^KER-RASH!"),
    ("out", "It's the end of the line!"),
]

ALIAS = {"tugga": "chugga", "truck": "trunk", "correct": "kerrash", "40": "forty", "60": "sixty", "attacks": "tocks",
         "running": "runnin", "coming": "comin", "burning": "burnin", "tumbling": "tumblin", "hopping": "hoppin",
         "flatten": "flattened", "on": "on", "tingling": "tingaling"}


def norm(t):
    t = t.lower().replace("’", "'")
    t = re.sub(r"[^a-z0-9']", "", t).strip("'")
    return ALIAS.get(t, t)


# whisper tokens (split hyphens)
wt = []
for w in words:
    parts = [p for p in re.split(r"[-\s]+", w["w"]) if norm(p)]
    for k, p in enumerate(parts):
        span = (w["e"] - w["s"]) / max(1, len(parts))
        wt.append((norm(p), w["s"] + k * span))

# lyric tokens: (display word index, token)
disp = []  # (line_idx, word_idx, display_text, shout)
lt = []  # (token, disp_idx)
for li, (_, text) in enumerate(LINES):
    for wi, raw in enumerate(text.split()):
        shout = raw.startswith("^")
        d = len(disp)
        disp.append((li, wi, raw[1:] if shout else raw, shout))
        joined = norm(raw.lstrip("^").replace("-", ""))
        parts = [joined] if joined == "kerrash" else [p for p in re.split(r"[-]+", raw.lstrip("^")) if norm(p)]
        for p in parts:
            lt.append((norm(p), d))

sm = difflib.SequenceMatcher(a=[t for t, _ in lt], b=[t for t, _ in wt], autojunk=False)
time_of = {}
for a, b, n in sm.get_matching_blocks():
    for k in range(n):
        d = lt[a + k][1]
        if d not in time_of:
            time_of[d] = wt[b + k][1]

# interpolate unmatched display words
known = sorted(time_of.items())
times = []
for d in range(len(disp)):
    if d in time_of:
        times.append(time_of[d])
        continue
    prev = max((x for x in known if x[0] < d), default=None, key=lambda x: x[0])
    nxt = min((x for x in known if x[0] > d), default=None, key=lambda x: x[0])
    if prev and nxt:
        f = (d - prev[0]) / (nxt[0] - prev[0])
        times.append(prev[1] + f * (nxt[1] - prev[1]))
    elif prev:
        times.append(prev[1] + 0.3 * (d - prev[0]))
    else:
        times.append(nxt[1] - 0.3 * (nxt[0] - d))

# refine matched word starts: snap to the nearest vocal onset within 150 ms
if len(sys.argv) > 4:
    import librosa

    y, sr = librosa.load(sys.argv[4], sr=22050, mono=True)
    harm = librosa.effects.harmonic(y, margin=3.0)
    on = librosa.onset.onset_detect(y=harm, sr=sr, units="time", backtrack=False)
    on = np.asarray(on)
    snapped = 0
    for d in list(time_of):
        t = times[d]
        k = np.argmin(np.abs(on - t))
        if abs(on[k] - t) < 0.15:
            times[d] = float(on[k])
            snapped += 1
    print(f"snapped {snapped} words to vocal onsets")

idx = np.arange(len(B))


def t2b(t):
    # fractional beat index from time (extrapolate linearly at the ends)
    if t <= B[0]:
        return (t - B[0]) / (B[1] - B[0])
    if t >= B[-1]:
        return len(B) - 1 + (t - B[-1]) / (B[-1] - B[-2])
    return float(np.interp(t, B, idx))


out_lines = []
matched = len(time_of)
for li, (sec, text) in enumerate(LINES):
    ds = [d for d in range(len(disp)) if disp[d][0] == li]
    bts = [t2b(times[d]) for d in ds]
    out_lines.append({"section": sec, "text": text, "beats": [round(b, 2) for b in bts], "times": [round(times[d], 2) for d in ds],
                      "matched": [d in time_of for d in ds]})

json.dump({"lines": out_lines}, open(sys.argv[3], "w"), indent=1)
print(f"matched {matched}/{len(disp)} display words")
for l in out_lines:
    ws = l["text"].split()
    s = "  ".join(f"{w}@{b:.2f}{'' if m else '?'}" for w, b, m in zip(ws, l["beats"], l["matched"]))
    print(f"[{l['section']}] {s}")
