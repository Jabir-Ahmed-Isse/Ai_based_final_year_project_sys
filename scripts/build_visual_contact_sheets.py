from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_directory", type=Path)
    parser.add_argument("output_directory", type=Path)
    parser.add_argument("--pattern", default="*.png")
    parser.add_argument("--columns", type=int, default=3)
    parser.add_argument("--rows", type=int, default=3)
    args = parser.parse_args()

    paths = sorted(args.input_directory.glob(args.pattern))
    args.output_directory.mkdir(parents=True, exist_ok=True)
    columns = args.columns
    rows = args.rows
    thumb_width = 420
    thumb_height = 260
    label_height = 42
    margin = 18
    font = ImageFont.load_default(size=15)
    per_sheet = columns * rows

    for sheet_index in range(math.ceil(len(paths) / per_sheet)):
        subset = paths[sheet_index * per_sheet : (sheet_index + 1) * per_sheet]
        canvas = Image.new(
            "RGB",
            (
                margin + columns * (thumb_width + margin),
                margin + rows * (thumb_height + label_height + margin),
            ),
            "white",
        )
        draw = ImageDraw.Draw(canvas)
        for index, path in enumerate(subset):
            with Image.open(path) as image:
                image = image.convert("RGB")
                image.thumbnail((thumb_width, thumb_height))
                column = index % columns
                row = index // columns
                x = margin + column * (thumb_width + margin)
                y = margin + row * (thumb_height + label_height + margin)
                canvas.paste(image, (x, y))
                label = path.stem[:65]
                draw.text((x, y + thumb_height + 6), label, fill="black", font=font)
        canvas.save(args.output_directory / f"contact-{sheet_index + 1:02d}.png", optimize=True)

    print(f"{len(paths)} images -> {math.ceil(len(paths) / per_sheet)} contact sheets")


if __name__ == "__main__":
    main()
