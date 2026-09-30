from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path

import pandas as pd


MODEL_LABELS = {
    "tfidf": "TF-IDF",
    "sentence_bert": "Sentence-BERT",
    "bge_m3": "BGE-M3",
}
CLASS_ORDER = ["Low Risk", "Medium Risk", "High Risk"]


def safe_record_count(path: Path) -> int:
    if not path.exists() or path.stat().st_size == 0:
        return 0
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = csv.reader(handle)
        try:
            next(rows)
        except StopIteration:
            return 0
        return sum(1 for row in rows if any(cell.strip() for cell in row))


def confusion_matrix(
    y_true: list[str], y_pred: list[str], labels: list[str]
) -> list[list[int]]:
    index = {label: i for i, label in enumerate(labels)}
    matrix = [[0 for _ in labels] for _ in labels]
    for truth, prediction in zip(y_true, y_pred):
        matrix[index[truth]][index[prediction]] += 1
    return matrix


def multiclass_mcc(matrix: list[list[int]]) -> float | None:
    size = len(matrix)
    true_totals = [sum(matrix[i]) for i in range(size)]
    pred_totals = [sum(matrix[i][j] for i in range(size)) for j in range(size)]
    correct = sum(matrix[i][i] for i in range(size))
    sample_count = sum(true_totals)
    numerator = correct * sample_count - sum(
        pred_totals[i] * true_totals[i] for i in range(size)
    )
    denominator = math.sqrt(
        (sample_count**2 - sum(value**2 for value in pred_totals))
        * (sample_count**2 - sum(value**2 for value in true_totals))
    )
    if denominator == 0:
        return None
    return numerator / denominator


def cohen_kappa(matrix: list[list[int]]) -> float | None:
    size = len(matrix)
    true_totals = [sum(matrix[i]) for i in range(size)]
    pred_totals = [sum(matrix[i][j] for i in range(size)) for j in range(size)]
    sample_count = sum(true_totals)
    if sample_count == 0:
        return None
    observed = sum(matrix[i][i] for i in range(size)) / sample_count
    expected = (
        sum(true_totals[i] * pred_totals[i] for i in range(size))
        / sample_count**2
    )
    if math.isclose(1.0 - expected, 0.0):
        return None
    return (observed - expected) / (1.0 - expected)


def wilson_interval(successes: int, total: int, z: float = 1.96) -> tuple[float, float]:
    if total == 0:
        return (math.nan, math.nan)
    proportion = successes / total
    denominator = 1 + z**2 / total
    centre = (proportion + z**2 / (2 * total)) / denominator
    margin = (
        z
        * math.sqrt(
            proportion * (1 - proportion) / total + z**2 / (4 * total**2)
        )
        / denominator
    )
    return (centre - margin, centre + margin)


def evaluate_predictions(
    y_true: list[str], y_pred: list[str], labels: list[str]
) -> dict:
    matrix = confusion_matrix(y_true, y_pred, labels)
    sample_count = len(y_true)
    correct = sum(matrix[i][i] for i in range(len(labels)))
    per_class = {}
    precisions = []
    recalls = []
    f1_scores = []
    weighted_f1_numerator = 0.0

    for i, label in enumerate(labels):
        true_positive = matrix[i][i]
        false_positive = sum(matrix[row][i] for row in range(len(labels))) - true_positive
        false_negative = sum(matrix[i]) - true_positive
        support = sum(matrix[i])
        predicted = sum(matrix[row][i] for row in range(len(labels)))
        precision = (
            true_positive / (true_positive + false_positive)
            if true_positive + false_positive
            else 0.0
        )
        recall = (
            true_positive / (true_positive + false_negative)
            if true_positive + false_negative
            else 0.0
        )
        f1 = (
            2 * precision * recall / (precision + recall)
            if precision + recall
            else 0.0
        )
        precisions.append(precision)
        recalls.append(recall)
        f1_scores.append(f1)
        weighted_f1_numerator += f1 * support
        per_class[label] = {
            "support": support,
            "predicted": predicted,
            "true_positive": true_positive,
            "precision": precision,
            "recall": recall,
            "f1": f1,
        }

    accuracy = correct / sample_count if sample_count else math.nan
    interval_low, interval_high = wilson_interval(correct, sample_count)
    return {
        "n": sample_count,
        "correct": correct,
        "accuracy": accuracy,
        "accuracy_ci95_low": interval_low,
        "accuracy_ci95_high": interval_high,
        "macro_precision": sum(precisions) / len(precisions),
        "macro_recall": sum(recalls) / len(recalls),
        "balanced_accuracy": sum(recalls) / len(recalls),
        "macro_f1": sum(f1_scores) / len(f1_scores),
        "weighted_f1": weighted_f1_numerator / sample_count if sample_count else math.nan,
        "multiclass_mcc": multiclass_mcc(matrix),
        "cohen_kappa": cohen_kappa(matrix),
        "confusion_matrix": matrix,
        "class_order": labels,
        "per_class": per_class,
    }


