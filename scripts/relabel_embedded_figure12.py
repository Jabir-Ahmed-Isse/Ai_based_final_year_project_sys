from __future__ import annotations

import argparse
from io import BytesIO
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from PIL import Image, ImageDraw, ImageFont


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("docx", type=Path)
    args = parser.parse_args()
    with ZipFile(args.docx) as archive:
        parts = {name: archive.read(name) for name in archive.namelist()}
    target = "word/media/image12.png"
    with Image.open(BytesIO(parts[target])) as source:
        image = source.convert("RGB")
    draw = ImageDraw.Draw(image)
    # The source chart has a white background. Cover only the existing title.
    draw.rectangle((0, 0, image.width, 92), fill="white")
    font_path = Path("C:/Windows/Fonts/arial.ttf")
    font = ImageFont.truetype(str(font_path), 30) if font_path.exists() else ImageFont.load_default()
    title = "Expert-reviewed supervisor labels"
    box = draw.textbbox((0, 0), title, font=font)
    x = (image.width - (box[2] - box[0])) // 2
    draw.text((x, 26), title, fill="#222222", font=font)
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    parts[target] = output.getvalue()
    with ZipFile(args.docx, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in parts.items():
            archive.writestr(name, data)
    with ZipFile(args.docx) as archive:
        if archive.testzip() is not None:
            raise RuntimeError("DOCX archive check failed")


if __name__ == "__main__":
    main()
