from __future__ import annotations

import csv
import html
import json
import math
import re
import shutil
from copy import deepcopy
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor, Twips
from lxml import etree


ROOT = Path(__file__).resolve().parents[1]
SOURCE_WORK = ROOT / "outputs" / "journal-revision-20260805-work"
WORK = ROOT / "outputs" / "journal-revision-20260805-supervisor-human-verified"
PACKAGE = ROOT / "outputs" / "final-journal-human-verified-corrected-model-flow-20260810"
OLD_PACKAGE = ROOT / "outputs" / "final-journal-model-performance-full-package-20260725"
SOURCE_DOCX = OLD_PACKAGE / "01-manuscript" / "final-journal-manuscript-symbolic-performance-complete.docx"
ANALYSIS = WORK / "analysis"
LIVE = WORK / "live-evidence"
SYSTEM_CAPTURES = SOURCE_WORK / "visualization-captures"
CAPTURE_CONTACTS = SOURCE_WORK / "visualization-capture-contact-sheets"
REFERENCES = SOURCE_WORK / "references-verified-210-final"
PUBLICATION_FIGURES = ANALYSIS / "publication-figures"
OLD_ARCHITECTURE = OLD_PACKAGE / "05-figures" / "architecture"
UPDATED_ARCHITECTURE = ROOT / "outputs" / "journal-revision-20260810-ai-framework" / "architecture"
MML2OMML = Path(r"C:\Program Files\Microsoft Office\Office16\MML2OMML.XSL")

NAVY = "17365D"
BLUE = "2F6BCE"
TEAL = "0F766E"
GOLD = "D97706"
LIGHT_BLUE = "EAF2FF"
LIGHT_GRAY = "F3F4F6"
LIGHT_GOLD = "FFF7E6"
WHITE = "FFFFFF"
TEXT = "111827"
W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
MATH_NS = "http://www.w3.org/1998/Math/MathML"
OMML_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math"
CITATION_PATTERN = re.compile(r"\[(\d{1,3})\](?:\s*[-–—]\s*\[(\d{1,3})\])?")
REFERENCE_NUMBER_MAP: dict[int, int] = {}
REFERENCE_ORDER_OLD_NUMBERS: list[int] = []
CITED_REFERENCE_OLD_NUMBERS: list[int] = []


def read_csv(name: str) -> list[dict[str, str]]:
    with (ANALYSIS / name).open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def load_reference_rows() -> list[dict[str, str]]:
    with (REFERENCES / "reference-verification-matrix.csv").open(
        encoding="utf-8-sig", newline=""
    ) as stream:
        return list(csv.DictReader(stream))


def citation_numbers(match: re.Match[str]) -> list[int]:
    start = int(match.group(1))
    end = int(match.group(2) or start)
    step = 1 if end >= start else -1
    return list(range(start, end + step, step))


def collect_reference_first_appearance_order(doc: Document, reference_count: int) -> list[int]:
    seen: set[int] = set()
    ordered: list[int] = []
    for paragraph_element in doc._element.body.xpath(".//w:p"):
        text = "".join(node.text or "" for node in paragraph_element.xpath(".//w:t"))
        for match in CITATION_PATTERN.finditer(text):
            for number in citation_numbers(match):
                if number < 1 or number > reference_count:
                    raise ValueError(f"Citation [{number}] is outside the 1-{reference_count} library")
                if number not in seen:
                    seen.add(number)
                    ordered.append(number)
    CITED_REFERENCE_OLD_NUMBERS.clear()
    CITED_REFERENCE_OLD_NUMBERS.extend(ordered)
    ordered.extend(number for number in range(1, reference_count + 1) if number not in seen)
    if len(ordered) != reference_count or len(set(ordered)) != reference_count:
        raise ValueError("Reference first-appearance order is not a complete permutation")
    return ordered


def format_mapped_citation(numbers: list[int]) -> str:
    if not numbers:
        return ""
    groups: list[tuple[int, int]] = []
    start = previous = numbers[0]
    for number in numbers[1:]:
        if number == previous + 1:
            previous = number
            continue
        groups.append((start, previous))
        start = previous = number
    groups.append((start, previous))
    return ", ".join(
        f"[{start}]" if start == end else f"[{start}]-[{end}]"
        for start, end in groups
    )


def remap_citation_text(text: str, number_map: dict[int, int]) -> str:
    def replacement(match: re.Match[str]) -> str:
        mapped = [number_map[number] for number in citation_numbers(match)]
        return format_mapped_citation(mapped)

    return CITATION_PATTERN.sub(replacement, text)


def remap_document_citations(doc: Document, number_map: dict[int, int]) -> None:
    for paragraph_element in doc._element.body.xpath(".//w:p"):
        text_nodes = paragraph_element.xpath(".//w:t")
        if not text_nodes:
            continue
        original = "".join(node.text or "" for node in text_nodes)
        remapped = remap_citation_text(original, number_map)
        if remapped == original:
            continue
        # Citation-bearing manuscript paragraphs use one uniform text run.
        # Keeping the first text node preserves its run formatting while also
        # handling any citation token that Word happened to split across runs.
        text_nodes[0].text = remapped
        for node in text_nodes[1:]:
            node.text = ""


def ordered_reference_rows() -> list[dict[str, str]]:
    rows = load_reference_rows()
    if not REFERENCE_ORDER_OLD_NUMBERS:
        raise RuntimeError("Reference order has not been initialized by build_manuscript")
    return [rows[old_number - 1] for old_number in REFERENCE_ORDER_OLD_NUMBERS]


def remap_latex_cite_keys(text: str) -> str:
    def replacement(match: re.Match[str]) -> str:
        old_number = int(match.group(1))
        return f"ref{REFERENCE_NUMBER_MAP[old_number]}"

    return re.sub(r"ref(\d{1,3})", replacement, text)


def remove_element(element) -> None:
    parent = element.getparent()
    if parent is not None:
        parent.remove(element)


def delete_from_paragraph_to_end(doc: Document, paragraph) -> None:
    body = doc._element.body
    children = list(body)
    start = children.index(paragraph._p)
    for child in children[start:]:
        if child.tag == qn("w:sectPr"):
            continue
        body.remove(child)


def delete_range(doc: Document, start_paragraph, end_paragraph) -> None:
    body = doc._element.body
    children = list(body)
    start = children.index(start_paragraph._p)
    end = children.index(end_paragraph._p)
    for child in children[start:end]:
        body.remove(child)


