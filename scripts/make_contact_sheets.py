from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--per-sheet", type=int, default=12)
    args = parser.parse_args()
    files = sorted(args.source.glob("page-*.png"))
    args.output.mkdir(parents=True, exist_ok=True)
    thumb_width = 350
    columns = 4
    for sheet_index, start in enumerate(range(0, len(files), args.per_sheet), start=1):
        batch = files[start : start + args.per_sheet]
        thumbs = []
        for path in batch:
            with Image.open(path) as image:
                ratio = thumb_width / image.width
                thumb = image.convert("RGB").resize((thumb_width, round(image.height * ratio)))
            canvas = Image.new("RGB", (thumb_width, thumb.height + 28), "white")
            canvas.paste(thumb, (0, 0))
            ImageDraw.Draw(canvas).text((8, thumb.height + 6), path.stem, fill="black")
            thumbs.append(canvas)
        rows = (len(thumbs) + columns - 1) // columns
        cell_height = max(t.height for t in thumbs)
        sheet = Image.new("RGB", (columns * thumb_width, rows * cell_height), "white")
        for index, thumb in enumerate(thumbs):
            x = (index % columns) * thumb_width
            y = (index // columns) * cell_height
            sheet.paste(thumb, (x, y))
        sheet.save(args.output / f"contact-{sheet_index:02d}.png")


if __name__ == "__main__":
    main()
