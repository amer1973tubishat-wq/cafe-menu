import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB'); W, H = im.size
a = np.asarray(im).astype(np.float32)
Y, X = np.mgrid[0:H, 0:W]

def _box(arr, r, axis):
    # box blur بالمجموع التراكمي، مع حواف ممدودة
    pad = [(0, 0), (0, 0)]; pad[axis] = (r + 1, r)
    c = np.cumsum(np.pad(arr, pad, mode='edge'), axis=axis)
    n = arr.shape[axis]
    hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
    lo = np.take(c, np.arange(0, n), axis=axis)
    return (hi - lo) / (2 * r + 1)

def blur(arr, r):
    # 3 مرات box blur ≈ gaussian
    out = arr.astype(np.float64); k = max(1, int(round(r * 0.58)))
    for _ in range(3):
        out = _box(_box(out, k, 0), k, 1)
    return out

def sky_model(mask, r):
    m = mask.astype(np.float32); den = blur(m, r) + 1e-6
    return np.stack([blur(a[..., c] * m, r) / den for c in range(3)], -1)

# 1) تخمين أولي للسما، وبعدين نموذج ناعم للونها
guess = np.where(X < 285, Y < 150, np.where(X < 660, Y < 92, np.where(X < 800, Y < 170, Y < 200)))
model = sky_model(guess, 50)
dist = np.sqrt(((a - model) ** 2).sum(-1))
mask = guess & (dist < 30)
model = sky_model(mask, 40)
dist = np.sqrt(((a - model) ** 2).sum(-1))

# 2) لكل عمود: أول بكسل مش سما = خط الأفق. الغيوم المضيئة أفتح من القلعة والشجر،
#    فالعتبة حسب المنطقة بالإضاءة مع بُعد اللون عن نموذج السما.
lum = a @ np.array([0.299, 0.587, 0.114])
castle = (X >= 285) & (X < 660)
nonsky = np.where(castle, (dist > 24) & (lum < 200) & (Y >= 80),
                  np.where(X < 285, (lum < 150) & (Y >= 140), (lum < 170) & (Y >= 150)))
nonsky |= Y >= 236
sky = np.zeros((H, W), bool)
for x in range(W):
    col = nonsky[:, x]
    run = col[:-2] & col[1:-1] & col[2:]
    idx = np.argmax(run) if run.any() else H
    sky[:idx, x] = True

alpha_hill = Image.fromarray(((~sky) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))

# 3) طبقة السما: كل عمود بيكمّل بلون آخر بكسلات سما فوق الأفق، وبعدين تنعيم أفقي
sky_arr = a.copy()
for x in range(W):
    k = int(sky[:, x].sum())
    ref = a[max(0, k - 8):max(1, k - 2), x].mean(0)
    sky_arr[k:, x] = ref
smooth = np.stack([blur(sky_arr[..., c], 70) for c in range(3)], -1)
below = ~sky
grow = np.zeros_like(below)
grow[:-4] |= below[4:]
sky_arr = np.where((below | grow)[..., None], smooth, sky_arr)
sky_img = Image.fromarray(np.clip(sky_arr, 0, 255).astype(np.uint8))
sky_img.save(f'{out}/sky.webp', quality=82, method=6)

# 4) نصّين التراس: الشق عند x=620
SEAM = 620
left_poly = [(0, 214), (178, 214), (178, 236), (200, 236), (202, 266), (600, 264), (606, 292), (582, 296), (582, 438), (SEAM + 14, 437), (SEAM + 14, H), (0, H)]
right_poly = [(SEAM - 14, 438), (642, 436), (648, 380), (660, 343), (672, 343), (686, 380), (693, 434), (760, 444), (840, 455), (907, 468), (907, 362), (920, 362),
              (920, 474), (946, 479), (952, 420), (966, 380), (978, 370), (990, 380), (1002, 420), (1006, 492), (1009, 476), (1023, 476), (1025, 496), (1100, 509), (1200, 534),
              (1300, 557), (1408, 581), (W, H), (SEAM - 14, H)]

# التلة بدون التراس: تحت خط التراس منكمّل لون المنحدر ونغمّقه، عشان لما ينفتح التراس ما يبين تراس ثاني وراه
tm = Image.new('L', (W, H), 0); d = ImageDraw.Draw(tm)
d.polygon(left_poly, fill=255); d.polygon(right_poly, fill=255)
tmask = np.asarray(tm) > 0
hill_arr = a.copy()
ty = np.array([int(np.argmax(tmask[:, x])) if tmask[:, x].any() else H for x in range(W)])
for x in range(W):
    k = ty[x]
    if k >= H: continue
    ref = a[max(0, k - 16):max(1, k - 6), x].mean(0)
    n = H - k
    shade = np.linspace(1.0, 0.42, n)[:, None]
    hill_arr[k:, x] = ref * shade
fill = np.stack([blur(hill_arr[..., c], 26) for c in range(3)], -1)
keep = np.zeros((H, W), bool)
for x in range(W):
    keep[ty[x]:min(H, ty[x] + 8), x] = True  # شريط من البكسلات الأصلية تحت حافة التراس
use_fill = tmask & ~keep & (np.abs(X - SEAM) > 28)
hill_arr = np.where(use_fill[..., None], fill, a)
hill = Image.fromarray(np.clip(hill_arr, 0, 255).astype(np.uint8)); hill.putalpha(alpha_hill)
hill.save(f'{out}/hill.webp', quality=82, method=6)

for name, poly in (('terrace-left', left_poly), ('terrace-right', right_poly)):
    m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).polygon(poly, fill=255)
    soft = np.asarray(m.filter(ImageFilter.GaussianBlur(3))).astype(np.float64)
    # الشق ناعم: النصّين بيتداخلوا على 24px، وورا الشق التلة محتفظة بالبكسلات الأصلية فما بيبين إشي وهم مسكّرين
    ramp = np.clip((SEAM + 12 - X) / 24, 0, 1) if name == 'terrace-left' else np.clip((X - (SEAM - 12)) / 24, 0, 1)
    sa = np.clip(soft * ramp, 0, 255).astype(np.uint8)
    layer = im.copy(); layer.putalpha(Image.fromarray(sa))
    layer.save(f'{out}/{name}.webp', quality=84, method=6)

# معاينة: الطبقات فوق خلفية ماجنتا
prev = Image.new('RGB', (W, H), (255, 0, 255)); prev.paste(hill, (0, 0), hill); prev.save(f'{out}/../preview-hill.png')
prev = Image.new('RGB', (W, H), (255, 0, 255))
for n in ('terrace-left', 'terrace-right'):
    l = Image.open(f'{out}/{n}.webp'); prev.paste(l, (0, 0), l)
prev.save(f'{out}/../preview-terrace.png')
print('ok')
