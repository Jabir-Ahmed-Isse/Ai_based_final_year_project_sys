from __future__ import annotations

import argparse
import hashlib
import json
from io import BytesIO
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from lxml import etree
from PIL import Image


W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
PR = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"w": W, "a": A, "r": R, "wp": WP, "pr": PR}


# Supplied screenshots that directly replace the corresponding live-dashboard
# appendix panels. The seven omitted panels remain untouched.
REPLACEMENTS = {
    "A1": ("image16.png", "Screenshot 2026-08-10 212504.png"),
    "A2": ("image17.png", "Screenshot 2026-08-10 212545.png"),
    "A3": ("image18.png", "Screenshot 2026-08-10 212628.png"),
    "A4": ("image19.png", "Screenshot 2026-08-10 212707.png"),
    "A7": ("image22.png", "Screenshot 2026-08-10 212746.png"),
    "A8": ("image23.png", "Screenshot 2026-08-10 212822.png"),
    "A9": ("image24.png", "Screenshot 2026-08-10 212857.png"),
    "A11": ("image26.png", "Screenshot 2026-08-10 212928.png"),
    "A15": ("image30.png", "Screenshot 2026-08-10 213011.png"),
    "A16": ("image31.png", "Screenshot 2026-08-10 213427.png"),
    "A17": ("image32.png", "Screenshot 2026-08-10 213453.png"),
    "A18": ("image33.png", "Screenshot 2026-08-10 213525.png"),
    "A19": ("image34.png", "Screenshot 2026-08-10 213609.png"),
    "A20": ("image35.png", "Screenshot 2026-08-10 213637.png"),
    "A21": ("image36.png", "Screenshot 2026-08-10 213715.png"),
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def cell_text(cell: etree._Element) -> str:
    return "".join(cell.xpath(".//w:t/text()", namespaces=NS)).strip()


def replace_cell_text(cell: etree._Element, value: str) -> None:
    nodes = cell.xpath(".//w:t", namespaces=NS)
    if not nodes:
        paragraph = etree.SubElement(cell, f"{{{W}}}p")
        run = etree.SubElement(paragraph, f"{{{W}}}r")
        node = etree.SubElement(run, f"{{{W}}}t")
        node.text = value
        return
    nodes[0].text = value
    for node in nodes[1:]:
        node.text = ""


def update_reference_count(document: etree._Element) -> dict[str, object]:
    for row in document.xpath(".//w:tr", namespaces=NS):
        cells = row.xpath("./w:tc", namespaces=NS)
        if len(cells) >= 4 and cell_text(cells[0]) == "References":
            before = [cell_text(cell) for cell in cells[:4]]
            replace_cell_text(cells[1], "113")
            replace_cell_text(cells[2], "113")
            replace_cell_text(cells[3], "Confirmed; finalized list preserved")
            after = [cell_text(cell) for cell in cells[:4]]
            return {"before": before, "after": after}
    raise ValueError("Could not find the reference-count row in Table V")


def update_traceability_sources(document: etree._Element) -> dict[str, str]:
    updated: dict[str, str] = {}
    for row in document.xpath(".//w:tr", namespaces=NS):
        cells = row.xpath("./w:tc", namespaces=NS)
        if len(cells) < 5:
            continue
        figure = cell_text(cells[0])
        if figure in REPLACEMENTS:
            screenshot = REPLACEMENTS[figure][1]
            replace_cell_text(cells[2], screenshot)
            updated[figure] = screenshot
    missing = sorted(set(REPLACEMENTS) - set(updated))
    if missing:
        raise ValueError(f"Traceability rows not found: {missing}")
    return updated


def keep_appendix_images_with_captions(document: etree._Element) -> int:
    """Keep every Appendix A image paragraph on the same page as its caption."""
    active = False
    count = 0
    for paragraph in document.xpath("./w:body/w:p", namespaces=NS):
        text = "".join(paragraph.xpath(".//w:t/text()", namespaces=NS)).strip()
        if text.startswith("APPENDIX A."):
            active = True
            continue
        if text.startswith("APPENDIX B."):
            break
        if not active or not paragraph.xpath(".//w:drawing", namespaces=NS):
            continue
        paragraph_properties = paragraph.find(f"{{{W}}}pPr")
        if paragraph_properties is None:
            paragraph_properties = etree.Element(f"{{{W}}}pPr")
            paragraph.insert(0, paragraph_properties)
        if paragraph_properties.find(f"{{{W}}}keepNext") is None:
            paragraph_properties.append(etree.Element(f"{{{W}}}keepNext"))
        count += 1
    if count != 22:
        raise ValueError(f"Expected 22 Appendix A image paragraphs, found {count}")
    return count


def relationship_map(rels: etree._Element) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for rel in rels.xpath("./pr:Relationship", namespaces=NS):
        target = rel.get("Target", "")
        if target.startswith("media/"):
            mapping[Path(target).name] = rel.get("Id")
    return mapping


def resize_drawing(document: etree._Element, relationship_id: str, width: int, height: int) -> dict[str, int]:
    blips = document.xpath(f'.//a:blip[@r:embed="{relationship_id}"]', namespaces=NS)
    if len(blips) != 1:
        raise ValueError(f"Expected one drawing for {relationship_id}, found {len(blips)}")
    drawing = blips[0]
    while drawing is not None and drawing.tag != f"{{{W}}}drawing":
        drawing = drawing.getparent()
    if drawing is None:
        raise ValueError(f"No w:drawing ancestor for {relationship_id}")
    extents = drawing.xpath(".//wp:extent", namespaces=NS)
    if not extents:
        raise ValueError(f"No wp:extent for {relationship_id}")
    old_cx = int(extents[0].get("cx"))
    old_cy = int(extents[0].get("cy"))
    new_cy = round(old_cx * height / width)
    for extent in extents:
        extent.set("cy", str(new_cy))
    for extent in drawing.xpath(".//a:xfrm/a:ext", namespaces=NS):
        extent.set("cx", str(old_cx))
        extent.set("cy", str(new_cy))
    return {"cx": old_cx, "oldCy": old_cy, "newCy": new_cy}


def revise(source: Path, output: Path, screenshot_dir: Path, report_path: Path | None) -> dict[str, object]:
    with ZipFile(source) as archive:
        parts = {name: archive.read(name) for name in archive.namelist()}

    document = etree.fromstring(parts["word/document.xml"])
    rels = etree.fromstring(parts["word/_rels/document.xml.rels"])
    media_to_rid = relationship_map(rels)

    report: dict[str, object] = {
        "source": str(source),
        "output": str(output),
        "referenceCountCorrection": update_reference_count(document),
        "traceabilitySources": update_traceability_sources(document),
        "appendixImagesKeptWithCaptions": keep_appendix_images_with_captions(document),
        "visualReplacements": {},
    }

    replacements_report: dict[str, object] = {}
    for figure, (media_name, screenshot_name) in REPLACEMENTS.items():
        part_name = f"word/media/{media_name}"
        screenshot = screenshot_dir / screenshot_name
        if part_name not in parts:
            raise FileNotFoundError(f"Embedded media part not found: {part_name}")
        if not screenshot.exists():
            raise FileNotFoundError(screenshot)
        new_data = screenshot.read_bytes()
        with Image.open(BytesIO(new_data)) as image:
            width, height = image.size
        rid = media_to_rid.get(media_name)
        if not rid:
            raise ValueError(f"Relationship not found for {media_name}")
        geometry = resize_drawing(document, rid, width, height)
        old_data = parts[part_name]
        parts[part_name] = new_data
        replacements_report[figure] = {
            "embeddedPart": media_name,
            "sourceScreenshot": screenshot_name,
            "pixelWidth": width,
            "pixelHeight": height,
            "oldSha256": sha256(old_data),
            "newSha256": sha256(new_data),
            "relationshipId": rid,
            "drawingGeometry": geometry,
        }

    report["visualReplacements"] = replacements_report
    parts["word/document.xml"] = etree.tostring(
        document, xml_declaration=True, encoding="UTF-8", standalone="yes"
    )

    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in parts.items():
            archive.writestr(name, data)

    with ZipFile(output) as archive:
        bad = archive.testzip()
    report["zipCrcFailure"] = bad
    report["outputSha256"] = sha256(output.read_bytes())
    report["outputBytes"] = output.stat().st_size
    if report_path:
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("screenshot_dir", type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    report = revise(
        args.source.resolve(),
        args.output.resolve(),
        args.screenshot_dir.resolve(),
        args.report.resolve() if args.report else None,
    )
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
