"""Cut the scenery and object sheets of a boss (made with an image AI) into game textures.

    python tools/art/slice_textures.py <boss>       (normally via `npm run art -- <boss>`)

Reads art/<boss>/textures.json:
    {
      "sheets": [
        { "file": "01", "type": "objects", "names": ["wisp", "wisp2", "sun", "moon", "twinkle"] },
        { "file": "02", "type": "strip", "name": "farhills" },
        ...
      ]
    }
  "objects": separate drawings on a white sheet, named in reading order (rows, then left to right).
  "seeThrough": [names] (objects): wide white patches closed in by the drawing (between a
             fence's planks) become see-through instead of staying paper white.
  "grayscale": true: the picture is turned black and white first (it came out warm-tinted).
  "tiles": [names] (objects): wall sections made to repeat both ways (a tunnel's bricks).
  "anchors": {name: {key: [x, y] | "rightmost" | "leftmost" | "top"}} (objects): points the
             game needs on a picture (the water tower's spout), found or given in its pixels.
  "picture": the whole picture as it is (a fixed backdrop, e.g. a duel's arena).
  "tile":    a texture filling the whole picture (rock), made to repeat both ways.
  "strip":   a wide background band on white; the white above it goes, and its two ends are
             blended so it repeats without a seam.
  "file" may leave out the extension (01 = 01.png, 01.jpg...). Sheets not there yet are skipped.

Writes public/art/textures/<name>.png and public/art/textures/index.json. The game swaps
its own code-drawn texture of the same name for these (any size: it fits them to the
place they take in the game and adds the hand-drawn line boil itself).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from slice_sheet import INK_LEVEL, ROOT, WHITE_LEVEL, cut_out, dilate, fail, label  # noqa: E402

OUT = ROOT / "public" / "art" / "textures"


def lum_of(rgb: np.ndarray) -> np.ndarray:
    return rgb.astype(np.float64) @ [0.299, 0.587, 0.114]


def reading_order(boxes: dict[int, tuple[int, int, int, int]]) -> list[int]:
    """Components sorted in rows (by vertical centre), then left to right."""
    rows: list[list[int]] = []
    for c in sorted(boxes, key=lambda c: (boxes[c][1] + boxes[c][3]) / 2):
        cy = (boxes[c][1] + boxes[c][3]) / 2
        if rows:
            row_cy = np.mean([(boxes[r][1] + boxes[r][3]) / 2 for r in rows[-1]])
            row_h = np.mean([boxes[r][3] - boxes[r][1] for r in rows[-1]])
            if abs(cy - row_cy) < max(boxes[c][3] - boxes[c][1], row_h) * 0.5:
                rows[-1].append(c)
                continue
        rows.append([c])
    return [c for r in rows for c in sorted(r, key=lambda c: boxes[c][0])]


def clear_gaps(cut: np.ndarray, lum: np.ndarray, radius: int = 9) -> np.ndarray:
    """Wide patches of paper white closed in by the drawing (between a fence's planks, under a
    telegraph wire) become see-through. Thin white bits (wood grain, highlights) stay."""
    white = (lum >= WHITE_LEVEL) & (cut[..., 3] > 0)
    core = ~dilate(~white, radius)  # pixels at least `radius` away from anything not white
    if not core.any():
        return cut
    lab, n = label(white)
    hit = np.unique(lab[core])
    gone = np.isin(lab, hit[hit > 0])
    out = cut.copy()
    out[..., 3] = np.where(gone, 0, out[..., 3])
    return out


def slice_objects(path: Path, names: list[str], see_through: set[str] | None = None) -> dict[str, Image.Image]:
    rgb = np.array(Image.open(path).convert("RGB"))
    lum = lum_of(rgb)
    # the drawings are the biggest blobs of ink; if some touch (grass at their feet), try
    # again joining less and with only the darker lines, then by the white gutters between them
    big: list[int] = []
    for grow, level in ((3, INK_LEVEL), (1, INK_LEVEL), (0, 200), (0, 170)):
        small = lum[::2, ::2] < level
        lab, n = label(dilate(small, grow) if grow else small)
        sizes = np.bincount(lab.ravel())
        sizes[0] = 0
        top = [int(c) for c in np.argsort(sizes)[::-1][: len(names)] if sizes[c] > 0]
        # every drawing should be a real one, not a speck
        if len(top) == len(names) and sizes[top[-1]] > sizes[top[0]] * 0.03:
            big = top
            break
    if not big:
        lab, n, sizes, big = split_by_gutters(lum, len(names))
    if len(big) < len(names):
        fail(f"{path.name}: found {len(big)} drawings but {len(names)} names ({', '.join(names)}). Leave white space between them.")
    boxes = {}
    for c in big:
        yy, xx = np.nonzero(lab == c)
        boxes[int(c)] = (int(xx.min()), int(yy.min()), int(xx.max()), int(yy.max()))
    order = reading_order(boxes)
    masks = {name: lab == c for name, c in zip(names, order)}
    # loose bits (a crow's wing, a spark) go with the nearest drawing, if they are close
    centres = {name: np.argwhere(m) for name, m in masks.items()}
    for c in range(1, n + 1):
        if c in boxes or sizes[c] == 0:
            continue
        pts = np.argwhere(lab == c)
        cy, cx = pts.mean(axis=0)
        dists = {k: float((((v[::7] - [cy, cx]) ** 2).sum(axis=1)).min()) for k, v in centres.items()}
        best = min(dists, key=dists.get)
        if dists[best] < 60**2:
            masks[best] |= lab == c
    out: dict[str, Image.Image] = {}
    for name, m in masks.items():
        own = dilate(np.kron(m, np.ones((2, 2), dtype=bool))[: lum.shape[0], : lum.shape[1]], 2)
        ys, xs = np.nonzero(own)
        pad = 6
        x0, y0 = max(0, int(xs.min()) - pad), max(0, int(ys.min()) - pad)
        x1, y1 = min(rgb.shape[1], int(xs.max()) + pad), min(rgb.shape[0], int(ys.max()) + pad)
        cut = cut_out(rgb[y0:y1, x0:x1], lum[y0:y1, x0:x1], own[y0:y1, x0:x1])
        if see_through and name in see_through:
            cut = clear_gaps(cut, lum[y0:y1, x0:x1])
        out[name] = trim(Image.fromarray(cut, "RGBA"))
    return out


def split_by_gutters(lum: np.ndarray, count: int) -> tuple[np.ndarray, int, np.ndarray, list[int]]:
    """Last resort: cut the sheet into rows and columns along the whitest lines between the
    drawings (a little grass may cross them), one label per cell that has ink."""
    ink = lum[::2, ::2] < INK_LEVEL
    h, w = ink.shape

    def gaps(profile: np.ndarray, length: int) -> list[tuple[int, int]]:
        low = profile <= max(1, int(length * 0.02))
        runs, start = [], None
        for i, v in enumerate(low):
            if v and start is None:
                start = i
            if not v and start is not None:
                runs.append((start, i))
                start = None
        if start is not None:
            runs.append((start, len(low)))
        return runs

    def cells(runs: list[tuple[int, int]], size: int) -> list[tuple[int, int]]:
        cuts = [0] + [(a + b) // 2 for a, b in runs if a > 0 and b < size] + [size]
        return [(cuts[i], cuts[i + 1]) for i in range(len(cuts) - 1)]

    lab = np.zeros(ink.shape, dtype=np.int32)
    n = 0
    for y0, y1 in cells(gaps(ink.sum(axis=1), w), h):
        band = ink[y0:y1]
        if band.sum() < 20:
            continue
        for x0, x1 in cells(gaps(band.sum(axis=0), y1 - y0), w):
            if band[:, x0:x1].sum() < 20:
                continue
            n += 1
            lab[y0:y1, x0:x1][band[:, x0:x1]] = n
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    big = [int(c) for c in np.argsort(sizes)[::-1][:count] if sizes[c] > 0]
    return lab, n, sizes, big


def trim(img: Image.Image) -> Image.Image:
    a = np.array(img)[..., 3]
    ys, xs = np.nonzero(a > 8)
    if len(ys) == 0:
        return img
    return img.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))


def slice_strip(path: Path) -> Image.Image:
    rgb = np.array(Image.open(path).convert("RGB"))
    lum = lum_of(rgb)
    own = np.ones(lum.shape, dtype=bool)
    cut = cut_out(rgb, lum, own)
    a = cut[..., 3] > 8
    rows = np.nonzero(a.any(axis=1))[0]
    cols = np.nonzero(a.any(axis=0))[0]
    if len(rows) == 0:
        fail(f"{path.name}: the strip is empty (all white?)")
    cut = cut[rows.min() : rows.max() + 1, cols.min() : cols.max() + 1]
    # a ragged bottom edge (white bits under the band) is filled down with the colour above it,
    # so no sky shows between the band and whatever stands in front of it
    h, w = cut.shape[:2]
    opaque = cut[..., 3] > 128
    last = np.where(opaque.any(axis=0), h - 1 - np.argmax(opaque[::-1], axis=0), -1)
    near_bottom = last >= int(h * 0.85)
    for x in np.nonzero(near_bottom & (last < h - 1))[0]:
        cut[last[x] + 1 :, x] = cut[max(0, last[x] - 6), x]  # from inside the band, not its outline
    body = repeat_cut(cut)
    return Image.fromarray(body, "RGBA")


def repeat_cut(cut: np.ndarray) -> np.ndarray:
    """Make a picture repeat side by side: find a start column a (near the left) and an end
    column b (near the right) where the few columns before each look alike (silhouette and
    drawing), cut [a, b) and fade the last of those columns into the ones before a: the end
    then leads straight into the beginning, with nothing doubled up."""
    h, w = cut.shape[:2]
    grey = cut[..., :3].astype(np.float64) @ [0.299, 0.587, 0.114]
    look = (grey * (cut[..., 3] / 255.0) + 255.0 * (1 - cut[..., 3] / 255.0))[::4]  # on white, every 4th row
    k = max(12, int(w * 0.025))
    span = max(k + 8, int(w * 0.2))
    edge = max(k + 4, int(w * 0.03))
    win = np.lib.stride_tricks.sliding_window_view(look, k, axis=1)  # (rows, w-k+1, k): columns [i, i+k)
    b_lo, b_hi = w - span, w - edge
    bs = win[:, b_lo - k : b_hi - k]  # windows ending at b
    best = (np.inf, edge, w - edge)
    for a in range(edge, span, 2):
        A = win[:, a - k][:, None, :]
        cost = np.abs(bs - A).mean(axis=(0, 2))
        j = int(np.argmin(cost))
        if cost[j] < best[0]:
            best = (float(cost[j]), a, b_lo + j)
    _, a, b = best
    body = cut[:, a:b].copy()
    t = np.linspace(0.0, 1.0, k)[None, :, None]
    tail = body[:, -k:].astype(np.float64)
    lead = cut[:, a - k : a].astype(np.float64)
    body[:, -k:] = np.clip(tail * (1.0 - t) + lead * t, 0, 255).astype(np.uint8)
    return body


def make_tile(img: Image.Image) -> Image.Image:
    """A wall section that repeats both ways: trimmed to where it is fully drawn (no broken
    corner), then made seamless across and down."""
    a = np.array(img)
    full = a[..., 3] > 200
    y0, y1, x0, x1 = 0, a.shape[0], 0, a.shape[1]
    for _ in range(400):  # peel off whichever edge is least filled until all four are solid
        edges = {"t": full[y0, x0:x1].mean(), "b": full[y1 - 1, x0:x1].mean(), "l": full[y0:y1, x0].mean(), "r": full[y0:y1, x1 - 1].mean()}
        worst = min(edges, key=edges.get)
        if edges[worst] > 0.98 or y1 - y0 < 40 or x1 - x0 < 40:
            break
        if worst == "t":
            y0 += 1
        elif worst == "b":
            y1 -= 1
        elif worst == "l":
            x0 += 1
        else:
            x1 -= 1
    t = a[y0:y1, x0:x1].copy()
    t[..., 3] = 255
    t = repeat_cut(t)
    t = repeat_cut(t.transpose(1, 0, 2).copy()).transpose(1, 0, 2).copy()
    return Image.fromarray(t, "RGBA")


def find_anchor(img: Image.Image, how) -> list[int]:
    """A point the game needs on a picture (where the water tower's spout ends...), in its
    own pixels: [x, y] as given, or found: "rightmost" / "leftmost" (the outermost drawn
    point in the top three quarters), "top" (the highest one)."""
    if isinstance(how, list):
        return [int(how[0]), int(how[1])]
    a = np.array(img)[..., 3] > 128
    h = a.shape[0]
    ys, xs = np.nonzero(a[: int(h * 0.75)] if how in ("rightmost", "leftmost") else a)
    if how == "rightmost":
        i = int(np.argmax(xs))
    elif how == "leftmost":
        i = int(np.argmin(xs))
    else:
        i = int(np.argmin(ys))
    return [int(xs[i]), int(ys[i])]


def find_file(src: Path, stem: str) -> Path | None:
    """`01` matches 01.png, 01.jpg, 01.jpeg or 01.webp (whatever the image AI gave)."""
    if (src / stem).is_file():
        return src / stem
    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        if (src / f"{stem}{ext}").is_file():
            return src / f"{stem}{ext}"
    return None


def main() -> None:
    if len(sys.argv) < 2:
        fail("usage: python tools/art/slice_textures.py <boss>")
    boss = sys.argv[1]
    src = ROOT / "art" / boss
    cfg_path = src / "textures.json"
    if not cfg_path.exists():
        return
    cfg = json.loads(cfg_path.read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    index_path = OUT / "index.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else {"textures": {}}
    done = waiting = 0
    for i, sheet in enumerate(cfg.get("sheets", []), start=1):
        names = sheet.get("names") or [sheet.get("name")]
        path = find_file(src, sheet["file"])
        if path is None:
            waiting += 1
            print(f"  ({i:2d}) {sheet['file']:10s} not there yet: {', '.join(names)}")
            continue
        if sheet.get("grayscale"):
            # warm-tinted pictures (old paper, sepia) made plain black and white
            gray = Image.open(path).convert("L").convert("RGB")
            path = OUT / f".{boss}-{sheet['file']}-gray.png"
            gray.save(path)
        if sheet.get("type") == "strip":
            images = {sheet["name"]: slice_strip(path)}
        elif sheet.get("type") == "picture":
            # a whole picture used as it is (a backdrop): only made black and white if asked
            images = {sheet["name"]: Image.open(path).convert("RGBA")}
        elif sheet.get("type") == "tile":
            images = {sheet["name"]: make_tile(Image.open(path).convert("RGBA"))}
        else:
            images = slice_objects(path, names, set(sheet.get("seeThrough", [])))
            for name in sheet.get("tiles", []):
                if name in images:
                    images[name] = make_tile(images[name])
        for name, img in images.items():
            img.save(OUT / f"{name}.png", optimize=True)
            entry = {"file": f"{name}.png", "w": img.width, "h": img.height, "boss": boss, "strip": sheet.get("type") == "strip"}
            marks = {k: find_anchor(img, v) for k, v in sheet.get("anchors", {}).get(name, {}).items()}
            if marks:
                entry["anchors"] = marks
            index["textures"][name] = entry
        done += 1
        print(f"  ({i:2d}) {sheet['file']:10s} → {', '.join(f'{k} {v.width}x{v.height}' for k, v in images.items())}")
    index_path.write_text(json.dumps(index, indent=2) + "\n")
    # a contact sheet to check the cut-outs at a glance
    shown = [n for n, v in index["textures"].items() if v.get("boss") == boss]
    if shown:
        draw_preview(src / "textures-preview.png", shown)
    print(f"✓ textures: {done} sheet(s) cut, {waiting} still to come  (preview: art/{boss}/textures-preview.png)")


def draw_preview(path: Path, names: list[str]) -> None:
    from PIL import ImageDraw

    cell_w, cell_h, cols = 260, 220, 6
    rows = (len(names) + cols - 1) // cols
    sheet = Image.new("RGB", (cell_w * cols, cell_h * rows), (205, 200, 188))
    d = ImageDraw.Draw(sheet)
    for i, name in enumerate(names):
        img = Image.open(OUT / f"{name}.png")
        img.thumbnail((cell_w - 20, cell_h - 40))
        x = (i % cols) * cell_w + (cell_w - img.width) // 2
        y = (i // cols) * cell_h + 8 + (cell_h - 40 - img.height)
        sheet.paste(img, (x, y), img)
        d.text(((i % cols) * cell_w + 8, (i // cols) * cell_h + cell_h - 24), name, fill=(20, 20, 20))
    sheet.save(path)


if __name__ == "__main__":
    main()
