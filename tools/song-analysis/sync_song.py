"""Sync a level with its song in ONE command.

    python sync_song.py <level-id> [options]        e.g.  python sync_song.py smokestack

Reads
    public/data/levels/<level-id>.json   ("song.file" says which audio file to use)
    public/<song.file>                   e.g. public/audio/smokestack/song.mp3
    lyrics.txt next to the audio         plain text, see public/audio/smokestack/lyrics.txt

Does
    1. finds the beat grid (librosa) -> tempo map + offset of beat 0
    2. transcribes the vocals with word timings (faster-whisper; cached, so re-runs are fast)
    3. lines up the written lyrics with what was heard (fuzzy, tolerant of mis-heard words)
    4. writes ONLY song.offsetMs, song.tempoMap and lyrics into the level JSON

Events are never touched. Events with an "anchor" (a word of the lyrics) follow their
word automatically when the game loads; the report lists the ones that moved.

Options
    --bpm N          tempo hint when the detected tempo is wrong (double / half time)
    --phase-ms N     fixed phase correction for the beat grid instead of the automatic one
    --model NAME     faster-whisper model (default: small.en)
    --dry-run        print the report, write nothing
    --no-cache       transcribe again even if a cached transcription exists
    --passes 1..3    how many times whisper listens (default 3; 1 is fastest, less reliable)
    --length auto    also set song.lengthBeats to the end of the song (new levels)

Without a lyrics.txt, a DRAFT is written from the transcription to get you started.
The usual way to run all this is `npm run audio -- <boss>` (scripts/audio.ts).
"""
import argparse
import difflib
import hashlib
import json
import re
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
CACHE = Path(__file__).resolve().parent / ".cache"

NUMBERS = {
    "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven",
    "8": "eight", "9": "nine", "10": "ten", "11": "eleven", "12": "twelve", "20": "twenty", "30": "thirty",
    "40": "forty", "50": "fifty", "60": "sixty", "70": "seventy", "80": "eighty", "90": "ninety", "100": "hundred",
}


# ───────────────────────────── lyrics.txt ─────────────────────────────

def parse_lyrics(path):
    """-> list of lines: {section, text, words: [{text, shout, pin}]}"""
    lines, section = [], ""
    for n, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        s = raw.strip()
        if not s or s.startswith("#"):
            continue
        m = re.fullmatch(r"\[(.+)\]", s)
        if m:
            section = m.group(1).strip()
            continue
        words, shown = [], []
        for tok in s.split():
            pin = None
            pm = re.fullmatch(r"(.+?)@(-?\d+(?:\.\d+)?)", tok)
            if pm:
                tok, pin = pm.group(1), float(pm.group(2))
            shout = tok.startswith("^")
            words.append({"text": tok[1:] if shout else tok, "shout": shout, "pin": pin})
            shown.append(tok)
        lines.append({"section": section, "text": " ".join(shown), "words": words, "src_line": n})
    if not lines:
        sys.exit(f"{path}: no lyric lines found")
    return lines


def title_of(path):
    for raw in path.read_text(encoding="utf-8").splitlines():
        s = raw.strip()
        if s.startswith("#") and s.strip("# "):
            return re.split(r"\s+[—-]\s+", s.strip("# "))[0]
    return ""


# ───────────────────────────── tokens ─────────────────────────────

def canon(t):
    t = t.lower().replace("’", "'")
    t = re.sub(r"[^a-z0-9]", "", t)
    t = NUMBERS.get(t, t)
    return re.sub(r"ing$", "in", t)  # runnin' == running


def parts_of(word):
    return [canon(p) for p in re.split(r"[-\s]+", word) if canon(p)]


_sim_cache = {}


def sim(a, b):
    if a == b:
        return 1.0
    k = (a, b)
    if k not in _sim_cache:
        _sim_cache[k] = difflib.SequenceMatcher(None, a, b).ratio()
    return _sim_cache[k]


