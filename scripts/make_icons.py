"""Draws icons/icon{16,32,48,128}.png: a blue rounded square with a white 訳."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SIZES = (16, 32, 48, 128)
FONT_CANDIDATES = (
    "C:/Windows/Fonts/YuGothB.ttc",
    "C:/Windows/Fonts/meiryob.ttc",
    "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
)
SCALE = 8


def load_font(size):
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    raise SystemExit("No CJK font found; add one to FONT_CANDIDATES.")


def draw(size):
    big = size * SCALE
    image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(image)
    d.rounded_rectangle((0, 0, big - 1, big - 1), radius=big * 0.22, fill=(37, 99, 235, 255))
    font = load_font(int(big * 0.68))
    d.text((big / 2, big / 2), "訳", font=font, fill="white", anchor="mm")
    return image.resize((size, size), Image.LANCZOS)


def main():
    out = ROOT / "icons"
    out.mkdir(exist_ok=True)
    for size in SIZES:
        draw(size).save(out / f"icon{size}.png")
        print(out / f"icon{size}.png")


if __name__ == "__main__":
    main()
