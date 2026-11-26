"""Cut a character pose sheet (e.g. made with an image AI) into game-ready frames.

    python tools/art/slice_sheet.py <boss>          (normally via `npm run art -- <boss>`)

Reads art/<boss>/art.json:
    {
      "sheet": "sheet.png",          the sheet, next to art.json (white background)
      "order": "rows" | "columns",   how the poses are laid out (reading order)
      "poses": ["sneer", "sing", ...] one name per pose, in that order
      "anchors": { "face": [x, y, r], "chimney": [x, y], ... }   optional overrides
    }

Writes public/art/<boss>/:
    <pose>_0.png, <pose>_1.png, <pose>_2.png   the pose on a transparent background,
                                               all on the same canvas and lined up on
                                               the wheels, plus two "line boil" copies
                                               with a tiny hand-drawn wobble
    manifest.json                              canvas size, pose list and anchor points
                                               (face, mouth, eyes, chimney, lamp, ground)

A sheet of separate PARTS for a puppet ("type": "parts") works too:
    {
      "type": "parts",
      "sheet": "parts.jpg",
      "scale": 2,                                   enlarge every part (smoother when shown big)
      "parts": { "body": [380, 260], "hat": [772, 130], ... },   a point inside each part
      "anchors": { "face": [576, 243, 41, 64], "wheels": [[182, 358, 58], ...], ... },
      "flip": ["gloveFist"]                         parts to mirror: the three gloves must have
                                                    the thumb on the right (a left hand, palm out)
    }
  Writes public/art/<boss>/<part>.png and a manifest with every part's size and the
  anchors moved into the body picture's own pixels.

Only needs Pillow and numpy.
"""

from __future__ import annotations

import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
INK_LEVEL = 215  # darker than this = part of a drawing
WHITE_LEVEL = 232  # lighter than this and touching the outside = background


def fail(msg: str) -> None:
    print(f"\n✗ {msg}\n", file=sys.stderr)
    sys.exit(1)


def dilate(mask: np.ndarray, r: int) -> np.ndarray:
    out = mask.copy()
    for _ in range(r):
        m = out.copy()
        m[1:, :] |= out[:-1, :]
        m[:-1, :] |= out[1:, :]
        m[:, 1:] |= out[:, :-1]
        m[:, :-1] |= out[:, 1:]
        out = m
    return out


def label(mask: np.ndarray) -> tuple[np.ndarray, int]:
    """4-connected components (plain BFS: the masks here are small)."""
    lab = np.zeros(mask.shape, dtype=np.int32)
    h, w = mask.shape
    n = 0
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys, xs):
        if lab[y0, x0]:
            continue
        n += 1
        lab[y0, x0] = n
        q = deque([(y0, x0)])
        while q:
            y, x = q.popleft()
            for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = n
                    q.append((yy, xx))
    return lab, n