def percentile(series: pd.Series, q: float) -> float:
    return float(series.quantile(q, interpolation="linear"))


def rank_models(records: list[dict], field: str, reverse: bool) -> None:
    ordered = sorted(records, key=lambda record: record[field], reverse=reverse)
    for rank, record in enumerate(ordered, start=1):
        record[f"{field}_rank"] = rank


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate evidence-bounded per-model performance metrics."
    )
    parser.add_argument("--raw-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    score_path = args.raw_dir / "project-pair-scores.csv"
    score_data = pd.read_csv(score_path)
    required = {
        "firstProjectId",
        "secondProjectId",
        "model",
        "weightedOverallScore",
        "riskLevel",
        "executionTimeMs",
    }
    missing = required.difference(score_data.columns)
    if missing:
        raise ValueError(f"Missing required columns: {sorted(missing)}")

    score_data["pair_key"] = score_data.apply(
        lambda row: "||".join(
            sorted([str(row["firstProjectId"]), str(row["secondProjectId"])])
        ),
        axis=1,
    )
    model_names = sorted(score_data["model"].dropna().unique().tolist())
    if set(model_names) != set(MODEL_LABELS):
        raise ValueError(f"Unexpected models: {model_names}")

    duplicate_count = int(
        score_data.duplicated(subset=["pair_key", "model"], keep=False).sum()
    )
    if duplicate_count:
        raise ValueError(f"Duplicate pair/model rows detected: {duplicate_count}")

    risk_pivot = score_data.pivot(
        index="pair_key", columns="model", values="riskLevel"
    )
    score_pivot = score_data.pivot(
        index="pair_key", columns="model", values="weightedOverallScore"
    )

    human_annotation_count = safe_record_count(
        args.raw_dir / "human-annotations.csv"
    )
    consensus_label_count = safe_record_count(
        args.raw_dir / "annotation-consensus.csv"
    )

    model_records = []
    per_class_rows = []
    for model in model_names:
        group = score_data.loc[score_data["model"] == model].copy()
        other_models = [candidate for candidate in model_names if candidate != model]
        peer_agreement_mask = (
            risk_pivot[other_models[0]].notna()
            & risk_pivot[other_models[1]].notna()
            & (risk_pivot[other_models[0]] == risk_pivot[other_models[1]])
            & risk_pivot[model].notna()
        )
        reference = risk_pivot.loc[peer_agreement_mask, other_models[0]].tolist()
        prediction = risk_pivot.loc[peer_agreement_mask, model].tolist()
        diagnostic = evaluate_predictions(reference, prediction, CLASS_ORDER)

        risk_counts = (
            group["riskLevel"].value_counts().reindex(CLASS_ORDER, fill_value=0)
        )
        record = {
            "model_key": model,
            "model": MODEL_LABELS[model],
            "model_version": str(group["modelVersion"].iloc[0]),
            "pair_records": int(len(group)),
            "unique_pairs": int(group["pair_key"].nunique()),
            "coverage_percent": float(
                100.0 * group["pair_key"].nunique() / risk_pivot.index.size
            ),
            "score_mean": float(group["weightedOverallScore"].mean()),
            "score_median": float(group["weightedOverallScore"].median()),
            "score_std": float(group["weightedOverallScore"].std(ddof=1)),
            "score_min": float(group["weightedOverallScore"].min()),
            "score_max": float(group["weightedOverallScore"].max()),
            "risk_low": int(risk_counts["Low Risk"]),
            "risk_medium": int(risk_counts["Medium Risk"]),
            "risk_high": int(risk_counts["High Risk"]),
            "latency_per_pair_ms_mean": float(group["executionTimeMs"].mean()),
            "latency_per_pair_ms_median": float(group["executionTimeMs"].median()),
            "latency_per_pair_ms_p95": percentile(group["executionTimeMs"], 0.95),
            "stored_pair_computation_ms": float(group["executionTimeMs"].sum()),
            "peer_reference_models": [
                MODEL_LABELS[other_models[0]],
                MODEL_LABELS[other_models[1]],
            ],
            "peer_consensus_coverage_n": diagnostic["n"],
            "peer_consensus_coverage_percent": float(
                100.0 * diagnostic["n"] / risk_pivot.index.size
            ),
            "peer_consensus_accuracy": diagnostic["accuracy"],
            "peer_consensus_accuracy_ci95_low": diagnostic["accuracy_ci95_low"],
            "peer_consensus_accuracy_ci95_high": diagnostic["accuracy_ci95_high"],
            "peer_consensus_macro_precision": diagnostic["macro_precision"],
            "peer_consensus_macro_recall": diagnostic["macro_recall"],
            "peer_consensus_macro_f1": diagnostic["macro_f1"],
            "peer_consensus_weighted_f1": diagnostic["weighted_f1"],
            "peer_consensus_multiclass_mcc": diagnostic["multiclass_mcc"],
            "peer_consensus_cohen_kappa": diagnostic["cohen_kappa"],
            "gold_label_count": consensus_label_count,
            "gold_accuracy": None,
            "gold_precision": None,
            "gold_recall": None,
            "gold_f1": None,
            "gold_mcc": None,
            "gold_metric_status": (
                "Not estimable: no independent expert-consensus project-pair labels."
            ),
            "peer_confusion_matrix": diagnostic["confusion_matrix"],
            "peer_confusion_class_order": diagnostic["class_order"],
        }
        model_records.append(record)

        for label in CLASS_ORDER:
            metrics = diagnostic["per_class"][label]
            per_class_rows.append(
                {
                    "model": MODEL_LABELS[model],
                    "class": label,
                    "peer_consensus_n": diagnostic["n"],
                    "support": metrics["support"],
                    "predicted": metrics["predicted"],
                    "true_positive": metrics["true_positive"],
                    "precision": metrics["precision"],
                    "recall": metrics["recall"],
                    "f1": metrics["f1"],
                    "status": "Peer-consensus agreement diagnostic; not human-label accuracy.",
                }
            )

    rank_models(model_records, "score_mean", reverse=True)
    rank_models(model_records, "peer_consensus_macro_f1", reverse=True)
    rank_models(model_records, "latency_per_pair_ms_mean", reverse=False)

    summary = {
        "evidence_scope": {
            "project_pairs": int(risk_pivot.index.size),
            "models": [MODEL_LABELS[name] for name in model_names],
            "pair_score_records": int(len(score_data)),
            "human_annotation_records": human_annotation_count,
            "expert_consensus_label_records": consensus_label_count,
        },
        "interpretation": {
            "gold_metrics": (
                "Accuracy, precision, recall, F1 and MCC against independent expert "
                "ground truth are not estimable because the frozen dataset contains "
                "zero expert-consensus labels."
            ),
            "peer_consensus_metrics": (
                "For each target model, the other two models define a peer consensus "
                "only on project pairs where their risk bands agree. The target is "
                "compared with that leave-one-model-out consensus. These values measure "
                "cross-model agreement, not predictive validity or human-label accuracy."
            ),
        },
        "models": model_records,
    }

    json_path = args.output_dir / "model-performance-evaluation.json"
    json_path.write_text(
        json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    flat_fields = [
        field
        for field in model_records[0]
        if field
        not in {
            "peer_reference_models",
            "peer_confusion_matrix",
            "peer_confusion_class_order",
        }
    ]
    with (args.output_dir / "model-performance-summary.csv").open(
        "w", encoding="utf-8-sig", newline=""
    ) as handle:
        writer = csv.DictWriter(handle, fieldnames=flat_fields)
        writer.writeheader()
        for record in model_records:
            writer.writerow({field: record[field] for field in flat_fields})

    with (args.output_dir / "model-performance-per-class.csv").open(
        "w", encoding="utf-8-sig", newline=""
    ) as handle:
        writer = csv.DictWriter(handle, fieldnames=list(per_class_rows[0]))
        writer.writeheader()
        writer.writerows(per_class_rows)

    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
