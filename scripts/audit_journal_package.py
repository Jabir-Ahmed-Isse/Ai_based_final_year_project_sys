"""Final, read-only audit of the generated journal package."""

from __future__ import annotations

import json
import re
import statistics
import zipfile
from pathlib import Path

from docx import Document
from PIL import Image, ImageStat
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "outputs" / "journal-package-20260724"
MANUSCRIPT = PACKAGE / "final-journal-manuscript.docx"


def paragraphs_between(paragraphs: list[str], start: str | None, end: str | None) -> list[str]:
    start_index = 0 if start is None else paragraphs.index(start) + 1
    end_index = len(paragraphs) if end is None else paragraphs.index(end)
    return paragraphs[start_index:end_index]


def extract_citation_numbers(text: str) -> set[int]:
    numbers = {int(number) for number in re.findall(r"\[(\d{1,3})\]", text)}
    for start, end in re.findall(
        r"\[(\d{1,3})\]\s*[–—-]\s*\[(\d{1,3})\]", text
    ):
        lower, upper = sorted((int(start), int(end)))
        numbers.update(range(lower, upper + 1))
    for content in re.findall(r"\[([0-9,\s;–—-]+)\]", text):
        for start, end in re.findall(r"(\d{1,3})\s*[–—-]\s*(\d{1,3})", content):
            lower, upper = sorted((int(start), int(end)))
            numbers.update(range(lower, upper + 1))
        numbers.update(int(number) for number in re.findall(r"\d{1,3}", content))
    return numbers


document = Document(MANUSCRIPT)
paragraphs = [paragraph.text.strip() for paragraph in document.paragraphs]
body = paragraphs_between(paragraphs, None, "References")
references = paragraphs_between(paragraphs, "References", "Appendix A. Journal-quality pseudocode")
abstract = paragraphs_between(paragraphs, "Abstract", next(
    paragraph for paragraph in paragraphs if paragraph.startswith("Keywords:")
))

body_citations = sorted({number for paragraph in body for number in extract_citation_numbers(paragraph)})
reference_numbers = [
    int(match.group(1))
    for paragraph in references
    if (match := re.match(r"\[(\d{1,3})\]\s", paragraph))
]
reference_dois = [
    match.group(1).rstrip(".,;")
    for paragraph in references
    if (match := re.search(r"\bdoi:\s*(10\.\S+)", paragraph, flags=re.IGNORECASE))
]

table_captions = [paragraph for paragraph in paragraphs if re.match(r"Table \d+\.", paragraph)]
figure_captions = [paragraph for paragraph in paragraphs if re.match(r"Figure \d+\.", paragraph)]
graphical_abstract_captions = [
    paragraph for paragraph in paragraphs if paragraph.startswith("Graphical abstract.")
]

with zipfile.ZipFile(MANUSCRIPT) as archive:
    media = [name for name in archive.namelist() if name.startswith("word/media/")]
    document_xml = archive.read("word/document.xml").decode("utf-8")
    drawing_alt_text = re.findall(r"<wp:docPr\b[^>]*\bdescr=\"([^\"]+)\"", document_xml)

suspicious_sequences = {
    sequence: sum(text.count(sequence) for text in paragraphs)
    for sequence in ("\ufffd", "Ã", "â€", "Î")
}

screenshot_checks = []
for path in sorted((PACKAGE / "system-screenshots").glob("*.png")):
    with Image.open(path) as image:
        grayscale = image.convert("L")
        standard_deviation = float(ImageStat.Stat(grayscale).stddev[0])
        screenshot_checks.append(
            {
                "file": path.name,
                "width": image.width,
                "height": image.height,
                "grayscale_standard_deviation": round(standard_deviation, 2),
                "nonblank": image.width >= 1000 and image.height >= 700 and standard_deviation >= 5,
            }
        )

supporting_docx = [
    PACKAGE / "cover-letter.docx",
    PACKAGE / "reviewer-response-template.docx",
    PACKAGE / "comparative-evaluation-report.docx",
]
supporting_docx_reopened = {
    path.name: len(Document(path).paragraphs) for path in supporting_docx
}

comparative_pdf = PACKAGE / "comparative-evaluation-report.pdf"
pdf_page_count = len(PdfReader(comparative_pdf).pages)

checks = {
    "manuscript_reopened": True,
    "table_count": len(document.tables),
    "table_caption_count": len(table_captions),
    "figure_caption_count": len(figure_captions),
    "graphical_abstract_caption_count": len(graphical_abstract_captions),
    "embedded_media_count": len(media),
    "drawing_alt_text_count": len(drawing_alt_text),
    "abstract_word_count": len(" ".join(abstract).split()),
    "comparative_section_integrated": "4.4 Comparative evaluation and evidence-bounded rankings"
    in paragraphs,
    "comparison_rankings_present": all(
        evidence in "\n".join(body)
        for evidence in (
            "project-pair Spearman rho=0.9537",
            "71.79%",
            "The operational ranking is therefore: (1) TF-IDF",
            "the raw-score ranking is (1) BGE-M3",
        )
    ),
    "body_citation_numbers": body_citations,
    "missing_body_citation_numbers": sorted(set(range(1, 161)) - set(body_citations)),
    "reference_numbers": reference_numbers,
    "reference_number_sequence_valid": reference_numbers == list(range(1, 161)),
    "reference_doi_count": len(reference_dois),
    "unique_reference_doi_count": len({doi.lower() for doi in reference_dois}),
    "suspicious_text_sequences": suspicious_sequences,
    "screenshot_count": len(screenshot_checks),
    "nonblank_screenshot_count": sum(item["nonblank"] for item in screenshot_checks),
    "screenshot_grayscale_standard_deviation_mean": round(
        statistics.fmean(item["grayscale_standard_deviation"] for item in screenshot_checks), 2
    ),
    "screenshots": screenshot_checks,
    "supporting_docx_reopened": supporting_docx_reopened,
    "comparative_pdf_page_count": pdf_page_count,
    "evidence_workbook_exists": (PACKAGE / "publication-evidence-workbook.xlsx").exists(),
    "package_manifest_mentions_evidence_workbook": "publication evidence workbook"
    in (PACKAGE / "package-manifest.md").read_text(encoding="utf-8").lower(),
}

checks["passed"] = all(
    [
        checks["table_count"] == 11,
        checks["table_caption_count"] == 11,
        checks["figure_caption_count"] == 13,
        checks["graphical_abstract_caption_count"] == 1,
        checks["embedded_media_count"] == 14,
        checks["drawing_alt_text_count"] == 14,
        checks["abstract_word_count"] <= 250,
        checks["comparative_section_integrated"],
        checks["comparison_rankings_present"],
        checks["missing_body_citation_numbers"] == [],
        checks["reference_number_sequence_valid"],
        checks["reference_doi_count"] == 160,
        checks["unique_reference_doi_count"] == 160,
        not any(suspicious_sequences.values()),
        checks["screenshot_count"] == 13,
        checks["nonblank_screenshot_count"] == 13,
        checks["comparative_pdf_page_count"] == 19,
        checks["evidence_workbook_exists"],
        checks["package_manifest_mentions_evidence_workbook"],
    ]
)

(PACKAGE / "final-package-audit.json").write_text(
    json.dumps(checks, indent=2, ensure_ascii=False), encoding="utf-8"
)
print(json.dumps(checks, indent=2, ensure_ascii=True))
