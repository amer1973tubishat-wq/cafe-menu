"""يجهّز صور الأصناف للموقع.

الاستعمال:
    python3 tools/add-menu-images.py photos/

حط صورك بأي اسم بمجلد photos/ (الأسهل تسمّيها بالاسم الإنجليزي للصنف، مثل knafeh.jpg
أو flat-white.png). الأداة لكل صورة:
  - بتقصّها من النص بنسبة البطاقة (1.45:1)
  - بتصغّرها لعرض 960px وبتحفظها WebP خفيفة في assets/menu/
  - بتحاول تلاقي الصنف اللي إله نفس الاسم بـ js/menu-data.js، وبتطبعلك سطر image جاهز
"""
import re
import sys
from pathlib import Path

from PIL import Image, ImageOps

RATIO = 1.45
WIDTH = 960
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "menu"
EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def menu_names():
    data = (ROOT / "js" / "menu-data.js").read_text(encoding="utf-8")
    return {slug(m): m for m in re.findall(r'\ben: "([^"]+)"', data)}


def prepare(src, dst):
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")  # صور الجوال بتيجي مقلوبة أحياناً
    w, h = im.size
    if w / h > RATIO:
        nw = int(h * RATIO)
        im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = int(w / RATIO)
        im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    if im.width > WIDTH:
        im = im.resize((WIDTH, round(WIDTH / RATIO)), Image.LANCZOS)
    im.save(dst, "WEBP", quality=80, method=6)


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    folder = Path(sys.argv[1])
    OUT.mkdir(parents=True, exist_ok=True)
    names = menu_names()
    photos = sorted(p for p in folder.iterdir() if p.suffix.lower() in EXTS)
    if not photos:
        print(f"ما لقيت صور ({', '.join(sorted(EXTS))}) بـ {folder}")
        sys.exit(1)
    for p in photos:
        key = slug(p.stem)
        dst = OUT / f"{key}.webp"
        prepare(p, dst)
        kb = dst.stat().st_size // 1024
        rel = dst.relative_to(ROOT).as_posix()
        if key in names:
            print(f'✓ {p.name} → {rel} ({kb}KB)  — حط عند "{names[key]}":  image: "{rel}",')
        else:
            print(f"? {p.name} → {rel} ({kb}KB)  — ما لقيت صنف بهالاسم؛ حط السطر بإيدك: image: \"{rel}\",")


if __name__ == "__main__":
    main()
