from __future__ import annotations

from html import escape
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "outputs" / "journal-revision-20260810-ai-framework" / "architecture"
OUT.mkdir(parents=True, exist_ok=True)

WIDTH, HEIGHT = 2700, 1650
NAVY = "#17365D"
BLUE = "#2F6BCE"
TEAL = "#0F766E"
GOLD = "#D97706"
PURPLE = "#6D4C9F"
INK = "#152238"
MUTED = "#52657A"
PALE_BLUE = "#EAF2FF"
PALE_TEAL = "#EAF8F5"
PALE_GOLD = "#FFF7E6"
PALE_PURPLE = "#F3EFFA"
PALE_GRAY = "#F5F7FA"
LINE = "#71869A"
WHITE = "#FFFFFF"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "arialbd.ttf" if bold else "arial.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


TITLE = font(62, True)
SUBTITLE = font(27)
LAYER = font(27, True)
BOX_TITLE = font(32, True)
BODY = font(25)
SMALL = font(22)
FOOT = font(22)
MODEL_DETAIL = font(20)


def wrapped(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    lines: list[str] = []
    for paragraph in text.split("\n"):
        words = paragraph.split()
        line = ""
        for word in words:
            candidate = f"{line} {word}".strip()
            if line and draw.textbbox((0, 0), candidate, font=fnt)[2] > max_width:
                lines.append(line)
                line = word
            else:
                line = candidate
        if line:
            lines.append(line)
    return lines


def center_text(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    text: str,
    fnt: ImageFont.FreeTypeFont,
    fill: str = INK,
    line_gap: int = 6,
) -> None:
    x0, y0, x1, y1 = box
    lines = wrapped(draw, text, fnt, x1 - x0 - 30)
    heights = [draw.textbbox((0, 0), line, font=fnt)[3] for line in lines]
    total = sum(heights) + line_gap * max(0, len(lines) - 1)
    y = y0 + (y1 - y0 - total) / 2
    for line, height in zip(lines, heights):
        bbox = draw.textbbox((0, 0), line, font=fnt)
        x = x0 + (x1 - x0 - (bbox[2] - bbox[0])) / 2
        draw.text((x, y), line, font=fnt, fill=fill)
        y += height + line_gap


def rounded_box(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    title: str,
    lines: list[str],
    outline: str,
    fill: str,
    title_fill: str | None = None,
    body_font: ImageFont.FreeTypeFont = BODY,
) -> None:
    x0, y0, x1, y1 = box
    draw.rounded_rectangle(box, radius=24, fill=fill, outline=outline, width=4)
    draw.rounded_rectangle((x0, y0, x1, y0 + 66), radius=24, fill=title_fill or outline)
    draw.rectangle((x0, y0 + 42, x1, y0 + 66), fill=title_fill or outline)
    center_text(draw, (x0 + 10, y0 + 4, x1 - 10, y0 + 62), title, BOX_TITLE, WHITE)
    available_top = y0 + 82
    row_height = (y1 - available_top - 18) / max(1, len(lines))
    for index, line in enumerate(lines):
        top = int(available_top + index * row_height)
        bottom = int(available_top + (index + 1) * row_height - 8)
        center_text(draw, (x0 + 18, top, x1 - 18, bottom), line, body_font)


def arrow(
    draw: ImageDraw.ImageDraw,
    start: tuple[int, int],
    end: tuple[int, int],
    color: str = LINE,
    width: int = 5,
    dashed: bool = False,
    both: bool = False,
) -> None:
    x0, y0 = start
    x1, y1 = end
    if dashed:
        segments = 12
        for index in range(segments):
            if index % 2 == 0:
                a = index / segments
                b = (index + 1) / segments
                draw.line((x0 + (x1 - x0) * a, y0 + (y1 - y0) * a, x0 + (x1 - x0) * b, y0 + (y1 - y0) * b), fill=color, width=width)
    else:
        draw.line((start, end), fill=color, width=width)

    def head(tip: tuple[int, int], tail: tuple[int, int]) -> None:
        tx, ty = tip
        sx, sy = tail
        dx, dy = tx - sx, ty - sy
        length = max(1.0, (dx * dx + dy * dy) ** 0.5)
        ux, uy = dx / length, dy / length
        px, py = -uy, ux
        base_x, base_y = tx - ux * 24, ty - uy * 24
        draw.polygon(
            [(tx, ty), (base_x + px * 12, base_y + py * 12), (base_x - px * 12, base_y - py * 12)],
            fill=color,
        )

    head(end, start)
    if both:
        head(start, end)


def svg_text(x: float, y: float, text: str, size: int, color: str, bold: bool = False, anchor: str = "middle") -> str:
    return f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-family="Arial" font-size="{size}" font-weight="{700 if bold else 400}" fill="{color}">{escape(text)}</text>'


def build_png() -> Path:
    image = Image.new("RGB", (WIDTH, HEIGHT), WHITE)
    draw = ImageDraw.Draw(image)

    draw.text((85, 48), "Implemented system and AI framework", font=TITLE, fill=NAVY)
    draw.text(
        (88, 128),
        "Operational data flow, implemented model components, supporting NLP tools, and the human-decision boundary",
        font=SUBTITLE,
        fill=MUTED,
    )

    columns = [
        (90, 250, 560, 760),
        (630, 250, 1120, 760),
        (1190, 250, 1755, 760),
        (1825, 250, 2610, 760),
    ]
    labels = ["ACTORS", "PRESENTATION", "APPLICATION CONTROL", "PERSISTENCE AND AUDIT"]
    for box, label in zip(columns, labels):
        center_text(draw, (box[0], 190, box[2], 235), label, LAYER, NAVY)

    # Flow arrows are drawn before the boxes so no line crosses text.
    arrow(draw, (560, 505), (630, 505), both=True)
    arrow(draw, (1120, 505), (1190, 505), both=True)
    arrow(draw, (1755, 505), (1825, 505), both=True)
    arrow(draw, (1470, 760), (1470, 845), both=True)
    arrow(draw, (2215, 760), (2215, 845), color=TEAL, both=True)

    rounded_box(
        draw,
        columns[0],
        "Academic roles",
        [
            "Student - six-field proposal",
            "Supervisor - expertise and capacity",
            "Administrator/coordinator - review, assignment, reporting",
            "Human approval remains authoritative",
        ],
        BLUE,
        PALE_BLUE,
    )
    rounded_box(
        draw,
        columns[1],
        "Web application",
        [
            "React 19 + TypeScript + Vite 6",
            "React Router + Axios + Recharts",
            "Role dashboards and workflows",
        ],
        TEAL,
        PALE_TEAL,
    )
    rounded_box(
        draw,
        columns[2],
        "Express REST layer",
        [
            "Express 5 + Node.js",
            "JWT, bcryptjs and role authorization",
            "express-validator, CORS and REST routing",
            "Application coordination and persistence",
        ],
        NAVY,
        PALE_BLUE,
    )
    rounded_box(
        draw,
        columns[3],
        "MongoDB data layer",
        [
            "Mongoose 9 schemas",
            "Projects and supervisor profiles",
            "Scores, labels and model runs",
            "Assignments, reports and audit logs",
        ],
        GOLD,
        PALE_GOLD,
    )

    ai_outer = (90, 845, 2610, 1505)
    draw.rounded_rectangle(ai_outer, radius=28, fill=PALE_GRAY, outline=PURPLE, width=5)
    draw.rounded_rectangle((90, 845, 2610, 927), radius=28, fill=PURPLE)
    draw.rectangle((90, 900, 2610, 927), fill=PURPLE)
    center_text(
        draw,
        (110, 852, 2590, 918),
        "Flask AI service and evaluated inference stack",
        BOX_TITLE,
        WHITE,
    )

    inner = [
        (125, 960, 690, 1460),
        (720, 960, 1350, 1460),
        (1380, 960, 1970, 1460),
        (2000, 960, 2575, 1460),
    ]
    rounded_box(
        draw,
        inner[0],
        "Service orchestration",
        [
            "Flask + Flask-CORS",
            "Batch comparison and matching",
            "Thread-safe lazy model registry",
            "SHA-256 keyed embedding cache",
        ],
        BLUE,
        WHITE,
    )
    rounded_box(
        draw,
        inner[1],
        "Compared models",
        [
            "TF-IDF: word 1-2 grams + character-within-word 3-5 grams + cosine similarity",
            "Sentence-BERT: sentence-transformers/\nparaphrase-multilingual-MiniLM-L12-v2",
            "BGE-M3: dense representation from BAAI/bge-m3",
        ],
        TEAL,
        WHITE,
        body_font=MODEL_DETAIL,
    )
    rounded_box(
        draw,
        inner[2],
        "Inference and evidence",
        [
            "NumPy L2 normalization and cosine/dot product",
            "Six-field weighted aggregation",
            "Supervisor fit, eligibility and capacity",
            "Metrics, thresholds and reproducible reports",
        ],
        NAVY,
        WHITE,
    )
    rounded_box(
        draw,
        inner[3],
        "Supporting NLP tools",
        [
            "RapidFuzz + NLTK text normalization",
            "FAISS project-document vector retrieval",
            "Supports preparation and evidence retrieval",
        ],
        GOLD,
        WHITE,
    )

    draw.line((90, 1552, 2610, 1552), fill="#D5DEE7", width=2)
    draw.text((100, 1580), "Solid bidirectional arrows: authenticated requests, results and persisted evidence.", font=FOOT, fill=MUTED)
    draw.text((1470, 1580), "Decision rule: AI scores support review; authorized staff approve assignments.", font=FOOT, fill=NAVY)

    output = OUT / "figure-a01-overall-architecture.png"
    image.save(output, dpi=(300, 300), optimize=True)
    return output


def build_svg() -> Path:
    # The SVG preserves publication-scale vector text and an accessible description.
    svg = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-labelledby="title desc">',
        '<title id="title">Implemented system and AI framework</title>',
        '<desc id="desc">Architecture of the React, Express, MongoDB and Flask services, including the TF-IDF, Sentence-BERT and BGE-M3 inference path and supporting NLP and retrieval tools.</desc>',
        f'<rect width="{WIDTH}" height="{HEIGHT}" fill="{WHITE}"/>',
        svg_text(85, 105, "Implemented system and AI framework", 62, NAVY, True, "start"),
        svg_text(88, 157, "Operational data flow, implemented model components, supporting NLP tools, and the human-decision boundary", 27, MUTED, False, "start"),
    ]
    main = [
        (90, 250, 470, 510, BLUE, PALE_BLUE, "Academic roles", ["Student - six-field proposal", "Supervisor - expertise and capacity", "Administrator/coordinator - review, assignment, reporting", "Human approval remains authoritative"]),
        (630, 250, 490, 510, TEAL, PALE_TEAL, "Web application", ["React 19 + TypeScript + Vite 6", "React Router + Axios + Recharts", "Role dashboards and workflows"]),
        (1190, 250, 565, 510, NAVY, PALE_BLUE, "Express REST layer", ["Express 5 + Node.js", "JWT, bcryptjs and role authorization", "express-validator, CORS and REST routing", "Application coordination and persistence"]),
        (1825, 250, 785, 510, GOLD, PALE_GOLD, "MongoDB data layer", ["Mongoose 9 schemas", "Projects and supervisor profiles", "Scores, labels and model runs", "Assignments, reports and audit logs"]),
    ]
    for x, y, w, h, color, fill, title, rows in main:
        svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="24" fill="{fill}" stroke="{color}" stroke-width="4"/>')
        svg.append(f'<path d="M{x+24},{y} H{x+w-24} Q{x+w},{y} {x+w},{y+24} V{y+66} H{x} V{y+24} Q{x},{y} {x+24},{y}" fill="{color}"/>')
        svg.append(svg_text(x+w/2, y+45, title, 32, WHITE, True))
        for index, row in enumerate(rows):
            svg.append(svg_text(x+w/2, y+135+index*88, row, 24, INK))
    svg.append(f'<rect x="90" y="845" width="2520" height="660" rx="28" fill="{PALE_GRAY}" stroke="{PURPLE}" stroke-width="5"/>')
    svg.append(f'<path d="M118,845 H2582 Q2610,845 2610,873 V927 H90 V873 Q90,845 118,845" fill="{PURPLE}"/>')
    svg.append(svg_text(1350, 895, "Flask AI service and evaluated inference stack", 32, WHITE, True))
    inner = [
        (125, 960, 565, BLUE, "Service orchestration", ["Flask + Flask-CORS", "Batch comparison and matching", "Thread-safe lazy model registry", "SHA-256 keyed embedding cache"]),
        (720, 960, 630, TEAL, "Compared models", ["TF-IDF: word 1-2 + character-within-word 3-5", "grams + cosine similarity", "Sentence-BERT: sentence-transformers/", "paraphrase-multilingual-MiniLM-L12-v2", "BGE-M3: dense representation from", "BAAI/bge-m3"]),
        (1380, 960, 590, NAVY, "Inference and evidence", ["NumPy L2 normalization and cosine/dot product", "Six-field weighted aggregation", "Supervisor fit, eligibility and capacity", "Metrics, thresholds and reproducible reports"]),
        (2000, 960, 575, GOLD, "Supporting NLP tools", ["RapidFuzz + NLTK text normalization", "FAISS project-document vector retrieval", "Supports preparation and evidence retrieval"]),
    ]
    for x, y, w, color, title, rows in inner:
        svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="500" rx="22" fill="white" stroke="{color}" stroke-width="4"/>')
        svg.append(f'<path d="M{x+22},{y} H{x+w-22} Q{x+w},{y} {x+w},{y+22} V{y+66} H{x} V{y+22} Q{x},{y} {x+22},{y}" fill="{color}"/>')
        svg.append(svg_text(x+w/2, y+45, title, 30, WHITE, True))
        step = (500 - 135) / max(1, len(rows))
        for index, row in enumerate(rows):
            svg.append(svg_text(x+w/2, y+120+index*step, row, 20, INK))
    svg.extend([
        svg_text(100, 1605, "Solid bidirectional arrows: authenticated requests, results and persisted evidence.", 22, MUTED, False, "start"),
        svg_text(1470, 1605, "Decision rule: AI scores support review; authorized staff approve assignments.", 22, NAVY, False, "start"),
        "</svg>",
    ])
    output = OUT / "figure-a01-overall-architecture.svg"
    output.write_text("\n".join(svg), encoding="utf-8")
    return output


