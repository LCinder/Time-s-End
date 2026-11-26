"""Every sung word with its time (faster-whisper).  python -I words.py song16k.wav small.en words.json"""
import sys, json
from faster_whisper import WhisperModel
m = WhisperModel(sys.argv[2] if len(sys.argv)>2 else "small.en", device="cpu", compute_type="int8")
import soundfile as sf; a,_=sf.read(sys.argv[1],dtype="float32"); segs, info = m.transcribe(a, word_timestamps=True, vad_filter=False, beam_size=5,
    initial_prompt="One-two-three, I have danced since nineteen-two. Mirror, mirror on the lid. Click, click, click! Wind me up again! A minuet must have a partner. STEP and STEP and TURN! Now you! Kick! Kick! Kick! Bravo!")
out=[]
for s in segs:
    out.append({"start":s.start,"end":s.end,"text":s.text,"words":[{"w":w.word,"s":w.start,"e":w.end,"p":w.probability} for w in s.words]})
    print(f"{s.start:7.2f} {s.end:7.2f} {s.text}", flush=True)
json.dump(out, open(sys.argv[3],"w"), indent=1)
