"""Create a clearly labelled, leakage-controlled provisional similarity benchmark."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
import re
from collections import Counter
from pathlib import Path
from typing import Any

SEED = 42
FIELDS = ["title", "description", "problemStatement", "objectives", "features", "technologiesAndTools"]
SPLIT_COUNTS = {"development": 120, "validation": 40, "test": 40}


def combined(project: dict[str, Any]) -> str:
    return " ".join(str(project.get(field) or "").strip() for field in FIELDS if project.get(field)).strip()


def tokens(text: str) -> set[str]:
    return set(re.findall(r"\b[\w+#.-]{3,}\b", text.casefold()))


def overlap(first: str, second: str) -> float:
    left, right = tokens(first), tokens(second)
    return len(left & right) / max(1, len(left | right))


def paraphrase(project: dict[str, Any], variant: int) -> str:
    values = [str(project.get(field) or "").strip() for field in FIELDS if project.get(field)]
    rotations = variant % max(1, len(values))
    values = values[rotations:] + values[:rotations]
    text = ". ".join(values)
    replacements = {
        "system": "platform",
        "manage": "coordinate",
        "management": "coordination",
        "improve": "enhance",
        "users": "participants",
        "application": "software solution",
        "monitoring": "tracking",
    }
    for source, target in replacements.items():
        text = re.sub(rf"\b{source}\b", target, text, flags=re.IGNORECASE)
    return text


def hybrid(first: dict[str, Any], second: dict[str, Any]) -> str:
    return " ".join([
        str(first.get("title") or ""),
        str(first.get("description") or ""),
        str(first.get("features") or ""),
        str(second.get("problemStatement") or ""),
        str(second.get("objectives") or ""),
        str(second.get("technologiesAndTools") or ""),
    ]).strip()


def grouped_splits(projects: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    shuffled = projects[:]
    random.Random(SEED).shuffle(shuffled)
    development_end = round(len(shuffled) * 0.6)
    validation_end = development_end + round(len(shuffled) * 0.2)
    return {
        "development": shuffled[:development_end],
        "validation": shuffled[development_end:validation_end],
        "test": shuffled[validation_end:],
    }


def build_records(projects: list[dict[str, Any]]) -> list[dict[str, Any]]:
    splits = grouped_splits(projects)
    records: list[dict[str, Any]] = []
    counters = Counter()
    for split_name, split_projects in splits.items():
        target_per_class = SPLIT_COUNTS[split_name]
        texts = {str(project["_id"]): combined(project) for project in split_projects}
        unrelated = {}
        for project in split_projects:
            project_id = str(project["_id"])
            alternatives = [candidate for candidate in split_projects if candidate["_id"] != project["_id"]]
            unrelated[project_id] = min(alternatives, key=lambda candidate: overlap(texts[project_id], texts[str(candidate["_id"])]))

        for index in range(target_per_class):
            first = split_projects[index % len(split_projects)]
            first_id = str(first["_id"])
            second = split_projects[(index * 7 + 3) % len(split_projects)]
            if second["_id"] == first["_id"]:
                second = split_projects[(index * 7 + 4) % len(split_projects)]
            negative = unrelated[first_id]
            definitions = [
                (2, "Highly similar", texts[first_id], paraphrase(first, index), [first_id], [first_id], 90),
                (1, "Partially related", texts[first_id], hybrid(first, second), [first_id], [first_id, str(second["_id"])], 50),
                (0, "Different", texts[first_id], texts[str(negative["_id"])], [first_id], [str(negative["_id"])], 10),
            ]
            for label, label_name, left_text, right_text, left_sources, right_sources, synthetic_score in definitions:
                digest = hashlib.sha256(f"{split_name}|{label}|{index}|{first_id}".encode()).hexdigest()[:16]
                records.append({
                    "benchmarkPairId": f"SYN-{digest}",
                    "benchmarkType": "synthetic_provisional_not_human_validated",
                    "split": split_name,
                    "relationLabel": label,
                    "relationLabelName": label_name,
                    "syntheticTargetScore": synthetic_score,
                    "leftText": left_text,
                    "rightText": right_text,
                    "leftSourceProjectIds": left_sources,
                    "rightSourceProjectIds": right_sources,
                    "construction": "rule-based paraphrase" if label == 2 else "controlled field hybrid" if label == 1 else "lowest lexical-overlap project in same split",
                    "randomSeed": SEED,
                })
                counters[(split_name, label)] += 1
    return records


def validate(records: list[dict[str, Any]]) -> dict[str, Any]:
    project_splits: dict[str, set[str]] = {}
    for record in records:
        for project_id in record["leftSourceProjectIds"] + record["rightSourceProjectIds"]:
            project_splits.setdefault(project_id, set()).add(record["split"])
    leakage = {project_id: sorted(values) for project_id, values in project_splits.items() if len(values) > 1}
    counts = Counter(record["relationLabel"] for record in records)
    if counts != Counter({0: 200, 1: 200, 2: 200}):
        raise ValueError(f"Expected 200 records per class, found {dict(counts)}")
    if leakage:
        raise ValueError(f"Project-level split leakage detected: {leakage}")
    return {
        "recordCount": len(records),
        "classCounts": {str(key): value for key, value in sorted(counts.items())},
        "splitCounts": dict(Counter(record["split"] for record in records)),
        "projectLevelLeakage": False,
        "randomSeed": SEED,
        "warning": "Synthetic provisional labels are construction targets, not academic expert judgements.",
    }


def write(records: list[dict[str, Any]], output_json: Path, output_csv: Path, manifest_path: Path) -> None:
    for target in (output_json, output_csv, manifest_path):
        target.parent.mkdir(parents=True, exist_ok=True)
    manifest = validate(records)
    output_json.write_text(json.dumps({"manifest": manifest, "records": records}, ensure_ascii=False, indent=2), encoding="utf-8")
    headers = list(records[0])
    with output_csv.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        for record in records:
            writer.writerow({**record, "leftSourceProjectIds": "|".join(record["leftSourceProjectIds"]), "rightSourceProjectIds": "|".join(record["rightSourceProjectIds"])})
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--projects-json", type=Path, required=True)
    parser.add_argument("--output-json", type=Path, required=True)
    parser.add_argument("--output-csv", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    args = parser.parse_args()
    source = json.loads(args.projects_json.read_text(encoding="utf-8"))
    projects = source["projects"]
    for project in projects:
        project["_id"] = project.get("_id") or project.get("contentHash")
    records = build_records(projects)
    write(records, args.output_json, args.output_csv, args.manifest)
    print(json.dumps(validate(records)))


if __name__ == "__main__":
    main()