def align(lyric_tokens, heard_tokens, threshold=0.7):
    """Weighted LCS: keeps the order, pairs tokens that are equal or sound alike.
    Returns {lyric_index: heard_index}."""
    n, m = len(lyric_tokens), len(heard_tokens)
    dp = np.zeros((n + 1, m + 1), dtype=np.float32)
    for i in range(1, n + 1):
        a = lyric_tokens[i - 1]
        row, prev = dp[i], dp[i - 1]
        for j in range(1, m + 1):
            best = prev[j] if prev[j] > row[j - 1] else row[j - 1]
            s = sim(a, heard_tokens[j - 1])
            if s >= threshold and prev[j - 1] + s > best:
                best = prev[j - 1] + s
            row[j] = best
    pairs, i, j = {}, n, m
    while i > 0 and j > 0:
        s = sim(lyric_tokens[i - 1], heard_tokens[j - 1])
        if s >= threshold and abs(dp[i, j] - (dp[i - 1, j - 1] + s)) < 1e-4:
            pairs[i - 1] = j - 1
            i, j = i - 1, j - 1
        elif dp[i - 1, j] >= dp[i, j - 1]:
            i -= 1
        else:
            j -= 1
    return pairs


# ───────────────────────────── audio analysis ─────────────────────────────

def beat_grid(y, sr, bpm_hint):
    import librosa

    hop = 512
    onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    if bpm_hint:
        start = bpm_hint
    else:
        tempo, _ = librosa.beat.beat_track(onset_envelope=onset, sr=sr, hop_length=hop)
        start = float(np.atleast_1d(tempo)[0])
    _, beats = librosa.beat.beat_track(onset_envelope=onset, sr=sr, hop_length=hop, start_bpm=start, units="time", tightness=400)
    raw = np.asarray(beats, dtype=float)
    if len(raw) < 16:
        sys.exit("could not find a steady beat (fewer than 16 beats); try --bpm")
    # tracked beats are quantised to ~23 ms frames: smooth them with a local linear fit
    sm, W = np.empty_like(raw), 12
    for k in range(len(raw)):
        a, b = max(0, k - W), min(len(raw), k + W + 1)
        ii = np.arange(a, b)
        sm[k] = np.polyval(np.polyfit(ii, raw[a:b], 1), k)
    return raw, sm


def auto_phase_ms(y, sr, beats):
    """Median distance from each beat to the nearest drum hit (percussive part only).
    Onsets are taken at the peak of the attack (no backtracking), which is close to
    when the hit is heard."""
    import librosa

    perc = librosa.effects.percussive(y, margin=3.0)
    on = np.asarray(librosa.onset.onset_detect(y=perc, sr=sr, units="time", backtrack=False))
    if len(on) == 0:
        return 0.0, 0
    d = []
    for b in beats:
        k = int(np.argmin(np.abs(on - b)))
        if abs(on[k] - b) < 0.07:
            d.append(on[k] - b)
    return (float(np.median(d)) * 1000 if d else 0.0), len(d)


