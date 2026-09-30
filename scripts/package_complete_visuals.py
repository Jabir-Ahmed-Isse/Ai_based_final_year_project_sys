from __future__ import annotations

import csv
import hashlib
import json
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "outputs" / "journal-package-20260724"
ARCHIVE = ROOT / "outputs" / "journal-package-20260724-complete-visuals.zip"
FILE_MANIFEST = PACKAGE / "complete-visuals-file-manifest.csv"
ARCHIVE_REPORT = ROOT / "outputs" / "journal-package-20260724-complete-visuals.json"


def digest(path: Path) -> str:
    sha = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            sha.update(chunk)
    return sha.hexdigest()


def package_files() -> list[Path]:
    return sorted(
        path
        for path in PACKAGE.rglob("*")
        if path.is_file() and not path.name.startswith("~$")
    )


initial_files = package_files()
with FILE_MANIFEST.open("w", newline="", encoding="utf-8-sig") as stream:
    writer = csv.writer(stream)
    writer.writerow(["relative_path", "bytes", "sha256"])
    for path in initial_files:
        writer.writerow([path.relative_to(PACKAGE).as_posix(), path.stat().st_size, digest(path)])

files = package_files()
with zipfile.ZipFile(ARCHIVE, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for path in files:
        archive.write(path, (PACKAGE.name / path.relative_to(PACKAGE)).as_posix())

with zipfile.ZipFile(ARCHIVE) as archive:
    names = archive.namelist()
    bad = archive.testzip()

report = {
    "archive": str(ARCHIVE.resolve()),
    "archive_bytes": ARCHIVE.stat().st_size,
    "archive_sha256": digest(ARCHIVE),
    "file_entries": len(names),
    "zip_integrity": bad is None,
    "first_bad_entry": bad,
    "canonical_docx_included": (
        f"{PACKAGE.name}/final-journal-manuscript-complete-visuals.docx" in names
    ),
    "checked_pdf_included": (
        f"{PACKAGE.name}/final-journal-manuscript-complete-visuals.pdf" in names
    ),
    "complete_visuals_audit_included": (
        f"{PACKAGE.name}/complete-visuals-audit.json" in names
    ),
}
ARCHIVE_REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))