def build_compact_png() -> Path:
    """Create a two-column-journal figure that remains legible at 3.25 inches."""
    width, height = 1600, 2200
    image = Image.new("RGB", (width, height), WHITE)
    draw = ImageDraw.Draw(image)
    title_font = font(50, True)
    subtitle_font = font(23)
    note_font = font(20)

    draw.text((65, 45), "Implementation-grounded AI framework", font=title_font, fill=NAVY)
    draw.text((68, 110), "Authenticated workflow, evaluated models, stored evidence, and human authority", font=subtitle_font, fill=MUTED)

    arrow(draw, (800, 410), (800, 470), both=True)
    arrow(draw, (800, 710), (800, 770), both=True)
    arrow(draw, (800, 1040), (400, 1105), both=True)
    arrow(draw, (800, 1040), (1200, 1105), both=True)
    arrow(draw, (1200, 1450), (1200, 1515), both=True)
    arrow(draw, (400, 1450), (400, 1515), color=TEAL, both=True)

    rounded_box(
        draw,
        (65, 175, 1535, 410),
        "Academic roles and decision authority",
        [
            "Student: six-field proposal   |   Supervisor: expertise and capacity",
            "Administrator/coordinator: review evidence, authorize assignment, audit outcomes",
        ],
        BLUE,
        PALE_BLUE,
    )
    rounded_box(
        draw,
        (130, 470, 1470, 710),
        "Presentation tier",
        [
            "React 19 + TypeScript + Vite 6",
            "React Router + Axios + Recharts",
        ],
        TEAL,
        PALE_TEAL,
    )
    rounded_box(
        draw,
        (130, 770, 1470, 1040),
        "Application control tier",
        [
            "Express 5 + Node.js REST API",
            "JWT + bcryptjs + role authorization   |   express-validator + CORS",
            "Coordinates model requests and persists returned evidence",
        ],
        NAVY,
        PALE_BLUE,
    )
    rounded_box(
        draw,
        (65, 1105, 765, 1450),
        "MongoDB / Mongoose 9",
        [
            "Projects and supervisor profiles",
            "Model runs, scores and human labels",
            "Assignments, reports and activity logs",
        ],
        GOLD,
        PALE_GOLD,
    )
    rounded_box(
        draw,
        (835, 1105, 1535, 1450),
        "Flask AI service",
        [
            "Flask + Flask-CORS JSON service",
            "Lazy Sentence-Transformers registry",
            "SHA-256 keyed embedding cache",
        ],
        PURPLE,
        PALE_PURPLE,
    )

    draw.rounded_rectangle((65, 1515, 1535, 2100), radius=26, fill=PALE_GRAY, outline=PURPLE, width=5)
    draw.rounded_rectangle((65, 1515, 1535, 1592), radius=26, fill=PURPLE)
    draw.rectangle((65, 1565, 1535, 1592), fill=PURPLE)
    center_text(draw, (80, 1520, 1520, 1586), "Implemented AI components", BOX_TITLE, WHITE)

    rounded_box(
        draw,
        (95, 1625, 570, 2065),
        "Compared models",
        [
            "TF-IDF: word 1-2 grams + character-within-word 3-5 grams + cosine similarity",
            "Sentence-BERT: sentence-transformers/\nparaphrase-multilingual-MiniLM-L12-v2",
            "BGE-M3: dense representation from BAAI/bge-m3",
        ],
        TEAL,
        WHITE,
        body_font=MODEL_DETAIL,
    )
    rounded_box(
        draw,
        (590, 1625, 1065, 2065),
        "Inference and evidence",
        [
            "NumPy L2 normalization + cosine",
            "Six-field weighting and risk bands",
            "Supervisor fit, capacity and evaluation metrics",
        ],
        NAVY,
        WHITE,
    )
    rounded_box(
        draw,
        (1085, 1625, 1505, 2065),
        "Supporting NLP tools",
        [
            "RapidFuzz + NLTK normalization",
            "FAISS vector retrieval",
            "Supports preparation and search",
        ],
        GOLD,
        WHITE,
    )

    draw.text((75, 2133), "AI scores support review; authorized academic staff retain final decision authority.", font=note_font, fill=NAVY)
    output = OUT / "figure-a01-overall-architecture.png"
    image.save(output, dpi=(300, 300), optimize=True)
    return output


