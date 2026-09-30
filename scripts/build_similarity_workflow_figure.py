from __future__ import annotations

from html import escape
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "outputs" / "journal-revision-20260810-ai-framework" / "architecture"
OUT.mkdir(parents=True, exist_ok=True)

WIDTH, HEIGHT = 1600, 2100
WHITE = "#FFFFFF"
INK = "#17212B"
NAVY = "#16324F"
BLUE = "#2D6A9F"
TEAL = "#2A9D8F"
PURPLE = "#6950A1"
GOLD = "#D99A20"
MUTED = "#536575"
ARROW = "#74899C"
PALE_BLUE = "#EEF4F8"
PALE_TEAL = "#EAF7F4"
PALE_PURPLE = "#F2EEFA"
PALE_GOLD = "#FFF8E5"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype("arialbd.ttf" if bold else "arial.ttf", size)
    except OSError:
        return ImageFont.load_default()


def centered_text(
    draw: ImageDraw.ImageDraw,
    bounds: tuple[int, int, int, int],
    text: str,
    face: ImageFont.FreeTypeFont,
    fill: str,
) -> None:
    x0, y0, x1, y1 = bounds
    bbox = draw.multiline_textbbox((0, 0), text, font=face, spacing=6, align="center")
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    draw.multiline_text(
        (x0 + (x1 - x0 - text_width) / 2, y0 + (y1 - y0 - text_height) / 2 - bbox[1]),
        text,
        font=face,
        fill=fill,
        spacing=6,
        align="center",
    )


def box(
    draw: ImageDraw.ImageDraw,
    bounds: tuple[int, int, int, int],
    title: str,
    lines: list[str],
    color: str,
    fill: str,
    body_size: int = 23,
) -> None:
    x0, y0, x1, y1 = bounds
    draw.rounded_rectangle(bounds, radius=22, fill=fill, outline=color, width=4)
    draw.rounded_rectangle((x0, y0, x1, y0 + 66), radius=22, fill=color)
    draw.rectangle((x0, y0 + 40, x1, y0 + 66), fill=color)
    centered_text(draw, (x0 + 8, y0 + 7, x1 - 8, y0 + 60), title, font(27, True), WHITE)
    if lines:
        centered_text(draw, (x0 + 25, y0 + 80, x1 - 25, y1 - 18), "\n".join(lines), font(body_size), INK)


def arrow(draw: ImageDraw.ImageDraw, points: list[tuple[int, int]], width: int = 5) -> None:
    draw.line(points, fill=ARROW, width=width, joint="curve")
    (tx, ty), (sx, sy) = points[-1], points[-2]
    dx, dy = tx - sx, ty - sy
    length = max((dx * dx + dy * dy) ** 0.5, 1.0)
    ux, uy = dx / length, dy / length
    px, py = -uy, ux
    base_x, base_y = tx - ux * 22, ty - uy * 22
    draw.polygon(
        [(tx, ty), (base_x + px * 11, base_y + py * 11), (base_x - px * 11, base_y - py * 11)],
        fill=ARROW,
    )


def svg_text(
    x: int,
    y: int,
    value: str,
    size: int,
    color: str,
    bold: bool = False,
    anchor: str = "middle",
) -> str:
    return (
        f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-family="Arial" '
        f'font-size="{size}" font-weight="{700 if bold else 400}" fill="{color}">{escape(value)}</text>'
    )


