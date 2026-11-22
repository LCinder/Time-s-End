"""Word-level timestamps of the sung lyrics with faster-whisper.
Usage: python -I words.py <audio> <out.json> [model]
"""
import json
import sys

from faster_whisper import WhisperModel

path, out = sys.argv[1], sys.argv[2]
model_name = sys.argv[3] if len(sys.argv) > 3 else "small.en"
prompt = (
    "End of the Line. All aboard! Tickets, please. Howdy there, little ticker. Boxcar, coal, trunk, piano, "
    "tunnel, quick, bridge is out, ker-rash. Chugga chugga choo. Toot toot. Tick-tock, little clock."
)
import librosa

audio, _ = librosa.load(path, sr=16000, mono=True)
model = WhisperModel(model_name, device="cpu", compute_type="int8")
segments, info = model.transcribe(
    audio,
    language="en",
    word_timestamps=True,
    vad_filter=False,
    initial_prompt=prompt,
    condition_on_previous_text=True,
    beam_size=5,
)
words = []
for seg in segments:
    print(f"[{seg.start:7.2f} -> {seg.end:7.2f}] {seg.text}", flush=True)
    for w in seg.words or []:
        words.append({"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3), "p": round(w.probability, 3)})
json.dump(words, open(out, "w"), indent=1)
print("words:", len(words))
