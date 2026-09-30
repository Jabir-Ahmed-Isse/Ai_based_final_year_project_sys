"""Build the final 210-source library from a verified core and strict DOI seeds.

Unlike discovery-oriented bibliography searches, this script never promotes a
query result automatically.  It starts with the previously screened 160-source
core, checks a manually curated set of methodological DOI candidates against
Crossref, rejects duplicates/retractions/incomplete records, and takes exactly
ten sources from each of five experiment-critical categories.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from datetime import date
from pathlib import Path
from urllib.parse import quote

import build_curated_reference_library as base


CANDIDATES: dict[str, tuple[str, ...]] = {
    "Statistical comparison and uncertainty in machine learning": (
        "10.1162/089976698300017197",
        "10.1023/A:1024068626366",
        "10.1023/A:1010920819831",
        "10.18653/v1/P18-1128",
        "10.1186/s12864-019-6413-7",
        "10.1214/aos/1176344552",
        "10.1007/s10994-017-5641-9",
        "10.1016/j.patcog.2019.02.023",
        "10.1016/j.bdr.2015.12.001",
        "10.1016/j.eij.2025.100711",
    ),
    "Human annotation and label reliability": (
        "10.1162/coli.07-034-R2",
        "10.1162/tacl_a_00293",
        "10.18653/v1/D19-1101",
        "10.3115/1613715.1613751",
        "10.1609/aaai.v32i1.11506",
        "10.1162/tacl_a_00449",
        "10.18653/v1/2021.emnlp-main.822",
        "10.18653/v1/P16-2096",
        "10.18653/v1/2023.emnlp-main.415",
        "10.18653/v1/2021.socialnlp-1.7",
        "10.1145/3318464.3383127",
    ),
    "Reproducible machine learning and dataset documentation": (
        "10.1145/3287560.3287596",
        "10.1145/3458723",
        "10.1162/tacl_a_00041",
        "10.1145/3531146.3533231",
        "10.1145/3442188.3445888",
        "10.1016/j.patter.2023.100804",
        "10.1007/s10664-020-09828-5",
        "10.1038/s42256-024-00857-z",
        "10.1145/3531146.3533108",
        "10.1145/3526062.3536353",
    ),
    "Matching theory and constrained assignment optimization": (
        "10.1080/00029890.1962.11989827",
        "10.1257/000282805774669637",
        "10.1007/s10878-020-00632-x",
        "10.1007/s10107-022-01917-1",
        "10.1287/inte.2017.0940",
        "10.1287/opre.2016.1544",
        "10.1155/2018/8958393",
        "10.1007/s10479-021-04001-7",
        "10.1007/s00453-016-0252-6",
        "10.1007/s00236-010-0120-9",
    ),
    "Educational data privacy and responsible AI governance": (
        "10.1111/bjet.12152",
        "10.1145/2883851.2883893",
        "10.1038/s42256-019-0088-2",
        "10.1177/2053951716679679",
        "10.1007/s11023-018-9482-5",
        "10.1007/s11423-016-9477-y",
        "10.1007/s11023-020-09517-8",
        "10.1007/s40593-021-00239-1",
        "10.1007/978-3-031-23035-6_4",
        "10.1016/j.caeai.2023.100131",
    ),
}


CATEGORY_TITLE_TERMS: dict[str, tuple[str, ...]] = {
    "Statistical comparison and uncertainty in machine learning": (
        "statistical", "classification", "classifier", "bootstrap", "generalization", "receiver operating", "matthews", "threshold", "imbalance", "area under",
    ),
    "Human annotation and label reliability": (
        "annotat", "coder agreement", "crowd", "disagreement", "social impact",
    ),
    "Reproducible machine learning and dataset documentation": (
        "reproduc", "model card", "data card", "datasheet", "data statement", "measure", "leakage", "provenance", "documentation", "randomness",
    ),
    "Matching theory and constrained assignment optimization": (
        "match", "allocat", "assignment", "quota", "admissions", "stability", "ranking", "project",
    ),
    "Educational data privacy and responsible AI governance": (
        "privacy", "ethic", "responsible", "governance", "fairness", "accountability", "artificial intelligence",
    ),
}


def fetch_crossref(doi: str) -> dict:
    url = f"{base.CROSSREF_BASE}/{quote(doi, safe='')}"
    payload = base.request_json("GET", url, params={})
    row = payload.get("message") or {}
    return base.crossref_to_paper(row)


def make_row(category: str, paper: dict) -> dict[str, object]:
    doi = base.paper_doi(paper)
    journal = paper.get("journal") or {}
    return {
        "category": category,
        "doi": doi,
        "title": base.clean_title(paper.get("title")),
        "authors": base.authors_text(paper),
        "year": paper.get("year") or "",
        "source": base.clean_title(paper.get("venue") or journal.get("name")),
        "publisher": base.clean_title(paper.get("publisher")),
        "type": "; ".join(paper.get("publicationTypes") or []),
        "volume": base.clean_title(journal.get("volume")),
        "issue": "",
        "pages": base.clean_title(journal.get("pages")),
        "landing_page": f"https://doi.org/{doi}",
        "semantic_scholar_url": paper.get("url") or "",
        "cited_by_count": int(paper.get("citationCount") or 0),
        "verified_on": date.today().isoformat(),
        "verification_source": "Curated DOI; Crossref metadata, title/source, and retraction/update relation rechecked",
        "relevance_basis": "Manually curated methodological source supporting the revised experiment",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-csv", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()

    with args.base_csv.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    if len(rows) != 160 or len({base.normalize_doi(r["doi"]) for r in rows}) != 160:
        raise RuntimeError("The strict builder requires the screened 160-source core")

    seen = {base.normalize_doi(r["doi"]) for r in rows}
    audit: list[dict[str, object]] = []
    for category, candidates in CANDIDATES.items():
        accepted = 0
        for raw_doi in candidates:
            doi = base.normalize_doi(raw_doi)
            if doi in seen:
                audit.append({"category": category, "doi": doi, "status": "duplicate-core", "title": ""})
                continue
            try:
                paper = fetch_crossref(doi)
                resolved = base.paper_doi(paper)
                title = base.clean_title(paper.get("title"))
                source = base.clean_title(paper.get("venue"))
                if not resolved or not title or not source:
                    raise ValueError("incomplete Crossref metadata")
                if paper.get("isRetracted"):
                    raise ValueError("retraction/correction relation present")
                if not any(term in title.casefold() for term in CATEGORY_TITLE_TERMS[category]):
                    raise ValueError("title failed the category-specific relevance screen")
                rows.append(make_row(category, paper))
                seen.add(resolved)
                accepted += 1
                audit.append({"category": category, "doi": resolved, "status": "accepted", "title": title})
            except Exception as exc:  # audit every rejection without silently substituting
                audit.append({"category": category, "doi": doi, "status": f"rejected: {exc}", "title": ""})
            if accepted == 10:
                break
        if accepted != 10:
            raise RuntimeError(f"{category}: only {accepted} valid unique DOI records")

    # Preserve the verified core's established citation order (1--160) so the
    # manuscript's existing numeric citations remain stable.  New methods and
    # governance sources follow as references 161--210 in category order.
    if len(rows) != 210 or len(seen) != 210:
        raise RuntimeError(f"Expected 210 unique references, found {len(rows)} rows/{len(seen)} DOIs")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    fieldnames = list(rows[0])
    with (args.output_dir / "reference-verification-matrix.csv").open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    (args.output_dir / "reference-verification-matrix.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    (args.output_dir / "strict-candidate-audit.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = ["# Verified scholarly reference library", "", f"Generated on {date.today().isoformat()}; 210 unique DOI records.", ""]
    for i, row in enumerate(rows, 1):
        volume = f", vol. {row['volume']}" if row["volume"] else ""
        pages = f", pp. {row['pages']}" if row["pages"] else ""
        lines.append(f"[{i}] {row['authors']}, \"{row['title']},\" *{row['source']}*{volume}{pages}, {row['year']}, doi: [{row['doi']}](https://doi.org/{row['doi']}).")
    (args.output_dir / "verified-reference-library.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    summary = {
        "count": len(rows),
        "unique_dois": len(seen),
        "category_counts": dict(Counter(row["category"] for row in rows)),
        "years_2020_2026": sum(1 for row in rows if 2020 <= int(row["year"] or 0) <= 2026),
        "strict_manual_additions": 50,
        "candidate_rejections": sum(1 for item in audit if item["status"] != "accepted"),
    }
    (args.output_dir / "reference-library-audit.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
