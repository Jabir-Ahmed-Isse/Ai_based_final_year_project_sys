from __future__ import annotations

from html import escape
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


OUT = Path("outputs/journal-package-20260724/architecture")
OUT.mkdir(parents=True, exist_ok=True)

NAVY = "#16324F"
BLUE = "#2D6A9F"
TEAL = "#2A9D8F"
GOLD = "#E9C46A"
PALE = "#EEF4F8"
INK = "#17212B"
RED = "#B84A4A"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "arialbd.ttf" if bold else "arial.ttf"
    try:
        return ImageFont.truetype(name, size)
    except OSError:
        return ImageFont.load_default()


def wrap(text: str, limit: int = 25) -> list[str]:
    words = text.split()
    lines, line = [], ""
    for word in words:
        candidate = (line + " " + word).strip()
        if len(candidate) > limit and line:
            lines.append(line)
            line = word
        else:
            line = candidate
    if line:
        lines.append(line)
    return lines[:3]


def draw(title: str, filename: str, columns: list[list[str]], footer: str = "") -> None:
    width, height = 2400, 1350
    image = Image.new("RGB", (width, height), "white")
    canvas = ImageDraw.Draw(image)
    title_font, label_font, footer_font = font(54, True), font(29), font(24)
    canvas.text((80, 60), title, font=title_font, fill=NAVY)
    n = len(columns)
    left, right, top, bottom = 110, 2290, 210, 1160
    col_w = (right - left) / n
    centers: list[list[tuple[float, float, float]]] = []
    svg = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1350" viewBox="0 0 2400 1350">',
        '<rect width="2400" height="1350" fill="white"/>',
        f'<text x="80" y="105" font-family="Arial" font-size="54" font-weight="700" fill="{NAVY}">{escape(title)}</text>',
        '<defs><marker id="arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 z" fill="#74899C"/></marker></defs>'
    ]
    for ci, col in enumerate(columns):
        x = left + ci * col_w + 12
        gap = (bottom - top) / max(1, len(col))
        local = []
        for ri, label in enumerate(col):
            cy = top + (ri + 0.5) * gap
            box_w = min(col_w - 45, 630)
            box_h = min(148, gap * 0.68)
            x0, y0, x1, y1 = x, cy - box_h / 2, x + box_w, cy + box_h / 2
            outline = [BLUE, TEAL, NAVY, GOLD][ci % 4]
            fill = PALE if ci < n - 1 else "#FFF8E5"
            canvas.rounded_rectangle((x0, y0, x1, y1), radius=18, fill=fill, outline=outline, width=4)
            lines = wrap(label, max(14, int(box_w / 22)))
            total = len(lines) * 34
            for li, line in enumerate(lines):
                bbox = canvas.textbbox((0, 0), line, font=label_font)
                tx = x0 + (box_w - (bbox[2] - bbox[0])) / 2
                ty = cy - total / 2 + li * 34
                canvas.text((tx, ty), line, font=label_font, fill=INK)
            svg.append(f'<rect x="{x0:.1f}" y="{y0:.1f}" width="{box_w:.1f}" height="{box_h:.1f}" rx="18" fill="{fill}" stroke="{outline}" stroke-width="4"/>')
            for li, line in enumerate(lines):
                sy = cy - total / 2 + li * 34 + 28
                svg.append(f'<text x="{x0 + box_w/2:.1f}" y="{sy:.1f}" text-anchor="middle" font-family="Arial" font-size="29" fill="{INK}">{escape(line)}</text>')
            local.append((x0, cy, x1))
        centers.append(local)
    for ci in range(n - 1):
        for left_box in centers[ci]:
            target = min(centers[ci + 1], key=lambda p: abs(p[1] - left_box[1]))
            start = (left_box[2] + 8, left_box[1])
            end = (target[0] - 16, target[1])
            canvas.line((start, end), fill="#74899C", width=4)
            ex, ey = end
            canvas.polygon([(ex, ey), (ex - 18, ey - 10), (ex - 18, ey + 10)], fill="#74899C")
            svg.append(f'<line x1="{start[0]:.1f}" y1="{start[1]:.1f}" x2="{end[0]:.1f}" y2="{end[1]:.1f}" stroke="#74899C" stroke-width="4" marker-end="url(#arrow)"/>')
    if footer:
        canvas.text((110, 1245), footer, font=footer_font, fill="#536575")
        svg.append(f'<text x="110" y="1275" font-family="Arial" font-size="24" fill="#536575">{escape(footer)}</text>')
    svg.append("</svg>")
    image.save(OUT / f"{filename}.png", dpi=(300, 300))
    (OUT / f"{filename}.svg").write_text("\n".join(svg), encoding="utf-8")


