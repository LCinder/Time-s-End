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
      "anchors": { "face": [576, 243, 41, 64], "wheels": [[182, 358, 58], ...], ... }
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


def slice_parts(boss: str, spec: dict, src_dir: Path) -> None:
    """Cut every part of a puppet sheet out on its own, plus the body's anchor points."""
    sheet = Image.open(src_dir / spec["sheet"]).convert("RGB")
    rgb = np.array(sheet)
    lum = rgb.astype(np.float64) @ [0.299, 0.587, 0.114]
    scale = float(spec.get("scale", 1))
    hints: dict = spec["parts"]
    print(f"· {spec['sheet']}: {sheet.width} x {sheet.height}, {len(hints)} parts, x{scale:g}")
    small = lum[::2, ::2] < INK_LEVEL
    lab, n = label(dilate(small, 3))
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    owner_of: dict[str, int] = {}
    for name, (hx, hy) in hints.items():
        y, x = int(hy) // 2, int(hx) // 2
        comp = int(lab[y, x])
        if comp == 0:  # the hint fell on white: take the nearest drawing
            ys, xs = np.nonzero(lab)
            i = int(np.argmin((ys - y) ** 2 + (xs - x) ** 2))
            comp = int(lab[ys[i], xs[i]])
        owner_of[name] = comp
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
    body_origin = (0, 0)
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
        img.save(out_dir / f"{name}.png", optimize=True)
        parts[name] = {"file": f"{name}.png", "w": img.width, "h": img.height}
        if name == "body":
            body_origin = (x0, y0)
        print(f"  {name:12s} {img.width:5d} x {img.height:<5d}")

    def to_body(v):  # sheet px -> body picture px
        if isinstance(v, (int, float)):
            return v * scale
        if isinstance(v, list) and v and isinstance(v[0], list):
            return [to_body(e) for e in v]
        out = [(v[0] - body_origin[0]) * scale, (v[1] - body_origin[1]) * scale]
        return out + [e * scale for e in v[2:]]

    anchors = {}
    for k, v in spec.get("anchors", {}).items():
        if k in ("ground", "noseX"):
            anchors[k] = (v - (body_origin[1] if k == "ground" else body_origin[0])) * scale
        else:
            anchors[k] = to_body(v)
    manifest = {"boss": boss, "type": "parts", "parts": parts, "anchors": anchors, "source": f"art/{boss}/{spec['sheet']}"}
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"✓ wrote {len(parts)} parts + manifest.json to public/art/{boss}/")


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
