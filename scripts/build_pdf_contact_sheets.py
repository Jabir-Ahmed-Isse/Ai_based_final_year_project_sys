from __future__ import annotations

import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PAGE_DIR = (
    Path(sys.argv[1]).resolve()
    if len(sys.argv) > 1
    else ROOT / "tmp" / "pdfs" / "complete-visuals-qa"
)
OUTPUT_DIR = PAGE_DIR / "contact-sheets"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

page_paths = sorted(PAGE_DIR.glob("page-*.png"))
columns = 4
rows = 4
thumb_width = 255
thumb_height = 330
label_height = 24
margin = 14
font = ImageFont.load_default()

for sheet_index in range(math.ceil(len(page_paths) / (columns * rows))):
    subset = page_paths[
        sheet_index * columns * rows : (sheet_index + 1) * columns * rows
    ]
    sheet = Image.new(
        "RGB",
        (
            margin + columns * (thumb_width + margin),
            margin + rows * (thumb_height + label_height + margin),
        ),
        "white",
    )
    draw = ImageDraw.Draw(sheet)
    for local_index, path in enumerate(subset):
        with Image.open(path) as page:
            page = page.convert("RGB")
            page.thumbnail((thumb_width, thumb_height))
            column = local_index % columns
            row = local_index // columns
            x = margin + column * (thumb_width + margin)
            y = margin + row * (thumb_height + label_height + margin)
            sheet.paste(page, (x, y))
            page_number = int(path.stem.rsplit("-", 1)[-1])
            draw.text(
                (x, y + thumb_height + 4),
                f"Page {page_number}",
                fill="black",
                font=font,
            )
    output = OUTPUT_DIR / f"contact-{sheet_index + 1:02d}.png"
    sheet.save(output, optimize=True)

print(f"{len(page_paths)} pages -> {math.ceil(len(page_paths) / 16)} contact sheets")