def transcribe(audio_path, y16, model_name, prompt, use_cache):
    h = hashlib.sha1(audio_path.read_bytes()).hexdigest()[:12]
    ph = hashlib.sha1(prompt.encode()).hexdigest()[:6]
    cache = CACHE / f"{audio_path.stem}-{h}-{model_name}-{ph}.words.json"
    if use_cache and cache.exists():
        print(f"· transcription: cached ({cache.name})")
        return json.loads(cache.read_text(encoding="utf-8"))
    from faster_whisper import WhisperModel

    print(f"· transcribing with faster-whisper '{model_name}' (a few minutes the first time)...", flush=True)
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, _ = model.transcribe(
        y16, language="en", word_timestamps=True, vad_filter=False, initial_prompt=prompt,
        condition_on_previous_text=True, beam_size=5,
    )
    words = []
    for seg in segments:
        print(f"    [{seg.start:7.2f} -> {seg.end:7.2f}] {seg.text}", flush=True)
        for w in seg.words or []:
            words.append({"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3), "p": round(w.probability, 3)})
    CACHE.mkdir(exist_ok=True)
    cache.write_text(json.dumps(words, indent=1), encoding="utf-8")
    return words


def draft_lyrics(heard, boss):
    """A first lyrics.txt from the transcription: a new line at every pause or
    sentence end, a new section at long pauses."""
    out = [
        f"# {boss} — DRAFT written by sync_song.py from what whisper heard.",
        "# Replace it with the real lyrics (one sung line per line), mark shouted words",
        "# with ^ and run the command again. Section names are only for the report.",
        "",
        "[section 1]",
    ]
    line, section, prev_end = [], 1, None
    for w in heard:
        gap = w["s"] - prev_end if prev_end is not None else 0
        if line and (gap > 0.6 or len(line) >= 12):
            out.append(" ".join(line))
            line = []
        if gap > 2.5 and len(out) > 5:
            section += 1
            out += ["", f"[section {section}]"]
        line.append(w["w"])
        prev_end = w["e"]
        if w["w"].endswith((".", "!", "?")) and len(line) >= 3:
            out.append(" ".join(line))
            line = []
    if line:
        out.append(" ".join(line))
    return "\n".join(out) + "\n"


def make_prompts(title, lines):
    """Three different contexts for whisper. Its timings on sung vocals wobble with
    the context, so the song is heard once per prompt and the runs vote (see consensus)."""
    plain = [l["text"].replace("^", "") for l in lines]
    repeated = []
    for t in plain:
        if plain.count(t) > 1 and t not in repeated:
            repeated.append(t)
    shouted = []
    for l in lines:
        for w in l["words"]:
            if w["shout"] and w["text"] not in shouted:
                shouted.append(w["text"])
    mid = len(plain) // 2
    variants = [
        f"{title}. {' '.join(plain[:2])} {', '.join(shouted)}.",              # opening + shouted words
        f"{title}. {' '.join(repeated)} {', '.join(shouted)}.",               # the chorus
        f"{title}. {', '.join(shouted)}. {' '.join(plain[mid:mid + 3])}",     # shouted words + middle of the song
    ]
    return [" ".join(v.split()[:90]) for v in variants]


def consensus(candidates, window=0.25):
    """candidates: [(time, prob)] from the runs that heard the word.
    -> (time, sure) using the biggest group of runs that agree within `window` seconds."""
    if not candidates:
        return None, False
    ts = sorted(candidates)
    best = []
    for i in range(len(ts)):
        group = [c for c in ts[i:] if c[0] - ts[i][0] <= window]
        if len(group) > len(best):
            best = group
    t = float(np.median([c[0] for c in best]))
    p = max(c[1] for c in best)
    sure = (len(best) >= 2 and len(best) * 2 > len(candidates)) or (len(candidates) == 1 and p >= 0.8)
    return t, sure and p >= 0.3


def repair_squashed(disp, times, vocal_on, repeat_gap=0.15, any_gap=0.06):
    """Whisper squashes quick passages ("TOOT! TOOT!", "chugga chugga choo") into a
    burst a few milliseconds apart. A word is "squashed" when it starts less than
    `repeat_gap` s after the same word, or less than `any_gap` s after any word
    (nobody sings two syllables that fast). Each squashed group is spread over the
    vocal onsets that follow it, before the next word. Returns the moved words."""

    def squashed(d):
        if d == 0 or disp[d][0] != disp[d - 1][0]:
            return False
        gap = times[d] - times[d - 1]
        same = canon(disp[d][1]["text"]) == canon(disp[d - 1][1]["text"])
        return gap < (repeat_gap if same else any_gap)

    moved, d = set(), 1
    while d < len(disp):
        if not squashed(d):
            d += 1
            continue
        j = d
        while j + 1 < len(disp) and squashed(j + 1):
            j += 1
        t0 = times[d - 1]
        if j + 1 < len(disp) and disp[j + 1][0] == disp[d][0]:
            limit = times[j + 1] - 0.05
        else:  # group ends the line: it may run until just before the next line
            nxt = times[j + 1] - 0.1 if j + 1 < len(disp) else t0 + 2.0
            limit = min(nxt, t0 + 0.45 * (j - d + 2))
        prev = t0
        for k in range(d, j + 1):
            left = j + 1 - k  # words still to place, including this one
            cand = [t for t in vocal_on if prev + repeat_gap * 0.6 <= t <= limit - (left - 1) * repeat_gap * 0.6]
            if cand:
                times[k] = float(cand[0])
            elif limit - prev > left * 0.1:
                times[k] = prev + (limit - prev) / (left + 1)
            prev = times[k]
            moved.add(k)
        d = j + 1
    return moved


# ───────────────────────────── tempo map maths (same as the game's Conductor) ─────────────────────────────

class TempoMap:
    def __init__(self, points, offset_sec):
        self.offset = offset_sec
        self.seg = []
        sec = 0.0
        for i, p in enumerate(points):
            if i:
                pb, ps, pspb = self.seg[-1]
                sec = ps + (p["beat"] - pb) * pspb
            self.seg.append((p["beat"], sec, 60.0 / p["bpm"]))

    def beat_of_time(self, t):
        s = t - self.offset
        cur = self.seg[0]
        for sg in self.seg:
            if s >= sg[1]:
                cur = sg
        return cur[0] + (s - cur[1]) / cur[2]


# ───────────────────────────── anchors (same rules as src/core/anchors.ts) ─────────────────────────────

def norm_word(w):
    return re.sub(r"[^a-z0-9]", "", w.lower())


def song_words(lyrics):
    out = []
    for l in lyrics:
        raw = l["text"].split()
        at = l.get("at") or [i * l.get("length", 6) / max(1, len(raw)) for i in range(len(raw))]
        for w, a in zip(raw, at):
            out.append((norm_word(w.lstrip("^")), l["beat"] + a))
    return sorted(out, key=lambda x: x[1])


def resolve_anchor(words, e):
    m = re.fullmatch(r"(.*?)(?:#(\d+))?", e["anchor"].strip())
    key, nth = norm_word(m.group(1)), int(m.group(2) or 1)
    hits = [b for w, b in words if w == key]
    if not (1 <= nth <= len(hits)):
        return None
    b = hits[nth - 1] + e.get("afterBeats", 0)
    if e.get("snap"):
        b = round(b / e["snap"]) * e["snap"]
    return round(b, 3)


# ───────────────────────────── level JSON output (keeps the readable layout) ─────────────────────────────

def dump(o):
    out = ["{"]
    keys = list(o.keys())
    for i, k in enumerate(keys):
        comma = "," if i < len(keys) - 1 else ""
        v = o[k]
        if k in ("lyrics", "events"):
            out.append(f'  "{k}": [')
            for j, item in enumerate(v):
                out.append("    " + json.dumps(item, ensure_ascii=False) + ("," if j < len(v) - 1 else ""))
            out.append("  ]" + comma)
        elif k == "song":
            out.append('  "song": {')
            for x in [x for x in v if x != "tempoMap"]:
                out.append(f'    "{x}": {json.dumps(v[x])},')
            out.append('    "tempoMap": [')
            tm = v["tempoMap"]
            for j in range(0, len(tm), 4):
                out.append("      " + ", ".join(json.dumps(t) for t in tm[j : j + 4]) + ("," if j + 4 < len(tm) else ""))
            out.append("    ]")
            out.append("  }" + comma)
        elif k == "placeholderMusic":
            out.append('  "placeholderMusic": {')
            out.append(f'    "key": {json.dumps(v["key"])},')
            out.append(f'    "swing": {json.dumps(v["swing"])},')
            out.append('    "sections": [')
            for j, s in enumerate(v["sections"]):
                out.append("      " + json.dumps(s) + ("," if j < len(v["sections"]) - 1 else ""))
            out.append("    ]")
            out.append("  }" + comma)
        else:
            body = json.dumps(v, ensure_ascii=False, indent=2).replace("\n", "\n  ")
            out.append(f'  "{k}": {body}{comma}')
    out.append("}")
    return "\n".join(out) + "\n"


# ───────────────────────────── main ─────────────────────────────

def main():
    if hasattr(sys.stdout, "reconfigure"):  # Windows consoles: don't choke on the report's symbols
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="Sync a level's tempo map and lyrics with its song.")
    ap.add_argument("level")
    ap.add_argument("--bpm", type=float)
    ap.add_argument("--phase-ms", type=float)
    ap.add_argument("--model", default="small.en")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-cache", action="store_true")
    ap.add_argument("--passes", type=int, default=3, choices=[1, 2, 3])
    ap.add_argument("--length", choices=["keep", "auto"], default="keep")
    args = ap.parse_args()

    level_path = ROOT / "public" / "data" / "levels" / f"{args.level}.json"
    if not level_path.exists():
        sys.exit(f"level not found: {level_path}")
    level = json.loads(level_path.read_text(encoding="utf-8"))
    song_file = level.get("song", {}).get("file")
    if not song_file:
        sys.exit(f'{level_path.name}: "song.file" is empty, so there is no audio to sync with')
    audio = ROOT / "public" / song_file
    lyrics_path = audio.parent / "lyrics.txt"
    if not audio.exists():
        sys.exit(f"missing file: {audio}")

    import librosa

    y, sr = librosa.load(str(audio), sr=22050, mono=True)
    y16 = librosa.resample(y, orig_sr=sr, target_sr=16000)

    draft_run = None
    if not lyrics_path.exists():
        # no lyrics yet: write a draft from what whisper hears, then carry on with it
        heard = transcribe(audio, y16, args.model, f"{level.get('title', '')}.", not args.no_cache)
        if not heard:
            sys.exit("whisper heard no vocals, so no lyrics draft could be written")
        if args.dry_run:
            print("\n(dry run: lyrics.txt is missing; a draft would be written from the transcription)")
            return
        draft_run = heard
        lyrics_path.write_text(draft_lyrics(heard, level.get("subtitle", args.level)), encoding="utf-8", newline="\n")
        print(f"· lyrics.txt was missing: wrote a DRAFT from the transcription -> {lyrics_path.relative_to(ROOT)}")
        print("  Fix it (paste the real lyrics, mark ^SHOUTED words) and run the command again.")
    lines = parse_lyrics(lyrics_path)
    print(f"· level {args.level}: {audio.relative_to(ROOT)} + {lyrics_path.relative_to(ROOT)} ({len(lines)} lines)")

    # 1. beat grid ------------------------------------------------------------
    raw, beats = beat_grid(y, sr, args.bpm)
    if args.phase_ms is not None:
        phase, phase_n = args.phase_ms, -1
    else:
        phase, phase_n = auto_phase_ms(y, sr, beats)
    tempo = [{"beat": k, "bpm": round(60 / ((beats[k + 4] - beats[k]) / 4), 2)} for k in range(0, len(beats) - 4, 4)]
    offset_ms = round(beats[0] * 1000 + phase, 1)
    tmap = TempoMap(tempo, offset_ms / 1000)

    # 2. transcription --------------------------------------------------------
    prompts = make_prompts(title_of(lyrics_path) or level.get("title", ""), lines)[: args.passes]
    runs = [transcribe(audio, y16, args.model, pr, not args.no_cache) for pr in prompts]
    if draft_run is not None:
        runs.append(draft_run)  # the draft's own transcription is one more vote

    # 3. alignment ------------------------------------------------------------
    disp = []  # every written word: (line index, word dict)
    lt, lt_owner = [], []
    for li, l in enumerate(lines):
        for w in l["words"]:
            d = len(disp)
            disp.append((li, w))
            for p in parts_of(w["text"]):
                lt.append(p)
                lt_owner.append(d)
    votes = {}  # written word -> [(time, prob)] one per run that heard it
    for heard in runs:
        ht, ht_time, ht_prob = [], [], []
        for w in heard:
            ps = parts_of(w["w"])
            for k, p in enumerate(ps):
                ht.append(p)
                ht_time.append(w["s"] + k * (w["e"] - w["s"]) / max(1, len(ps)))
                ht_prob.append(w["p"])
        seen = set()
        for li_tok, hj in sorted(align(lt, ht).items()):
            d = lt_owner[li_tok]
            if d not in seen:
                seen.add(d)
                votes.setdefault(d, []).append((ht_time[hj], ht_prob[hj]))
    time_of, unsure = {}, set()
    for d, cands in votes.items():
        t, sure = consensus(cands)
        time_of[d] = t
        if not sure:
            unsure.add(d)

    # snap matched words to the nearest vocal onset (whisper timings are coarse)
    harm = librosa.effects.harmonic(y, margin=3.0)
    vocal_on = np.asarray(librosa.onset.onset_detect(y=harm, sr=sr, units="time", backtrack=False))
    times = {}
    for d, t in time_of.items():
        k = int(np.argmin(np.abs(vocal_on - t))) if len(vocal_on) else 0
        times[d] = float(vocal_on[k]) if len(vocal_on) and abs(vocal_on[k] - t) < 0.15 else t
    # unmatched words: spread them between their matched neighbours
    known = sorted(times.items())
    for d in range(len(disp)):
        if d in times:
            continue
        prev = max((x for x in known if x[0] < d), default=None)
        nxt = min((x for x in known if x[0] > d), default=None)
        if prev and nxt:
            times[d] = prev[1] + (d - prev[0]) / (nxt[0] - prev[0]) * (nxt[1] - prev[1])
        elif prev:
            times[d] = prev[1] + 0.3 * (d - prev[0])
        elif nxt:
            times[d] = nxt[1] - 0.3 * (nxt[0] - d)
        else:
            sys.exit("no lyric word could be matched with the transcription: is lyrics.txt the right song?")

    repaired = repair_squashed(disp, times, vocal_on)
    unsure |= repaired

    # 4. lyric lines in beats -------------------------------------------------
    new_lyrics, report_lines = [], []
    for li, l in enumerate(lines):
        ds = [d for d in range(len(disp)) if disp[d][0] == li]
        bts = []
        for d in ds:
            w = disp[d][1]
            bts.append(w["pin"] if w["pin"] is not None else tmap.beat_of_time(times[d]))
        start = round(bts[0] * 20) / 20
        at = [max(0.0, round((b - start) * 20) / 20) for b in bts]
        for i in range(1, len(at)):
            if at[i] <= at[i - 1]:
                at[i] = round(at[i - 1] + 0.1, 2)
        text = " ".join(("^" if w["shout"] else "") + w["text"] for _, w in (disp[d] for d in ds))
        new_lyrics.append({"beat": start, "text": text, "at": at})
        marks = []
        for d, a in zip(ds, at):
            w = disp[d][1]
            flag = "@" if w["pin"] is not None else ("" if d in time_of else "?")
            if d in unsure and w["pin"] is None:
                flag = "~"
            marks.append(f"{w['text']}{flag}")
        report_lines.append((l["section"], start, marks))

    # ───────── report ─────────
    old_lyrics = level.get("lyrics", [])
    old_song = level["song"]
    matched = len(time_of)
    pinned = sum(1 for _, w in disp if w["pin"] is not None)
    print()
    print("═══ BEAT GRID ═══")
    bpms = [t["bpm"] for t in tempo]
    print(f"  {len(beats)} beats, tempo {min(bpms):.1f}–{max(bpms):.1f} BPM (median {np.median(bpms):.1f})")
    src = "fixed (--phase-ms)" if phase_n < 0 else f"automatic, from {phase_n} drum hits"
    print(f"  phase correction {phase:+.1f} ms ({src})")
    print(f"  beat 0 at {offset_ms:.1f} ms  (was {old_song.get('offsetMs')} ms)")
    old_spb = 60 / old_song["tempoMap"][0]["bpm"]
    shift = (offset_ms - float(old_song.get("offsetMs", 0))) / 1000 / old_spb
    fixed_events = [e for e in level.get("events", []) if "anchor" not in e]
    if abs(shift) > 0.5 and fixed_events:
        print(f"  !! beat 0 moved by {shift:+.2f} beats: events with a plain \"beat\" number will be off by about")
        print(f"     {round(shift):+d} beats. Anchored events are fine. Check the start of the level!")
    if args.length == "auto":
        level["song"]["lengthBeats"] = int(len(beats) - 1)
        print(f"  lengthBeats set to {level['song']['lengthBeats']} (the end of the song)")
    elif level["song"]["lengthBeats"] > len(beats) + 8:
        print(f"  !! lengthBeats is {level['song']['lengthBeats']} but the song only has ~{len(beats)} beats")

    print()
    print(f"═══ LYRICS ═══  {matched}/{len(disp)} words heard ({len(unsure)} unsure), {pinned} pinned with @, {len(disp) - matched} never heard")
    print(f"  heard {len(runs)} times with different context; ? = never heard (placed between its neighbours),")
    print("  ~ = unsure (the runs disagree or whisper was not confident), @ = pinned")
    last_sec = None
    for (sec, start, marks), old in zip(report_lines, old_lyrics + [None] * len(report_lines)):
        if sec != last_sec:
            print(f"  [{sec}]")
            last_sec = sec
        moved = ""
        if old and abs(old["beat"] - start) >= 0.05:
            moved = f"   (was {old['beat']})"
        print(f"    {start:7.2f}  {' '.join(marks)}{moved}")
    bad = [(s, st, m) for s, st, m in report_lines if sum(1 for x in m if x.endswith("?")) > len(m) / 2]
    if bad:
        print("  !! lines mostly guessed (check them, or pin a word with @beat):")
        for s, st, m in bad:
            print(f"     beat {st:.2f}: {' '.join(m)}")

    anchored = [e for e in level.get("events", []) if "anchor" in e]
    if anchored:
        ow, nw = song_words(old_lyrics), song_words(new_lyrics)
        print()
        print("═══ ANCHORED EVENTS ═══")
        moved = 0
        for e in anchored:
            a, b = resolve_anchor(ow, e), resolve_anchor(nw, e)
            if b is None:
                print(f"  !! {e['type']} anchored to \"{e['anchor']}\": that word is no longer in the lyrics")
            elif a != b:
                moved += 1
                print(f"  {e['type']:<12} {e['anchor']:<10} beat {a} -> {b}")
        if not moved:
            print(f"  all {len(anchored)} anchored events stay where they were")

    if args.dry_run:
        print("\n(dry run: nothing written)")
        return
    level["song"]["offsetMs"] = offset_ms
    level["song"]["tempoMap"] = tempo
    level["lyrics"] = new_lyrics
    level_path.write_text(dump(level), encoding="utf-8", newline="\n")
    print(f"\n✔ wrote {level_path.relative_to(ROOT)}  (offsetMs, tempoMap, lyrics). Run `npm run check` next.")


if __name__ == "__main__":
    main()
