"""Tempo + beat grid analysis of the boss song.
Usage: python -I beats.py <audio> <out.json>
"""
import json
import sys

import librosa
import numpy as np

path, out = sys.argv[1], sys.argv[2]
y, sr = librosa.load(path, sr=22050, mono=True)
dur = len(y) / sr
hop = 512
onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)

result = {"duration": dur}
for start in (132, 66, 100, 120, 144, 160):
    tempo, beats = librosa.beat.beat_track(onset_envelope=onset, sr=sr, hop_length=hop, start_bpm=start, units="time", tightness=200)
    t = float(np.atleast_1d(tempo)[0])
    result[f"tempo_start{start}"] = t

tempo, beats = librosa.beat.beat_track(onset_envelope=onset, sr=sr, hop_length=hop, start_bpm=132, units="time", tightness=400)
beats = np.asarray(beats)
idx = np.arange(len(beats))
# linear fit: time = offset + idx * spb
A = np.vstack([idx, np.ones_like(idx)]).T
spb, off = np.linalg.lstsq(A, beats, rcond=None)[0]
resid = beats - (off + idx * spb)
result.update(
    {
        "beat_count": int(len(beats)),
        "fit_bpm": 60.0 / spb,
        "fit_offset": float(off),
        "resid_ms_max": float(np.max(np.abs(resid)) * 1000),
        "resid_ms_std": float(np.std(resid) * 1000),
        "beats": [round(float(b), 4) for b in beats],
    }
)

# local tempo per 16-beat window (to detect drift / tempo changes)
local = []
for i in range(0, len(beats) - 16, 16):
    seg = beats[i : i + 17]
    local.append({"t": round(float(seg[0]), 2), "bpm": round(60.0 / float(np.mean(np.diff(seg))), 2)})
result["local_bpm"] = local

# loudness per second (to find intro/sections/quiet bridge)
rms = librosa.feature.rms(y=y, hop_length=sr)[0]
result["rms_per_sec"] = [round(float(r), 4) for r in rms]

json.dump(result, open(out, "w"), indent=1)
print(json.dumps({k: v for k, v in result.items() if k not in ("beats", "rms_per_sec", "local_bpm")}, indent=1))
print("local bpm:", [(l["t"], l["bpm"]) for l in local])
