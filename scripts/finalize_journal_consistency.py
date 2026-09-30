from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from docx import Document


ABSTRACT_OLD = "This study evaluates TF-IDF,"
ABSTRACT_NEW = (
    "This study evaluates term frequency-inverse document frequency (TF-IDF),"
)


def citation_sequence(doc: Document) -> list[str]:
    pattern = re.compile(r"\[(?:\d+(?:\s*[-,]\s*\d+)*)\]")
    text = "\n".join(p.text for p in doc.paragraphs)
    text += "\n" + "\n".join(
        cell.text for table in doc.tables for row in table.rows for cell in row.cells
    )
    return pattern.findall(text)


def reference_entries(doc: Document) -> list[str]:
    return [p.text for p in doc.paragraphs if re.match(r"^\[\d+\]", p.text.strip())]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("report", type=Path)
    args = parser.parse_args()

    source_doc = Document(args.source)
    source_refs = reference_entries(source_doc)
    source_citations = citation_sequence(source_doc)

    doc = Document(args.source)
    abstract_changes = 0
    for paragraph in doc.paragraphs:
        if ABSTRACT_OLD in paragraph.text:
            for run in paragraph.runs:
                if ABSTRACT_OLD in run.text:
                    run.text = run.text.replace(ABSTRACT_OLD, ABSTRACT_NEW, 1)
                    abstract_changes += 1
                    break
            else:
                raise RuntimeError("The abstract phrase spans multiple runs unexpectedly")
            break

    reference_rows_changed = 0
    for table in doc.tables:
        for row in table.rows:
            if row.cells and row.cells[0].text.strip() == "References":
                if len(row.cells) < 4:
                    raise RuntimeError("Reference audit row has an unexpected structure")
                row.cells[1].paragraphs[0].runs[0].text = "114"
                row.cells[2].paragraphs[0].runs[0].text = "114"
                row.cells[3].paragraphs[0].runs[0].text = (
                    "Confirmed; all 114 finalized entries preserved"
                )
                reference_rows_changed += 1

    if abstract_changes != 1:
        raise RuntimeError(f"Expected one abstract expansion, found {abstract_changes}")
    if reference_rows_changed != 1:
        raise RuntimeError(
            f"Expected one reference audit row, found {reference_rows_changed}"
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    doc.save(args.output)

    final_doc = Document(args.output)
    report = {
        "abstractExpansions": abstract_changes,
        "referenceAuditRowsChanged": reference_rows_changed,
        "referencesUnchanged": reference_entries(final_doc) == source_refs,
        "citationSequencePreserved": citation_sequence(final_doc) == source_citations,
        "sourceReferences": len(source_refs),
        "finalReferences": len(reference_entries(final_doc)),
        "paragraphsPreserved": len(final_doc.paragraphs) == len(source_doc.paragraphs),
        "tablesPreserved": len(final_doc.tables) == len(source_doc.tables),
        "inlineShapesPreserved": len(final_doc.inline_shapes)
        == len(source_doc.inline_shapes),
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    if not all(
        [
            report["referencesUnchanged"],
            report["citationSequencePreserved"],
            report["paragraphsPreserved"],
            report["tablesPreserved"],
            report["inlineShapesPreserved"],
        ]
    ):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