def svg_box(
    bounds: tuple[int, int, int, int],
    title: str,
    lines: list[str],
    color: str,
    fill: str,
    body_size: int = 23,
) -> list[str]:
    x0, y0, x1, y1 = bounds
    width, height = x1 - x0, y1 - y0
    rows = [
        f'<rect x="{x0}" y="{y0}" width="{width}" height="{height}" rx="22" fill="{fill}" stroke="{color}" stroke-width="4"/>',
        f'<path d="M{x0+22},{y0} H{x1-22} Q{x1},{y0} {x1},{y0+22} V{y0+66} H{x0} V{y0+22} Q{x0},{y0} {x0+22},{y0}" fill="{color}"/>',
        svg_text((x0 + x1) // 2, y0 + 44, title, 27, WHITE, True),
    ]
    available = y1 - (y0 + 90)
    step = min(body_size + 16, available / max(1, len(lines)))
    start = y0 + 102 + max(0, (available - step * len(lines)) / 2)
    for index, line in enumerate(lines):
        rows.append(svg_text((x0 + x1) // 2, int(start + index * step), line, body_size, INK))
    return rows


def svg_arrow(points: list[tuple[int, int]], group_id: str | None = None) -> str:
    points_value = " ".join(f"{x},{y}" for x, y in points)
    polyline = (
        f'<polyline points="{points_value}" fill="none" stroke="{ARROW}" '
        'stroke-width="5" stroke-linejoin="round" marker-end="url(#arrow)"/>'
    )
    return f'<g id="{group_id}">{polyline}</g>' if group_id else polyline


def build() -> tuple[Path, Path]:
    image = Image.new("RGB", (WIDTH, HEIGHT), WHITE)
    draw = ImageDraw.Draw(image)
    draw.text((65, 42), "Six-field similarity workflow", font=font(48, True), fill=NAVY)
    draw.text(
        (68, 107),
        "TF-IDF follows the lexical path; Sentence-BERT and BGE-M3 share model-specific encoding",
        font=font(22),
        fill=MUTED,
    )

    input_box = (70, 190, 1530, 455)
    normalization = (150, 525, 1450, 690)
    lexical = (70, 790, 690, 960)
    encoding = (910, 790, 1530, 960)
    tfidf = (70, 1060, 690, 1305)
    sbert = (790, 1060, 1135, 1305)
    bge = (1185, 1060, 1530, 1305)
    scores = (150, 1405, 1450, 1565)
    weighted = (150, 1640, 1450, 1800)
    outcome = (150, 1870, 1450, 2035)

    # Connectors are drawn first so that no path obscures a label.
    arrow(draw, [(800, 455), (800, 525)])
    arrow(draw, [(800, 690), (800, 740), (380, 740), (380, 790)])
    arrow(draw, [(800, 690), (800, 740), (1220, 740), (1220, 790)])
    arrow(draw, [(380, 960), (380, 1060)])
    arrow(draw, [(1220, 960), (1220, 1005), (962, 1005), (962, 1060)])
    arrow(draw, [(1220, 960), (1220, 1005), (1357, 1005), (1357, 1060)])
    draw.line([(380, 1305), (380, 1360), (1357, 1360)], fill=ARROW, width=5, joint="curve")
    draw.line([(962, 1305), (962, 1360)], fill=ARROW, width=5)
    draw.line([(1357, 1305), (1357, 1360)], fill=ARROW, width=5)
    arrow(draw, [(800, 1360), (800, 1405)])
    arrow(draw, [(800, 1565), (800, 1640)])
    arrow(draw, [(800, 1800), (800, 1870)])

    boxes = (
        (input_box, "Proposal representation", ["Title  |  Description  |  Problem statement", "Objectives  |  Features  |  Technologies/tools"], BLUE, PALE_BLUE, 23),
        (normalization, "Field preparation", ["Normalize every available field and preserve field identity"], TEAL, PALE_TEAL, 23),
        (lexical, "Lexical vectorization", ["Word and character n-grams"], GOLD, PALE_GOLD, 23),
        (encoding, "Model-specific encoding", ["Apply each neural checkpoint to the same prepared fields"], PURPLE, PALE_PURPLE, 22),
        (tfidf, "TF-IDF", ["word 1-2 grams", "character-within-word 3-5 grams", "0.70 / 0.30 blend"], GOLD, PALE_GOLD, 21),
        (sbert, "Sentence-BERT", ["MiniLM-L12-v2", "384 dimensions"], PURPLE, PALE_PURPLE, 20),
        (bge, "BGE-M3", ["dense representation", "1,024 dimensions"], PURPLE, PALE_PURPLE, 20),
        (scores, "Field-level cosine similarity", ["One comparable score for each available project field"], NAVY, PALE_BLUE, 22),
        (weighted, "Weighted aggregation", ["0.20 title  |  0.20 description  |  0.20 problem", "0.15 objectives  |  0.15 features  |  0.10 tools"], TEAL, PALE_TEAL, 21),
        (outcome, "Stored evidence and review priority", ["Low 0-39%  |  Medium 40-69%  |  High 70-100%"], BLUE, PALE_BLUE, 22),
    )
    for args in boxes:
        box(draw, *args)

    png = OUT / "figure-a04-similarity-workflow.png"
    image.save(png, dpi=(300, 300), optimize=True)

    svg = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-labelledby="title desc">',
        '<title id="title">Six-field similarity workflow</title>',
        '<desc id="desc">TF-IDF follows a separate lexical vectorization branch. Model-specific encoding branches explicitly to both Sentence-BERT and BGE-M3 before the three paths merge for field-level cosine similarity and weighted aggregation.</desc>',
        f'<rect width="{WIDTH}" height="{HEIGHT}" fill="{WHITE}"/>',
        '<defs><marker id="arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 z" fill="#74899C"/></marker></defs>',
        svg_text(65, 90, "Six-field similarity workflow", 48, NAVY, True, "start"),
        svg_text(68, 137, "TF-IDF follows the lexical path; Sentence-BERT and BGE-M3 share model-specific encoding", 22, MUTED, False, "start"),
        svg_arrow([(800, 455), (800, 525)]),
        svg_arrow([(800, 690), (800, 740), (380, 740), (380, 790)], "tfidf-lexical-branch"),
        svg_arrow([(800, 690), (800, 740), (1220, 740), (1220, 790)], "neural-encoding-input"),
        svg_arrow([(380, 960), (380, 1060)], "lexical-vectorization-to-tfidf"),
        '<g id="model-specific-encoding-targets" data-targets="Sentence-BERT BGE-M3">',
        svg_arrow([(1220, 960), (1220, 1005), (962, 1005), (962, 1060)], "encoding-to-sentence-bert"),
        svg_arrow([(1220, 960), (1220, 1005), (1357, 1005), (1357, 1060)], "encoding-to-bge-m3"),
        '</g>',
        f'<polyline points="380,1305 380,1360 1357,1360" fill="none" stroke="{ARROW}" stroke-width="5" stroke-linejoin="round"/>',
        f'<line x1="962" y1="1305" x2="962" y2="1360" stroke="{ARROW}" stroke-width="5"/>',
        f'<line x1="1357" y1="1305" x2="1357" y2="1360" stroke="{ARROW}" stroke-width="5"/>',
        svg_arrow([(800, 1360), (800, 1405)]),
        svg_arrow([(800, 1565), (800, 1640)]),
        svg_arrow([(800, 1800), (800, 1870)]),
    ]
    for args in boxes:
        svg.extend(svg_box(*args))
    svg.append("</svg>")
    svg_path = OUT / "figure-a04-similarity-workflow.svg"
    svg_path.write_text("\n".join(svg), encoding="utf-8")
    return png, svg_path


if __name__ == "__main__":
    print("\n".join(str(path) for path in build()))