def set_repeat_table_header(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def shade_cell(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=70, start=80, bottom=70, end=80) -> None:
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for m, v in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{m}"))
        if node is None:
            node = OxmlElement(f"w:{m}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(v))
        node.set(qn("w:type"), "dxa")


def _ensure_word_child(parent, tag: str):
    child = parent.find(qn(tag))
    if child is None:
        child = OxmlElement(tag)
        parent.append(child)
    return child


def _current_column_width_dxa(doc: Document) -> int:
    """Return the usable width of the active Word column in twips."""
    section = doc.sections[-1]
    content_width = int(section.page_width.twips - section.left_margin.twips - section.right_margin.twips)
    columns = section._sectPr.find(qn("w:cols"))
    column_count = int(columns.get(qn("w:num"), "1")) if columns is not None else 1
    spacing = int(columns.get(qn("w:space"), "0")) if columns is not None else 0
    return int((content_width - spacing * (column_count - 1)) / column_count)


def _column_weights(headers: list[str], rows: list[list[object]]) -> list[float]:
    """Allocate more room to narrative columns while keeping numeric columns compact."""
    weights: list[float] = []
    for column_index, header in enumerate(headers):
        values = [str(row[column_index]) for row in rows if column_index < len(row)]
        texts = [str(header), *values]
        maximum_length = max((len(text) for text in texts), default=1)
        numeric_values = sum(bool(re.fullmatch(r"[\d\s.,%/()–—-]+", value)) for value in values)
        numeric_ratio = numeric_values / len(values) if values else 0.0
        if numeric_ratio >= 0.65:
            weight = 0.78 + min(len(str(header)), 18) / 45
        else:
            weight = 1.0 + min(maximum_length, 64) / 28
        if str(header).strip().lower() in {"model", "n", "year", "ref.", "rank"}:
            weight = min(weight, 1.05)
        weights.append(weight)
    return weights


def apply_exact_table_geometry(
    table,
    weights: list[float],
    total_width_dxa: int,
    *,
    margin_dxa: int,
) -> None:
    """Synchronize tblW, tblInd, tblGrid and every tcW to prevent overflow."""
    weight_sum = sum(weights)
    widths = [int(round(total_width_dxa * weight / weight_sum)) for weight in weights]
    widths[-1] += total_width_dxa - sum(widths)

    table.autofit = False
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    tbl_pr = table._tbl.tblPr
    table_width = _ensure_word_child(tbl_pr, "w:tblW")
    table_width.set(qn("w:type"), "dxa")
    table_width.set(qn("w:w"), str(total_width_dxa))
    table_indent = _ensure_word_child(tbl_pr, "w:tblInd")
    table_indent.set(qn("w:type"), "dxa")
    table_indent.set(qn("w:w"), str(margin_dxa))
    layout = _ensure_word_child(tbl_pr, "w:tblLayout")
    layout.set(qn("w:type"), "fixed")

    grid = table._tbl.tblGrid
    for child in list(grid):
        grid.remove(child)
    for width in widths:
        grid_column = OxmlElement("w:gridCol")
        grid_column.set(qn("w:w"), str(width))
        grid.append(grid_column)

    for column_index, width in enumerate(widths):
        table.columns[column_index].width = Twips(width)
    for row in table.rows:
        row.height = None
        row_properties = row._tr.get_or_add_trPr()
        cant_split = _ensure_word_child(row_properties, "w:cantSplit")
        cant_split.set(qn("w:val"), "true")
        for column_index, cell in enumerate(row.cells):
            width = widths[column_index]
            cell.width = Twips(width)
            cell_properties = cell._tc.get_or_add_tcPr()
            cell_width = _ensure_word_child(cell_properties, "w:tcW")
            cell_width.set(qn("w:type"), "dxa")
            cell_width.set(qn("w:w"), str(width))
            set_cell_margins(cell, top=55, start=margin_dxa, bottom=55, end=margin_dxa)


def set_table_borders(table, color="B8C2CC", size="4") -> None:
    tbl_pr = table._tbl.tblPr
    borders = tbl_pr.find(qn("w:tblBorders"))
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = borders.find(qn(f"w:{edge}"))
        if tag is None:
            tag = OxmlElement(f"w:{edge}")
            borders.append(tag)
        tag.set(qn("w:val"), "single")
        tag.set(qn("w:sz"), size)
        tag.set(qn("w:space"), "0")
        tag.set(qn("w:color"), color)


def set_table_no_borders(table) -> None:
    tbl_pr = table._tbl.tblPr
    borders = tbl_pr.find(qn("w:tblBorders"))
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = borders.find(qn(f"w:{edge}"))
        if tag is None:
            tag = OxmlElement(f"w:{edge}")
            borders.append(tag)
        tag.set(qn("w:val"), "nil")


def style_run(run, size=9.5, bold=False, italic=False, color=TEXT, name="Times New Roman") -> None:
    run.font.name = name
    run._element.rPr.rFonts.set(qn("w:eastAsia"), name)
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic
    run.font.color.rgb = RGBColor.from_string(color)


def add_para(doc: Document, text: str = "", *, bold_prefix: str | None = None, size=9.5, align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_after=4) -> object:
    p = doc.add_paragraph()
    p.alignment = align
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.line_spacing = 1.0
    if bold_prefix and text.startswith(bold_prefix):
        r1 = p.add_run(bold_prefix)
        style_run(r1, size=size, bold=True)
        r2 = p.add_run(text[len(bold_prefix):])
        style_run(r2, size=size)
    else:
        r = p.add_run(text)
        style_run(r, size=size)
    return p


def add_bullet(doc: Document, text: str) -> object:
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.left_indent = Inches(0.18)
    for r in p.runs:
        style_run(r, size=9.2)
    if not p.runs:
        style_run(p.add_run(text), size=9.2)
    else:
        p.text = text
        for r in p.runs:
            style_run(r, size=9.2)
    return p


def add_h1(doc: Document, text: str) -> object:
    p = doc.add_paragraph(style="Heading 1")
    p.paragraph_format.keep_with_next = True
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run(text)
    style_run(r, size=11, bold=True, color=NAVY)
    return p


def add_h2(doc: Document, text: str) -> object:
    p = doc.add_paragraph(style="Heading 2")
    p.paragraph_format.keep_with_next = True
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after = Pt(3)
    r = p.add_run(text)
    style_run(r, size=10, bold=True, italic=True, color=NAVY)
    return p


def add_h3(doc: Document, text: str) -> object:
    p = doc.add_paragraph(style="Heading 3")
    p.paragraph_format.keep_with_next = True
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run(text)
    style_run(r, size=9.5, bold=True, color=TEAL)
    return p


def add_table(doc: Document, headers: list[str], rows: list[list[object]], caption: str | None = None, font_size=7.1, widths: list[float] | None = None) -> object:
    if caption:
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.keep_with_next = True
        p.paragraph_format.space_before = Pt(4)
        p.paragraph_format.space_after = Pt(2)
        style_run(p.add_run(caption), size=7.8, bold=True, color=NAVY)
    table = doc.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    table.autofit = False
    set_table_borders(table)
    header = table.rows[0]
    set_repeat_table_header(header)
    for i, value in enumerate(headers):
        cell = header.cells[i]
        shade_cell(cell, NAVY)
        set_cell_margins(cell)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        style_run(p.add_run(str(value)), size=font_size, bold=True, color=WHITE)
    for row_index, values in enumerate(rows):
        row = table.add_row()
        fill = WHITE if row_index % 2 == 0 else LIGHT_GRAY
        for i, value in enumerate(values):
            cell = row.cells[i]
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            shade_cell(cell, fill)
            set_cell_margins(cell)
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT if i == 0 else WD_ALIGN_PARAGRAPH.CENTER
            style_run(p.add_run(str(value)), size=font_size)
    horizontal_margin = 28 if len(headers) >= 8 else (40 if len(headers) >= 6 else 60)
    available_width = _current_column_width_dxa(doc) - 2 * horizontal_margin
    weights = widths if widths else _column_weights(headers, rows)
    apply_exact_table_geometry(
        table,
        weights,
        available_width,
        margin_dxa=horizontal_margin,
    )
    doc.add_paragraph().paragraph_format.space_after = Pt(1)
    return table


def add_figure(
    doc: Document,
    path: Path,
    caption: str,
    width: float = 3.25,
    page_break_before: bool = False,
) -> None:
    if not path.exists():
        raise FileNotFoundError(path)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(1)
    p.paragraph_format.page_break_before = page_break_before
    p.add_run().add_picture(str(path), width=Inches(width))
    c = doc.add_paragraph()
    c.alignment = WD_ALIGN_PARAGRAPH.CENTER
    c.paragraph_format.space_after = Pt(5)
    style_run(c.add_run(caption), size=7.5, italic=True, color=TEXT)


def add_wide_figure(doc: Document, path: Path, caption: str, width: float = 6.45) -> None:
    """Place a legible full-width figure inside the two-column article flow."""
    figure_section = doc.add_section(WD_SECTION.CONTINUOUS)
    set_columns(figure_section, 1)
    figure_section.different_first_page_header_footer = False
    figure_section.header.is_linked_to_previous = True
    figure_section.footer.is_linked_to_previous = True
    add_figure(doc, path, caption, width=width)
    article_section = doc.add_section(WD_SECTION.CONTINUOUS)
    set_columns(article_section, 2)
    article_section.different_first_page_header_footer = False
    article_section.header.is_linked_to_previous = True
    article_section.footer.is_linked_to_previous = True


def set_columns(section, count: int, space_twips: int = 320) -> None:
    sect_pr = section._sectPr
    cols = sect_pr.find(qn("w:cols"))
    if cols is None:
        cols = OxmlElement("w:cols")
        sect_pr.append(cols)
    cols.set(qn("w:num"), str(count))
    cols.set(qn("w:space"), str(space_twips))


def insert_front_section_break(doc: Document, intro_paragraph) -> None:
    final_sect_pr = doc._element.body.sectPr
    front_sect_pr = deepcopy(final_sect_pr)
    # The opening title/abstract and the two-column article body belong to the
    # same first-page flow.  Force a continuous section transition; copying a
    # source section can otherwise retain ``nextPage`` and strand the abstract.
    section_type = front_sect_pr.find(qn("w:type"))
    if section_type is None:
        section_type = OxmlElement("w:type")
        front_sect_pr.insert(0, section_type)
    section_type.set(qn("w:val"), "continuous")
    cols = front_sect_pr.find(qn("w:cols"))
    if cols is None:
        cols = OxmlElement("w:cols")
        front_sect_pr.append(cols)
    cols.set(qn("w:num"), "1")
    p = OxmlElement("w:p")
    p_pr = OxmlElement("w:pPr")
    p_pr.append(front_sect_pr)
    p.append(p_pr)
    intro_paragraph._p.addprevious(p)
    body_cols = final_sect_pr.find(qn("w:cols"))
    if body_cols is None:
        body_cols = OxmlElement("w:cols")
        final_sect_pr.append(body_cols)
    body_cols.set(qn("w:num"), "2")
    body_cols.set(qn("w:space"), "320")


def wrap_table_in_single_column_section(doc: Document, caption_paragraph, table) -> None:
    """Place a wide retained table in a dedicated full-width section."""
    body_sect_pr = doc._element.body.sectPr

    preceding_section = deepcopy(body_sect_pr)
    preceding_type = preceding_section.find(qn("w:type"))
    if preceding_type is None:
        preceding_type = OxmlElement("w:type")
        preceding_section.insert(0, preceding_type)
    preceding_type.set(qn("w:val"), "nextPage")
    preceding_columns = preceding_section.find(qn("w:cols"))
    if preceding_columns is None:
        preceding_columns = OxmlElement("w:cols")
        preceding_section.append(preceding_columns)
    preceding_columns.set(qn("w:num"), "2")
    preceding_columns.set(qn("w:space"), "320")

    before = OxmlElement("w:p")
    before_properties = OxmlElement("w:pPr")
    before_properties.append(preceding_section)
    before.append(before_properties)
    caption_paragraph._p.addprevious(before)

    table_section = deepcopy(body_sect_pr)
    table_type = table_section.find(qn("w:type"))
    if table_type is None:
        table_type = OxmlElement("w:type")
        table_section.insert(0, table_type)
    table_type.set(qn("w:val"), "nextPage")
    table_columns = table_section.find(qn("w:cols"))
    if table_columns is None:
        table_columns = OxmlElement("w:cols")
        table_section.append(table_columns)
    table_columns.set(qn("w:num"), "1")

    after = OxmlElement("w:p")
    after_properties = OxmlElement("w:pPr")
    after_properties.append(table_section)
    after.append(after_properties)
    table._tbl.addnext(after)
    apply_exact_table_geometry(
        table,
        [650, 650, 2300, 5760],
        9360,
        margin_dxa=120,
    )


def remove_front_page_breaks(doc: Document, intro_paragraph) -> None:
    """Remove only inherited explicit page breaks before the article body."""
    for paragraph in doc.paragraphs:
        if paragraph._p is intro_paragraph._p:
            break
        for br in list(paragraph._p.findall(".//" + qn("w:br"))):
            if br.get(qn("w:type")) in (None, "page"):
                parent = br.getparent()
                if parent is not None:
                    parent.remove(br)
        p_pr = paragraph._p.pPr
        if p_pr is not None:
            page_break_before = p_pr.find(qn("w:pageBreakBefore"))
            if page_break_before is not None:
                p_pr.remove(page_break_before)


def build_transform() -> etree.XSLT:
    return etree.XSLT(etree.parse(str(MML2OMML)))


def mathml(body: str) -> str:
    return f'<math xmlns="{MATH_NS}"><mrow>{body}</mrow></math>'


def add_equation(doc: Document, transformer: etree.XSLT, body: str, number: int) -> None:
    table = doc.add_table(rows=1, cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    table.autofit = False
    set_table_no_borders(table)
    left, right = table.rows[0].cells
    source = etree.fromstring(mathml(body).encode("utf-8"))
    transformed = transformer(source)
    omml_root = deepcopy(transformed.getroot())
    p = left.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    math_para = etree.Element(f"{{{OMML_NS}}}oMathPara", nsmap={"m": OMML_NS})
    math_para.append(omml_root)
    p._p.append(math_para)
    rp = right.paragraphs[0]
    rp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    style_run(rp.add_run(f"({number})"), size=8)
    available_width = _current_column_width_dxa(doc) - 20
    apply_exact_table_geometry(table, [0.88, 0.12], available_width, margin_dxa=10)


def add_algorithm(doc: Document, number: int, title: str, inputs: str, outputs: str, steps: list[str]) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.keep_with_next = True
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(2)
    style_run(p.add_run(f"ALGORITHM {number}. {title.upper()}"), size=8, bold=True, color=NAVY)
    table = doc.add_table(rows=0, cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    table.autofit = False
    set_table_borders(table, color="8FA3B8")
    entries = [("Input", inputs), ("Output", outputs)] + [(str(i), step) for i, step in enumerate(steps, 1)]
    for idx, (label, text) in enumerate(entries):
        row = table.add_row()
        for cell in row.cells:
            set_cell_margins(cell)
            shade_cell(cell, LIGHT_BLUE if idx < 2 else (WHITE if idx % 2 == 0 else LIGHT_GRAY))
        style_run(row.cells[0].paragraphs[0].add_run(label), size=7.2, bold=True, color=NAVY)
        style_run(row.cells[1].paragraphs[0].add_run(text), size=7.2)
    available_width = _current_column_width_dxa(doc) - 100
    apply_exact_table_geometry(table, [0.15, 0.85], available_width, margin_dxa=50)


def apply_ieee_styles(doc: Document) -> None:
    normal = doc.styles["Normal"]
    normal.font.name = "Times New Roman"
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Times New Roman")
    normal.font.size = Pt(9.5)
    for name, size in (("Heading 1", 11), ("Heading 2", 10), ("Heading 3", 9.5)):
        style = doc.styles[name]
        style.font.name = "Times New Roman"
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "Times New Roman")
        style.font.size = Pt(size)
    for section in doc.sections:
        section.top_margin = Inches(0.65)
        section.bottom_margin = Inches(0.65)
        section.left_margin = Inches(0.62)
        section.right_margin = Inches(0.62)
    for p in doc.paragraphs:
        for r in p.runs:
            if p.style and p.style.name.startswith("Heading"):
                continue
            r.font.name = "Times New Roman"
            r._element.rPr.rFonts.set(qn("w:eastAsia"), "Times New Roman")


def replace_front_matter(doc: Document) -> None:
    paragraphs = doc.paragraphs
    for p in paragraphs:
        if p.text.startswith("An Integrated Multi-Field NLP Platform"):
            p.text = "A Comparative Evaluation of Semantic Models for Final-Year Project Similarity Detection and Intelligent Supervisor Assignment"
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            for r in p.runs:
                style_run(r, size=18, bold=True, color=NAVY)
        elif p.text.startswith("Evidence frozen:"):
            p.text = "Evidence frozen: 5 August 2026 | IEEE Open Journal-style research article | Verified live database results"
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            for r in p.runs:
                style_run(r, size=8.5, italic=True, color=TEAL)
        elif p.text == "Abstract":
            p.text = "ABSTRACT"
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        elif p.text.startswith("Final-year projects are often managed through fragmented processes"):
            p.text = (
                "Final-year project governance requires both early detection of semantically overlapping proposals and transparent allocation of qualified supervisors. This study evaluates TF-IDF, the pretrained sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2 checkpoint (Sentence-BERT), and BAAI/bge-m3 (BGE-M3) in a deployed decision-support system. The corrected dataset contains 78 projects represented by title, description, problem statement, research objectives, features, and technologies/tools, plus 20 structured test supervisor profiles. Complete inference produced 3,003 project pairs per model (9,009 scores), 1,560 project-supervisor scores per model (4,680 scores), and 78 capacity-feasible assignments. On 30 single-administrator similarity labels per model at the implemented 70% threshold, Sentence-BERT achieved the strongest balanced evidence (93.33% accuracy, 92.31% F1, 94.44% balanced accuracy, MCC 0.873, ROC-AUC 0.968). BGE-M3 obtained the highest ordinary F1 (94.74%) but zero specificity and MCC because 27 of its 30 model-specific labels were positive; TF-IDF was fastest (0.416 ms/pair) but recalled only 9.09% of positives. In the administrator-verified supervisor evaluation, TF-IDF achieved the strongest overall result (94.10% accuracy, 81.75% F1, MCC 0.785). The research administrator checked all 4,680 supervisor labels and amended records where necessary; the resulting evidence is an internal, single-reviewer evaluation rather than an independent multi-rater or external test. The final assignment used all 20 supervisors without capacity violations (mean load 3.90; Gini 0.226). The study contributes a six-field, evidence-traceable framework, explicit label-provenance grading, symbolic formulation, threshold and error analysis, and a human-oversight protocol. Sentence-BERT is the preferred similarity model under the available balanced evidence, while TF-IDF is the leading supervisor model within the administrator-verified internal evaluation."
            )
            p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
            for r in p.runs:
                style_run(r, size=9)
        elif p.text.startswith("Keywords:"):
            p.text = "INDEX TERMS—Artificial intelligence, educational decision support, final-year projects, semantic similarity, sentence embeddings, supervisor assignment, TF-IDF, workload balancing."
            for r in p.runs:
                style_run(r, size=8.8, italic=True)

    intro = next(p for p in doc.paragraphs if p.text == "1. Introduction")
    highlights = next(p for p in doc.paragraphs if p.text == "Highlights")
    delete_range(doc, highlights, intro)
    intro.text = "I. INTRODUCTION"
    related = next(p for p in doc.paragraphs if p.text == "2. Related work")
    related.text = "II. RELATED WORK"

    letters = "ABCDEFGHIJKLM"
    for p in doc.paragraphs:
        m = re.match(r"2\.(\d+)\s+(.+)", p.text)
        if m:
            index = int(m.group(1)) - 1
            p.text = f"{letters[index]}. {m.group(2)}"
        if p.text.startswith("This study asks: (RQ1)"):
            p.text = (
                "This study asks: (RQ1) how accurately do the three implemented models identify similar proposals at the deployed threshold? (RQ2) how do the six fields influence stored scores? (RQ3) how do the models compare for supervisor matching under the available evidence? (RQ4) does capacity-aware allocation preserve feasibility and distribute load? (RQ5) which model offers the strongest balance of validity, efficiency, explainability and deployability? (RQ6) what errors and evidence limitations remain?"
            )
        if p.text == "A validity boundary that withholds label-dependent metrics and distinguishes thesis-reported values from reproducible database evidence.":
            p.text = "An evidence-grading protocol that distinguishes single-rater similarity labels, administrator-verified supervisor labels, and independently validated ground truth."


def build_manuscript() -> Path:
    doc = Document(SOURCE_DOCX)
    replace_front_matter(doc)
    start = next(p for p in doc.paragraphs if p.text == "3. Materials and methods")
    delete_from_paragraph_to_end(doc, start)
    intro = next(p for p in doc.paragraphs if p.text == "I. INTRODUCTION")
    remove_front_page_breaks(doc, intro)
    insert_front_section_break(doc, intro)
    literature_caption = next(
        paragraph
        for paragraph in doc.paragraphs
        if paragraph.text.startswith("Table 1. Literature comparison matrix")
    )
    literature_heading = next(
        paragraph
        for paragraph in doc.paragraphs
        if paragraph.text.endswith("Literature comparison matrix")
        and paragraph is not literature_caption
    )
    # The curated 45-record comparison matrix is intentionally excluded from
    # the journal at the author's request. Remove both the caption and the
    # retained source table, together with its now-empty subsection heading,
    # before appending the verified system study.
    remove_element(literature_heading._p)
    remove_element(literature_caption._p)
    remove_element(doc.tables[0]._tbl)
    while doc.paragraphs and not doc.paragraphs[-1].text.strip():
        remove_element(doc.paragraphs[-1]._p)
    transformer = build_transform()

    # III. System and AI framework
    add_h1(doc, "III. SYSTEM AND AI FRAMEWORK")
    add_h2(doc, "A. Layered Architecture and Human Control Boundary")
    add_para(doc, "Figure 1 summarizes the architecture used in the deployed platform and shows where model evidence enters the human decision process. The presentation tier uses React 19, TypeScript, Vite 6, React Router, Axios, and Recharts for proposal, supervision, assignment, and evaluation interfaces. The application tier is a Node.js service built on Express 5; express-validator and CORS govern requests, while JSON Web Tokens, bcryptjs password hashing, and role-based authorization protect student, supervisor, coordinator, and administrator operations. MongoDB is accessed through Mongoose 9 schemas that retain projects, supervisor profiles, model runs, field-level and overall scores, human labels, assignments, generated reports, and activity logs. Express coordinates requests to the Flask inference service and records the returned evidence, keeping user interaction, model computation, and institutional records in distinct layers.")
    add_figure(doc, UPDATED_ARCHITECTURE / "figure-a01-overall-architecture.png", "FIGURE 1. Implementation-grounded system and AI framework showing the exact TF-IDF cosine, Sentence-BERT MiniLM, and BGE-M3 model configurations; authorized academic staff retain final decision authority.", page_break_before=True)
    add_para(doc, "Students submit proposals containing six research fields; supervisors maintain expertise and capacity data; administrators inspect similarity evidence and evaluation dashboards; and coordinators or administrators authorize assignments. Model output is therefore advisory. A high similarity score initiates academic review rather than establishing plagiarism, and a supervisor ranking is a documented recommendation rather than an automatic appointment.")
    add_h2(doc, "B. Implemented AI Service and Model Stack")
    add_para(doc, "The AI layer is implemented as a Flask and Flask-CORS JSON service, not as an unspecified Python component. It performs pairwise project comparison, proposal-to-archive screening, complete all-pairs experiments, exhaustive project-supervisor matching, model-status inspection, threshold evaluation, and ranking evaluation. A process-wide, thread-safe registry loads the neural checkpoints lazily, while SHA-256 keyed caches reuse normalized embeddings across repeated batch calls.")
    add_para(doc, "Three model configurations are implemented and reported consistently throughout the study. TF-IDF uses scikit-learn TfidfVectorizer and blends word 1-2 gram cosine similarity with character-within-word 3-5 gram cosine similarity; the deployed combination assigns weights of 0.70 and 0.30, respectively. Sentence-BERT uses the Sentence-Transformers checkpoint sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2 and produces 384-dimensional normalized embeddings. BGE-M3 uses the dense representation from the BAAI/bge-m3 checkpoint and produces 1,024-dimensional normalized embeddings. The dense vectors are compared by dot product after L2 normalization, making the result equivalent to cosine similarity, with batch size 32 in the reported experiments. Neither dense checkpoint is fine-tuned on the frozen institutional corpus.")
    add_para(doc, "NumPy supports the vector operations used to calculate field-weighted scores, risk bands, supervisor-fit components, eligibility and capacity adjustments, classification and ranking measures, and threshold analyses. Scikit-learn, SciPy, Pandas, and Matplotlib are used where the evaluation requires reproducible tables, statistics, or figures. RapidFuzz and NLTK provide typo-tolerant text normalization, while FAISS supports project-document vector retrieval. As shown in Fig. 1, these supporting tools work alongside the TF-IDF, Sentence-BERT, and BGE-M3 components in the implemented workflow.")
    add_h2(doc, "C. Six-Field Similarity Workflow")
    add_para(doc, "Each project is represented by title, description, problem statement, research objectives, features, and technologies/tools. After the fields are prepared, TF-IDF follows a separate lexical vectorization path. The model-specific encoding path branches to both Sentence-BERT and BGE-M3, so the same prepared fields are encoded independently by each neural checkpoint. All three paths then calculate field-level cosine similarity, combine the six scores using the declared weights, and store the overall evidence. The weighted result is mapped to low (0–39%), medium (40–69%), or high (70–100%) review priority; these categories guide review and are not plagiarism verdicts.")
    add_figure(doc, UPDATED_ARCHITECTURE / "figure-a04-similarity-workflow.png", "FIGURE 2. Six-field scoring workflow. TF-IDF follows the lexical branch, while model-specific encoding leads independently to Sentence-BERT and BGE-M3 before field-weighted aggregation.")
    add_h2(doc, "D. Supervisor Recommendation and Assignment")
    add_para(doc, "For supervisor recommendation, the same configured TF-IDF, Sentence-BERT, and BGE-M3 models compare each project with structured supervisor-profile evidence. Expertise/specialization and research interests form the principal semantic text, together with technologies, skills, previous project topics, publication keywords, availability, faculty/department eligibility, current workload, and maximum capacity. The pure score assigns 0.80 to semantic expertise, 0.05 each to technology, skills, and workload/availability, and 0.025 each to previous-project and publication-keyword alignment. Ineligible candidates receive an adjusted score of zero; the assignment stage then applies a progressive utilization penalty and greedy feasible selection.")
    add_figure(doc, OLD_ARCHITECTURE / "figure-a10-supervisor-workflow.png", "FIGURE 3. Verified supervisor recommendation and human-approved assignment boundary.")

    # IV. Methodology
    add_h1(doc, "IV. METHODOLOGY")
    add_h2(doc, "A. Notation")
    add_table(doc, ["Symbol", "Meaning"], [
        ["P, S", "Sets of projects and supervisors"], ["pᵢ, sⱼ", "Project i and supervisor j"],
        ["F", "Six project fields"], ["eᵢ,ᶠ", "Embedding of project i for field f"],
        ["wᶠ", "Configured field weight"], ["τₘ", "Decision threshold for model m"],
        ["Lⱼ, Cⱼ", "Current load and maximum capacity"], ["y, ŷ", "Human label and model decision"],
        ["TP, TN, FP, FN", "Confusion-matrix counts"], ["ρ, G", "Rank correlation and Gini coefficient"],
    ], "TABLE I. LIST OF NOTATIONS AND ABBREVIATIONS", font_size=7.4)
    add_h2(doc, "B. Dataset and Cardinality")
    add_para(doc, "The corrected research dataset contains 78 unique, test-marked Computer Science and IT projects and 20 test supervisor profiles. All six required project fields are populated. The all-pairs similarity design and exhaustive project-supervisor cross-product are given in (1) and (2).")
    add_equation(doc, transformer, '<msub><mi>N</mi><mtext>pair</mtext></msub><mo>=</mo><mfrac><mrow><mi>n</mi><mo>(</mo><mi>n</mi><mo>−</mo><mn>1</mn><mo>)</mo></mrow><mn>2</mn></mfrac><mo>=</mo><mfrac><mrow><mn>78</mn><mo>×</mo><mn>77</mn></mrow><mn>2</mn></mfrac><mo>=</mo><mn>3003</mn>', 1)
    add_equation(doc, transformer, '<msub><mi>N</mi><mtext>cand</mtext></msub><mo>=</mo><msub><mi>n</mi><mi>p</mi></msub><mo>×</mo><msub><mi>n</mi><mi>s</mi></msub><mo>=</mo><mn>78</mn><mo>×</mo><mn>20</mn><mo>=</mo><mn>1560</mn>', 2)
    add_table(doc, ["Characteristic", "Verified value", "Source"], [
        ["Projects", "78 unique", "MongoDB audit"], ["Supervisors", "20 test profiles", "MongoDB audit"],
        ["Pairs/model", "3,003", "All-pairs experiment"], ["All pair scores", "9,009", "Stored records"],
        ["Candidates/model", "1,560", "78 × 20"], ["All supervisor scores", "4,680", "Stored records"],
        ["Similarity labels", "90 (30/model)", "Annotation export"], ["Supervisor labels", "4,680", "Ground-truth export"],
        ["Final assignments", "78", "Capacity-balanced run"], ["Missing six-field values", "0", "Dataset audit"],
    ], "TABLE II. VERIFIED DATASET AND EXPERIMENT CHARACTERISTICS")
    add_h2(doc, "C. Model Configurations")
    add_table(doc, ["Model", "Representation", "Dimension", "Preprocessing / inference", "Training status"], [
        ["TF-IDF", "0.7 word + 0.3 char cosine", "Run vocabulary", "Word 1–2; char_wb 3–5; min df 1; 30k caps", "Fitted on evaluation corpus; no neural training"],
        ["Sentence-BERT", "paraphrase-multilingual-MiniLM-L12-v2", "384", "Normalized pretrained embeddings; cosine by dot product; batch 32", "Pretrained, not fine-tuned"],
        ["BGE-M3", "BAAI/bge-m3 dense embedding", "1024", "Normalized pretrained embeddings; cosine by dot product; batch 32", "Pretrained, not fine-tuned"],
    ], "TABLE III. VERIFIED MODEL CONFIGURATION", font_size=6.8)
    add_para(doc, "TF-IDF combines lexical word and character evidence, Sentence-BERT provides a lightweight multilingual sentence representation, and BGE-M3 supplies a higher-dimensional multilingual embedding. Their score levels are not directly calibrated probabilities; threshold performance must therefore be evaluated rather than inferred from mean score alone [31]–[40], [51]–[60], [126]–[135].")
    add_h2(doc, "D. Symbolic Similarity Formulation")
    add_para(doc, "For TF-IDF, term weight and cosine similarity are represented by (3) and (4). Dense models produce L2-normalized embeddings, making their dot product equal to cosine similarity.")
    add_equation(doc, transformer, '<mi>w</mi><mo>(</mo><mi>t</mi><mo>,</mo><mi>d</mi><mo>)</mo><mo>=</mo><mi mathvariant="normal">tf</mi><mo>(</mo><mi>t</mi><mo>,</mo><mi>d</mi><mo>)</mo><mo>·</mo><mrow><mo>[</mo><mi mathvariant="normal">log</mi><mo>(</mo><mfrac><mrow><mi>N</mi><mo>+</mo><mn>1</mn></mrow><mrow><mi mathvariant="normal">df</mi><mo>(</mo><mi>t</mi><mo>)</mo><mo>+</mo><mn>1</mn></mrow></mfrac><mo>)</mo><mo>+</mo><mn>1</mn><mo>]</mo></mrow>', 3)
    add_equation(doc, transformer, '<mi mathvariant="normal">cos</mi><mo>(</mo><mi>x</mi><mo>,</mo><mi>y</mi><mo>)</mo><mo>=</mo><mfrac><mrow><msup><mi>x</mi><mi>T</mi></msup><mi>y</mi></mrow><mrow><msub><mrow><mo>‖</mo><mi>x</mi><mo>‖</mo></mrow><mn>2</mn></msub><msub><mrow><mo>‖</mo><mi>y</mi><mo>‖</mo></mrow><mn>2</mn></msub></mrow></mfrac>', 4)
    add_para(doc, "The availability-aware multi-field aggregate in (5) renormalizes weights when a field is absent, although no field is missing in the frozen dataset. Configured weights are 0.20, 0.20, 0.20, 0.15, 0.15, and 0.10 in the field order stated above.")
    add_equation(doc, transformer, '<mi>S</mi><mo>(</mo><msub><mi>p</mi><mi>i</mi></msub><mo>,</mo><msub><mi>p</mi><mi>j</mi></msub><mo>)</mo><mo>=</mo><mfrac><mrow><munderover><mo>∑</mo><mrow><mi>f</mi><mo>∈</mo><mi>F</mi></mrow><mrow></mrow></munderover><msub><mi>w</mi><mi>f</mi></msub><msub><mi>I</mi><mi>f</mi></msub><mi mathvariant="normal">cos</mi><mo>(</mo><msub><mi>e</mi><mrow><mi>i</mi><mo>,</mo><mi>f</mi></mrow></msub><mo>,</mo><msub><mi>e</mi><mrow><mi>j</mi><mo>,</mo><mi>f</mi></mrow></msub><mo>)</mo></mrow><mrow><munderover><mo>∑</mo><mrow><mi>f</mi><mo>∈</mo><mi>F</mi></mrow><mrow></mrow></munderover><msub><mi>w</mi><mi>f</mi></msub><msub><mi>I</mi><mi>f</mi></msub></mrow></mfrac>', 5)
    add_equation(doc, transformer, '<mi>R</mi><mo>(</mo><mi>S</mi><mo>)</mo><mo>=</mo><mrow><mo>{</mo><mtable><mtr><mtd><mtext>Low</mtext></mtd><mtd><mn>0</mn><mo>≤</mo><mi>S</mi><mo>&lt;</mo><mn>40</mn></mtd></mtr><mtr><mtd><mtext>Medium</mtext></mtd><mtd><mn>40</mn><mo>≤</mo><mi>S</mi><mo>&lt;</mo><mn>70</mn></mtd></mtr><mtr><mtd><mtext>High</mtext></mtd><mtd><mn>70</mn><mo>≤</mo><mi>S</mi><mo>≤</mo><mn>100</mn></mtd></mtr></mtable></mrow>', 6)
    add_h2(doc, "E. Supervisor Scoring and Capacity Constraints")
    add_equation(doc, transformer, '<msub><mi>Q</mi><mrow><mi>i</mi><mi>j</mi></mrow></msub><mo>=</mo><mn>0.80</mn><msub><mi>q</mi><mtext>semantic</mtext></msub><mo>+</mo><mn>0.05</mn><msub><mi>q</mi><mtext>technology</mtext></msub><mo>+</mo><mn>0.05</mn><msub><mi>q</mi><mtext>skills</mtext></msub><mo>+</mo><mn>0.025</mn><msub><mi>q</mi><mtext>previous</mtext></msub><mo>+</mo><mn>0.025</mn><msub><mi>q</mi><mtext>publication</mtext></msub><mo>+</mo><mn>0.05</mn><msub><mi>q</mi><mtext>availability</mtext></msub>', 7)
    add_equation(doc, transformer, '<msub><mi>A</mi><mrow><mi>i</mi><mi>j</mi></mrow></msub><mo>=</mo><msub><mi>E</mi><mrow><mi>i</mi><mi>j</mi></mrow></msub><mo>·</mo><mrow><mo>[</mo><msub><mi>Q</mi><mrow><mi>i</mi><mi>j</mi></mrow></msub><mo>−</mo><mi>λ</mi><mfrac><msub><mi>L</mi><mi>j</mi></msub><msub><mi>C</mi><mi>j</mi></msub></mfrac><mo>]</mo></mrow>', 8)
    add_equation(doc, transformer, '<msup><mi>s</mi><mo>*</mo></msup><mo>=</mo><mi mathvariant="normal">argmax</mi><munder><mrow><mo> </mo></mrow><mrow><msub><mi>s</mi><mi>j</mi></msub><mo>∈</mo><mi>S</mi><mo>:</mo><msub><mi>L</mi><mi>j</mi></msub><mo>&lt;</mo><msub><mi>C</mi><mi>j</mi></msub></mrow></munder><msub><mi>A</mi><mrow><mi>i</mi><mi>j</mi></mrow></msub>', 9)
    add_para(doc, "Here Eᵢⱼ is a binary eligibility mask and λ is the configured progressive utilization penalty. The implemented balancing run uses mean model score with a maximum penalty of 15 points. This is a greedy feasible decision layer, not a claim of globally optimal stable matching; relevant matching and education-allocation foundations are summarized in [191]–[195] and [196]–[200].")
    add_h2(doc, "F. Algorithms")
    add_algorithm(doc, 1, "Multi-field similarity checking", "Two six-field projects, model m, weights wᶠ", "Field scores, weighted score, risk band", [
        "Normalize each available field with the same field-specific text policy.", "Generate TF-IDF vectors or normalized pretrained embeddings.", "Compute cosine similarity separately for every available field.", "Renormalize available weights and compute the weighted score in (5).", "Apply the 40% and 70% risk boundaries and persist all evidence."])
    add_algorithm(doc, 2, "Supervisor candidate scoring", "Project pᵢ, supervisor profiles S, model m", "Pure and adjusted ranked candidate list", [
        "Construct the project and rich supervisor semantic representations.", "Compute semantic, technology, skills, previous-project, and publication-keyword evidence.", "Combine evidence using (7), then compute availability/workload evidence.", "Apply eligibility mask Eᵢⱼ; store pure and adjusted scores.", "Sort candidates while retaining component-level explanations."])
    add_algorithm(doc, 3, "Capacity-aware assignment", "All project-candidate scores and capacities Cⱼ", "One feasible provisional supervisor per project", [
        "Initialize assigned load Lⱼ=0 for every supervisor.", "For each project, compute the mean model score and utilization penalty.", "Discard ineligible or full supervisors.", "Select the highest adjusted feasible candidate and increment Lⱼ.", "Persist the assignment, component scores, penalty, and audit explanation."])

    # V. Experimental design
    add_h1(doc, "V. EXPERIMENTAL DESIGN")
    add_h2(doc, "A. Evidence Freeze, Cleaning, and Leakage Boundary")
    add_para(doc, "The verified experiment is frozen at 5 August 2026. Dataset version project_dataset_v2_corrected_descriptions corrected all 78 descriptions and reduced near-duplicate description pairs at Jaccard ≥0.65 from 840 to zero. Every project remains test/synthetic marked. Because the pretrained neural checkpoints were not fine-tuned, there is no project-level train/test split; the study evaluates inference on a fixed institutional corpus. The TF-IDF vocabulary is fitted on that corpus, so its results are transductive. Thresholds are not external-test estimates.")
    add_h2(doc, "B. Ground-Truth Provenance")
    add_para(doc, "Similarity evidence comprises 30 model-specific cases per model, submitted by one administrator. The three queues overlap on only 1–3 pairs, so paired inter-model tests such as McNemar are not valid. All 90 consensus records remain needs_more_labels with annotatorCount=1; consequently the evidence grade is C, not multi-rater consensus. Supervisor evidence comprises 1,560 binary labels per model. The research administrator checked all 4,680 labels and amended records where necessary. The stored annotationSource field records how each label was initially populated, not whether the final label was reviewed. Supervisor evidence is therefore grade C: administrator verified, but still single-reviewer and internal rather than independently adjudicated or externally validated. Annotation-quality literature warns that disagreement and label provenance are substantive data properties, not disposable noise [171]–[175], [176]–[180].")
    add_table(doc, ["Experiment", "Model", "n", "Independent annotators", "Consensus", "Evidence grade"], [
        ["Similarity", "TF-IDF", "30", "1", "0", "C—single administrator"],
        ["Similarity", "Sentence-BERT", "30", "1", "0", "C—single administrator"],
        ["Similarity", "BGE-M3", "30", "1", "0", "C—single administrator"],
        ["Supervisor", "TF-IDF", "1,560", "1", "0", "C—administrator verified"],
        ["Supervisor", "Sentence-BERT", "1,560", "1", "0", "C—administrator verified"],
        ["Supervisor", "BGE-M3", "1,560", "1", "0", "C—administrator verified"],
    ], "TABLE IV. LABEL PROVENANCE AND EVIDENCE GRADING")
    add_h2(doc, "C. Classification Metrics")
    add_para(doc, "All classification metrics are recomputed from TP, TN, FP, and FN. Zero denominators return zero, matching the dashboard service. Binary F1 is reported separately from macro- and weighted-F1. The core formulas are (10)–(16); their use with imbalance is supported by classifier-evaluation literature [161]–[165].")
    equations = [
        '<mi mathvariant="normal">Accuracy</mi><mo>=</mo><mfrac><mrow><mi>TP</mi><mo>+</mo><mi>TN</mi></mrow><mrow><mi>TP</mi><mo>+</mo><mi>TN</mi><mo>+</mo><mi>FP</mi><mo>+</mo><mi>FN</mi></mrow></mfrac>',
        '<mi mathvariant="normal">Precision</mi><mo>=</mo><mfrac><mi>TP</mi><mrow><mi>TP</mi><mo>+</mo><mi>FP</mi></mrow></mfrac>',
        '<mi mathvariant="normal">Recall</mi><mo>=</mo><mfrac><mi>TP</mi><mrow><mi>TP</mi><mo>+</mo><mi>FN</mi></mrow></mfrac>',
        '<msub><mi>F</mi><mn>1</mn></msub><mo>=</mo><mn>2</mn><mo>·</mo><mfrac><mrow><mi mathvariant="normal">Precision</mi><mo>·</mo><mi mathvariant="normal">Recall</mi></mrow><mrow><mi mathvariant="normal">Precision</mi><mo>+</mo><mi mathvariant="normal">Recall</mi></mrow></mfrac>',
        '<mi mathvariant="normal">Specificity</mi><mo>=</mo><mfrac><mi>TN</mi><mrow><mi>TN</mi><mo>+</mo><mi>FP</mi></mrow></mfrac>',
        '<mi mathvariant="normal">BalancedAccuracy</mi><mo>=</mo><mfrac><mrow><mi mathvariant="normal">Recall</mi><mo>+</mo><mi mathvariant="normal">Specificity</mi></mrow><mn>2</mn></mfrac>',
        '<mi mathvariant="normal">MCC</mi><mo>=</mo><mfrac><mrow><mi>TP</mi><mo>·</mo><mi>TN</mi><mo>−</mo><mi>FP</mi><mo>·</mo><mi>FN</mi></mrow><msqrt><mrow><mo>(</mo><mi>TP</mi><mo>+</mo><mi>FP</mi><mo>)</mo><mo>(</mo><mi>TP</mi><mo>+</mo><mi>FN</mi><mo>)</mo><mo>(</mo><mi>TN</mi><mo>+</mo><mi>FP</mi><mo>)</mo><mo>(</mo><mi>TN</mi><mo>+</mo><mi>FN</mi><mo>)</mo></mrow></msqrt></mfrac>',
    ]
    for num, body in enumerate(equations, 10):
        add_equation(doc, transformer, body, num)
    add_h2(doc, "D. Threshold, Interval, and Statistical Policy")
    add_para(doc, "Similarity classification is evaluated at the deployed 70% threshold for all models, while 50–80% sensitivity curves are reported separately. Percentile bootstrap intervals use 1,000 resamples within each model-specific labelled sample. Because samples differ across models and no independent common test set exists, the paper does not report inter-model p-values. This restraint follows established guidance on classifier comparison and resampling [166]–[170]. Supervisor thresholds are selected on the same administrator-verified sample used for evaluation; the resulting values describe internal performance and may be optimistic relative to a held-out test set.")
    add_h2(doc, "E. Reproducibility and Environment")
    add_para(doc, "All predictions, component scores, thresholds, labels, assignments, and evaluation tables are exported in sanitized CSV/JSON form. The package includes the exact analysis script, model checkpoint names, batch size 32, TF-IDF configuration, figure scripts, workbook, environment inventory, and SHA-256 checksums. Model cards, dataset documentation, leakage reporting, and randomness controls follow reproducibility principles in [181]–[185] and [186]–[190].")

    # VI. Results
    add_h1(doc, "VI. RESULTS")
    add_h2(doc, "A. Number Validation and Experiment Completion")
    add_table(doc, ["Item", "Previous manuscript", "Verified live value", "Status / correction"], [
        ["Projects", "78", "78", "Confirmed"], ["Pair scores", "9,009", "9,009", "Confirmed"],
        ["Supervisor scores", "4,680", "4,680", "Confirmed"], ["Similarity labels", "0 / NE", "90 (30/model)", "Corrected"],
        ["Supervisor labels", "NE", "4,680, administrator verified", "Corrected with evidence grade C"],
        ["Similarity mean TF/SBERT/BGE", "18.93/47.11/63.07", "16.04/41.98/60.77", "Updated after description correction"],
        ["Load SD", "1.09", "1.61", "Updated"], ["References", "160", "210", "Expanded and reverified"],
    ], "TABLE V. MASTER VALIDATION OF MATERIAL MANUSCRIPT NUMBERS")
    add_h2(doc, "B. Full-Corpus Score Behaviour")
    add_para(doc, "Across all 3,003 pairs per model, TF-IDF produced the lowest mean score (16.04%), Sentence-BERT an intermediate mean (41.98%), and BGE-M3 the highest mean (60.77%). These differences indicate model calibration and representation geometry, not accuracy. BGE-M3 placed 780 pairs in the high-risk band, Sentence-BERT 107, and TF-IDF 4. The deployed common threshold therefore has substantially different alert burdens across models.")
    add_table(doc, ["Model", "Mean", "Median", "Minimum", "Maximum", "SD", "95% CI of mean"], [
        ["TF-IDF", "16.04%", "5.01%", "1.19%", "72.18%", "17.02", "15.43–16.65%"],
        ["Sentence-BERT", "41.98%", "37.82%", "13.88%", "88.32%", "14.88", "41.44–42.51%"],
        ["BGE-M3", "60.77%", "57.26%", "42.60%", "90.98%", "10.33", "60.40–61.14%"],
    ], "TABLE VI. DESCRIPTIVE SCORE STATISTICS (3,003 PAIRS/MODEL)")
    add_figure(doc, PUBLICATION_FIGURES / "figure-01-similarity-score-distributions.png", "FIGURE 4. Full-corpus similarity-score distributions; scores are not calibrated probabilities.")
    add_figure(doc, PUBLICATION_FIGURES / "figure-02-similarity-risk-distribution.png", "FIGURE 5. Alert burden under the implemented 40% and 70% risk boundaries.")
    add_h2(doc, "C. Similarity Classification Performance")
    add_para(doc, "Table VII provides every requested core metric. Sentence-BERT ranks first on accuracy, balanced accuracy, macro-F1, MCC, kappa, ROC-AUC, and evidence-balanced mean rank. BGE-M3 has the highest ordinary F1 because all 27 labelled positives are retrieved, but its three negatives are all false positives, producing zero specificity, zero MCC, and zero kappa. TF-IDF makes only one positive prediction; it is correct, yielding 100% precision, but ten false negatives reduce recall to 9.09%. Hence ordinary F1 alone would produce a misleading BGE-M3 > Sentence-BERT > TF-IDF ordering.")
    add_table(doc, ["Model", "Acc.", "Prec.", "Recall", "F1", "Macro-F1", "Spec.", "Bal. acc.", "MCC", "ROC-AUC", "TP/TN/FP/FN"], [
        ["TF-IDF", "66.67", "100.00", "9.09", "16.67", "47.92", "100.00", "54.55", "0.244", "0.565", "1/19/0/10"],
        ["Sentence-BERT", "93.33", "85.71", "100.00", "92.31", "93.21", "88.89", "94.44", "0.873", "0.968", "12/16/2/0"],
        ["BGE-M3", "90.00", "90.00", "100.00", "94.74", "47.37", "0.00", "50.00", "0.000", "0.531", "27/0/3/0"],
    ], "TABLE VII. SIMILARITY CLASSIFICATION AT 70% (%, EXCEPT MCC/AUC)", font_size=6.2)
    add_table(doc, ["Model", "Accuracy 95% CI", "F1 95% CI", "Macro-F1 95% CI", "Balanced acc. 95% CI", "MCC 95% CI"], [
        ["TF-IDF", "50.00–83.33", "0.00–44.44", "34.78–65.35", "50.00–64.29", "0.000–0.471"],
        ["Sentence-BERT", "83.33–100", "76.92–100", "81.68–100", "85.71–100", "0.690–1.000"],
        ["BGE-M3", "76.67–100", "86.79–100", "43.40–50.00", "50.00–50.00", "0.000–0.000"],
    ], "TABLE VIII. 1,000-RESAMPLE BOOTSTRAP INTERVALS")
    add_figure(doc, PUBLICATION_FIGURES / "figure-10-similarity-classification-metrics.png", "FIGURE 6. Accuracy, precision, recall, and ordinary F1 on the model-specific labelled samples.")
    add_figure(doc, PUBLICATION_FIGURES / "figure-11-similarity-confusion-matrices.png", "FIGURE 7. Confusion matrices reveal the asymmetric error profiles hidden by ordinary F1.")
    add_h2(doc, "D. Threshold Sensitivity and Model Ranking")
    add_para(doc, "Sentence-BERT’s F1 peaks at the deployed 70% threshold. TF-IDF peaks near 60% for F1 and 65% for accuracy/balanced accuracy, whereas BGE-M3 remains saturated at lower thresholds because its labelled subset is predominantly positive. Alternative thresholds are diagnostic only; the operational 70% boundary is preserved.")
    add_figure(doc, PUBLICATION_FIGURES / "figure-12-threshold-versus-f1.png", "FIGURE 8. Threshold-versus-F1 sensitivity from 50% to 80%.")
    add_table(doc, ["Rank criterion", "1st", "2nd", "3rd", "Interpretation"], [
        ["Ordinary F1", "BGE-M3", "Sentence-BERT", "TF-IDF", "Sensitive to model-specific class balance"],
        ["Evidence-balanced", "Sentence-BERT", "TF-IDF", "BGE-M3", "Mean rank of accuracy, macro-F1, balanced accuracy, MCC, AUC"],
        ["Latency", "TF-IDF", "Sentence-BERT", "BGE-M3", "Lower is better"],
        ["Explainability", "TF-IDF", "Sentence-BERT", "BGE-M3", "Lexical features are directly inspectable"],
        ["Multilingual capacity", "BGE-M3", "Sentence-BERT", "TF-IDF", "Checkpoint capability; not independently tested here"],
    ], "TABLE IX. MODEL RANKINGS BY DISTINCT DECISION CRITERIA")
    add_h2(doc, "E. Six-Field Results and Output-Sensitivity Ablation")
    add_para(doc, "All models score features and technologies/tools more highly on average than titles and descriptions. This reflects corpus content and score scale rather than field predictive value. Removal-based output sensitivity shows the largest mean absolute score shifts for Sentence-BERT title (5.54 points), BGE-M3 title (4.00), and TF-IDF title (3.29), while rank correlations remain high (ρ=0.953–0.995). These are deterministic output ablations, not label-based performance ablations.")
    add_table(doc, ["Model", "Title", "Description", "Problem", "Objectives", "Features", "Technologies"], [
        ["TF-IDF", "3.24", "3.94", "18.21", "18.22", "33.47", "32.11"],
        ["Sentence-BERT", "20.29", "27.23", "50.45", "50.78", "62.10", "54.52"],
        ["BGE-M3", "44.88", "52.33", "66.07", "64.63", "72.82", "75.01"],
    ], "TABLE X. MEAN FIELD SCORE (%) OVER 3,003 PAIRS/MODEL")
    add_figure(doc, PUBLICATION_FIGURES / "figure-03-field-level-similarity.png", "FIGURE 9. Mean field-level scores under the same six-field representation.")
    add_h2(doc, "F. Efficiency and Operational Suitability")
    add_para(doc, "TF-IDF is 74.8 times faster than Sentence-BERT and 133.4 times faster than BGE-M3 on the stored inference measurements. The transformer records report model-default device and do not provide reliable peak-memory measurements; memory is therefore marked not measured rather than estimated.")
    add_table(doc, ["Model", "Mean ms/pair", "Pairs/s", "Device", "Memory", "Operational implication"], [
        ["TF-IDF", "0.416", "2,402.69", "CPU", "Not measured", "Best lightweight/interactive option"],
        ["Sentence-BERT", "31.141", "32.11", "Model default", "Not measured", "Balanced semantic deployment"],
        ["BGE-M3", "55.518", "18.01", "Model default", "Not measured", "Highest compute cost; multilingual research option"],
    ], "TABLE XI. MEASURED PROCESSING PERFORMANCE")
    add_figure(doc, PUBLICATION_FIGURES / "figure-04-similarity-latency.png", "FIGURE 10. Per-pair measured latency; lower is better.")
    add_h2(doc, "G. Supervisor Matching: Administrator-Verified Internal Results")
    add_para(doc, "At model-specific F1-optimized thresholds, TF-IDF has the highest accuracy (94.10%), F1 (81.75%), and MCC (0.785). BGE-M3 is second by F1 (74.37%), and Sentence-BERT is third (72.46%). Sentence-BERT provides the highest precision (83.33%), whereas TF-IDF has the highest recall (87.66%). The research administrator checked all 4,680 labels and amended records where necessary, so the results establish TF-IDF as the leading model for this internal evaluation. Because one administrator conducted the review and each threshold was selected on the same labelled sample, independent held-out or external validation is still needed before generalizing the ranking.")
    add_table(doc, ["Model", "n", "Threshold", "Accuracy", "Precision", "Recall", "F1", "MCC", "TP/TN/FP/FN", "Evidence"], [
        ["TF-IDF", "1,560", "4.14", "94.10", "76.58", "87.66", "81.75", "0.785", "206/1262/63/29", "C"],
        ["Sentence-BERT", "1,560", "27.90", "92.69", "83.33", "64.10", "72.46", "0.691", "150/1296/30/84", "C"],
        ["BGE-M3", "1,560", "46.75", "92.18", "73.14", "75.64", "74.37", "0.698", "177/1261/65/57", "C"],
    ], "TABLE XII. ADMINISTRATOR-VERIFIED SUPERVISOR BINARY METRICS (%, EXCEPT MCC)", font_size=6.6)
    add_table(doc, ["Ranking measure", "Status", "Reason"], [
        ["Top-1 / Top-3 / Top-5", "Not measured", "No independent per-project ranked gold standard"],
        ["MRR / MAP / nDCG@K", "Not measured", "Binary labels do not provide an independent ranked relevance set"],
        ["Coverage", "Measured operationally", "78/78 projects assigned; all 20 supervisors used"],
        ["Binary accuracy/F1", "Internal validation", "Administrator verified; threshold selected on the same sample"],
    ], "TABLE XIII. SUPERVISOR RANKING-METRIC AVAILABILITY")
    add_figure(doc, PUBLICATION_FIGURES / "figure-15-supervisor-classification-metrics.png", "FIGURE 11. Supervisor-label metrics from the administrator-verified internal evaluation; the thresholds were selected on the same labelled sample.")
    add_figure(doc, PUBLICATION_FIGURES / "figure-19-supervisor-label-provenance.png", "FIGURE 12. All 4,680 supervisor labels were checked by the research administrator; initialization-source metadata remain available in the reproducibility files.")
    add_h2(doc, "H. Workload, Capacity, and Fairness")
    add_para(doc, "The balancing run assigned all 78 projects, used every supervisor, and exceeded no capacity. Assigned load ranges from 1 to 6 (mean 3.90, SD 1.61), mean capacity utilization is 77.92%, and the Gini coefficient is 0.226. The result demonstrates feasibility and moderate concentration, not fairness across protected groups; no protected-attribute data were collected or analysed.")
    add_equation(doc, transformer, '<mi>G</mi><mo>=</mo><mfrac><mrow><munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi></munderover><munderover><mo>∑</mo><mrow><mi>j</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi></munderover><mo>|</mo><msub><mi>L</mi><mi>i</mi></msub><mo>−</mo><msub><mi>L</mi><mi>j</mi></msub><mo>|</mo></mrow><mrow><mn>2</mn><msup><mi>n</mi><mn>2</mn></msup><mover><mi>L</mi><mo>¯</mo></mover></mrow></mfrac><mo>=</mo><mn>0.226</mn>', 17)
    add_table(doc, ["Measure", "Verified result"], [["Assigned projects", "78/78"], ["Supervisors used", "20/20"], ["Minimum / maximum load", "1 / 6"], ["Mean / SD", "3.90 / 1.61"], ["Mean utilization", "77.92%"], ["Gini coefficient", "0.226"], ["Capacity violations", "0"]], "TABLE XIV. WORKLOAD AND CAPACITY OUTCOMES")
    add_figure(doc, PUBLICATION_FIGURES / "figure-08-workload-and-capacity.png", "FIGURE 13. Final assignment load against maximum capacity for 20 anonymized supervisors.")
    add_h2(doc, "I. Error and Disagreement Analysis")
    add_para(doc, "TF-IDF’s dominant error is false negative: lexical mismatch prevents high scores for semantically related proposals. Sentence-BERT’s two errors are false positives at 70%, consistent with paraphrase-sensitive embeddings occasionally merging generic academic language. BGE-M3’s labelled queue contains only three negatives and classifies all three as similar, preventing any evidence of negative-class discrimination. Full-corpus pair disagreements are largest when BGE-M3 assigns a high semantic baseline while TF-IDF finds little shared vocabulary. Representative records are anonymized by project codes in the supplied error-analysis table; no student text is reproduced in the paper.")
    add_figure(doc, PUBLICATION_FIGURES / "figure-06-largest-model-disagreements.png", "FIGURE 14. Ten largest full-corpus score disagreements across the three representations.")

    # VII Discussion
    add_h1(doc, "VII. DISCUSSION")
    add_h2(doc, "A. Answers to the Research Questions")
    add_para(doc, "RQ1: Sentence-BERT provides the strongest balanced similarity evidence at the deployed threshold. Its 92.31% F1 is slightly below BGE-M3’s 94.74%, but its MCC 0.873, balanced accuracy 94.44%, specificity 88.89%, and ROC-AUC 0.968 demonstrate discrimination across both classes. BGE-M3’s raw F1 must be interpreted with its 90% positive labelled subset and zero true negatives.")
    add_para(doc, "RQ2: Features and technologies/tools yield the highest mean field scores, but title removal produces the largest average score perturbation for each model after reweighting. Score-level ablation cannot establish which field improves accuracy; a common independently labelled set is required.")
    add_para(doc, "RQ3: TF-IDF leads the administrator-verified supervisor comparison, with the highest accuracy (94.10%), F1 (81.75%), and MCC (0.785). Sentence-BERT provides the highest precision (83.33%), while BGE-M3 ranks second by F1 (74.37%). These results establish the internal ordering for the reviewed dataset; a broader claim of general superiority still requires an independent held-out or external test set. Future evaluation should also record expert-ranked relevant supervisors per project so that Top-K, MRR, MAP, and nDCG can be reported.")
    add_para(doc, "RQ4: The capacity layer is operationally feasible: all projects are assigned, every supervisor is used, and no capacity is exceeded. The Gini value and load range provide a transparent workload baseline, while matching research shows why feasibility, preference quality, and fairness should be treated as distinct objectives [191]–[200].")
    add_para(doc, "RQ5: Model choice is conditional. Sentence-BERT is the preferred balanced similarity model; TF-IDF is the fastest and most inspectable; BGE-M3 is the strongest multilingual/high-recall research candidate but requires threshold calibration and negative examples. No single model dominates every operational dimension.")
    add_para(doc, "RQ6: The principal threats are small model-specific similarity samples, single-reviewer judgments, class imbalance, non-overlapping cases, supervisor-threshold optimization on the evaluation sample, and the absence of external institutional validation. These limitations determine the evidence grades and keep the claims within what the data can support.")
    add_h2(doc, "B. Comparative Deployment Interpretation")
    add_table(doc, ["Decision need", "Preferred model", "Evidence-based reason", "Caution"], [
        ["Balanced similarity screening", "Sentence-BERT", "Best MCC, balanced accuracy, macro-F1, ROC-AUC", "Single-rater n=30"],
        ["Fast transparent triage", "TF-IDF", "0.416 ms/pair; inspectable lexical evidence", "Low semantic recall at 70%"],
        ["Multilingual/high-recall research", "BGE-M3", "Pretrained multilingual representation; 100% observed recall", "No true negatives; threshold not calibrated"],
        ["Supervisor assignment", "TF-IDF leads internally", "Single-reviewer, same-sample threshold selection", "Collect independent ranked relevance"],
        ["Operational provisional matching", "Ensemble + human approval", "Feasible capacity-aware allocation", "Greedy, not globally optimal/fair"],
    ], "TABLE XV. EVIDENCE-BOUNDED DEPLOYMENT RECOMMENDATIONS")
    add_figure(doc, PUBLICATION_FIGURES / "figure-20-evidence-bounded-rankings.png", "FIGURE 15. Separate similarity-validity and administrator-verified supervisor rankings; lower rank is better.")
    add_h2(doc, "C. Explainability and Human Oversight")
    add_para(doc, "Every similarity record exposes six field scores and the weighted overall score; every supervisor record exposes semantic, technology, skills, previous-project, publication-keyword, availability, eligibility, pure, and adjusted components. This traceability permits an administrator to distinguish title overlap from problem/objective overlap and expertise fit from workload penalties. Explanations support review but do not prove causality. Explainable-recommendation literature similarly separates understandable evidence from faithful causal explanation [71]–[80].")
    add_h2(doc, "D. Fairness, Privacy, and Ethics")
    add_para(doc, "Similarity alerts must initiate review, never automatic accusations of plagiarism. Supervisor rankings must not create entitlement, exclusion, or publication-count bias. Incomplete profiles, language coverage, department constraints, and workload penalties can systematically affect visibility. Authorized users must be able to inspect, override, and document decisions. The package removes identities and credentials; only synthetic/test evidence is shared. Educational privacy, learning-analytics ethics, and responsible-AI governance sources emphasize transparency, agency, proportionality, and accountable human oversight [201]–[205], [206]–[210].")

    # VIII/IX
    add_h1(doc, "VIII. LIMITATIONS AND FUTURE DIRECTIONS")
    add_para(doc, "Internal validity is limited by model-specific labelled queues, single-reviewer judgments, and supervisor thresholds selected on the evaluation sample. Construct validity is limited because binary ‘similar’ does not fully represent degrees or types of conceptual overlap, while binary supervisor relevance does not represent ranked suitability. External validity is limited to 78 synthetic/test projects and 20 test profiles from one institutional setting. Conclusion validity is limited by small n=30 similarity samples, extreme BGE-M3 class imbalance, and unavailable paired inter-model significance tests. Reproducibility is constrained by model-default device reporting and absent peak-memory measurements, although predictions, configurations, scripts, checksums, and the supervisor-verification declaration are supplied.")
    add_para(doc, "Priority future work is a blinded, common-case, multi-rater label set with adjudication and inter-annotator agreement; a held-out external institution; language-stratified Somali/English evaluation; independently judged relevant-supervisor sets enabling Top-K, MRR, MAP, and nDCG; prespecified threshold selection on validation data; memory/energy profiling; protected-group fairness review where legally and ethically appropriate; and comparison of greedy assignment with stable or multi-objective optimization. Human-reviewed overrides should be retained as prospective audit evidence rather than recycled as training labels without governance.")
    add_h1(doc, "IX. CONCLUSION")
    add_para(doc, "This study verified a deployed three-model framework for six-field project similarity and workload-aware supervisor assignment. The live experiment contains 78 projects, 20 supervisors, 9,009 project-pair scores, 4,680 supervisor scores, 90 model-specific similarity labels, and 78 capacity-feasible assignments. Sentence-BERT is the strongest balanced similarity model under the available grade-C evidence (93.33% accuracy, 92.31% F1, MCC 0.873), TF-IDF is the fastest and most interpretable, and BGE-M3’s high ordinary F1 is qualified by zero negative-class discrimination. In the administrator-verified supervisor evaluation, TF-IDF leads on accuracy, F1, and MCC; BGE-M3 ranks second by F1, and Sentence-BERT records the highest precision. This is a grade-C internal result because one administrator reviewed the labels and the thresholds were selected on the same sample. The principal contribution is an evidence-traceable decision-support design that makes scores, thresholds, provenance, workload effects, limitations, and human authority explicit.")

    # One-column appendix with every live visualization panel.
    appendix_section = doc.add_section(WD_SECTION.NEW_PAGE)
    set_columns(appendix_section, 1)
    add_h1(doc, "APPENDIX A. COMPLETE LIVE VISUALIZATION-PAGE EVIDENCE")
    add_para(doc, "This appendix contains every scientific chart or analysis panel from the research-administrator Visualization page, captured individually from the live system after verification of 78 projects, 9,009 project-pair scores, 4,680 supervisor scores, 90 similarity annotations, and 78 assignments. Ordinary interface screenshots are excluded. Dashboard captions that used the word consensus are corrected in the manuscript: the underlying records have one annotator and needs_more_labels status.", size=9.5)
    capture_files = sorted(SYSTEM_CAPTURES.glob("panel-*.png"))
    for idx, path in enumerate(capture_files, 1):
        title = path.stem.split("-", 2)[-1].replace("-", " ").title()
        add_figure(doc, path, f"FIGURE A{idx}. Live Visualization-page panel: {title}.", width=6.65)
    add_h1(doc, "APPENDIX B. VISUAL TRACEABILITY")
    visual_rows = []
    for idx, path in enumerate(capture_files, 1):
        visual_rows.append([f"A{idx}", "Live dashboard panel", path.name, "Browser capture after live DB audit", "Supplementary appendix"])
    add_table(doc, ["Figure", "Type", "Source", "Verification", "Placement"], visual_rows, "TABLE B-I. COMPLETE VISUAL TRACEABILITY", font_size=6.7)
    add_h1(doc, "APPENDIX C. DECLARATIONS")
    add_para(doc, "Funding—No verified funding information was supplied; no funding claim is made.")
    add_para(doc, "Conflicts of Interest—To be completed and confirmed by the authors before submission.")
    add_para(doc, "Ethics and Consent—The experimental records are marked test/synthetic. The package contains anonymized evidence only. Institutional ethics requirements must be confirmed by the authors and institution before submission.")
    add_para(doc, "Data and Code Availability—Sanitized evidence tables, evaluation scripts, chart data, figures, and checksums are included in the accompanying reproducibility package. Private operational data and credentials are excluded.")
    add_para(doc, "Author Contributions and Corresponding Author—To be supplied and verified by the authors; no names, memberships, emails, grants, or contribution roles are invented here.")

    source_references = load_reference_rows()
    first_appearance_order = collect_reference_first_appearance_order(
        doc, len(source_references)
    )
    REFERENCE_ORDER_OLD_NUMBERS.clear()
    REFERENCE_ORDER_OLD_NUMBERS.extend(first_appearance_order)
    REFERENCE_NUMBER_MAP.clear()
    REFERENCE_NUMBER_MAP.update(
        {old_number: new_number for new_number, old_number in enumerate(first_appearance_order, 1)}
    )
    remap_document_citations(doc, REFERENCE_NUMBER_MAP)
    refs = [source_references[old_number - 1] for old_number in first_appearance_order]

    refs_section = doc.add_section(WD_SECTION.NEW_PAGE)
    set_columns(refs_section, 2)
    add_h1(doc, "REFERENCES")
    for idx, ref in enumerate(refs, 1):
        bits = [f"[{idx}] {ref['authors']}, “{ref['title']},” {ref['source']}"]
        if ref["volume"]:
            bits.append(f"vol. {ref['volume']}")
        if ref["pages"]:
            bits.append(f"pp. {ref['pages']}")
        if ref["year"]:
            bits.append(str(ref["year"]))
        text = ", ".join(bits) + f", doi: {ref['doi']}."
        p = add_para(doc, text, size=7.2, align=WD_ALIGN_PARAGRAPH.LEFT, space_after=2)
        p.paragraph_format.first_line_indent = Inches(-0.16)
        p.paragraph_format.left_indent = Inches(0.16)

    apply_ieee_styles(doc)
    # Preserve deliberate larger/smaller local sizes after global style application.
    output = PACKAGE / "01-manuscript" / "final-ieee-journal-manuscript-verified.docx"
    output.parent.mkdir(parents=True, exist_ok=True)
    doc.save(output)
    return output


def build_comparison_report() -> Path:
    doc = Document()
    section = doc.sections[0]
    section.top_margin = Inches(0.65)
    section.bottom_margin = Inches(0.65)
    section.left_margin = Inches(0.7)
    section.right_margin = Inches(0.7)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    style_run(p.add_run("Comparative Evaluation Report"), size=20, bold=True, color=NAVY)
    p2 = doc.add_paragraph()
    p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    style_run(p2.add_run("TF-IDF vs. Sentence-BERT vs. BGE-M3\nProject Similarity and Supervisor Assignment"), size=12, bold=True, color=TEAL)
    add_para(doc, "Evidence freeze: 5 August 2026. This report is fully traceable to the sanitized live database export and independently recomputed analysis files.", align=WD_ALIGN_PARAGRAPH.CENTER)
    add_h1(doc, "1. Executive Finding")
    add_para(doc, "Sentence-BERT ranks first for balanced project-similarity validity; BGE-M3 ranks first by ordinary similarity F1 but fails negative-class discrimination on its model-specific sample; TF-IDF ranks first for speed and transparency. In the administrator-verified supervisor comparison, TF-IDF ranks first on accuracy, F1, and MCC; BGE-M3 is second by F1, while Sentence-BERT has the highest precision. This ordering is an internal result from one reviewer and is not presented as an externally validated universal ranking.")
    add_table(doc, ["Task / criterion", "Rank 1", "Rank 2", "Rank 3", "Evidence meaning"], [
        ["Similarity ordinary F1", "BGE-M3 94.74", "Sentence-BERT 92.31", "TF-IDF 16.67", "Misleading without class balance"],
        ["Similarity evidence-balanced", "Sentence-BERT", "TF-IDF", "BGE-M3", "Accuracy, macro-F1, balanced accuracy, MCC, AUC"],
        ["Supervisor internal F1", "TF-IDF 81.75", "BGE-M3 74.37", "Sentence-BERT 72.46", "Grade C; administrator verified"],
        ["Latency", "TF-IDF 0.416 ms", "Sentence-BERT 31.141 ms", "BGE-M3 55.518 ms", "Measured per stored pair"],
    ], "TABLE 1. MODEL RANKING SUMMARY", font_size=7.5)
    add_h1(doc, "2. Similarity Performance")
    add_table(doc, ["Model", "Accuracy", "Precision", "Recall", "F1", "Macro-F1", "Specificity", "MCC", "ROC-AUC", "Counts"], [
        ["TF-IDF", "66.67", "100.00", "9.09", "16.67", "47.92", "100.00", "0.244", "0.565", "1/19/0/10"],
        ["Sentence-BERT", "93.33", "85.71", "100.00", "92.31", "93.21", "88.89", "0.873", "0.968", "12/16/2/0"],
        ["BGE-M3", "90.00", "90.00", "100.00", "94.74", "47.37", "0.00", "0.000", "0.531", "27/0/3/0"],
    ], "TABLE 2. VERIFIED SIMILARITY METRICS AT 70%", font_size=7)
    add_figure(doc, PUBLICATION_FIGURES / "figure-10-similarity-classification-metrics.png", "FIGURE 1. Core similarity metrics.", width=6.5)
    add_figure(doc, PUBLICATION_FIGURES / "figure-11-similarity-confusion-matrices.png", "FIGURE 2. Similarity confusion matrices.", width=6.5)
    add_figure(doc, PUBLICATION_FIGURES / "figure-12-threshold-versus-f1.png", "FIGURE 3. Threshold sensitivity.", width=6.5)
    add_h1(doc, "3. Supervisor Performance and Evidence Boundary")
    add_table(doc, ["Model", "Threshold", "Accuracy", "Precision", "Recall", "F1", "MCC", "Counts", "Evidence"], [
        ["TF-IDF", "4.14", "94.10", "76.58", "87.66", "81.75", "0.785", "206/1262/63/29", "C"],
        ["Sentence-BERT", "27.90", "92.69", "83.33", "64.10", "72.46", "0.691", "150/1296/30/84", "C"],
        ["BGE-M3", "46.75", "92.18", "73.14", "75.64", "74.37", "0.698", "177/1261/65/57", "C"],
    ], "TABLE 3. ADMINISTRATOR-VERIFIED SUPERVISOR BINARY METRICS", font_size=7)
    add_para(doc, "The research administrator checked all 4,680 labels and amended records where necessary. The stored annotationSource field preserves the initial population route and is not the final review status. Top-1, Top-3, Top-5, MRR, MAP, and nDCG are not measured because the system does not yet contain independent per-project ranked relevant-supervisor judgments.")
    add_figure(doc, PUBLICATION_FIGURES / "figure-15-supervisor-classification-metrics.png", "FIGURE 4. Administrator-verified internal supervisor metrics.", width=6.5)
    add_figure(doc, PUBLICATION_FIGURES / "figure-19-supervisor-label-provenance.png", "FIGURE 5. Administrator-verified supervisor-label coverage.", width=6.5)
    add_h1(doc, "4. Workload and Fairness")
    add_table(doc, ["Assigned", "Supervisors used", "Mean", "SD", "Min", "Max", "Gini", "Violations"], [["78/78", "20/20", "3.90", "1.61", "1", "6", "0.226", "0"]], "TABLE 4. CAPACITY-AWARE ASSIGNMENT")
    add_figure(doc, PUBLICATION_FIGURES / "figure-08-workload-and-capacity.png", "FIGURE 6. Workload and capacity.", width=6.5)
    add_h1(doc, "5. Final Recommendations")
    add_bullet(doc, "Use Sentence-BERT as the primary balanced similarity-screening candidate, subject to a larger blinded common test set.")
    add_bullet(doc, "Retain TF-IDF as the fast, transparent baseline and triage model.")
    add_bullet(doc, "Retain BGE-M3 for multilingual/high-recall research, but recalibrate it with deliberately sampled negative pairs.")
    add_bullet(doc, "Use TF-IDF as the leading supervisor model for the verified internal dataset, while collecting independent ranked relevance labels for Top-K, MRR, MAP, and nDCG evaluation.")
    add_bullet(doc, "Keep the capacity-aware ensemble and human approval boundary; audit overrides and workload outcomes prospectively.")
    apply_ieee_styles(doc)
    output = PACKAGE / "03-evaluation-and-evidence" / "comparative-evaluation-report-verified.docx"
    output.parent.mkdir(parents=True, exist_ok=True)
    doc.save(output)
    return output


def write_reports() -> None:
    reports = PACKAGE / "03-evaluation-and-evidence" / "reports"
    reports.mkdir(parents=True, exist_ok=True)
    report_texts = {
        "initial-manuscript-audit.md": """# Initial manuscript audit\n\n## Material problems found\n\n- The prior manuscript treated label-dependent metrics as not estimable although the live database now contains 90 similarity labels and 4,680 supervisor labels.\n- Prior score means, risk counts, workload SD, and description version were stale after the corrected-description run.\n- The dashboard word *consensus* overstated the evidence: all 90 similarity consensus rows have one annotator and `needs_more_labels` status.\n- The stored supervisor annotation-source flag was initially read as the final review status. The research administrator subsequently confirmed that all 4,680 labels had been checked and amended where necessary.\n- A single raw-F1 ranking would misrepresent BGE-M3 because its labelled subset is 90% positive and contains zero true negatives at 70%.\n- Ranking metrics such as Top-K, MRR, MAP, and nDCG were requested but are unsupported by the current binary, model-specific supervisor labels.\n- The previous 160-reference library was below the requested 200-source minimum.\n- Earlier visualization captures included clipped interface regions; all 22 scientific panels were recaptured separately.\n- The supplied format sample is an Emerald/ORCA-style article rather than an IEEE Open Journal template. The manuscript therefore follows the prompt's explicit IEEE organization without inventing a sample provenance.\n\n## Corrections applied\n\nAll live quantities were traced to database exports and recomputed analysis; labels were evidence-graded; result sections were rewritten; symbolic native Word equations and five implementation-faithful algorithms were added; 210 unique DOI references were verified; all scientific visualization panels were inserted before the reference list; unsupported metrics are explicitly marked *Not measured*.\n""",
        "updated-number-validation-report.md": """# Updated-number validation report\n\n| Item | Verified value | Primary evidence | Status |\n|---|---:|---|---|\n| Projects | 78 unique | live DB audit | confirmed |\n| Supervisors | 20 test profiles | live DB audit | confirmed |\n| Pair scores | 9,009 | 3,003/model × 3 | confirmed |\n| Supervisor scores | 4,680 | 1,560/model × 3 | confirmed |\n| Similarity labels | 90 | 30/model; one admin | corrected |\n| Multi-rater consensus | 0 | all `needs_more_labels` | corrected |\n| Supervisor labels | 4,680 | administrator checked all labels; changes saved where needed | corrected with evidence grade C |\n| Assignments | 78/78 | balanced run | confirmed |\n| Capacity violations | 0 | assignment audit | confirmed |\n| Workload mean / SD | 3.90 / 1.61 | recomputation | updated |\n| Workload Gini | 0.226 | recomputation | added |\n| Similarity mean TF-IDF | 16.04% | 3,003 records | updated |\n| Similarity mean Sentence-BERT | 41.98% | 3,003 records | updated |\n| Similarity mean BGE-M3 | 60.77% | 3,003 records | updated |\n""",
        "ranking-metric-report.md": """# Ranking-metric report\n\nTop-1, Top-3, Top-5, Precision@K, Recall@K, Hit Rate@K, MRR, MAP, and nDCG@K are **not measured**. The administrator-verified supervisor evidence contains model-specific binary judgments, not an independent per-project ranked relevance set. Coverage and capacity feasibility are measured: 78/78 projects were assigned, all 20 supervisors were used, and no capacity was exceeded.\n""",
        "statistical-significance-report.md": """# Statistical and uncertainty report\n\n- Percentile bootstrap 95% intervals use 1,000 within-model resamples.\n- Similarity queues contain different cases; intersections are only 3 TF-IDF/Sentence-BERT pairs, 3 TF-IDF/BGE-M3 pairs, and 1 Sentence-BERT/BGE-M3 pair.\n- Paired McNemar, Wilcoxon, Friedman, or paired-bootstrap model tests are therefore not valid and are not reported.\n- Supervisor thresholds are selected on the same administrator-verified labels used for evaluation; the comparison is internal and no external inferential claim is made.\n- The supplied CSV files contain all interval endpoints and sample sizes.\n""",
        "fairness-workload-analysis.md": """# Fairness and workload analysis\n\nThe capacity-aware run assigned 78 projects across 20 supervisors with load 1–6, mean 3.90, SD 1.61, mean utilization 77.92%, Gini 0.226, and zero capacity violations. This establishes workload feasibility, not demographic fairness. No protected attributes are exported or evaluated. Risks include incomplete profiles, publication-volume advantage, language mismatch, department constraints, and over-reliance on high semantic scores. Human override and reason logging remain mandatory.\n""",
        "ethical-privacy-analysis.md": """# Ethical and privacy analysis\n\nSimilarity is a review signal, not proof of plagiarism or misconduct. Supervisor recommendations support, but do not replace, authorized academic decisions. The package contains only test/synthetic, anonymized records and excludes credentials, emails, database IDs, evaluator IDs, tokens, and private operational profiles. Institutions should confirm lawful basis, consent, retention, access controls, override rights, appeal paths, threshold transparency, and audit responsibilities before real deployment.\n""",
        "error-analysis.md": """# Error analysis\n\n- **TF-IDF:** 10 false negatives and no false positives; shared meaning without shared vocabulary is the principal risk.\n- **Sentence-BERT:** two false positives and no false negatives; generic academic language can be over-merged.\n- **BGE-M3:** three false positives, zero true negatives, and zero false negatives; the labelled sample cannot demonstrate negative-class discrimination.\n- **Full-corpus disagreement:** the largest gaps generally pair high BGE-M3 baselines with low TF-IDF lexical overlap.\n\nAn anonymized case table is supplied in `similarity-error-analysis.csv` and `similarity-largest-disagreements.csv`.\n""",
        "ablation-study.md": """# Output-sensitivity ablation\n\nThe project-field and supervisor-component analyses remove one stored component and renormalize the remaining score. They measure deterministic score shift and rank stability, **not predictive-performance improvement**. Title removal creates the largest mean project-score shift for all three models. The 0.80 semantic supervisor component has the largest score influence; workload/availability can materially reorder candidates, especially for TF-IDF. Complete values are in the supplied ablation CSV files.\n""",
        "journal-format-compliance.md": """# IEEE-style format compliance\n\n- One-paragraph abstract and Index Terms\n- Roman-numbered main sections and lettered subsections\n- Two-column main text and references; full-width one-column visual appendix\n- Numeric citations and 210-entry reference list\n- Native symbolic Word equations numbered (1)–(17)\n- Five real-logic algorithms across manuscript and reproducibility material\n- Table captions above tables; figure captions below figures\n- Every live visualization-page scientific panel placed before references\n- No invented DOI, funding, membership, author email, affiliation, acceptance date, or grant\n\nThe user-supplied sample file was not an IEEE Open Journal template; the explicit formatting requirements in the revision prompt governed the layout.\n""",
        "response-to-reviewer-summary.md": """# Response-to-reviewer-style improvement summary\n\n1. Replaced stale unlabelled-result claims with metrics recomputed from live confusion counts.\n2. Added complete accuracy, precision, recall, F1, macro-F1, weighted-F1, specificity, balanced accuracy, MCC, kappa, ROC-AUC, AP, and Brier evidence.\n3. Separated raw-F1 ranking from evidence-balanced ranking.\n4. Added explicit grade-C evidence boundaries and corrected the false consensus and supervisor-source interpretations.\n5. Added threshold sensitivity, 1,000-resample intervals, error analysis, output ablation, latency, workload, Gini, and capacity results.\n6. Marked unsupported Top-K/MRR/MAP/nDCG and memory metrics as not measured.\n7. Added symbolic mathematics, real algorithms, and implementation-verified configurations.\n8. Reverified and expanded the bibliography to 210 unique DOI records.\n9. Replaced clipped captures with all 22 live scientific visualization panels, individually reviewed.\n10. Rebuilt the complete IEEE-style Word/PDF/LaTeX package with sanitized evidence and reproducibility files.\n""",
    }
    for name, text in report_texts.items():
        (reports / name).write_text(text, encoding="utf-8")

    # Traceability tables.
    with (reports / "figure-traceability.csv").open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["figure", "visual_type", "source", "underlying_data", "verification", "purpose", "placement"])
        for i, path in enumerate(sorted(SYSTEM_CAPTURES.glob("panel-*.png")), 1):
            writer.writerow([f"A{i}", "live dashboard panel", path.name, "live research API/database", "browser capture after DB and metric reconciliation", "implementation evidence", "Appendix A before references"])
        for path in sorted(PUBLICATION_FIGURES.glob("*.png")):
            writer.writerow([path.stem, "programmatic scientific chart", path.name, "analysis CSV files", "recomputed from sanitized export", "quantitative interpretation", "main paper or package"])
    with (reports / "table-traceability.csv").open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["table", "content", "source", "verification"])
        entries = [
            ("I", "Notation", "implementation and equations", "symbol cross-check"),
            ("II", "Dataset characteristics", "live-evidence-audit.json", "database audit"),
            ("III", "Model configuration", "research_config.py and batch_research_service.py", "source inspection"),
            ("IV", "Label provenance", "sanitized annotations", "record counts"),
            ("VII", "Similarity metrics", "similarity-metrics.csv", "confusion-count recomputation"),
            ("XII", "Supervisor metrics", "supervisor-metrics.csv", "confusion-count recomputation"),
            ("XIV", "Workload", "supervisor-workload.csv", "direct recomputation"),
        ]
        writer.writerows(entries)


def write_reference_reports() -> None:
    out = PACKAGE / "06-references"
    out.mkdir(parents=True, exist_ok=True)
    for path in REFERENCES.iterdir():
        if path.is_file():
            shutil.copy2(path, out / path.name)
    refs = ordered_reference_rows()
    fieldnames = list(refs[0].keys())
    with (out / "reference-verification-matrix.csv").open(
        "w", encoding="utf-8-sig", newline=""
    ) as stream:
        writer = csv.DictWriter(stream, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(refs)
    (out / "reference-verification-matrix.json").write_text(
        json.dumps(refs, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    library_lines = [
        "# Verified scholarly reference library",
        "",
        "Ordered by first appearance in the manuscript; 210 unique DOI records.",
        "",
    ]
    for number, ref in enumerate(refs, 1):
        source = f" *{ref['source']}*," if ref["source"] else ""
        volume = f" vol. {ref['volume']}," if ref["volume"] else ""
        pages = f" pp. {ref['pages']}," if ref["pages"] else ""
        year = f" {ref['year']}," if ref["year"] else ""
        library_lines.append(
            f"[{number}] {ref['authors']}, \"{ref['title']},\"{source}{volume}{pages}{year} "
            f"doi: [{ref['doi']}](https://doi.org/{ref['doi']})."
        )
    (out / "verified-reference-library.md").write_text(
        "\n".join(library_lines) + "\n", encoding="utf-8"
    )
    cited_set = set(CITED_REFERENCE_OLD_NUMBERS)
    with (out / "reference-number-remapping.csv").open(
        "w", encoding="utf-8-sig", newline=""
    ) as stream:
        writer = csv.writer(stream)
        writer.writerow(
            ["new_ref_no", "old_ref_no", "cited_in_manuscript", "doi", "title"]
        )
        for new_number, old_number in enumerate(REFERENCE_ORDER_OLD_NUMBERS, 1):
            ref = refs[new_number - 1]
            writer.writerow(
                [new_number, old_number, "Yes" if old_number in cited_set else "No", ref["doi"], ref["title"]]
            )
    audit_path = out / "reference-library-audit.json"
    audit = json.loads(audit_path.read_text(encoding="utf-8"))
    audit["citation_order"] = "first appearance in manuscript"
    audit["cited_references"] = len(CITED_REFERENCE_OLD_NUMBERS)
    audit["uncited_references_appended"] = len(refs) - len(CITED_REFERENCE_OLD_NUMBERS)
    audit_path.write_text(
        json.dumps(audit, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    claims = {
        "Academic and doctoral supervision": "Supervision quality depends on feedback, expectations, relationship, and institutional conditions.",
        "Algorithmic fairness and human oversight": "AI decision support requires accountability, contestability, and human oversight.",
        "Artificial intelligence in higher education": "AI is used in higher-education teaching and administrative decision support with governance risks.",
        "BERT and contextual language models": "Contextual transformers encode text beyond surface term overlap.",
        "Capstone and final-year project management": "Capstone systems require transparent allocation, monitoring, and authentic project governance.",
        "Dense, sparse, and hybrid retrieval": "Sparse and dense retrieval present different effectiveness and efficiency trade-offs.",
        "Educational recommender systems": "Content-based recommendation can support educational routing and personalization.",
        "Explainable recommendation": "Recommendation explanations should expose evidence and limitations without claiming causal faithfulness.",
        "Multilingual and long-document embeddings": "Multilingual/long-text models address heterogeneous academic language and document length.",
        "Plagiarism and originality detection": "Proposal overlap screening is related to but distinct from plagiarism judgment.",
        "Ranking metrics and evaluation": "Ranking and classification require task-appropriate metrics and careful imbalance interpretation.",
        "Reviewer and expert assignment": "Expert assignment combines topical match with candidate constraints.",
        "Semantic textual similarity": "STS evaluates semantic relatedness beyond keyword identity.",
        "Sentence-BERT and sentence embeddings": "Bi-encoder sentence models enable efficient cosine-based semantic comparison.",
        "Supervisor recommendation": "Academic supervisor matching uses expertise and research-interest alignment.",
        "TF-IDF and cosine similarity": "TF-IDF cosine is an efficient, inspectable lexical baseline.",
        "Workload-aware fair allocation": "Capacity and workload constraints must be separated from semantic relevance.",
        "Statistical comparison and uncertainty in machine learning": "Classifier comparisons require uncertainty intervals, suitable metrics, and valid paired designs.",
        "Human annotation and label reliability": "Annotator provenance, disagreement, and consensus procedures affect validity.",
        "Reproducible machine learning and dataset documentation": "Datasheets, model cards, leakage reporting, and reproducibility controls strengthen evidence.",
        "Matching theory and constrained assignment optimization": "Stable and constrained matching formalize capacity-aware education allocation.",
        "Educational data privacy and responsible AI governance": "Educational AI requires privacy, fairness, transparency, and accountable governance.",
    }
    with (out / "claim-to-source-evidence-table.csv").open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["ref_no", "authors_year", "title", "source", "doi", "verification_status", "supported_claim", "support_confirmed", "correction"])
        for i, ref in enumerate(refs, 1):
            writer.writerow([i, f"{ref['authors']} ({ref['year']})", ref["title"], ref["source"], ref["doi"], "Verified DOI metadata and relevance screened", claims.get(ref["category"], "Category-specific scholarly support"), "Yes—title/source/category screen; claim kept conservative", "None recorded"])
    (out / "reference-corrections-and-removals.md").write_text(
        "# Reference corrections and removals\n\n- Final library: 210 unique DOI records.\n- Duplicates in final library: 0.\n- Fabricated references retained: 0.\n- Predatory references intentionally added: 0.\n- Strict expansion candidate rejected: 1 (logged in `strict-candidate-audit.json`).\n- Twenty initially guessed or keyword-adjacent methodological candidates were replaced during audit before finalization; they do not appear in the final library.\n- Citation numbers are assigned by first appearance in the manuscript.\n- The first in-text citation is [1]-[10]; 200 cited sources precede 10 uncited library records.\n- `reference-number-remapping.csv` preserves the old-to-new number mapping.\n",
        encoding="utf-8",
    )


def write_latex() -> None:
    out = PACKAGE / "01-manuscript" / "latex"
    out.mkdir(parents=True, exist_ok=True)
    refs = ordered_reference_rows()
    def esc(text: str) -> str:
        replacements = {
            "\\": r"\textbackslash{}", "&": r"\&", "%": r"\%", "_": r"\_",
            "#": r"\#", "$": r"\$", "~": r"\textasciitilde{}",
            "^": r"\textasciicircum{}", "{": r"\{", "}": r"\}",
        }
        return "".join(replacements.get(character, character) for character in html.unescape(text))
    lines = [
        r"\documentclass[journal]{IEEEtran}",
        r"\usepackage[T1]{fontenc}", r"\usepackage[utf8]{inputenc}",
        r"\usepackage{amsmath,amssymb,booktabs,graphicx,array,url}",
        r"\graphicspath{{../../05-figures/publication-charts/}{../../05-figures/system-visualizations/}{../../05-figures/architecture/}}",
        r"\title{A Comparative Evaluation of Semantic Models for Final-Year Project Similarity Detection and Intelligent Supervisor Assignment}",
        r"\author{Author information to be verified before submission}",
        r"\begin{document}", r"\maketitle",
        r"\begin{abstract}",
        "Final-year project governance requires early detection of semantically overlapping proposals and transparent allocation of qualified supervisors. This reproducible study evaluates TF-IDF, sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2 (Sentence-BERT), and BAAI/bge-m3 (BGE-M3) in a deployed decision-support system. The frozen corpus contains 78 test/synthetic projects, 20 structured test supervisor profiles, 3,003 project pairs per model (9,009 scores), 1,560 project-supervisor candidates per model (4,680 scores), and 78 capacity-feasible assignments. On 30 model-specific single-administrator similarity labels per model at the deployed 70\\% threshold, Sentence-BERT provides the strongest balanced evidence: 93.33\\% accuracy, 92.31\\% F1, 94.44\\% balanced accuracy, MCC 0.873, and ROC-AUC 0.968. BGE-M3 has the highest ordinary F1 (94.74\\%) but zero specificity and MCC because its labelled subset contains no correctly rejected negative. TF-IDF is fastest (0.416 ms/pair) but recalls only 9.09\\% of positives. In the administrator-verified supervisor evaluation, TF-IDF provides the strongest overall result (94.10\\% accuracy, 81.75\\% F1, MCC 0.785). The research administrator checked all 4,680 supervisor labels and amended records where necessary; this is a single-reviewer internal evaluation rather than an independent multi-rater or external test. The final allocation uses every supervisor, violates no capacity, and has load Gini 0.226. The study contributes an evidence-traceable six-field formulation, explicit label-provenance grading, complete metric reporting, threshold/error/ablation analysis, workload auditing, and a human-oversight boundary.",
        r"\end{abstract}",
        r"\begin{IEEEkeywords}artificial intelligence, educational decision support, final-year projects, semantic similarity, sentence embeddings, supervisor assignment, TF-IDF, workload balancing\end{IEEEkeywords}",

        r"\section{Introduction}",
        "Final-year and capstone projects connect problem formulation, design, implementation, evaluation, and professional communication. Institutional governance becomes difficult when proposals, decisions, archived projects, feedback, and supervisor profiles remain fragmented across paper forms, email, and messaging applications. In that setting, originality checking depends on personal memory and supervisor allocation is often performed without reproducible evidence or capacity accounting.",
        "This study examines two connected tasks: multi-field proposal similarity and expertise-aware, capacity-feasible supervisor assignment. It asks which model provides the strongest balanced similarity evidence, how field weighting affects results, what can be concluded from the available supervisor labels, whether the assignment layer is operationally feasible, and which limitations constrain scientific claims. The output is advisory: similarity scores are review signals rather than plagiarism verdicts, and supervisor rankings do not replace authorized academic judgment.",
        "The contribution is an implementation-verified and evidence-bounded evaluation. Every material number is traced to the sanitized live export; all reported classification metrics are recomputed from confusion counts; unsupported ranking measures are explicitly marked not measured; and label provenance determines the strength of conclusions.",

        r"\section{Related Work}",
        r"The framework connects literature on doctoral and project supervision, responsible educational AI, lexical and dense retrieval, sentence embeddings, semantic textual similarity, explainable matching, classification under imbalance, annotation reliability, reproducible machine learning, constrained assignment, and privacy-aware governance. Supervisory quality depends on expertise, feedback, expectations, access, and workload, while algorithmic decision support requires transparency, contestability, and clearly limited authority \cite{ref41,ref1,ref21,ref11,ref71,ref156}.",
        r"TF-IDF cosine remains an efficient and inspectable lexical baseline. Sentence-BERT-style bi-encoders provide efficient semantic comparison, while BGE-M3 offers a multilingual high-dimensional representation. Score magnitude across these representation spaces is not a calibrated probability and must not be interpreted as accuracy without labelled evaluation \cite{ref31,ref33,ref54,ref61,ref71,ref81}.",
        r"Model comparisons require task-appropriate metrics, uncertainty, valid pairing, and explicit treatment of class imbalance. Annotation provenance, disagreement, and consensus procedures are substantive data properties. Reproducibility further requires documented datasets, model configuration, leakage boundaries, and versioned outputs \cite{ref161,ref166,ref171,ref181,ref186}.",

        r"\section{System and AI Framework}",
        r"\subsection{Layered Architecture and Human Control Boundary}",
        "The deployed platform separates a React 19/TypeScript/Vite 6 presentation tier, an Express 5 application tier, MongoDB/Mongoose 9 persistence, and a Flask/Flask-CORS AI service. React Router, Axios, and Recharts support role workflows and evaluation interfaces. Express applies express-validator, CORS, JSON Web Tokens, bcryptjs password verification, and role-based authorization before coordinating model requests or persisting evidence. The data layer retains projects, supervisor profiles, scores, labels, assignments, reports, and audit logs. The presentation tier does not communicate with the AI service directly, and authorized academic staff retain final review and assignment authority.",
        r"\begin{figure}[!t]\centering\includegraphics[width=\columnwidth]{figure-a01-overall-architecture.png}\caption{Implementation-grounded system and AI framework showing the exact TF-IDF cosine, Sentence-BERT MiniLM, and BGE-M3 model configurations; authorized academic staff retain final decision authority.}\label{fig:architecture}\end{figure}",
        r"\subsection{Implemented AI Service and Model Stack}",
        "The AI layer is a Flask/Flask-CORS JSON service that performs project comparison, proposal-to-archive screening, all-pairs experiments, exhaustive supervisor matching, model-status inspection, threshold evaluation, and ranking evaluation. A thread-safe lazy registry loads neural checkpoints, while SHA-256 keyed caches reuse normalized embeddings.",
        "Three exact model configurations are evaluated. TF-IDF uses scikit-learn TfidfVectorizer and blends word 1--2 gram cosine similarity with character-within-word 3--5 gram cosine similarity using weights 0.70 and 0.30. Sentence-BERT uses sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2 and produces 384-dimensional normalized embeddings. BGE-M3 uses the dense representation from the BAAI/bge-m3 checkpoint and produces 1,024-dimensional normalized embeddings. Dense vectors are L2-normalized and compared by dot product, which equals cosine similarity, with batch size 32. Neither dense checkpoint is fine-tuned on the frozen institutional corpus.",
        "NumPy supports the vector operations used to calculate field-weighted scores, supervisor-fit and capacity adjustments, classification and ranking measures, and threshold analyses. Scikit-learn, SciPy, Pandas, and Matplotlib provide reproducible tables, statistics, and figures where required. RapidFuzz and NLTK provide typo-tolerant text normalization, while FAISS supports project-document vector retrieval. These supporting tools work alongside the TF-IDF, Sentence-BERT, and BGE-M3 components in the implemented workflow.",
        r"\subsection{Six-Field Representation and Similarity Workflow}",
        "Each project contains title, description, problem statement, research objectives, features, and technologies/tools. TF-IDF follows a separate lexical vectorization path after field preparation, whereas model-specific encoding branches independently to Sentence-BERT and BGE-M3. The three paths produce a cosine score for every available field before weighted aggregation. Configured weights are 0.20, 0.20, 0.20, 0.15, 0.15, and 0.10 respectively. Missing fields trigger weight renormalization; no field is missing in the frozen corpus.",
        r"\begin{figure}[!t]\centering\includegraphics[width=\columnwidth]{figure-a04-similarity-workflow.png}\caption{Six-field scoring workflow. TF-IDF follows the lexical branch, while model-specific encoding leads independently to Sentence-BERT and BGE-M3 before field-weighted aggregation.}\label{fig:workflow}\end{figure}",
        r"\subsection{Supervisor Recommendation and Assignment}",
        "The configured TF-IDF, Sentence-BERT, and BGE-M3 models compare each project with structured supervisor-profile evidence. Expertise and research interests form the principal semantic text, augmented by technologies, skills, previous projects, publication keywords, availability, eligibility, workload, and capacity. The pure score assigns 0.80 to semantic expertise, 0.05 each to technology, skills, and workload/availability, and 0.025 each to previous-project and publication-keyword alignment. Eligibility filtering and a progressive utilization penalty precede human-approved feasible assignment.",

        r"\section{Symbolic Formulation and Algorithms}",
        r"For $n=78$ projects and $n_s=20$ supervisors, the complete inference cardinalities are",
        r"\begin{equation}N_{\mathrm{pair}}=\frac{n(n-1)}{2}=3{,}003.\end{equation}",
        r"\begin{equation}N_{\mathrm{cand}}=n n_s=1{,}560.\end{equation}",
        r"TF-IDF term weights and cosine similarity are",
        r"\begin{equation}w(t,d)=\mathrm{tf}(t,d)\left[\log\left(\frac{N+1}{\mathrm{df}(t)+1}\right)+1\right].\end{equation}",
        r"\begin{equation}\cos(x,y)=\frac{x^{\mathsf T}y}{\lVert x\rVert_2\lVert y\rVert_2}.\end{equation}",
        r"The available-field aggregate and operational risk mapping are",
        r"\begin{equation}S(p_i,p_j)=\frac{\sum_{f\in F}w_f I_f\cos(e_{i,f},e_{j,f})}{\sum_{f\in F}w_f I_f}.\end{equation}",
        r"\begin{equation}R(S)=\begin{cases}\mathrm{Low},&0\le S<40\\\mathrm{Medium},&40\le S<70\\\mathrm{High},&70\le S\le100.\end{cases}\end{equation}",
        r"Supervisor relevance combines semantic, technology, skills, prior-project, publication-keyword, and workload/availability evidence:",
        r"\begin{equation}Q_{ij}=0.80q_{\mathrm{sem}}+0.05q_{\mathrm{tech}}+0.05q_{\mathrm{skills}}+0.025q_{\mathrm{prev}}+0.025q_{\mathrm{pub}}+0.05q_{\mathrm{avail}}.\end{equation}",
        r"\begin{equation}A_{ij}=E_{ij}\left[Q_{ij}-\lambda\frac{L_j}{C_j}\right].\end{equation}",
        r"\begin{equation}s^*=\arg\max_{j\in S:\,L_j<C_j}A_{ij}.\end{equation}",
        r"Core classification measures are recomputed from $TP$, $TN$, $FP$, and $FN$:",
        r"\begin{equation}\mathrm{Accuracy}=\frac{TP+TN}{TP+TN+FP+FN}.\end{equation}",
        r"\begin{equation}\mathrm{Precision}=\frac{TP}{TP+FP}.\end{equation}",
        r"\begin{equation}\mathrm{Recall}=\frac{TP}{TP+FN}.\end{equation}",
        r"\begin{equation}F_1=2\frac{\mathrm{Precision}\cdot\mathrm{Recall}}{\mathrm{Precision}+\mathrm{Recall}}.\end{equation}",
        r"\begin{equation}\mathrm{Specificity}=\frac{TN}{TN+FP}.\end{equation}",
        r"\begin{equation}\mathrm{BalancedAccuracy}=\frac{\mathrm{Recall}+\mathrm{Specificity}}{2}.\end{equation}",
        r"\begin{equation}\mathrm{MCC}=\frac{TP\,TN-FP\,FN}{\sqrt{(TP+FP)(TP+FN)(TN+FP)(TN+FN)}}.\end{equation}",
        r"For assigned loads $x_i$ with mean $\bar{x}$, workload inequality is",
        r"\begin{equation}G=\frac{\sum_i\sum_j|x_i-x_j|}{2n_s^2\bar{x}}.\end{equation}",
        r"\subsection{Implementation-Faithful Procedures}",
        r"\textbf{Algorithm 1 (similarity):} normalize every available field; generate TF-IDF vectors or normalized pretrained embeddings; compute field-wise cosine values; renormalize available weights; apply 40\% and 70\% risk boundaries; and persist component evidence.",
        r"\textbf{Algorithm 2 (supervisor scoring):} compute the six evidence components in (7); apply eligibility; store pure and workload-adjusted scores; and retain component-level explanations with the ranking.",
        r"\textbf{Algorithm 3 (capacity assignment):} initialize load; compute mean model score and progressive utilization penalty; discard ineligible/full supervisors; select the highest feasible adjusted candidate; increment load; and persist the audit explanation.",

        r"\section{Experimental Design}",
        r"\subsection{Frozen Dataset and Leakage Boundary}",
        "The evidence freeze is 5 August 2026. Dataset version project-dataset-v2-corrected-descriptions contains 78 test/synthetic projects with zero missing six-field values and no near-duplicate descriptions after correction. All-pairs inference stores 9,009 scores; supervisor inference stores 4,680 scores. The pretrained checkpoints are not fine-tuned. The TF-IDF vocabulary is fitted on the evaluated corpus, so that baseline is transductive.",
        r"\subsection{Label Provenance}",
        "Similarity evidence contains 30 model-specific cases per model, submitted by one administrator. All 90 consensus records have annotatorCount=1 and needs-more-labels status; therefore no multi-rater consensus exists and the evidence grade is C. Supervisor evidence contains 1,560 binary records per model. The research administrator checked all 4,680 labels and amended records where necessary. The stored annotationSource field describes the initial population route, not the final review status. Supervisor evidence is grade C: administrator verified, single reviewer, and internal rather than independently adjudicated or externally validated.",
        r"\subsection{Threshold, Interval, and Statistical Policy}",
        "Similarity classification is evaluated at the deployed 70\\% threshold, with 50--80\\% sensitivity curves. Percentile bootstrap intervals use 1,000 within-model resamples. The labelled queues contain different project pairs and have insufficient overlap for valid paired McNemar, Wilcoxon, Friedman, or paired-bootstrap model tests. Supervisor thresholds maximize F1 on the same administrator-verified sample and therefore describe internal rather than held-out performance.",

        r"\section{Results}",
        r"\subsection{Full-Corpus Score Behaviour and Efficiency}",
        "Mean similarity scores are 16.04\\% (TF-IDF), 41.98\\% (Sentence-BERT), and 60.77\\% (BGE-M3). These differences reflect representation geometry and calibration, not accuracy. The implemented risk bands produce TF-IDF low/medium/high counts of 2,680/319/4, Sentence-BERT 1,674/1,222/107, and BGE-M3 0/2,223/780. Average measured latency is 0.416, 31.141, and 55.518 ms/pair respectively.",
        r"\begin{figure}[!t]\centering\includegraphics[width=\columnwidth]{figure-01-similarity-score-distributions.png}\caption{Full-corpus similarity-score distributions.}\label{fig:score-dist}\end{figure}",
        r"\begin{figure}[!t]\centering\includegraphics[width=\columnwidth]{figure-04-similarity-latency.png}\caption{Measured latency per stored pair; lower is better.}\label{fig:latency}\end{figure}",
        r"\subsection{Similarity Classification}",
        r"\begin{table*}[!t]\caption{Similarity classification at 70\% (percent except MCC and ROC-AUC)}\centering\begin{tabular}{lrrrrrrrrrr}\toprule Model&Acc.&Prec.&Recall&F1&Macro-F1&Spec.&Bal. Acc.&MCC&AUC&TP/TN/FP/FN\\\midrule TF-IDF&66.67&100.00&9.09&16.67&47.92&100.00&54.55&0.244&0.565&1/19/0/10\\Sentence-BERT&93.33&85.71&100.00&92.31&93.21&88.89&94.44&0.873&0.968&12/16/2/0\\BGE-M3&90.00&90.00&100.00&94.74&47.37&0.00&50.00&0.000&0.531&27/0/3/0\\\bottomrule\end{tabular}\label{tab:similarity}\end{table*}",
        "Sentence-BERT ranks first on accuracy, macro-F1, balanced accuracy, MCC, kappa, ROC-AUC, and evidence-balanced mean rank. BGE-M3 leads ordinary F1, but its three negatives are false positives, giving zero specificity and MCC. TF-IDF makes one positive prediction; it is correct, but ten false negatives reduce recall to 9.09\\%. Ordinary F1 alone would therefore produce a misleading ordering.",
        r"\begin{figure}[!t]\centering\includegraphics[width=\columnwidth]{figure-10-similarity-classification-metrics.png}\caption{Similarity accuracy, precision, recall, and ordinary F1.}\label{fig:sim-metrics}\end{figure}",
        r"\begin{figure}[!t]\centering\includegraphics[width=\columnwidth]{figure-11-similarity-confusion-matrices.png}\caption{Confusion matrices reveal asymmetric error profiles.}\label{fig:confusion}\end{figure}",
        r"\subsection{Threshold Sensitivity and Rankings}",
        "Sentence-BERT F1 peaks at 70\\%. TF-IDF peaks near 60\\% for F1 and 65\\% for accuracy/balanced accuracy. BGE-M3 remains saturated at lower thresholds because its labelled subset is 90\\% positive. Evidence-balanced similarity ranking is Sentence-BERT, TF-IDF, BGE-M3; ordinary-F1 ranking is BGE-M3, Sentence-BERT, TF-IDF; latency ranking is TF-IDF, Sentence-BERT, BGE-M3.",
        r"\begin{figure}[!t]\centering\includegraphics[width=\columnwidth]{figure-12-threshold-versus-f1.png}\caption{Threshold-versus-F1 sensitivity.}\label{fig:threshold}\end{figure}",
        r"\subsection{Supervisor Matching: Provisional Results}",
        r"\begin{table*}[!t]\caption{Administrator-verified supervisor binary metrics (percent except MCC)}\centering\begin{tabular}{lrrrrrrrr}\toprule Model&Threshold&Accuracy&Precision&Recall&F1&MCC&TP/TN/FP/FN&Grade\\\midrule TF-IDF&4.14&94.10&76.58&87.66&81.75&0.785&206/1262/63/29&C\\Sentence-BERT&27.90&92.69&83.33&64.10&72.46&0.691&150/1296/30/84&C\\BGE-M3&46.75&92.18&73.14&75.64&74.37&0.698&177/1261/65/57&C\\\bottomrule\end{tabular}\label{tab:supervisor}\end{table*}",
        "TF-IDF has the highest provisional F1 and MCC, Sentence-BERT has the highest precision, and BGE-M3 occupies the middle F1 position. These results cannot establish a definitive winner because labels and optimized thresholds are derived from model suggestions. Top-1/3/5, Precision@K, Recall@K, Hit Rate@K, MRR, MAP, and nDCG are not measured because no independent per-project ranked relevance set exists.",
        r"\begin{figure}[!t]\centering\includegraphics[width=\columnwidth]{figure-15-supervisor-classification-metrics.png}\caption{Administrator-verified internal supervisor accuracy, precision, recall, and F1.}\label{fig:sup-metrics}\end{figure}",
        r"\subsection{Workload, Fairness, Errors, and Ablation}",
        "The final capacity-aware run assigns all 78 projects across all 20 supervisors. Loads range from 1 to 6, mean load is 3.90, standard deviation is 1.61, mean utilization is 77.92\\%, Gini is 0.226, and no capacity is exceeded. This demonstrates feasibility and workload distribution, not demographic fairness; protected attributes are neither exported nor evaluated.",
        "TF-IDF has ten similarity false negatives, Sentence-BERT two false positives, and BGE-M3 three false positives with no true negatives. Output-sensitivity ablation removes one stored component and renormalizes the remaining score. Title removal produces the largest mean project-score shift; the 0.80 semantic supervisor component has the largest score influence. These are deterministic sensitivity results, not predictive-performance improvements.",
        r"\begin{figure}[!t]\centering\includegraphics[width=\columnwidth]{figure-08-workload-and-capacity.png}\caption{Assigned load, capacity, and utilization.}\label{fig:workload}\end{figure}",

        r"\section{Discussion}",
        "Sentence-BERT is the preferred balanced similarity-screening model under the available grade-C evidence. Its ordinary F1 is slightly below BGE-M3, but MCC, balanced accuracy, specificity, macro-F1, and ROC-AUC demonstrate discrimination across both classes. TF-IDF remains the fastest and most inspectable baseline. BGE-M3 remains a strong multilingual/high-recall research candidate, but requires deliberately sampled negatives and threshold calibration.",
        "For supervisor allocation, TF-IDF leads the administrator-verified internal comparison on accuracy, F1, and MCC; BGE-M3 ranks second by F1, and Sentence-BERT has the highest precision. Because one administrator reviewed the labels and the thresholds were selected on the same sample, broader generalization still requires independent held-out or external validation. The operationally defensible strategy remains a comparative candidate view combined with eligibility, capacity, recorded explanations, authorized approval, override reasons, and prospective audit.",
        "Human oversight is substantive rather than decorative. Similarity categories prioritize review and cannot prove plagiarism. A high supervisor score cannot resolve conflicts of interest, availability changes, student preference, department rules, or hidden profile incompleteness. Institutions should define access control, lawful basis, consent, retention, appeal, threshold disclosure, contestability, and accountability before real deployment.",

        r"\section{Limitations and Future Directions}",
        "Internal validity is limited by model-specific labelled queues, single-reviewer judgments, and supervisor thresholds selected on the evaluation sample. Construct validity is limited because binary similarity does not capture types or degrees of overlap and binary supervisor relevance does not represent ranked suitability. External validity is limited to 78 test/synthetic projects and 20 test profiles from one institutional setting. Conclusion validity is limited by n=30 similarity samples, BGE-M3 class imbalance, and the absence of valid paired inter-model tests. Peak memory and energy are not measured.",
        "Future work should collect a blinded common-case multi-rater set with adjudication and inter-annotator agreement; evaluate a held-out institution; stratify Somali/English performance; create independent relevant-supervisor sets for Top-K, MRR, MAP, and nDCG; prespecify threshold selection; profile memory and energy; conduct lawful protected-group fairness review; and compare the greedy allocation with stable or multi-objective optimization.",

        r"\section{Conclusion}",
        "The deployed framework has 78 projects, 20 supervisors, 9,009 project-pair scores, 4,680 supervisor scores, 90 model-specific similarity labels, and 78 capacity-feasible assignments. Sentence-BERT supplies the strongest balanced similarity evidence (93.33\\% accuracy, 92.31\\% F1, MCC 0.873), TF-IDF is fastest and most interpretable, and BGE-M3's high ordinary F1 is qualified by zero negative-class discrimination. In the administrator-verified supervisor comparison, TF-IDF leads on accuracy, F1, and MCC; this remains a grade-C internal result because the labels have one reviewer and the thresholds were selected on the same sample. The main contribution is an evidence-traceable decision-support design that exposes scores, thresholds, provenance, workload effects, uncertainty, limitations, and human authority.",

        r"\appendices",
        r"\section{Complete Live Visualization-Page Evidence}",
        "Every scientific chart or analysis panel below was captured individually from the live research-administrator Visualization page after verification of the 78-project evidence freeze. Ordinary interface screenshots are excluded. The dashboard word consensus is corrected by the manuscript evidence grade: all 90 underlying similarity records have one annotator and needs-more-labels status.",
    ]
    for index, path in enumerate(sorted(SYSTEM_CAPTURES.glob("panel-*.png")), 1):
        title = path.stem.split("-", 2)[-1].replace("-", " ").title()
        lines.append(rf"\begin{{figure*}}[!t]\centering\includegraphics[width=0.92\textwidth]{{../../05-figures/system-visualizations/{esc(path.name)}}}\caption{{Live Visualization-page panel A{index}: {esc(title)}.}}\label{{fig:live-{index}}}\end{{figure*}}")
    lines += [
        r"\section{Declarations}",
        "Funding: no verified funding information was supplied; no funding claim is made. Conflicts of interest, author contributions, corresponding-author details, and institutional ethics requirements must be completed and confirmed by the authors before submission. Sanitized evidence, evaluation outputs, figures, scripts, and checksums are included in the package; private operational data and credentials are excluded.",
        r"\begin{thebibliography}{210}",
    ]
    lines = [remap_latex_cite_keys(line) for line in lines]
    for i, ref in enumerate(refs, 1):
        lines.append(rf"\bibitem{{ref{i}}} {esc(ref['authors'])}, ``{esc(ref['title'])},'' {esc(ref['source'])}, {esc(ref['year'])}, doi: {esc(ref['doi'])}.")
    lines += [r"\end{thebibliography}", r"\end{document}"]
    (out / "final-ieee-journal-manuscript-verified.tex").write_text("\n".join(lines) + "\n", encoding="utf-8")


def copy_package_files() -> None:
    dirs = [
        PACKAGE / "04-data" / "sanitized-live-evidence",
        PACKAGE / "05-figures" / "publication-charts",
        PACKAGE / "05-figures" / "system-visualizations",
        PACKAGE / "05-figures" / "architecture",
        PACKAGE / "07-reproducibility" / "analysis-outputs",
        PACKAGE / "07-reproducibility" / "scripts",
        PACKAGE / "08-quality-assurance",
        PACKAGE / "02-submission-materials",
    ]
    for d in dirs:
        d.mkdir(parents=True, exist_ok=True)
    shutil.copytree(LIVE, dirs[0], dirs_exist_ok=True)
    shutil.copytree(PUBLICATION_FIGURES, dirs[1], dirs_exist_ok=True)
    shutil.copytree(SYSTEM_CAPTURES, dirs[2], dirs_exist_ok=True)
    shutil.copytree(CAPTURE_CONTACTS, dirs[2] / "contact-sheets", dirs_exist_ok=True)
    for stem in ("figure-a01-overall-architecture", "figure-a04-similarity-workflow", "figure-a09-field-aggregation", "figure-a10-supervisor-workflow", "figure-a11-workload-balancing", "figure-a12-database-architecture", "figure-a15-evaluation-pipeline"):
        for ext in (".png", ".svg"):
            source_dir = UPDATED_ARCHITECTURE if stem in {"figure-a01-overall-architecture", "figure-a04-similarity-workflow"} else OLD_ARCHITECTURE
            src = source_dir / f"{stem}{ext}"
            if src.exists():
                shutil.copy2(src, dirs[3] / src.name)
    shutil.copytree(ANALYSIS, dirs[4], dirs_exist_ok=True)
    for name in (
        "build_verified_model_evaluation.py",
        "build_publication_evidence_workbook.mjs",
        "audit_live_evidence.js",
        "audit_supervisor_label_verification.js",
        "export_live_research_evidence.js",
        "build_strict_reference_library_210.py",
        "build_final_verified_package.py",
        "verify_final_journal_package.py",
        "generate_package_checksums.py",
        "build_ai_framework_figure.py",
        "build_similarity_workflow_figure.py",
    ):
        src = ROOT / "scripts" / name
        if src.exists():
            shutil.copy2(src, dirs[5] / src.name)
    shutil.copy2(ROOT / "python-ai" / "src" / "research_config.py", dirs[5] / "research_config.py")
    shutil.copy2(ROOT / "python-ai" / "src" / "batch_research_service.py", dirs[5] / "batch_research_service.py")
    (PACKAGE / "02-submission-materials" / "highlights.md").write_text(
        "# Highlights\n\n- 78 projects; 9,009 pair scores; 4,680 supervisor scores; three verified models.\n- Sentence-BERT leads balanced similarity validity: 93.33% accuracy and MCC 0.873.\n- BGE-M3's 94.74% ordinary F1 is qualified by zero specificity on a 90%-positive subset.\n- TF-IDF is fastest at 0.416 ms/pair and leads administrator-verified supervisor F1 at 81.75%.\n- Capacity-aware assignment covers 78/78 projects with zero overload and Gini 0.226.\n",
        encoding="utf-8",
    )
    (PACKAGE / "02-submission-materials" / "submission-readiness-checklist.md").write_text(
        "# Submission-readiness checklist\n\n- [x] Verified numbers and model names\n- [x] Complete model-performance metrics and confusion counts\n- [x] 210 verified DOI references\n- [x] Symbolic equations and algorithms\n- [x] All scientific visualization panels included before references\n- [x] Sanitized reproducibility package\n- [ ] Authors, affiliations, corresponding author, contributions, conflicts, funding, and ethics statement confirmed by authors\n- [ ] Independent multi-rater common test set collected\n- [ ] Target journal selected and house-style conversion completed\n",
        encoding="utf-8",
    )


def write_readme() -> None:
    text = """# Final verified journal package — 10 August 2026

## Primary outputs

- `01-manuscript/final-ieee-journal-manuscript-verified.docx`
- `01-manuscript/final-ieee-journal-manuscript-verified.pdf` (created by the QA render step)
- `01-manuscript/latex/final-ieee-journal-manuscript-verified.tex`
- `03-evaluation-and-evidence/comparative-evaluation-report-verified.docx`
- `03-evaluation-and-evidence/comparative-evaluation-report-verified.pdf`
- `03-evaluation-and-evidence/publication-evidence-workbook-verified.xlsx`

## Evidence boundary

Similarity metrics use 30 model-specific, single-administrator labels per model (grade C; no multi-rater consensus). Supervisor metrics use 4,680 administrator-verified labels (grade C; single-reviewer internal evaluation). The stored annotation-source field retains the initialization route and is not treated as the final review status. Unsupported ranking and memory measures are marked **Not measured**.

## Reproducibility

Run `scripts/build_verified_model_evaluation.py` against the sanitized exports to regenerate CSV/JSON metrics and publication charts. Source configuration snapshots, reference audit, figure/table traceability, privacy reports, and final checksums are included. No `.env`, credentials, emails, tokens, or private identifiers are packaged.

References are numbered by first appearance in the manuscript. The synchronized verification matrix and `reference-number-remapping.csv` preserve the final order and the old-to-new number mapping.

Section III now documents the implemented React/Express/MongoDB/Flask architecture and identifies the exact model, normalization, and retrieval technologies inside the AI service. Figures 1 and 2 are supplied in both high-resolution PNG and editable SVG formats.
"""
    (PACKAGE / "README.md").write_text(text, encoding="utf-8")


def main() -> None:
    PACKAGE.mkdir(parents=True, exist_ok=True)
    copy_package_files()
    build_manuscript()
    build_comparison_report()
    write_reports()
    write_reference_reports()
    write_latex()
    write_readme()
    print(json.dumps({"package": str(PACKAGE), "manuscript": "built", "comparison_report": "built", "references": 210, "visualization_panels": len(list(SYSTEM_CAPTURES.glob('panel-*.png')))}, indent=2))


if __name__ == "__main__":
    main()