DIAGRAMS = [
    ("Overall system architecture", "figure-a01-overall-architecture",
     [["Students", "Supervisors", "Coordinator", "Administrator"],
      ["React 19 + Vite UI", "Role dashboards", "Research analytics pages"],
      ["Express 5 REST API", "JWT/RBAC middleware", "Research services"],
      ["MongoDB/Mongoose", "Python AI service", "Stored reports"]],
     "Verified from frontend routes, Express routes/middleware, Mongoose models and Python services."),
    ("Frontend-backend-AI service interaction", "figure-a02-service-architecture",
     [["React pages", "Axios API client"], ["Express REST endpoints", "Authentication middleware"],
      ["Python Flask AI endpoints", "Node transformer service"], ["MongoDB collections", "Generated artifacts"]],
     "The application contains both a Python research service and a Node embedding service."),
    ("Final-year project lifecycle", "figure-a03-project-lifecycle",
     [["Idea generation"], ["Proposal submission"], ["Similarity screening"], ["Human review"],
      ["Supervisor recommendation"], ["Authorized assignment"], ["Progress, feedback and reporting"]],
     "Recommendation and final assignment are deliberately separated."),
    ("Multi-field similarity-detection workflow", "figure-a04-similarity-workflow",
     [["Title", "Description", "Problem statement", "Objectives", "Features", "Technologies/tools"],
      ["Field normalization", "Model-specific encoding"],
      ["TF-IDF", "Sentence-BERT", "BGE-M3 dense"],
      ["Field scores", "Weighted score", "Risk band", "Stored comparison"]],
     "Weights: 0.20, 0.20, 0.20, 0.15, 0.15 and 0.10; risk boundaries: 40 and 70."),
    ("TF-IDF project-similarity pipeline", "figure-a05-tfidf-pipeline",
     [["Six project fields"], ["Word 1-2 grams", "Character 3-5 grams"],
      ["TF-IDF vector matrices"], ["Cosine similarity"], ["Weighted aggregation", "Risk classification"]],
     "The measured baseline uses scikit-learn TfidfVectorizer with up to 30,000 word and 30,000 character features."),
    ("Configured BERT cross-encoder pipeline", "figure-a06-bert-pipeline",
     [["Project field pair"], ["CrossEncoder tokenizer"], ["cross-encoder/stsb-roberta-base"],
      ["Pairwise relevance score"], ["Field aggregation"]],
     "Configured in the model registry; no completed BERT cross-encoder database experiment was present."),
    ("Sentence-BERT project pipeline", "figure-a07-sbert-pipeline",
     [["Six project fields"], ["Multilingual MiniLM tokenizer"], ["384-dimensional embeddings"],
      ["Cosine similarity"], ["Weighted score and risk"]],
     "Checkpoint: sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2; batch size 32."),
    ("BGE-M3 dense matching pipeline", "figure-a08-bge-pipeline",
     [["Project/profile text"], ["BAAI/bge-m3 encoder"], ["1,024-dimensional dense vectors"],
      ["Cosine similarity"], ["Project similarity or supervisor score"]],
     "Only dense embeddings were activated; sparse and multi-vector modes were not used."),
    ("Multi-field score aggregation", "figure-a09-field-aggregation",
     [["Field-level similarities"], ["Availability-aware normalization"],
      ["0.20 title", "0.20 description", "0.20 problem", "0.15 objectives", "0.15 features", "0.10 tools"],
      ["Weighted overall score"], ["Low 0-39", "Medium 40-69", "High 70-100"]],
     "A separate unweighted combined-text score is also stored."),
    ("Supervisor recommendation and assignment", "figure-a10-supervisor-workflow",
     [["Project representation"], ["Rich supervisor profiles"],
      ["Expertise", "Technology", "Skills", "Previous projects", "Publication keywords"],
      ["Pure semantic ranking"], ["Eligibility and workload adjustment"], ["Human-approved assignment"]],
     "All project-supervisor scores are persisted before capacity-aware provisional assignment."),
    ("Capacity-aware workload balancing", "figure-a11-workload-balancing",
     [["Semantic candidate list"], ["Availability and eligibility filter"], ["Capacity check"],
      ["Progressive utilization penalty (max 15)"], ["Greedy feasible selection"], ["Audit record"]],
     "The measured run assigned 78 projects across 20 test supervisors with zero capacity violations."),
    ("Research database architecture", "figure-a12-database-architecture",
     [["Users and roles", "Projects and taxonomy"],
      ["ResearchExperimentRun", "ProjectPairScore", "SupervisorMatchScore"],
      ["HumanEvaluation", "AnnotationConsensus", "SupervisorGroundTruth"],
      ["SupervisorAssignment", "GeneratedResearchReport", "ActivityLog"]],
     "Collection names correspond to Mongoose models in backend/src/models."),
    ("Deployment architecture", "figure-a13-deployment-architecture",
     [["Browser clients"], ["Vercel-hosted React UI (thesis-reported)"],
      ["Render-hosted Express API (thesis-reported)", "Separate Python AI service (thesis-reported)"],
      ["MongoDB Atlas (thesis-reported)", "Model checkpoints/cache"]],
     "Deployment providers are reported by the thesis; deployment manifests were not found in the inspected repository."),
    ("Security and role-access workflow", "figure-a14-security-rbac",
     [["Login credentials"], ["bcrypt password verification"], ["JWT issuance"],
      ["Authentication middleware"], ["Student", "Supervisor", "Coordinator", "Administrator"],
      ["Authorized REST resource"]],
     "Verified roles: student, supervisor, coordinator and admin; no panel-member role was implemented."),
    ("Model-evaluation pipeline", "figure-a15-evaluation-pipeline",
     [["Imported project dataset"], ["All unique pairs / all supervisor candidates"],
      ["TF-IDF", "Sentence-BERT", "BGE-M3"],
      ["Stored scores, fields, ranks and timings"], ["Descriptive statistics and figures"],
      ["Future expert labels"], ["Classification/ranking metrics and tests"]],
     "Label-dependent metrics are intentionally gated until expert ground truth exists.")
]

for args in DIAGRAMS:
    draw(*args)

print(f"generated={len(DIAGRAMS)} directory={OUT.resolve()}")