def flood_from_border(passable: np.ndarray) -> np.ndarray:
    """Pixels of `passable` reachable from the image border."""
    h, w = passable.shape
    seen = np.zeros_like(passable)
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
            if passable[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if passable[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= yy < h and 0 <= xx < w and passable[yy, xx] and not seen[yy, xx]:
                seen[yy, xx] = True
                q.append((yy, xx))
    return seen


def find_poses(lum: np.ndarray, count: int, order: str) -> list[tuple[int, int, int, int, np.ndarray]]:
    """Bounding boxes (x0, y0, x1, y1) and masks of the `count` poses, in reading order.

    Poses that touch (a pointing finger reaching the next pose) are told apart by their
    darkest lines: lowering the ink threshold until there are `count` separate drawings
    gives one "seed" per pose; every other pixel then goes to the seed it is joined to.
    """
    small = lum[::2, ::2]
    for th in range(200, 59, -10):
        lab, n = label(dilate(small < th, 1) if th < 150 else small < th)
        sizes = np.bincount(lab.ravel())
        sizes[0] = 0
        top = np.argsort(sizes)[::-1][:count]
        if n >= count and sizes[top[-1]] > sizes[top[0]] * 0.3:
            break
    else:
        fail(f"could not find {count} separate poses. Leave more white space between the poses.")
    region = dilate(small < INK_LEVEL, 3)
    owner = np.zeros(small.shape, dtype=np.int32)
    q: deque[tuple[int, int]] = deque()
    for i, comp in enumerate(top):
        ys, xs = np.nonzero(lab == comp)
        owner[ys, xs] = i + 1
        q.extend(zip(ys.tolist(), xs.tolist()))
    h, w = small.shape
    while q:  # grow every seed through the drawing (first come, first served)
        y, x = q.popleft()
        o = owner[y, x]
        for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= yy < h and 0 <= xx < w and region[yy, xx] and not owner[yy, xx]:
                owner[yy, xx] = o
                q.append((yy, xx))
    # loose bits (sweat drops, motion lines) go with the nearest pose
    points = [np.argwhere(owner == i + 1)[::5] for i in range(count)]
    blab, bn = label(region & (owner == 0))
    for c in range(1, bn + 1):
        bit = blab == c
        cy, cx = np.argwhere(bit).mean(axis=0)
        dist = [float((((p - [cy, cx]) ** 2).sum(axis=1)).min()) for p in points]
        owner[bit] = int(np.argmin(dist)) + 1

    def bbox(m: np.ndarray) -> tuple[int, int, int, int]:
        yy, xx = np.nonzero(m)
        return int(xx.min()), int(yy.min()), int(xx.max()) + 1, int(yy.max()) + 1

    # reading order: cluster into rows (or columns) first
    items = [(*bbox(owner == i + 1), i + 1) for i in range(count)]
    key_major = 1 if order == "rows" else 0
    items.sort(key=lambda b: (b[key_major] + b[key_major + 2]) / 2)
    groups: list[list] = []
    for b in items:
        c = (b[key_major] + b[key_major + 2]) / 2
        size = b[key_major + 2] - b[key_major]
        if groups and abs(c - groups[-1][0]) < size * 0.5:
            groups[-1][1].append(b)
        else:
            groups.append([c, [b]])
    minor = 0 if order == "rows" else 1
    ordered = [b for _, g in groups for b in sorted(g, key=lambda b: b[minor])]
    full = np.kron(owner, np.ones((2, 2), dtype=np.int32))[: lum.shape[0], : lum.shape[1]]
    return [(x0 * 2, y0 * 2, x1 * 2, y1 * 2, dilate(full == i, 2)) for x0, y0, x1, y1, i in ordered]


def cut_out(rgb: np.ndarray, lum: np.ndarray, own: np.ndarray) -> np.ndarray:
    """RGBA: background (white reachable from outside, or another pose) made transparent, soft edges."""
    own = ~flood_from_border(~own)  # holes inside the drawing (white windows, gloves) belong to it
    passable = (lum >= WHITE_LEVEL) | ~own
    bg = flood_from_border(passable) | ~own
    alpha = np.where(bg, 0.0, 1.0)
    # anti-aliased rim: light pixels next to the background fade out, ink colour un-blended from white
    rim = dilate(bg, 2) & ~bg
    soft = rim & (lum > 120)
    a = np.clip((255.0 - lum) / (255.0 - 120.0), 0.0, 1.0)
    alpha = np.where(soft, a, alpha)
    out = rgb.astype(np.float64)
    safe = np.maximum(alpha, 1e-3)[..., None]
    unblended = np.clip((out - 255.0 * (1.0 - alpha[..., None])) / safe, 0, 255)
    out = np.where(soft[..., None], unblended, out)
    return np.dstack([out, alpha * 255.0]).astype(np.uint8)


def ink_profile(rgba: np.ndarray, band: float) -> tuple[np.ndarray, int]:
    """Column profile of the opaque pixels in the lowest `band` of the drawing, and its bottom row."""
    a = rgba[..., 3] > 128
    rows = np.nonzero(a.any(axis=1))[0]
    bottom = int(rows.max())
    top = int(bottom - (bottom - rows.min()) * band)
    return a[top : bottom + 1].sum(axis=0).astype(np.float64), bottom


def best_shift(ref: np.ndarray, cur: np.ndarray, max_shift: int) -> int:
    """Horizontal shift that lines `cur` up with `ref` (cross-correlation)."""
    best, best_s = -1.0, 0
    n = max(len(ref), len(cur)) + 2 * max_shift
    r = np.zeros(n)
    r[max_shift : max_shift + len(ref)] = ref
    for s in range(-max_shift, max_shift + 1):
        c = np.zeros(n)
        start = max_shift + s
        if start < 0 or start + len(cur) > n:
            continue
        c[start : start + len(cur)] = cur
        score = float((r * c).sum())
        if score > best:
            best, best_s = score, s
    return best_s


def boil(rgba: np.ndarray, seed: int, amp: float = 0.8) -> np.ndarray:
    """A copy with a smooth sub-pixel wobble, like the line boil of hand-inked cels."""
    h, w = rgba.shape[:2]
    rng = np.random.default_rng(seed)
    gy, gx = max(2, h // 40), max(2, w // 40)
    def field() -> np.ndarray:
        coarse = rng.uniform(-amp, amp, (gy, gx)).astype(np.float32)
        return np.array(Image.fromarray(coarse, mode="F").resize((w, h), Image.BICUBIC))
    dx, dy = field(), field()
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    sx = np.clip(xx + dx, 0, w - 1.001)
    sy = np.clip(yy + dy, 0, h - 1.001)
    x0, y0 = sx.astype(np.int32), sy.astype(np.int32)
    fx, fy = (sx - x0)[..., None], (sy - y0)[..., None]
    src = rgba.astype(np.float32)
    top = src[y0, x0] * (1 - fx) + src[y0, x0 + 1] * fx
    bot = src[y0 + 1, x0] * (1 - fx) + src[y0 + 1, x0 + 1] * fx
    return np.clip(top * (1 - fy) + bot * fy, 0, 255).astype(np.uint8)


def find_face(rgba: np.ndarray, lum: np.ndarray, facing: str) -> tuple[int, int, int]:
    """The face: the biggest roughly round light area towards the front of the body."""
    h, w = lum.shape
    light = (lum > 165) & (rgba[..., 3] > 200)
    lab, n = label(light[::2, ::2])
    best, best_score = None, 0.0
    for comp in range(1, n + 1):
        yy, xx = np.nonzero(lab == comp)
        if len(yy) < 60:
            continue
        bw, bh = int(np.ptp(xx)) + 1, int(np.ptp(yy)) + 1
        aspect = bw / bh
        if not 0.7 < aspect < 1.4:
            continue
        cx = (xx.min() + xx.max()) / 2 * 2
        front = cx / w if facing == "right" else 1 - cx / w
        score = len(yy) * (0.5 + front)
        if score > best_score:
            best_score = score
            best = (int(cx), int((yy.min() + yy.max())), int(max(bw, bh)))
    if best is None:
        fail("could not find the face (a big round light area). Add \"anchors\": {\"face\": [x, y, r]} to art.json.")
    return best


def ncc_map(img: np.ndarray, tpl: np.ndarray) -> np.ndarray:
    """Normalised cross-correlation of a template over an image (FFT), top-left indexed."""
    H, W = img.shape
    h, w = tpl.shape
    t = tpl - tpl.mean()
    tn = np.sqrt((t * t).sum()) + 1e-9
    shape = (H + h, W + w)
    corr = np.fft.irfft2(np.fft.rfft2(img, s=shape) * np.fft.rfft2(t[::-1, ::-1], s=shape), s=shape)[h - 1 : H, w - 1 : W]
    def box(a: np.ndarray) -> np.ndarray:
        c = np.pad(a, ((1, 0), (1, 0))).cumsum(0).cumsum(1)
        return c[h:, w:] - c[:-h, w:] - c[h:, :-w] + c[:-h, :-w]
    s1 = box(img)
    s2 = box(img * img)
    var = np.maximum(s2 - s1 * s1 / (h * w), 1e-9)
    return corr / (np.sqrt(var) * tn)


def find_wheels(body: np.ndarray, ground: float) -> list[tuple[float, float, float, float]]:
    """Wheels on the body: round dark outlines in the lower part that sit on the ground.

    A circle Hough transform on the outline pixels gives candidate centres; a real wheel
    touches the ground, so its radius is (ground - centre y); the candidate is kept if a
    dark outline really runs along that circle. Returns [(x, y, r, score)] in body px.
    """
    f = 4
    b = body[::f, ::f]
    lum = b[..., :3].astype(np.float64) @ [0.299, 0.587, 0.114]
    solid = b[..., 3] > 128
    light = (lum > 140) & solid
    near_light = np.zeros_like(light)
    near_light[1:, :] |= light[:-1, :]
    near_light[:-1, :] |= light[1:, :]
    near_light[:, 1:] |= light[:, :-1]
    near_light[:, :-1] |= light[:, 1:]
    edge = (lum < 80) & solid & near_light
    H, W = edge.shape
    ys, xs = np.nonzero(edge)
    keep = ys > H * 0.45
    ys, xs = ys[keep], xs[keep]
    peaks: list[tuple[float, int, int, int]] = []
    for r in range(max(4, int(W * 0.03)), max(6, int(W * 0.14))):
        acc = np.zeros((H, W))
        ang = np.linspace(0, 2 * np.pi, max(12, int(2 * np.pi * r)), endpoint=False)
        cx = (xs[:, None] + r * np.cos(ang)[None, :]).round().astype(int).ravel()
        cy = (ys[:, None] + r * np.sin(ang)[None, :]).round().astype(int).ravel()
        ok = (cx >= 0) & (cx < W) & (cy >= 0) & (cy < H)
        np.add.at(acc, (cy[ok], cx[ok]), 1)
        for _ in range(6):
            i = int(np.argmax(acc))
            y, x = divmod(i, W)
            peaks.append((acc[y, x] / (2 * np.pi * r), x * f, y * f, r * f))
            acc[max(0, y - r) : y + r, max(0, x - r) : x + r] = 0
    full_lum = body[..., :3].astype(np.float64) @ [0.299, 0.587, 0.114]
    dark = (full_lum < 90) & (body[..., 3] > 128)
    def ring_score(x: float, y: float, r: float) -> float:
        a = np.linspace(0, 2 * np.pi, 96, endpoint=False)
        hits = 0
        for dr in (-3, 0, 3):
            px = np.clip((x + (r + dr) * np.cos(a)).astype(int), 0, body.shape[1] - 1)
            py = np.clip((y + (r + dr) * np.sin(a)).astype(int), 0, body.shape[0] - 1)
            hits = np.maximum(hits, dark[py, px].astype(int))
        return float(np.mean(hits))
    found: list[tuple[float, float, float, float]] = []
    for _, x, y, r in peaks:
        best = None
        for dx in np.linspace(-0.25, 0.25, 7) * r:
            for dy in np.linspace(-0.25, 0.25, 7) * r:
                cx, cy = x + dx, y + dy
                rr = ground - cy  # a wheel sits on the ground
                if rr < r * 0.5 or rr > r * 1.9 or rr < 8:
                    continue
                sc = ring_score(cx, cy, rr)
                if best is None or sc > best[3]:
                    best = (cx, cy, rr, sc)
        if best and best[3] >= 0.55:
            found.append(best)
    found.sort(key=lambda t: -t[3])
    kept: list[tuple[float, float, float, float]] = []
    for c in found:
        if all((c[0] - k[0]) ** 2 + (c[1] - k[1]) ** 2 > (1.5 * max(c[2], k[2])) ** 2 for k in kept):
            kept.append(c)
    return kept


def auto_anchors(body: np.ndarray, parts: dict, facing: str) -> dict:
    """Find the face plate, nose, ground, top (smokestack/head) and wheels on the body picture."""
    a = body[..., 3] > 128
    rows = np.nonzero(a.any(axis=1))[0]
    cols = np.nonzero(a.any(axis=0))[0]
    ground = int(rows.max())
    nose = int(cols.max() if facing == "right" else cols.min())
    lum = body[..., :3].astype(np.float64) @ [0.299, 0.587, 0.114]
    # the face plate: the biggest round-ish light area, preferring the front
    light = (lum > 150) & (body[..., 3] > 200)
    lab, n = label(light[::2, ::2])
    best, best_score = None, 0.0
    W = body.shape[1]
    for comp in range(1, n + 1):
        yy, xx = np.nonzero(lab == comp)
        if len(yy) < 80:
            continue
        bw, bh = int(np.ptp(xx)) + 1, int(np.ptp(yy)) + 1
        if not 0.45 < bw / bh < 2.2:
            continue
        fill = len(yy) / (np.pi / 4 * bw * bh)  # 1 for an ellipse
        cx = (xx.min() + xx.max()) / 2 * 2
        front = cx / W if facing == "right" else 1 - cx / W
        score = len(yy) * min(fill, 1.0) ** 3 * (0.3 + front) ** 2
        if score > best_score:
            best_score = score
            best = [float(cx), float(yy.min() + yy.max()), bw, bh]
    if best is None:
        fail("could not find the face plate (a round light area on the body). Add \"anchors\": {\"face\": [x, y, rx, ry]} to art.json.")
    fx, fy, bw, bh = best
    face = [fx, fy, float(bw), float(bh)]  # labelled at half size: bw, bh are the radii in full px
    # the top: a smokestack, a head... the highest part, and where it widens into the body
    top = int(rows.min())
    cap = np.nonzero(a[top : top + 10].any(axis=0))[0]
    tx = float(cap.mean())
    cap_w = max(1, int(np.ptp(cap)) + 1)
    base = top + int(0.25 * (ground - top))
    for y in range(top + 12, ground):
        run = np.nonzero(a[y, max(0, int(tx) - 3 * cap_w) : int(tx) + 3 * cap_w])[0]
        if run.size and np.ptp(run) + 1 > 2.6 * cap_w:
            base = y
            break
    anchors = {"face": face, "noseX": nose, "ground": ground, "chimney": [tx, float(top), float(base)]}
    if "wheel" in parts:
        wheels = find_wheels(body, ground)
        if wheels:
            rmax = max(w[2] for w in wheels)
            big = sorted([w for w in wheels if w[2] >= 0.75 * rmax], key=lambda w: w[0])
            small = [w for w in wheels if w[2] < 0.75 * rmax and w[2] >= 0.3 * rmax and w[1] > ground - 3 * rmax]
            anchors["wheels"] = [[round(w[0], 1), round(w[1], 1), round(w[2], 1)] for w in big]
            if small:
                s = max(small, key=lambda w: w[3])
                anchors["frontWheel"] = [round(s[0], 1), round(s[1], 1), round(s[2], 1)]
    f = anchors["face"]
    anchors["shoulders"] = [[f[0] - f[2] * 1.45, f[1] + f[3] * 0.5], [f[0] - f[2] * 4, f[1]]]
    return anchors


def draw_preview(path: Path, body: np.ndarray, parts: dict, anchors: dict) -> None:
    """A picture to check what was detected: the body with its anchors, and every part with its name."""
    from PIL import ImageDraw
    b = Image.fromarray(body, "RGBA")
    thumbs = [(n, Image.fromarray(p, "RGBA")) for n, p in parts.items() if n != "body"]
    th = 160
    W = max(b.width, sum(int(t.width * th / t.height) + 20 for _, t in thumbs) + 20)
    H = b.height + th + 70
    img = Image.new("RGBA", (W, H), (120, 140, 120, 255))
    img.alpha_composite(b, (0, 0))
    d = ImageDraw.Draw(img)
    fx, fy, rx, ry = anchors["face"]
    d.ellipse((fx - rx, fy - ry, fx + rx, fy + ry), outline=(255, 0, 0, 255), width=4)
    for w in anchors.get("wheels", []) + ([anchors["frontWheel"]] if "frontWheel" in anchors else []):
        d.ellipse((w[0] - w[2], w[1] - w[2], w[0] + w[2], w[1] + w[2]), outline=(0, 80, 255, 255), width=4)
    cx, ct, cb = anchors["chimney"]
    d.line((cx, ct, cx, cb), fill=(0, 200, 0, 255), width=5)
    d.line((0, anchors["ground"], b.width, anchors["ground"]), fill=(0, 255, 255, 255), width=3)
    d.line((anchors["noseX"], 0, anchors["noseX"], b.height), fill=(255, 200, 0, 255), width=3)
    for sx, sy in anchors.get("shoulders", []):
        d.ellipse((sx - 8, sy - 8, sx + 8, sy + 8), fill=(255, 0, 255, 255))
    x = 20
    for name, t in thumbs:
        t2 = t.resize((max(1, int(t.width * th / t.height)), th))
        img.alpha_composite(t2, (x, b.height + 40))
        d.text((x, b.height + 15), name, fill=(255, 255, 255, 255))
        x += t2.width + 20
    d.text((10, 10), "red: face  blue: wheels  green: top/smokestack  cyan: ground  yellow: nose  pink: shoulders", fill=(255, 255, 255, 255))
    img.convert("RGB").save(path)


def slice_parts(boss: str, spec: dict, src_dir: Path) -> None:
    """Cut every part of a puppet sheet out on its own, find the body's anchor points, write a preview.

    "parts" is either a list of names in reading order (the body is the biggest drawing, the
    others are taken left to right, top to bottom) or {name: [x, y]} with a point inside each.
    "anchors" is optional: whatever is missing is found automatically.
    """
    sheet = Image.open(src_dir / spec["sheet"]).convert("RGB")
    rgb = np.array(sheet)
    lum = rgb.astype(np.float64) @ [0.299, 0.587, 0.114]
    scale = float(spec.get("scale", 2))
    facing = spec.get("facing", "right")
    names_or_hints = spec.get("parts", ["body", "hat", "mustache", "gloveOpen", "gloveFist", "glovePoint", "wheel"])
    print(f"· {spec['sheet']}: {sheet.width} x {sheet.height}")
    small = lum[::2, ::2] < INK_LEVEL
    lab, n = label(dilate(small, 3))
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    owner_of: dict[str, int] = {}
    if isinstance(names_or_hints, dict):
        for name, (hx, hy) in names_or_hints.items():
            y, x = int(hy) // 2, int(hx) // 2
            comp = int(lab[y, x])
            if comp == 0:  # the hint fell on white: take the nearest drawing
                ys, xs = np.nonzero(lab)
                i = int(np.argmin((ys - y) ** 2 + (xs - x) ** 2))
                comp = int(lab[ys[i], xs[i]])
            owner_of[name] = comp
    else:
        names = list(names_or_hints)
        big = [c for c in range(1, n + 1) if sizes[c] > sizes.max() * 0.02]
        if len(big) < len(names):
            fail(f"found {len(big)} separate drawings but art.json lists {len(names)} parts ({', '.join(names)}). Leave white space between the parts.")
        big = sorted(big, key=lambda c: -sizes[c])[: len(names)]
        body = big[0]
        rest = big[1:]
        # reading order: rows (by vertical centre), then left to right
        boxes = {}
        for c in rest:
            yy, xx = np.nonzero(lab == c)
            boxes[c] = (xx.min(), yy.min(), xx.max(), yy.max())
        rows: list[list[int]] = []
        for c in sorted(rest, key=lambda c: (boxes[c][1] + boxes[c][3]) / 2):
            cy = (boxes[c][1] + boxes[c][3]) / 2
            if rows and abs(cy - np.mean([(boxes[r][1] + boxes[r][3]) / 2 for r in rows[-1]])) < (boxes[c][3] - boxes[c][1]) * 0.6:
                rows[-1].append(c)
            else:
                rows.append([c])
        ordered = [c for r in rows for c in sorted(r, key=lambda c: boxes[c][0])]
        owner_of["body" if names[0] == "body" else names[0]] = body
        for name, c in zip([nm for nm in names if nm != "body"], ordered):
            owner_of[name] = c
    # loose bits go with the nearest part
    taken = set(owner_of.values())
    centres = {name: np.argwhere(lab == c).mean(axis=0) for name, c in owner_of.items()}
    full_owner = {name: (lab == c) for name, c in owner_of.items()}
    for c in range(1, n + 1):
        if c in taken or sizes[c] == 0:
            continue
        cy, cx = np.argwhere(lab == c).mean(axis=0)
        best = min(centres, key=lambda k: (centres[k][0] - cy) ** 2 + (centres[k][1] - cx) ** 2)
        full_owner[best] |= lab == c
    out_dir = ROOT / "public" / "art" / boss
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.png"):
        old.unlink()
    parts = {}
    images: dict[str, np.ndarray] = {}
    for name, m in full_owner.items():
        own = dilate(np.kron(m, np.ones((2, 2), dtype=bool))[: lum.shape[0], : lum.shape[1]], 2)
        ys, xs = np.nonzero(own)
        pad = 6
        x0, y0 = max(0, int(xs.min()) - pad), max(0, int(ys.min()) - pad)
        x1, y1 = min(rgb.shape[1], int(xs.max()) + pad), min(rgb.shape[0], int(ys.max()) + pad)
        cut = cut_out(rgb[y0:y1, x0:x1], lum[y0:y1, x0:x1], own[y0:y1, x0:x1])
        img = Image.fromarray(cut, "RGBA")
        if scale != 1:
            img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
        if name in spec.get("flip", []):
            # mirrored so all the gloves have the thumb on the same side (image AIs mix them up):
            # we see the character's left side, so the near hand is a left hand shown palm out,
            # thumb on the right
            img = img.transpose(Image.FLIP_LEFT_RIGHT)
        img.save(out_dir / f"{name}.png", optimize=True)
        images[name] = np.array(img)
        parts[name] = {"file": f"{name}.png", "w": img.width, "h": img.height, "origin": [x0, y0]}
        print(f"  {name:12s} {img.width:5d} x {img.height:<5d}")
    if "body" not in images:
        fail('one of the parts must be called "body"')
    # anchors: found automatically in the (enlarged) body picture; art.json can override any
    anchors = auto_anchors(images["body"], images, facing)
    anchors["face"] = [round(v, 1) for v in anchors["face"]]  # centre and radii, body px
    bo = parts["body"]["origin"]
    def to_body(v):  # sheet px -> body picture px (for anchors given by hand in art.json)
        if isinstance(v, (int, float)):
            return v * scale
        if isinstance(v, list) and v and isinstance(v[0], list):
            return [to_body(e) for e in v]
        return [(v[0] - bo[0]) * scale, (v[1] - bo[1]) * scale] + [e * scale for e in v[2:]]
    for k, v in spec.get("anchors", {}).items():
        if k == "ground":
            anchors[k] = (v - bo[1]) * scale
        elif k == "noseX":
            anchors[k] = (v - bo[0]) * scale
        else:
            anchors[k] = to_body(v)
    for p in parts.values():
        p.pop("origin", None)
    manifest = {"boss": boss, "type": "parts", "facing": facing, "parts": parts, "anchors": anchors, "source": f"art/{boss}/{spec['sheet']}"}
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    draw_preview(src_dir / "preview.png", images["body"], images, anchors)
    # the list of every character built, for the game's puppet viewer
    built = sorted(d.name for d in (ROOT / "public" / "art").iterdir() if (d / "manifest.json").exists())
    (ROOT / "public" / "art" / "index.json").write_text(json.dumps({"characters": built}, indent=2) + "\n", encoding="utf-8")
    a = anchors
    print(f"· face at ({a['face'][0]:.0f}, {a['face'][1]:.0f}) radii {a['face'][2]:.0f} x {a['face'][3]:.0f}; "
          f"{len(a.get('wheels', []))} wheels{' + front wheel' if 'frontWheel' in a else ''}; ground {a['ground']:.0f}; nose {a['noseX']:.0f}")
    print(f"✓ wrote {len(parts)} parts + manifest.json to public/art/{boss}/ and a check picture: art/{boss}/preview.png")


def main() -> None:
    if len(sys.argv) < 2:
        fail("usage: npm run art -- <boss>   (reads art/<boss>/art.json)")
    boss = sys.argv[1]
    src_dir = ROOT / "art" / boss
    spec_path = src_dir / "art.json"
    if not spec_path.exists():
        fail(f"art/{boss}/art.json not found")
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    if spec.get("type") == "parts":
        slice_parts(boss, spec, src_dir)
        return
    names: list[str] = spec["poses"]
    order = spec.get("order", "rows")
    facing = spec.get("facing", "right")
    sheet = Image.open(src_dir / spec["sheet"]).convert("RGB")
    rgb = np.array(sheet)
    lum = rgb.astype(np.float64) @ [0.299, 0.587, 0.114]
    print(f"· {spec['sheet']}: {sheet.width} x {sheet.height}, looking for {len(names)} poses ({order})")

    poses = find_poses(lum, len(names), order)
    pad = 8
    cuts = []
    for (x0, y0, x1, y1, own), name in zip(poses, names):
        x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
        x1, y1 = min(rgb.shape[1], x1 + pad), min(rgb.shape[0], y1 + pad)
        cut = cut_out(rgb[y0:y1, x0:x1], lum[y0:y1, x0:x1], own[y0:y1, x0:x1])
        cuts.append(cut)
        print(f"  {name:10s} {x1 - x0:4d} x {y1 - y0:<4d} at ({x0}, {y0})")

    # line every pose up with the first one on the wheels (the lowest third of the drawing)
    ref_prof, ref_bottom = ink_profile(cuts[0], 0.33)
    offsets = [(0, 0)]
    for cut in cuts[1:]:
        prof, bottom = ink_profile(cut, 0.33)
        offsets.append((best_shift(ref_prof, prof, max(20, len(ref_prof) // 4)), ref_bottom - bottom))
    left = min(dx for dx, _ in offsets)
    topm = min(dy for _, dy in offsets)
    W = max(dx - left + c.shape[1] for (dx, _), c in zip(offsets, cuts))
    H = max(dy - topm + c.shape[0] for (_, dy), c in zip(offsets, cuts))
    canvases = []
    for (dx, dy), cut in zip(offsets, cuts):
        canvas = np.zeros((H, W, 4), dtype=np.uint8)
        ox, oy = dx - left, dy - topm
        canvas[oy : oy + cut.shape[0], ox : ox + cut.shape[1]] = cut
        canvases.append(canvas)

    out_dir = ROOT / "public" / "art" / boss
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.png"):
        old.unlink()
    for i, (canvas, name) in enumerate(zip(canvases, names)):
        Image.fromarray(canvas, "RGBA").save(out_dir / f"{name}_0.png", optimize=True)
        for v in (1, 2):
            Image.fromarray(boil(canvas, seed=i * 10 + v), "RGBA").save(out_dir / f"{name}_{v}.png", optimize=True)

    # anchors, found on the first pose (art.json can override any of them)
    ref = canvases[0]
    ref_lum = ref[..., :3].astype(np.float64) @ [0.299, 0.587, 0.114]
    fx, fy, fr = find_face(ref, ref_lum, facing)
    opaque_rows = np.nonzero((ref[..., 3] > 128).any(axis=1))[0]
    ground = int(opaque_rows.max())
    side = -1 if facing == "right" else 1  # towards the back of the train
    band = ref[:, max(0, fx + side * 3 * fr) : fx] if side < 0 else ref[:, fx : fx + 3 * fr]
    hat_rows = np.nonzero((band[..., 3] > 128).any(axis=1))[0]
    hat_cols = np.nonzero((band[int(hat_rows.min()) : int(hat_rows.min()) + 6, :, 3] > 128).any(axis=0))[0]
    chimney_x = int((fx + side * 3 * fr if side < 0 else fx) + hat_cols.mean())
    anchors = {
        "face": [fx, fy, fr],
        "eyes": [fx, int(fy - fr * 0.15)],
        "mouth": [fx, int(fy + fr * 0.45)],
        "chimney": [max(0, chimney_x), int(hat_rows.min())],
        "lamp": [int(fx - side * fr * 0.05), int(fy - fr * 1.4)],
        "ground": ground,
    }
    anchors.update(spec.get("anchors", {}))
    manifest = {
        "boss": boss,
        "w": W,
        "h": H,
        "facing": facing,
        "poses": names,
        "variants": 3,
        "anchors": anchors,
        "source": f"art/{boss}/{spec['sheet']}",
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"· canvas {W} x {H}; face at ({fx}, {fy}) r {fr}; ground {ground}")
    print(f"✓ wrote {len(names) * 3} frames + manifest.json to public/art/{boss}/")
    if fr * 2 < 180:
        print(f"  note: the face is only {fr * 2} px wide; the game shows it about 200 px wide, so it will look soft."
              " A sheet 2-3 times bigger (or upscaled) will look sharper.")


if __name__ == "__main__":
    main()