def build_compact_svg() -> Path:
    width, height = 1600, 2200
    svg = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">',
        '<title id="title">Implementation-grounded AI framework</title>',
        '<desc id="desc">React, Express, MongoDB and Flask architecture with TF-IDF, Sentence-BERT and BGE-M3 inference and supporting NLP and retrieval tools.</desc>',
        f'<rect width="{width}" height="{height}" fill="white"/>',
        svg_text(65, 95, "Implementation-grounded AI framework", 50, NAVY, True, "start"),
        svg_text(68, 142, "Authenticated workflow, evaluated models, stored evidence, and human authority", 23, MUTED, False, "start"),
    ]

    def box(x: int, y: int, w: int, h: int, color: str, fill: str, title: str, rows: list[str], size: int = 24) -> None:
        svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="22" fill="{fill}" stroke="{color}" stroke-width="4"/>')
        svg.append(f'<path d="M{x+22},{y} H{x+w-22} Q{x+w},{y} {x+w},{y+22} V{y+66} H{x} V{y+22} Q{x},{y} {x+22},{y}" fill="{color}"/>')
        svg.append(svg_text(x+w/2, y+45, title, 29, WHITE, True))
        step = (h-92) / max(1, len(rows))
        for index, row in enumerate(rows):
            svg.append(svg_text(x+w/2, y+105+index*step, row, size, INK))

    box(65, 175, 1470, 235, BLUE, PALE_BLUE, "Academic roles and decision authority", ["Student: six-field proposal | Supervisor: expertise and capacity", "Administrator/coordinator: review evidence, authorize assignment, audit outcomes"])
    box(130, 470, 1340, 240, TEAL, PALE_TEAL, "Presentation tier", ["React 19 + TypeScript + Vite 6", "React Router + Axios + Recharts"])
    box(130, 770, 1340, 270, NAVY, PALE_BLUE, "Application control tier", ["Express 5 + Node.js REST API", "JWT + bcryptjs + role authorization | express-validator + CORS", "Coordinates model requests and persists returned evidence"])
    box(65, 1105, 700, 345, GOLD, PALE_GOLD, "MongoDB / Mongoose 9", ["Projects and supervisor profiles", "Model runs, scores and human labels", "Assignments, reports and activity logs"], 22)
    box(835, 1105, 700, 345, PURPLE, PALE_PURPLE, "Flask AI service", ["Flask + Flask-CORS JSON service", "Lazy Sentence-Transformers registry", "SHA-256 keyed embedding cache"], 22)
    svg.append(f'<rect x="65" y="1515" width="1470" height="585" rx="26" fill="{PALE_GRAY}" stroke="{PURPLE}" stroke-width="5"/>')
    svg.append(f'<path d="M91,1515 H1509 Q1535,1515 1535,1541 V1592 H65 V1541 Q65,1515 91,1515" fill="{PURPLE}"/>')
    svg.append(svg_text(800, 1565, "Implemented AI components", 31, WHITE, True))
    box(95, 1625, 475, 440, TEAL, WHITE, "Compared models", ["TF-IDF", "word 1-2 + character-within-word 3-5", "cosine similarity", "Sentence-BERT", "sentence-transformers/", "paraphrase-multilingual-MiniLM-L12-v2", "BGE-M3", "dense representation from", "BAAI/bge-m3"], 17)
    box(590, 1625, 475, 440, NAVY, WHITE, "Inference and evidence", ["NumPy L2 normalization + cosine", "Six-field weighting and risk bands", "Supervisor fit and capacity", "Evaluation metrics and reports"], 20)
    box(1085, 1625, 420, 440, GOLD, WHITE, "Supporting NLP tools", ["RapidFuzz + NLTK", "FAISS vector retrieval", "Supports preparation and search"], 20)
    svg.append(svg_text(75, 2165, "AI scores support review; authorized academic staff retain final decision authority.", 21, NAVY, False, "start"))
    svg.append("</svg>")
    output = OUT / "figure-a01-overall-architecture.svg"
    output.write_text("\n".join(svg), encoding="utf-8")
    return output


if __name__ == "__main__":
    print(build_compact_png())
    print(build_compact_svg())
