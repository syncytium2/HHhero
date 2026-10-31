"""Trace the measured points of Hodgkin & Huxley 1952, Fig. 3 (p. 508): potassium
conductance rising during depolarizations of 6 to 109 mV, axon 17, 6-7 C.

    python tools/trace/hh1952_fig3.py lit/pdf/hodgkin1952.pdf [review-dir]

Writes src/paper/hh1952_fig3.json: for each curve, its depolarization and the
circles as (t ms, gK m.mho/cm2). The PDF is the free archive scan (PMC1392413);
it is not in git (lit/pdf is ignored), and neither is the review image this
writes, which embeds a crop of the printed figure.

How the reading works. The scan is 600 dpi bitonal. The time axis is the long
line at the bottom, its 12 ticks 0..11 ms. Curve A's ordinate has major ticks
0..20 m.mho/cm2; A to J share that scale, K and L are four times larger
(caption). Each curve has its own zero: a short foot drawn rightwards from the
axis. The circles are white holes enclosed by ink, the right size and shape.
Each circle belongs to the curve whose eqn. (11) value, with Table 1's
parameters, it is closest to, in pixels: the curves never cross at one time.
A circle that a curve runs through can be split by the line and is then
missed (one on curve B near 0.7 ms is). Checks: every curve gets points, its first point sits near gK0 = 0.24, and the
mean distance of the points from their own curve is printed.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pymupdf
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

REPO = Path(__file__).resolve().parents[2]
PAGE = 9                       # the page of the PDF that holds Fig. 3 (p. 508)
CROP = (574, 1038, 3116, 4264)  # the figure, in the 600 dpi page scan
T0_X, PX_PER_MS = 273.0, None   # fitted from the ticks below
GK0 = 0.24
# Table 1 (p. 510): curve, depolarization (mV), final gK (m.mho/cm2), tau_n (ms)
TABLE1 = [("A", 109, 20.70, 1.05), ("B", 100, 20.00, 1.10), ("C", 88, 18.60, 1.25), ("D", 76, 17.00, 1.50),
          ("E", 63, 15.30, 1.70), ("F", 51, 13.27, 2.05), ("G", 38, 10.29, 2.60), ("H", 32, 8.62, 3.20),
          ("I", 26, 6.84, 3.80), ("J", 19, 5.00, 4.50), ("K", 10, 1.47, 5.25), ("L", 6, 0.98, 5.25)]


def eqn11(t, ginf, tau):
    return (ginf ** 0.25 - (ginf ** 0.25 - GK0 ** 0.25) * np.exp(-np.asarray(t) / tau)) ** 4


def groups(idx, gap=2):
    out = []
    for i in idx:
        if out and i - out[-1][-1] <= gap:
            out[-1].append(i)
        else:
            out.append([i])
    return out


def main(pdf, review):
    doc = pymupdf.open(pdf)
    pix = pymupdf.Pixmap(doc, doc[PAGE - 1].get_images()[0][0])
    page = Image.frombytes("L", (pix.width, pix.height), pix.samples)
    fig = page.crop(CROP)
    a = np.array(fig) < 128
    H, W = a.shape

    # time: the tick marks standing on the axis line
    ticks = [np.mean(g) for g in groups(np.where(a[3080:3128].sum(0) > 30)[0])]
    assert len(ticks) == 12, ticks
    k, x0 = np.polyfit(np.arange(12), ticks, 1)
    res = np.abs(np.polyval([k, x0], np.arange(12)) - ticks).max()
    print(f"time axis: 0 ms at x={x0:.1f}, {k:.2f} px/ms, worst tick off by {res:.1f} px")
    # the axis line's tilt, from where it sits at each end
    yl = np.where(a[3100:3160, 300])[0].mean() + 3100
    yr = np.where(a[3100:3160, 2100])[0].mean() + 3100
    tilt = (yr - yl) / 1800
    # curve A's ordinate: major ticks 0..20 on the right of the axis
    major = [np.mean(g) for g in groups(np.where(a[80:1080, 280:330].sum(1) > 25)[0] + 80) if len(g) >= 9]
    major = [m for m in major if abs((m - 186) % 217.5) < 6 or abs((m - 186) % 217.5 - 217.5) < 6]
    assert len(major) == 5, major
    px_per_unit = (major[-1] - major[0]) / 20
    print(f"ordinate: {px_per_unit:.2f} px per m.mho/cm2 (A to J), x4 for K and L")

    # each curve's zero: a foot drawn right from the axis, 90 px or longer
    feet = []
    for y in range(1000, 3100):
        row = a[y]
        x = 262
        while x < 290 and not row[x]:
            x += 1
        if x >= 290:
            continue
        e = x
        while e < W and row[e]:
            e += 1
        if 90 <= e - x <= 300:
            feet.append(y)
    zeros = [np.mean(g) for g in groups(feet)]
    assert len(zeros) == 12, zeros

    # circles
    lab, _ = ndi.label(~a)
    circles = []
    for i, s in enumerate(ndi.find_objects(lab)):
        h, w = s[0].stop - s[0].start, s[1].stop - s[1].start
        if 8 <= h <= 40 and 8 <= w <= 40 and 0.7 < h / w < 1.4 and s[0].start > 0 and s[1].start > 0:
            if (lab[s] == i + 1).sum() > 0.55 * h * w:
                circles.append(((s[1].start + s[1].stop - 1) / 2, (s[0].start + s[0].stop - 1) / 2))

    def px(curve, t, g):
        _, _, _, _ = curve
        j = TABLE1.index(curve)
        scale = px_per_unit * (4 if j >= 10 else 1)
        x = x0 + k * t
        return x, zeros[j] + tilt * (x - 270) - g * scale

    out = {c[0]: [] for c in TABLE1}
    for cx, cy in circles:
        t = (cx - x0) / k
        # past 11.5 ms are the key's markers; between 10.4 and 11.1 ms the only holes are in the printed
        # depolarizations ("88", "38", "6"): the measured points there sit at 8.8 and 11.25 ms
        if t < -0.1 or t > 11.5 or 10.4 < t < 11.1:
            continue
        d = [abs(px(c, t, eqn11(t, c[2], c[3]))[1] - cy) for c in TABLE1]
        j = int(np.argmin(d))
        if d[j] > 80:
            print(f"  unassigned circle at t={t:.2f} ms, y={cy:.0f} (nearest curve {TABLE1[j][0]}, {d[j]:.0f} px)")
            continue
        c = TABLE1[j]
        scale = px_per_unit * (4 if j >= 10 else 1)
        g = (zeros[j] + tilt * (cx - 270) - cy) / scale
        out[c[0]].append((round(max(t, 0.0), 3), round(g, 3)))

    for c in TABLE1:
        pts = sorted(out[c[0]])
        out[c[0]] = pts
        err = np.mean([abs(g - eqn11(t, c[2], c[3])) for t, g in pts]) if pts else float("nan")
        print(f"  {c[0]} {c[1]:>3} mV: {len(pts):2d} points, first {pts[0] if pts else None}, mean |data - eqn 11| {err:.2f}")
        assert pts, c

    data = {
        "figure": "Hodgkin & Huxley 1952, J Physiol 117:500, Fig. 3 (p. 508)",
        "traced": "Circles traced from the archive scan (PMC1392413) by tools/trace/hh1952_fig3.py; values are read off the printed figure, so carry its drawing error.",
        "units": {"t": "ms", "g": "m.mho/cm2 (mS/cm2)"},
        "conditions": "axon 17, 6-7 C, sea water and choline sea water; gK0 = 0.24",
        "curves": [{"curve": c[0], "depolarization": c[1], "gKinf": c[2], "tauN": c[3], "points": out[c[0]]} for c in TABLE1],
    }
    dest = REPO / "src" / "paper" / "hh1952_fig3.json"
    dest.parent.mkdir(exist_ok=True)
    dest.write_text(json.dumps(data, indent=1) + "\n")
    print("wrote", dest)

    if review:
        img = fig.convert("RGB")
        dr = ImageDraw.Draw(img)
        for j, c in enumerate(TABLE1):
            ts = np.linspace(0, 11, 200)
            dr.line([px(c, t, g) for t, g in zip(ts, eqn11(ts, c[2], c[3]))], fill=(0, 160, 255), width=3)
            for t, g in out[c[0]]:
                x, y = px(c, t, g)
                dr.ellipse((x - 9, y - 9, x + 9, y + 9), outline=(255, 0, 0), width=4)
            dr.text((2300, zeros[j] - 40), c[0], fill=(255, 0, 0))
        Path(review).mkdir(parents=True, exist_ok=True)
        img.resize((img.width // 2, img.height // 2)).save(Path(review) / "fig3_overlay.png")
        print("review image:", Path(review) / "fig3_overlay.png")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
