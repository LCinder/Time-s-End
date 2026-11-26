"""Turn a recorded duel run into a vertical clip for TikTok / Reels / Shorts.

  1. record (the autopilot plays; 30 frames a second of game time, however slow the machine):
       node tools/playtest/duel.cjs --level pirouette --mode perfect --record <dir> --rec-from 40 --rec-len 25
     (--rec-from: seconds of play after the first turn of the key starts; --phase 1 or 2 to start later)
  2. make the video:
       python3 -I tools/clip/make_clip.py <dir> out.mp4 [--title "TIME'S END"] [--caption "..."] [--wide]
     The soundtrack is rebuilt from the song pieces the game played (same files, offsets, speeds
     and fades), so it is exactly what a player hears, minus the sound effects.
     Default: 1080x1920 (the game in the middle, a title above and a caption below); --wide: 1280x720.

Needs ffmpeg and numpy.
"""
import json, os, subprocess, sys, tempfile
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SR = 44100


def arg(k, d=None):
    return sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d


def decode(path, cache):
    if path not in cache:
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(ROOT, 'public', path), '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
        cache[path] = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2)
    return cache[path]


def soundtrack(clip):
    t0 = clip['start']
    length = clip['frames'] / clip['fps']
    out = np.zeros((int(length * SR) + SR, 2), np.float32)
    cache = {}
    pieces = []
    for p in clip['pieces']:
        if 'stop' in p:
            for q in pieces:
                q['end'] = min(q['end'], p['stop'] + p['len'])
            continue
        pieces.append(dict(p, end=p['when'] + p['dur'] + 0.006))
    for p in pieces:
        a, b = max(p['when'], t0), min(p['end'], t0 + length)
        if b <= a:
            continue
        buf = decode(p['file'], cache)
        n = int((b - a) * SR)
        # positions in the file for each output sample (playbackRate: faster and higher)
        src = (p['offset'] + (a - p['when']) * p['rate'] + np.arange(n) / SR * p['rate']) * SR
        ok = src < len(buf) - 1
        src = src[ok]
        i = src.astype(int)
        f = (src - i)[:, None]
        seg = buf[i] * (1 - f) + buf[i + 1] * f
        env = np.ones(len(seg), np.float32)
        fade = int(0.006 * SR)
        if p['when'] >= t0:
            env[:fade] = np.linspace(0, 1, min(fade, len(env)))
        tail = p['end'] - b
        if tail <= 0.006:
            k = min(fade, len(env))
            env[-k:] *= np.linspace(1, 0, k)
        start = int((a - t0) * SR)
        out[start:start + len(seg)] += seg * env[:, None]
    return out[: int(length * SR)]


def main():
    d, mp4 = sys.argv[1], sys.argv[2]
    clip = json.load(open(os.path.join(d, 'clip.json')))
    audio = soundtrack(clip)
    peak = np.abs(audio).max() or 1
    audio = (audio / max(1.0, peak / 0.95)).astype(np.float32)
    tmp = tempfile.mkdtemp()
    wav = os.path.join(tmp, 'a.f32')
    audio.tofile(wav)
    title = arg('--title', "TIME'S END")
    caption = arg('--caption', 'Miss Pirouette - a boss fight to her own song')
    font = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'
    esc = lambda s: s.replace('\\', '\\\\').replace("'", "’").replace(':', '\\:')
    if '--wide' in sys.argv:
        vf = 'scale=1280:720:flags=lanczos'
    else:
        vf = (
            "scale=1080:608:flags=lanczos,pad=1080:1920:0:656:color=0x0b0b0b,"
            f"drawtext=fontfile={font}:text='{esc(title)}':fontcolor=0xf4efe4:fontsize=96:x=(w-text_w)/2:y=330:borderw=6:bordercolor=black,"
            f"drawtext=fontfile={font}:text='{esc(caption)}':fontcolor=0xf4efe4:fontsize=40:x=(w-text_w)/2:y=1340:borderw=4:bordercolor=black"
        )
    subprocess.run([
        'ffmpeg', '-v', 'error', '-y',
        '-framerate', str(clip['fps']), '-i', os.path.join(d, 'f%05d.png'),
        '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', wav,
        '-vf', vf, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-preset', 'medium',
        '-c:a', 'aac', '-b:a', '192k', '-shortest', mp4,
    ], check=True)
    print(f'{mp4}: {clip["frames"]} frames, {clip["frames"] / clip["fps"]:.1f} s')


if __name__ == '__main__':
    main()
