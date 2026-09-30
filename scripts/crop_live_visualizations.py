from __future__ import annotations

import csv
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
VISUAL_DIR = ROOT / "outputs" / "journal-package-20260724" / "system-visualizations"
RAW_DIR = VISUAL_DIR / "raw-browser-captures"
MANIFEST = RAW_DIR / "capture-manifest.json"
INVENTORY = VISUAL_DIR / "visualization-capture-inventory.csv"


def main() -> None:
    captures = json.loads(MANIFEST.read_text(encoding="utf-8"))
    rows: list[list[str | int]] = []

    for capture in captures:
        raw_path = Path(capture["rawFile"])
        output_path = Path(capture["outFile"])
        crop = capture["crop"]

        with Image.open(raw_path) as image:
            left = max(0, int(crop["left"]) - 2)
            top = max(0, int(crop["top"]) - 2)
            right = min(image.width, int(crop["right"]) + 2)
            bottom = min(image.height, int(crop["bottom"]) + 2)
            cropped = image.crop((left, top, right, bottom))
            cropped.save(output_path, format="PNG", optimize=True)

        rows.append(
            [
                capture["index"] + 1,
                capture["title"],
                capture["part"],
                capture["parts"],
                output_path.name,
                raw_path.name,
                cropped.width,
                cropped.height,
                f"{capture['scrollY']:.3f}",
                "Live in-app browser capture; exact card-bound crop",
            ]
        )

    with INVENTORY.open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.writer(stream)
        writer.writerow(
            [
                "visual_number",
                "live_page_title",
                "part",
                "parts",
                "cropped_file",
                "raw_browser_frame",
                "width_px",
                "height_px",
                "scroll_y_px",
                "provenance",
            ]
        )
        writer.writerows(rows)

    print(
        json.dumps(
            {
                "captured_sections": len({row[0] for row in rows}),
                "cropped_files": len(rows),
                "inventory": str(INVENTORY.resolve()),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
