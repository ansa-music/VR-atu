"""
Өз pattern-маркерлерін жасау (AR.js Marker Generator-дің офлайн баламасы).

Әр маркер үшін:
  markers/<name>.png          — басып шығаруға арналған толық маркер (қара жиек + сурет)
  markers/pattern-<name>.patt — AR.js үшін үлгі файлы
Сонымен қатар камерасыз тексеруге арналған test/*.jpg суреттерін жасайды.

.patt форматы AR.js генераторындағыдай (THREEx.ArPatternFile.encodeImage):
4 бағдар (0°, 90°, 180°, 270° сағат тіліне қарсы), әрқайсысында B, G, R арналары,
әр арна — 16x16 сандар кестесі.

Іске қосу (ar-lab қалтасынан):  python tools/make_markers.py .
"""
import os
import random
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SS = 4            # сапалы жиектер үшін суперсэмплинг
INNER = 512       # ішкі суреттің өлшемі (px)
MARGIN = 0.12     # маркер айналасындағы ақ өріс (маркер енінің үлесі)


# ---------- Маркер суреттері (ақ фон, қара пішін; бұрылғанда симметриялы емес) ----------

def draw_key(d, s):
    """Кілт тесігі — порталды ашатын «кілт» маркері."""
    cx, cy, r = 0.50 * s, 0.33 * s, 0.23 * s
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=0)
    d.polygon([(0.41 * s, 0.40 * s), (0.59 * s, 0.40 * s),
               (0.72 * s, 0.92 * s), (0.28 * s, 0.92 * s)], fill=0)


def draw_bolt(d, s):
    """Найзағай — әлемді ауыстыратын маркер."""
    pts = [(0.60, 0.06), (0.22, 0.55), (0.47, 0.55), (0.36, 0.94),
           (0.80, 0.42), (0.55, 0.42), (0.72, 0.06)]
    d.polygon([(x * s, y * s) for x, y in pts], fill=0)


MARKERS = {"key": draw_key, "bolt": draw_bolt}


def make_inner(draw_fn):
    big = Image.new("L", (INNER * SS, INNER * SS), 255)
    draw_fn(ImageDraw.Draw(big), INNER * SS)
    return big.resize((INNER, INNER), Image.LANCZOS).convert("RGB")


def make_full_marker(inner):
    """Ішкі сурет маркердің 50%-ын алады (AR.js patternRatio = 0.5)."""
    marker_px = INNER * 2
    margin_px = int(marker_px * MARGIN)
    size = marker_px + 2 * margin_px
    img = Image.new("RGB", (size, size), "white")
    d = ImageDraw.Draw(img)
    d.rectangle([margin_px, margin_px, margin_px + marker_px - 1, margin_px + marker_px - 1], fill="black")
    off = margin_px + INNER // 2
    img.paste(inner, (off, off))
    return img


def encode_patt(inner):
    blocks = []
    for k in range(4):
        im16 = inner.rotate(90 * k).resize((16, 16), Image.BOX)
        px = im16.load()
        rows = []
        for ch in (2, 1, 0):  # BGR реті, генератордағыдай
            for y in range(16):
                rows.append(" ".join(str(px[x, y][ch]).rjust(3) for x in range(16)))
        blocks.append("\n".join(rows) + "\n")
    return "\n".join(blocks)


# ---------- Тест суреттері (маркер үстелдегі қағазда, перспективамен) ----------

def perspective_coeffs(dst, src):
    """PIL PERSPECTIVE коэффициенттері: шығыс нүктесі (dst) -> кіріс нүктесі (src)."""
    a = []
    b = []
    for (x, y), (u, v) in zip(dst, src):
        a.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.append(u)
        a.append([0, 0, 0, x, y, 1, -v * x, -v * y]); b.append(v)
    return np.linalg.solve(np.array(a, float), np.array(b, float)).tolist()


def table_background(w, h, seed):
    rnd = np.random.default_rng(seed)
    y = np.linspace(0, 1, h)[:, None]
    x = np.linspace(0, 1, w)[None, :]
    grain = np.sin(x * 40 + np.sin(y * 7) * 3) * 10
    base = np.stack([150 + grain - y * 30, 105 + grain * 0.8 - y * 25, 70 + grain * 0.5 - y * 20], -1)
    base += rnd.normal(0, 4, base.shape)
    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))


def place(bg, sheet, quad):
    w, h = sheet.size
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    c = perspective_coeffs(quad, src)
    warped = sheet.transform(bg.size, Image.PERSPECTIVE, c, Image.BICUBIC)
    mask = Image.new("L", sheet.size, 255).transform(bg.size, Image.PERSPECTIVE, c, Image.BICUBIC)
    bg.paste(warped, (0, 0), mask)


def make_test_images(root, fulls):
    out = os.path.join(root, "test")
    os.makedirs(out, exist_ok=True)
    # Телефондағыдай тік (portrait) кадр: AR.js сурет көзін әрқашан тік деп есептейді
    W, H = 480, 640
    key_quad = [(150, 300), (330, 304), (362, 470), (118, 466)]
    scenes = {
        "key":   [("key", key_quad)],
        "bolt":  [("bolt", [(150, 290), (335, 300), (360, 465), (120, 458)])],
        "both":  [("bolt", [(235, 150), (370, 156), (382, 268), (230, 262)]),
                  ("key", [(140, 340), (320, 344), (352, 510), (108, 506)])],
        "empty": [],
    }
    for name, items in scenes.items():
        bg = table_background(W, H, seed=len(name))
        if not items:  # маркері жоқ бос қағаз
            sheet = Image.new("RGB", (400, 400), (245, 245, 240))
            place(bg, sheet, key_quad)
        for marker_name, quad in items:
            place(bg, fulls[marker_name], quad)
        bg = bg.filter(ImageFilter.GaussianBlur(0.6))
        bg.save(os.path.join(out, f"{name}.jpg"), quality=92)


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "ar-lab"
    mdir = os.path.join(root, "markers")
    os.makedirs(mdir, exist_ok=True)
    fulls = {}
    for name, fn in MARKERS.items():
        inner = make_inner(fn)
        full = make_full_marker(inner)
        full.save(os.path.join(mdir, f"{name}.png"))
        with open(os.path.join(mdir, f"pattern-{name}.patt"), "w", newline="\n") as f:
            f.write(encode_patt(inner))
        fulls[name] = full
    random.seed(1)
    make_test_images(root, fulls)
    print("ok:", ", ".join(MARKERS))


if __name__ == "__main__":
    main()
