from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from scipy.stats import rankdata, spearmanr
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    cohen_kappa_score,
    confusion_matrix,
    f1_score,
    matthews_corrcoef,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)


MODEL_ORDER = ["tfidf", "sentence_bert", "bge_m3"]
MODEL_LABELS = {
    "tfidf": "TF-IDF",
    "sentence_bert": "Sentence-BERT",
    "bge_m3": "BGE-M3",
}
MODEL_COLOURS = {
    "tfidf": "#0072B2",
    "sentence_bert": "#009E73",
    "bge_m3": "#D55E00",
}
FIELD_COLUMNS = {
    "titleScore": "Title",
    "descriptionScore": "Description",
    "problemStatementScore": "Problem statement",
    "researchObjectivesScore": "Research objectives",
    "featuresScore": "Features",
    "technologiesToolsScore": "Technologies and tools",
}
FIELD_WEIGHTS = {
    "titleScore": 0.20,
    "descriptionScore": 0.20,
    "problemStatementScore": 0.20,
    "researchObjectivesScore": 0.15,
    "featuresScore": 0.15,
    "technologiesToolsScore": 0.10,
}
SUPERVISOR_COMPONENTS = {
    "semanticExpertiseScore": 0.80,
    "technologyScore": 0.05,
    "skillsScore": 0.05,
    "previousProjectScore": 0.025,
    "publicationKeywordScore": 0.025,
    "workloadAvailabilityScore": 0.05,
}


def safe_div(numerator: float, denominator: float) -> float:
    return float(numerator / denominator) if denominator else 0.0


def serialise(value):
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        if math.isnan(float(value)):
            return None
        return float(value)
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    raise TypeError(f"Unsupported type: {type(value)!r}")


def classification_metrics(labels, scores, threshold: float) -> dict:
    y = np.asarray(labels, dtype=int)
    s = np.asarray(scores, dtype=float)
    predicted = (s >= threshold).astype(int)
    if len(y):
        tn, fp, fn, tp = confusion_matrix(y, predicted, labels=[0, 1]).ravel()
    else:
        tn = fp = fn = tp = 0
    precision = precision_score(y, predicted, zero_division=0) if len(y) else 0.0
    recall = recall_score(y, predicted, zero_division=0) if len(y) else 0.0
    specificity = safe_div(tn, tn + fp)
    accuracy = safe_div(tp + tn, len(y))
    result = {
        "sampleSize": int(len(y)),
        "threshold": float(threshold),
        "truePositive": int(tp),
        "trueNegative": int(tn),
        "falsePositive": int(fp),
        "falseNegative": int(fn),
        "positiveLabels": int(np.sum(y == 1)),
        "negativeLabels": int(np.sum(y == 0)),
        "accuracy": accuracy,
        "precision": float(precision),
        "recall": float(recall),
        "specificity": specificity,
        "negativePredictiveValue": safe_div(tn, tn + fn),
        "falsePositiveRate": safe_div(fp, fp + tn),
        "falseNegativeRate": safe_div(fn, fn + tp),
        "falseDiscoveryRate": safe_div(fp, fp + tp),
        "balancedAccuracy": (recall + specificity) / 2,
        "f1": float(f1_score(y, predicted, zero_division=0)) if len(y) else 0.0,
        "macroF1": float(f1_score(y, predicted, average="macro", zero_division=0)) if len(y) else 0.0,
        "weightedF1": float(f1_score(y, predicted, average="weighted", zero_division=0)) if len(y) else 0.0,
        "mcc": float(matthews_corrcoef(y, predicted)) if len(y) else 0.0,
        "cohensKappa": float(cohen_kappa_score(y, predicted)) if len(y) else 0.0,
    }
    if len(np.unique(y)) > 1:
        probabilities = np.clip(s / 100.0, 0, 1)
        result.update(
            {
                "rocAuc": float(roc_auc_score(y, probabilities)),
                "averagePrecision": float(average_precision_score(y, probabilities)),
                "brierLoss": float(brier_score_loss(y, probabilities)),
            }
        )
    else:
        result.update({"rocAuc": None, "averagePrecision": None, "brierLoss": None})
    return result


def lightweight_metrics(labels, scores, threshold: float) -> dict:
    y = np.asarray(labels, dtype=int)
    s = np.asarray(scores, dtype=float)
    predicted = (s >= threshold).astype(int)
    tp = int(np.sum((y == 1) & (predicted == 1)))
    tn = int(np.sum((y == 0) & (predicted == 0)))
    fp = int(np.sum((y == 0) & (predicted == 1)))
    fn = int(np.sum((y == 1) & (predicted == 0)))
    precision = safe_div(tp, tp + fp)
    recall = safe_div(tp, tp + fn)
    specificity = safe_div(tn, tn + fp)
    accuracy = safe_div(tp + tn, len(y))
    f1 = safe_div(2 * precision * recall, precision + recall)
    negative_f1_precision = safe_div(tn, tn + fn)
    negative_f1_recall = specificity
    negative_f1 = safe_div(
        2 * negative_f1_precision * negative_f1_recall,
        negative_f1_precision + negative_f1_recall,
    )
    denominator = math.sqrt((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn))
    return {
        "threshold": float(threshold),
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "macroF1": (f1 + negative_f1) / 2,
        "balancedAccuracy": (recall + specificity) / 2,
        "mcc": safe_div(tp * tn - fp * fn, denominator),
    }


def optimise_threshold(labels, scores) -> tuple[float, dict]:
    values = sorted(set(float(value) for value in scores))
    candidates = sorted(set([70.0, *values]))
    best = lightweight_metrics(labels, scores, 70.0)
    for threshold in candidates:
        measured = lightweight_metrics(labels, scores, threshold)
        if (measured["f1"], measured["accuracy"], -threshold) > (
            best["f1"],
            best["accuracy"],
            -best["threshold"],
        ):
            best = measured
    complete = classification_metrics(labels, scores, best["threshold"])
    return complete["threshold"], complete


def bootstrap_intervals(labels, scores, threshold: float, seed: int, iterations: int = 1000) -> dict:
    y = np.asarray(labels, dtype=int)
    s = np.asarray(scores, dtype=float)
    rng = np.random.default_rng(seed)
    records = {metric: [] for metric in ["accuracy", "precision", "recall", "f1", "macroF1", "balancedAccuracy", "mcc"]}
    for _ in range(iterations):
        indices = rng.integers(0, len(y), len(y))
        measured = lightweight_metrics(y[indices], s[indices], threshold)
        for metric in records:
            records[metric].append(measured[metric])
    return {
        metric: {
            "lower95": float(np.quantile(values, 0.025)),
            "upper95": float(np.quantile(values, 0.975)),
        }
        for metric, values in records.items()
    }


def gini(values) -> float:
    array = np.asarray(values, dtype=float)
    if not len(array) or np.sum(array) == 0:
        return 0.0
    array = np.sort(np.maximum(array, 0))
    index = np.arange(1, len(array) + 1)
    return float((2 * np.sum(index * array)) / (len(array) * np.sum(array)) - (len(array) + 1) / len(array))


def save_table(frame: pd.DataFrame, output_directory: Path, stem: str) -> None:
    frame.to_csv(output_directory / f"{stem}.csv", index=False)
    (output_directory / f"{stem}.json").write_text(
        json.dumps(frame.to_dict(orient="records"), indent=2, default=serialise),
        encoding="utf-8",
    )


def save_figure(fig, figure_directory: Path, number: int, stem: str) -> dict:
    fig.tight_layout()
    png = figure_directory / f"figure-{number:02d}-{stem}.png"
    pdf = figure_directory / f"figure-{number:02d}-{stem}.pdf"
    svg = figure_directory / f"figure-{number:02d}-{stem}.svg"
    fig.savefig(png, dpi=300, bbox_inches="tight", facecolor="white")
    fig.savefig(pdf, bbox_inches="tight", facecolor="white")
    fig.savefig(svg, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return {"png": png.name, "pdf": pdf.name, "svg": svg.name}


def ranked(frame: pd.DataFrame, columns: list[str], prefix: str) -> pd.DataFrame:
    ranking = frame[["model", *columns]].copy()
    rank_columns = []
    for column in columns:
        key = f"rank_{column}"
        ranking[key] = rankdata(-ranking[column].astype(float), method="average")
        rank_columns.append(key)
    ranking[f"{prefix}MeanRank"] = ranking[rank_columns].mean(axis=1)
    ranking[f"{prefix}Rank"] = rankdata(ranking[f"{prefix}MeanRank"], method="min").astype(int)
    return ranking.sort_values([f"{prefix}Rank", f"{prefix}MeanRank"])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    input_directory = args.input.resolve()
    output_directory = args.output.resolve()
    figure_directory = output_directory / "publication-figures"
    output_directory.mkdir(parents=True, exist_ok=True)
    figure_directory.mkdir(parents=True, exist_ok=True)

    sns.set_theme(style="whitegrid", context="paper", font_scale=1.05)
    plt.rcParams.update(
        {
            "font.family": "DejaVu Sans",
            "axes.titlesize": 11,
            "axes.labelsize": 9,
            "legend.fontsize": 8,
            "xtick.labelsize": 8,
            "ytick.labelsize": 8,
        }
    )

    projects = pd.read_json(input_directory / "projects-sanitized.json")
    pair_scores = pd.read_json(input_directory / "project-pair-scores-sanitized.json")
    supervisor_scores = pd.read_json(input_directory / "supervisor-matching-scores-sanitized.json")
    similarity_annotations = pd.read_json(input_directory / "similarity-annotations-sanitized.json")
    consensus = pd.read_json(input_directory / "annotation-consensus-sanitized.json")
    supervisor_labels = pd.read_json(input_directory / "supervisor-ground-truth-sanitized.json")
    assignments = pd.read_json(input_directory / "balanced-assignments-sanitized.json")
    supervisors = pd.read_json(input_directory / "supervisor-profiles-sanitized.json")

    verification_path = input_directory / "supervisor-label-verification-declaration.json"
    supervisor_verification = None
    if verification_path.exists():
        supervisor_verification = json.loads(verification_path.read_text(encoding="utf-8"))
        if supervisor_verification.get("verificationStatus") != "administrator_verified":
            raise ValueError("Supervisor-label declaration does not state administrator_verified status")
        if int(supervisor_verification.get("recordsReviewed", 0)) != len(supervisor_labels):
            raise ValueError("Supervisor-label declaration count does not match the exported labels")
    supervisor_labels_verified = supervisor_verification is not None

    project_titles = projects.set_index("projectCode")["title"].to_dict()
    pair_scores["pairKey"] = pair_scores.apply(
        lambda row: "|".join(sorted([row["firstProjectCode"], row["secondProjectCode"]])),
        axis=1,
    )
    similarity_annotations["pairKey"] = similarity_annotations.apply(
        lambda row: "|".join(sorted([row["firstProjectCode"], row["secondProjectCode"]])),
        axis=1,
    )
    scored_annotations = similarity_annotations.merge(
        pair_scores[["pairKey", "model", "weightedOverallScore", "executionTimeMs"]],
        on=["pairKey", "model"],
        how="left",
        validate="one_to_one",
    )
    if scored_annotations["weightedOverallScore"].isna().any():
        raise ValueError("At least one similarity annotation has no matching score")

    similarity_metric_records = []
    similarity_threshold_records = []
    similarity_interval_records = []
    similarity_curve_data = {}
    error_records = []
    seed_map = {"tfidf": 101, "sentence_bert": 202, "bge_m3": 303}
    for model in MODEL_ORDER:
        rows = scored_annotations[scored_annotations["model"] == model].copy()
        measured = classification_metrics(rows["binaryLabel"], rows["weightedOverallScore"], 70.0)
        similarity_metric_records.append({"model": model, "modelLabel": MODEL_LABELS[model], **measured})
        intervals = bootstrap_intervals(rows["binaryLabel"], rows["weightedOverallScore"], 70.0, seed_map[model])
        for metric, interval in intervals.items():
            similarity_interval_records.append(
                {"model": model, "modelLabel": MODEL_LABELS[model], "metric": metric, **interval}
            )
        for threshold in range(50, 81, 5):
            threshold_metrics = classification_metrics(rows["binaryLabel"], rows["weightedOverallScore"], threshold)
            similarity_threshold_records.append(
                {"model": model, "modelLabel": MODEL_LABELS[model], **threshold_metrics}
            )
        y = rows["binaryLabel"].to_numpy(dtype=int)
        probabilities = rows["weightedOverallScore"].to_numpy(dtype=float) / 100.0
        fpr, tpr, _ = roc_curve(y, probabilities)
        precision, recall, _ = precision_recall_curve(y, probabilities)
        similarity_curve_data[model] = {
            "fpr": fpr.tolist(),
            "tpr": tpr.tolist(),
            "precision": precision.tolist(),
            "recall": recall.tolist(),
        }
        rows["predicted"] = (rows["weightedOverallScore"] >= 70).astype(int)
        for _, row in rows[rows["predicted"] != rows["binaryLabel"]].iterrows():
            first, second = row["pairKey"].split("|")
            error_records.append(
                {
                    "experiment": "project_similarity",
                    "model": model,
                    "errorType": "False positive" if row["predicted"] == 1 else "False negative",
                    "firstProjectCode": first,
                    "secondProjectCode": second,
                    "firstProjectTitle": project_titles.get(first),
                    "secondProjectTitle": project_titles.get(second),
                    "score": row["weightedOverallScore"],
                    "humanBinaryLabel": row["binaryLabel"],
                }
            )

    similarity_metrics = pd.DataFrame(similarity_metric_records)
    similarity_thresholds = pd.DataFrame(similarity_threshold_records)
    similarity_intervals = pd.DataFrame(similarity_interval_records)
    similarity_errors = pd.DataFrame(error_records)

    similarity_evidence_ranking = ranked(
        similarity_metrics,
        ["accuracy", "macroF1", "balancedAccuracy", "mcc", "rocAuc"],
        "evidenceBalanced",
    )
    similarity_f1_ranking = similarity_metrics[["model", "modelLabel", "f1"]].copy()
    similarity_f1_ranking["f1Rank"] = rankdata(-similarity_f1_ranking["f1"], method="min").astype(int)
    similarity_rankings = similarity_evidence_ranking.merge(similarity_f1_ranking, on="model", suffixes=("", "_f1"))
    similarity_rankings["evidenceGrade"] = "C — single administrator; 30 labels/model; no multi-rater consensus"
    similarity_rankings["interpretation"] = similarity_rankings["model"].map(
        {
            "sentence_bert": "Strongest balanced single-rater result (highest MCC, balanced accuracy, macro-F1 and ROC-AUC).",
            "bge_m3": "Highest ordinary F1, but 27/30 labels are positive and the model has zero true negatives at 70%, so MCC is 0.",
            "tfidf": "Perfect precision on one predicted positive, but ten false negatives produce very low recall and F1.",
        }
    )

    descriptive_records = []
    risk_records = []
    field_records = []
    processing_records = []
    for model in MODEL_ORDER:
        rows = pair_scores[pair_scores["model"] == model]
        scores = rows["weightedOverallScore"].astype(float)
        sem = float(scores.std(ddof=1) / math.sqrt(len(scores)))
        descriptive_records.append(
            {
                "model": model,
                "modelLabel": MODEL_LABELS[model],
                "records": len(scores),
                "mean": scores.mean(),
                "median": scores.median(),
                "minimum": scores.min(),
                "maximum": scores.max(),
                "standardDeviation": scores.std(ddof=0),
                "variance": scores.var(ddof=0),
                "range": scores.max() - scores.min(),
                "lower95Mean": scores.mean() - 1.96 * sem,
                "upper95Mean": scores.mean() + 1.96 * sem,
                "averageExecutionTimeMs": rows["executionTimeMs"].mean(),
                "comparisonsPerSecond": safe_div(1000.0, rows["executionTimeMs"].mean()),
            }
        )
        for risk in ["Low Risk", "Medium Risk", "High Risk"]:
            risk_records.append(
                {
                    "model": model,
                    "modelLabel": MODEL_LABELS[model],
                    "risk": risk.replace(" Risk", ""),
                    "count": int((rows["riskLevel"] == risk).sum()),
                }
            )
        for field, label in FIELD_COLUMNS.items():
            field_records.append(
                {
                    "model": model,
                    "modelLabel": MODEL_LABELS[model],
                    "field": field,
                    "fieldLabel": label,
                    "meanScore": rows[field].mean(),
                    "configuredWeight": FIELD_WEIGHTS[field],
                }
            )
        processing_records.append(
            {
                "model": model,
                "modelLabel": MODEL_LABELS[model],
                "averageMs": rows["executionTimeMs"].mean(),
                "minimumMs": rows["executionTimeMs"].min(),
                "maximumMs": rows["executionTimeMs"].max(),
                "medianMs": rows["executionTimeMs"].median(),
                "standardDeviationMs": rows["executionTimeMs"].std(ddof=0),
                "comparisonsPerSecond": safe_div(1000.0, rows["executionTimeMs"].mean()),
                "device": rows["device"].mode().iat[0],
            }
        )

    descriptive = pd.DataFrame(descriptive_records)
    risk_counts = pd.DataFrame(risk_records)
    field_means = pd.DataFrame(field_records)
    processing = pd.DataFrame(processing_records)
    score_pivot = pair_scores.pivot(index="pairKey", columns="model", values="weightedOverallScore")[MODEL_ORDER]
    correlation = score_pivot.corr(method="pearson")
    correlation_long = correlation.reset_index().melt(id_vars="model", var_name="otherModel", value_name="pearsonCorrelation")
    disagreement = score_pivot.assign(
        maximumDifference=lambda frame: frame.max(axis=1) - frame.min(axis=1)
    ).sort_values("maximumDifference", ascending=False).head(10).reset_index()
    disagreement[["firstProjectCode", "secondProjectCode"]] = disagreement["pairKey"].str.split("|", expand=True)
    disagreement["pairLabel"] = disagreement.apply(
        lambda row: f"{row['firstProjectCode']}–{row['secondProjectCode']}", axis=1
    )

    similarity_ablation_records = []
    for model in MODEL_ORDER:
        rows = pair_scores[pair_scores["model"] == model].copy()
        full = rows["weightedOverallScore"].to_numpy(dtype=float)
        for omitted, omitted_label in FIELD_COLUMNS.items():
            retained = [field for field in FIELD_COLUMNS if field != omitted]
            denominator = sum(FIELD_WEIGHTS[field] for field in retained)
            ablated = sum(rows[field].to_numpy(dtype=float) * FIELD_WEIGHTS[field] for field in retained) / denominator
            correlation_value = spearmanr(full, ablated).statistic
            similarity_ablation_records.append(
                {
                    "model": model,
                    "modelLabel": MODEL_LABELS[model],
                    "omittedField": omitted,
                    "omittedFieldLabel": omitted_label,
                    "meanAbsoluteScoreShift": float(np.mean(np.abs(full - ablated))),
                    "maximumAbsoluteScoreShift": float(np.max(np.abs(full - ablated))),
                    "spearmanRankCorrelation": float(correlation_value),
                    "analysisType": "Output-sensitivity ablation; not predictive-performance ablation",
                }
            )
    similarity_ablation = pd.DataFrame(similarity_ablation_records)

    joined_supervisor = supervisor_labels.merge(
        supervisor_scores,
        on=["projectCode", "supervisorCode", "model"],
        how="left",
        validate="one_to_one",
    )
    if joined_supervisor["finalAdjustedScore"].isna().any():
        raise ValueError("At least one supervisor label has no matching score")
    supervisor_metric_records = []
    supervisor_provenance_records = []
    supervisor_human_only_records = []
    for model in MODEL_ORDER:
        rows = joined_supervisor[joined_supervisor["model"] == model]
        threshold, measured = optimise_threshold(rows["binaryLabel"], rows["finalAdjustedScore"])
        supervisor_metric_records.append({"model": model, "modelLabel": MODEL_LABELS[model], **measured})
        for source, count in rows["annotationSource"].fillna("unspecified").value_counts().items():
            supervisor_provenance_records.append(
                {
                    "model": model,
                    "modelLabel": MODEL_LABELS[model],
                    "annotationSource": source,
                    "records": int(count),
                    "percentage": float(count / len(rows)),
                }
            )
        human = rows[rows["annotationSource"] == "human_reviewed"]
        if len(human):
            human_threshold, human_measured = optimise_threshold(human["binaryLabel"], human["finalAdjustedScore"])
            supervisor_human_only_records.append(
                {"model": model, "modelLabel": MODEL_LABELS[model], **human_measured, "status": "estimable_single_rater"}
            )
        else:
            supervisor_human_only_records.append(
                {
                    "model": model,
                    "modelLabel": MODEL_LABELS[model],
                    "sampleSize": 0,
                    "threshold": None,
                    "accuracy": None,
                    "precision": None,
                    "recall": None,
                    "f1": None,
                    "mcc": None,
                    "status": "not_estimable_no_human_reviewed_labels",
                }
            )

    supervisor_metrics = pd.DataFrame(supervisor_metric_records)
    supervisor_provenance = pd.DataFrame(supervisor_provenance_records)
    supervisor_human_only = pd.DataFrame(supervisor_human_only_records)
    supervisor_ranking = ranked(
        supervisor_metrics,
        ["accuracy", "precision", "recall", "f1", "mcc"],
        "inSample",
    )
    supervisor_ranking["modelLabel"] = supervisor_ranking["model"].map(MODEL_LABELS)
    supervisor_ranking["f1Rank"] = rankdata(-supervisor_ranking["f1"], method="min").astype(int)
    supervisor_ranking["evidenceGrade"] = (
        "C — administrator-verified; single-reviewer internal evaluation"
        if supervisor_labels_verified
        else "D — source metadata does not establish final human verification"
    )

    supervisor_verification_summary = pd.DataFrame(
        [
            {
                "model": model,
                "modelLabel": MODEL_LABELS[model],
                "records": int((supervisor_labels["model"] == model).sum()),
                "verificationStatus": "administrator_verified" if supervisor_labels_verified else "not_declared",
                "reviewDesign": (
                    supervisor_verification.get("reviewDesign")
                    if supervisor_labels_verified
                    else "verification declaration unavailable"
                ),
                "evidenceGrade": "C" if supervisor_labels_verified else "D",
                "sourceMetadataMeaning": (
                    supervisor_verification.get("sourceFieldInterpretation")
                    if supervisor_labels_verified
                    else "annotationSource records the stored initialization route"
                ),
            }
            for model in MODEL_ORDER
        ]
    )

    supervisor_ablation_records = []
    for model in MODEL_ORDER:
        rows = supervisor_scores[supervisor_scores["model"] == model].copy()
        full = rows["pureSemanticScore"].to_numpy(dtype=float)
        for omitted, weight in SUPERVISOR_COMPONENTS.items():
            retained = [field for field in SUPERVISOR_COMPONENTS if field != omitted]
            denominator = sum(SUPERVISOR_COMPONENTS[field] for field in retained)
            ablated = sum(rows[field].to_numpy(dtype=float) * SUPERVISOR_COMPONENTS[field] for field in retained) / denominator
            supervisor_ablation_records.append(
                {
                    "model": model,
                    "modelLabel": MODEL_LABELS[model],
                    "omittedComponent": omitted,
                    "configuredWeight": weight,
                    "meanAbsoluteScoreShift": float(np.mean(np.abs(full - ablated))),
                    "maximumAbsoluteScoreShift": float(np.max(np.abs(full - ablated))),
                    "spearmanRankCorrelation": float(spearmanr(full, ablated).statistic),
                    "analysisType": "Score-output sensitivity; not independent predictive validation",
                }
            )
    supervisor_ablation = pd.DataFrame(supervisor_ablation_records)

    supervisor_descriptive = supervisor_scores.groupby("model", as_index=False).agg(
        records=("finalAdjustedScore", "size"),
        meanSemantic=("pureSemanticScore", "mean"),
        meanAdjusted=("finalAdjustedScore", "mean"),
        minimumAdjusted=("finalAdjustedScore", "min"),
        maximumAdjusted=("finalAdjustedScore", "max"),
        standardDeviationAdjusted=("finalAdjustedScore", "std"),
        averageExecutionTimeMs=("executionTimeMs", "mean"),
    )
    supervisor_descriptive["modelLabel"] = supervisor_descriptive["model"].map(MODEL_LABELS)

    assignment_counts = assignments.groupby("assignedSupervisorCode").size().rename("assignedProjects")
    workload = supervisors[["supervisorCode", "currentProjects", "maximumCapacity"]].copy()
    workload = workload.merge(assignment_counts, left_on="supervisorCode", right_index=True, how="left")
    workload["assignedProjects"] = workload["assignedProjects"].fillna(0).astype(int)
    workload["capacityUtilization"] = workload["assignedProjects"] / workload["maximumCapacity"]
    workload["capacityExceeded"] = workload["assignedProjects"] > workload["maximumCapacity"]
    workload_summary = {
        "supervisors": int(len(workload)),
        "assignedProjects": int(workload["assignedProjects"].sum()),
        "minimumAssigned": int(workload["assignedProjects"].min()),
        "maximumAssigned": int(workload["assignedProjects"].max()),
        "meanAssigned": float(workload["assignedProjects"].mean()),
        "standardDeviationAssigned": float(workload["assignedProjects"].std(ddof=0)),
        "giniAssigned": gini(workload["assignedProjects"]),
        "capacityExceededCount": int(workload["capacityExceeded"].sum()),
        "meanCapacityUtilization": float(workload["capacityUtilization"].mean()),
    }

    label_provenance = pd.concat(
        [
            pd.DataFrame(
                [
                    {
                        "experiment": "project_similarity",
                        "model": model,
                        "modelLabel": MODEL_LABELS[model],
                        "records": int((similarity_annotations["model"] == model).sum()),
                        "independentAnnotators": 1,
                        "consensusRecords": int(((consensus["model"] == model) & (consensus["status"] == "consensus")).sum()),
                        "primarySource": "single administrator submission",
                        "evidenceGrade": "C",
                    }
                    for model in MODEL_ORDER
                ]
            ),
            pd.DataFrame(
                [
                    {
                        "experiment": "supervisor_assignment",
                        "model": model,
                        "modelLabel": MODEL_LABELS[model],
                        "records": int((supervisor_labels["model"] == model).sum()),
                        "independentAnnotators": 1,
                        "consensusRecords": 0,
                        "primarySource": (
                            "administrator-verified labels; suggestion-assisted initialization metadata retained"
                            if supervisor_labels_verified
                            else "source metadata does not establish final human verification"
                        ),
                        "evidenceGrade": "C" if supervisor_labels_verified else "D",
                    }
                    for model in MODEL_ORDER
                ]
            ),
        ],
        ignore_index=True,
    )

    dashboard_expected_similarity = {
        "tfidf": {"accuracy": 0.6667, "precision": 1.0, "recall": 0.0909, "f1": 0.1667, "mcc": 0.244},
        "sentence_bert": {"accuracy": 0.9333, "precision": 0.8571, "recall": 1.0, "f1": 0.9231, "mcc": 0.873},
        "bge_m3": {"accuracy": 0.90, "precision": 0.90, "recall": 1.0, "f1": 0.9474, "mcc": 0.0},
    }
    dashboard_expected_supervisor = {
        "tfidf": {"threshold": 4.14, "accuracy": 0.9410, "precision": 0.7658, "recall": 0.8766, "f1": 0.8175, "mcc": 0.785},
        "sentence_bert": {"threshold": 27.90, "accuracy": 0.9269, "precision": 0.8333, "recall": 0.6410, "f1": 0.7246, "mcc": 0.691},
        "bge_m3": {"threshold": 46.75, "accuracy": 0.9218, "precision": 0.7314, "recall": 0.7564, "f1": 0.7437, "mcc": 0.698},
    }
    reconciliation_records = []
    for experiment, measured_frame, expected in [
        ("project_similarity", similarity_metrics, dashboard_expected_similarity),
        ("supervisor_assignment", supervisor_metrics, dashboard_expected_supervisor),
    ]:
        for model in MODEL_ORDER:
            measured = measured_frame[measured_frame["model"] == model].iloc[0]
            for metric, dashboard_value in expected[model].items():
                recalculated = float(measured[metric])
                difference = recalculated - dashboard_value
                tolerance = 0.005 if metric != "threshold" else 0.02
                reconciliation_records.append(
                    {
                        "experiment": experiment,
                        "model": model,
                        "modelLabel": MODEL_LABELS[model],
                        "metric": metric,
                        "dashboardValue": dashboard_value,
                        "recalculatedValue": recalculated,
                        "absoluteDifference": abs(difference),
                        "withinRoundingTolerance": abs(difference) <= tolerance,
                    }
                )
    reconciliation = pd.DataFrame(reconciliation_records)

    tables = {
        "similarity-metrics": similarity_metrics,
        "similarity-bootstrap-intervals": similarity_intervals,
        "similarity-threshold-analysis": similarity_thresholds,
        "similarity-rankings": similarity_rankings,
        "similarity-descriptive-statistics": descriptive,
        "similarity-risk-counts": risk_counts,
        "similarity-field-means": field_means,
        "similarity-model-correlation": correlation_long,
        "similarity-largest-disagreements": disagreement,
        "similarity-error-analysis": similarity_errors,
        "similarity-output-ablation": similarity_ablation,
        "processing-performance": processing,
        "supervisor-metrics": supervisor_metrics,
        "supervisor-rankings": supervisor_ranking,
        "supervisor-label-provenance": supervisor_provenance,
        "supervisor-human-reviewed-only": supervisor_human_only,
        "supervisor-verification-summary": supervisor_verification_summary,
        "supervisor-descriptive-statistics": supervisor_descriptive,
        "supervisor-output-ablation": supervisor_ablation,
        "supervisor-workload": workload,
        "label-provenance": label_provenance,
        "dashboard-reconciliation": reconciliation,
    }
    for stem, frame in tables.items():
        save_table(frame, output_directory, stem)

    figure_manifest = []

    fig, ax = plt.subplots(figsize=(7.2, 4.0))
    bins = np.arange(0, 101, 5)
    for model in MODEL_ORDER:
        ax.hist(pair_scores.loc[pair_scores.model == model, "weightedOverallScore"], bins=bins, histtype="step", linewidth=2.0, label=MODEL_LABELS[model], color=MODEL_COLOURS[model])
    ax.set(title="Similarity-score distributions", xlabel="Weighted similarity (%)", ylabel="Project-pair count", xlim=(0, 100))
    ax.legend(frameon=False)
    figure_manifest.append({"number": 1, "title": "Similarity-score distributions", "caption": "All 3,003 persisted project pairs per model; descriptive, not accuracy evidence.", **save_figure(fig, figure_directory, 1, "similarity-score-distributions")})

    fig, ax = plt.subplots(figsize=(6.8, 3.8))
    pivot = risk_counts.pivot(index="risk", columns="model", values="count").reindex(["Low", "Medium", "High"])[MODEL_ORDER]
    pivot.plot(kind="bar", ax=ax, color=[MODEL_COLOURS[m] for m in MODEL_ORDER], width=0.78)
    ax.set(title="Configured similarity-risk distribution", xlabel="Risk band", ylabel="Project-pair count")
    ax.tick_params(axis="x", rotation=0)
    ax.legend([MODEL_LABELS[m] for m in MODEL_ORDER], frameon=False)
    figure_manifest.append({"number": 2, "title": "Configured similarity-risk distribution", "caption": "Risk bands use the configured 40% and 70% score boundaries.", **save_figure(fig, figure_directory, 2, "similarity-risk-distribution")})

    fig, ax = plt.subplots(figsize=(8.0, 4.2))
    pivot = field_means.pivot(index="fieldLabel", columns="model", values="meanScore").reindex(list(FIELD_COLUMNS.values()))[MODEL_ORDER]
    pivot.plot(kind="bar", ax=ax, color=[MODEL_COLOURS[m] for m in MODEL_ORDER], width=0.82)
    ax.set(title="Mean similarity by project field", xlabel="Project field", ylabel="Mean field score (%)", ylim=(0, 100))
    ax.tick_params(axis="x", rotation=25)
    ax.legend([MODEL_LABELS[m] for m in MODEL_ORDER], frameon=False)
    figure_manifest.append({"number": 3, "title": "Mean similarity by project field", "caption": "Six-field descriptive means; not feature importance or predictive ablation.", **save_figure(fig, figure_directory, 3, "field-level-similarity")})

    fig, ax = plt.subplots(figsize=(6.8, 3.8))
    ax.bar([MODEL_LABELS[m] for m in MODEL_ORDER], processing.set_index("model").loc[MODEL_ORDER, "averageMs"], color=[MODEL_COLOURS[m] for m in MODEL_ORDER])
    for index, value in enumerate(processing.set_index("model").loc[MODEL_ORDER, "averageMs"]):
        ax.text(index, value, f"{value:.3f} ms", ha="center", va="bottom", fontsize=8)
    ax.set(title="Measured similarity latency", xlabel="Model", ylabel="Average milliseconds per persisted comparison")
    figure_manifest.append({"number": 4, "title": "Measured similarity latency", "caption": "Recorded experiment-run latency; hardware and implementation specific.", **save_figure(fig, figure_directory, 4, "similarity-latency")})

    fig, ax = plt.subplots(figsize=(5.2, 4.2))
    sns.heatmap(correlation.loc[MODEL_ORDER, MODEL_ORDER], annot=True, fmt=".3f", cmap="Blues", vmin=0, vmax=1, square=True, ax=ax, cbar_kws={"label": "Pearson correlation"})
    ax.set_xticklabels([MODEL_LABELS[m] for m in MODEL_ORDER], rotation=20)
    ax.set_yticklabels([MODEL_LABELS[m] for m in MODEL_ORDER], rotation=0)
    ax.set_title("Score correlation on identical project pairs")
    figure_manifest.append({"number": 5, "title": "Score correlation on identical project pairs", "caption": "Pearson correlation across 3,003 aligned pair scores.", **save_figure(fig, figure_directory, 5, "model-score-correlation")})

    fig, ax = plt.subplots(figsize=(7.2, 4.3))
    ordered = disagreement.sort_values("maximumDifference")
    ax.barh(ordered["pairLabel"], ordered["maximumDifference"], color="#6B7280")
    ax.set(title="Largest model-score disagreements", xlabel="Maximum difference among models (percentage points)", ylabel="Project pair")
    figure_manifest.append({"number": 6, "title": "Largest model-score disagreements", "caption": "Ten pairs with the largest spread among the three persisted model scores.", **save_figure(fig, figure_directory, 6, "largest-model-disagreements")})

    fig, ax = plt.subplots(figsize=(6.8, 3.8))
    sup_ordered = supervisor_descriptive.set_index("model").loc[MODEL_ORDER]
    x = np.arange(len(MODEL_ORDER)); width = 0.35
    ax.bar(x - width / 2, sup_ordered["meanSemantic"], width, label="Semantic score", color="#0072B2")
    ax.bar(x + width / 2, sup_ordered["meanAdjusted"], width, label="Workload-adjusted score", color="#009E73")
    ax.set_xticks(x, [MODEL_LABELS[m] for m in MODEL_ORDER])
    ax.set(title="Supervisor matching-score means", xlabel="Model", ylabel="Mean score (%)", ylim=(0, 100))
    ax.legend(frameon=False)
    figure_manifest.append({"number": 7, "title": "Supervisor matching-score means", "caption": "All 1,560 project-supervisor scores per model.", **save_figure(fig, figure_directory, 7, "supervisor-matching-scores")})

    fig, ax = plt.subplots(figsize=(9.0, 4.1))
    ax.bar(workload["supervisorCode"], workload["assignedProjects"], label="Assigned projects", color="#7B61A8")
    ax.plot(workload["supervisorCode"], workload["maximumCapacity"], color="#D55E00", marker="o", label="Maximum capacity")
    ax.set(title="Balanced workload and configured capacity", xlabel="Pseudonymized supervisor", ylabel="Projects")
    ax.tick_params(axis="x", rotation=55)
    ax.legend(frameon=False)
    figure_manifest.append({"number": 8, "title": "Balanced workload and configured capacity", "caption": "All 78 assignments; no recorded capacity was exceeded.", **save_figure(fig, figure_directory, 8, "workload-and-capacity")})

    fig, ax = plt.subplots(figsize=(8.4, 2.2))
    ax.axis("off")
    table_values = processing[["modelLabel", "averageMs", "minimumMs", "maximumMs", "medianMs", "standardDeviationMs", "comparisonsPerSecond", "device"]].copy()
    for column in ["averageMs", "minimumMs", "maximumMs", "medianMs", "standardDeviationMs", "comparisonsPerSecond"]:
        table_values[column] = table_values[column].map(lambda value: f"{value:.3f}")
    table = ax.table(cellText=table_values.values, colLabels=["Model", "Avg ms", "Min ms", "Max ms", "Median ms", "SD ms", "Per second", "Device"], loc="center", cellLoc="center")
    table.auto_set_font_size(False); table.set_fontsize(7.5); table.scale(1, 1.4)
    ax.set_title("Similarity-processing summary", pad=14)
    figure_manifest.append({"number": 9, "title": "Similarity-processing summary", "caption": "Recorded execution-time summary for reproducibility.", **save_figure(fig, figure_directory, 9, "processing-summary")})

    fig, ax = plt.subplots(figsize=(7.2, 4.1))
    metric_names = ["accuracy", "precision", "recall", "f1"]
    x = np.arange(len(metric_names)); width = 0.24
    for index, model in enumerate(MODEL_ORDER):
        row = similarity_metrics.set_index("model").loc[model]
        ax.bar(x + (index - 1) * width, [row[name] * 100 for name in metric_names], width, label=MODEL_LABELS[model], color=MODEL_COLOURS[model])
    ax.set_xticks(x, ["Accuracy", "Precision", "Recall", "F1"])
    ax.set(title="Similarity-model classification metrics at 70%", xlabel="Metric", ylabel="Performance (%)", ylim=(0, 105))
    ax.legend(frameon=False)
    figure_manifest.append({"number": 10, "title": "Similarity-model classification metrics at 70%", "caption": "Single-administrator evaluation, n=30 model-specific labels each; no multi-rater consensus.", **save_figure(fig, figure_directory, 10, "similarity-classification-metrics")})

    fig, axes = plt.subplots(1, 3, figsize=(9.0, 3.2))
    for ax, model in zip(axes, MODEL_ORDER):
        row = similarity_metrics.set_index("model").loc[model]
        matrix = np.array([[row["trueNegative"], row["falsePositive"]], [row["falseNegative"], row["truePositive"]]])
        sns.heatmap(matrix, annot=True, fmt=".0f", cmap="Blues", cbar=False, square=True, ax=ax, xticklabels=["Different", "Similar"], yticklabels=["Different", "Similar"])
        ax.set(title=MODEL_LABELS[model], xlabel="Predicted", ylabel="Human label")
    fig.suptitle("Similarity confusion matrices at the configured 70% threshold", y=1.02, fontsize=11)
    figure_manifest.append({"number": 11, "title": "Similarity confusion matrices", "caption": "Counts from 30 single-administrator labels per model; dashboard wording 'consensus pairs' is not supported by database status.", **save_figure(fig, figure_directory, 11, "similarity-confusion-matrices")})

    fig, ax = plt.subplots(figsize=(7.0, 4.0))
    for model in MODEL_ORDER:
        rows = similarity_thresholds[similarity_thresholds["model"] == model]
        ax.plot(rows["threshold"], rows["f1"] * 100, marker="o", linewidth=2, label=MODEL_LABELS[model], color=MODEL_COLOURS[model])
    ax.set(title="Similarity F1 sensitivity to the decision threshold", xlabel="Threshold (%)", ylabel="F1 (%)", ylim=(0, 105))
    ax.legend(frameon=False)
    figure_manifest.append({"number": 12, "title": "Similarity F1 sensitivity", "caption": "Thresholds 50%–80%; exploratory and in-sample.", **save_figure(fig, figure_directory, 12, "threshold-versus-f1")})

    fig, ax = plt.subplots(figsize=(5.3, 4.5))
    ax.plot([0, 1], [0, 1], linestyle="--", color="#9CA3AF", label="Chance")
    for model in MODEL_ORDER:
        data = similarity_curve_data[model]
        auc = similarity_metrics.set_index("model").loc[model, "rocAuc"]
        ax.plot(data["fpr"], data["tpr"], linewidth=2, label=f"{MODEL_LABELS[model]} (AUC {auc:.3f})", color=MODEL_COLOURS[model])
    ax.set(title="Similarity receiver-operating-characteristic curves", xlabel="False-positive rate", ylabel="True-positive rate", xlim=(0, 1), ylim=(0, 1))
    ax.legend(frameon=False, loc="lower right")
    figure_manifest.append({"number": 13, "title": "Similarity ROC curves", "caption": "Single-rater, model-specific labelled subsets; cross-model inferential comparison is not valid.", **save_figure(fig, figure_directory, 13, "similarity-roc-curves")})

    fig, ax = plt.subplots(figsize=(5.3, 4.5))
    for model in MODEL_ORDER:
        data = similarity_curve_data[model]
        ap = similarity_metrics.set_index("model").loc[model, "averagePrecision"]
        ax.plot(data["recall"], data["precision"], linewidth=2, label=f"{MODEL_LABELS[model]} (AP {ap:.3f})", color=MODEL_COLOURS[model])
    ax.set(title="Similarity precision-recall curves", xlabel="Recall", ylabel="Precision", xlim=(0, 1), ylim=(0, 1.02))
    ax.legend(frameon=False, loc="lower left")
    figure_manifest.append({"number": 14, "title": "Similarity precision-recall curves", "caption": "The BGE-M3 subset is 90% positive, which inflates ordinary F1 and average precision.", **save_figure(fig, figure_directory, 14, "similarity-precision-recall-curves")})

    fig, ax = plt.subplots(figsize=(7.2, 4.1))
    x = np.arange(4); width = 0.24
    sup_metrics_index = supervisor_metrics.set_index("model")
    for index, model in enumerate(MODEL_ORDER):
        row = sup_metrics_index.loc[model]
        ax.bar(x + (index - 1) * width, [row[name] * 100 for name in ["accuracy", "precision", "recall", "f1"]], width, label=MODEL_LABELS[model], color=MODEL_COLOURS[model])
    ax.set_xticks(x, ["Accuracy", "Precision", "Recall", "F1"])
    ax.set(title="Supervisor-assignment internal classification metrics", xlabel="Metric", ylabel="Performance (%)", ylim=(0, 105))
    ax.legend(frameon=False)
    figure_manifest.append({"number": 15, "title": "Supervisor-assignment classification metrics", "caption": "Administrator-verified labels evaluated at model-specific F1-optimised thresholds; evidence remains single-reviewer and internal.", **save_figure(fig, figure_directory, 15, "supervisor-classification-metrics")})

    fig, ax = plt.subplots(figsize=(7.2, 4.0))
    confusion = supervisor_metrics.set_index("model").loc[MODEL_ORDER, ["truePositive", "trueNegative", "falsePositive", "falseNegative"]]
    confusion.index = [MODEL_LABELS[m] for m in MODEL_ORDER]
    confusion.plot(kind="bar", ax=ax, color=["#009E73", "#0072B2", "#CC3311", "#EE7733"], width=0.8)
    ax.set(title="Supervisor-assignment confusion-matrix counts", xlabel="Model", ylabel="Labelled project-supervisor pairs")
    ax.tick_params(axis="x", rotation=0)
    ax.legend(["TP", "TN", "FP", "FN"], frameon=False)
    figure_manifest.append({"number": 16, "title": "Supervisor-assignment confusion counts", "caption": "Counts at model-specific F1-optimised thresholds.", **save_figure(fig, figure_directory, 16, "supervisor-confusion-counts")})

    fig, ax = plt.subplots(figsize=(6.8, 3.8))
    x = np.arange(3); width = 0.36
    ordered = supervisor_metrics.set_index("model").loc[MODEL_ORDER]
    ax.bar(x - width / 2, ordered["threshold"], width, label="Decision threshold (%)", color="#7B61A8")
    ax.bar(x + width / 2, ordered["mcc"] * 100, width, label="MCC × 100", color="#009E73")
    ax.set_xticks(x, [MODEL_LABELS[m] for m in MODEL_ORDER])
    ax.set(title="Supervisor threshold and Matthews correlation", xlabel="Model", ylabel="Percent / MCC × 100", ylim=(0, 100))
    ax.legend(frameon=False)
    figure_manifest.append({"number": 17, "title": "Supervisor threshold and MCC", "caption": "Thresholds were selected in sample to maximise F1.", **save_figure(fig, figure_directory, 17, "supervisor-threshold-and-mcc")})

    fig, ax = plt.subplots(figsize=(6.8, 3.8))
    class_balance = supervisor_metrics.set_index("model").loc[MODEL_ORDER, ["negativeLabels", "positiveLabels"]]
    class_balance.index = [MODEL_LABELS[m] for m in MODEL_ORDER]
    class_balance.plot(kind="bar", stacked=True, ax=ax, color=["#999999", "#0072B2"], width=0.65)
    ax.set(title="Supervisor-evaluation class balance", xlabel="Model", ylabel="Labelled project-supervisor pairs")
    ax.tick_params(axis="x", rotation=0)
    ax.legend(["Not relevant", "Relevant"], frameon=False)
    figure_manifest.append({"number": 18, "title": "Supervisor-evaluation class balance", "caption": "Each model contains 1,560 submitted labels; relevance is grade 2–3.", **save_figure(fig, figure_directory, 18, "supervisor-class-balance")})

    fig, ax = plt.subplots(figsize=(7.6, 4.0))
    verification_plot = supervisor_verification_summary.set_index("modelLabel").reindex([MODEL_LABELS[m] for m in MODEL_ORDER])
    ax.bar(verification_plot.index, verification_plot["records"], color="#009E73", width=0.62)
    for index, value in enumerate(verification_plot["records"]):
        ax.text(index, value + 25, f"{int(value):,}", ha="center", va="bottom", fontsize=9)
    ax.set(title="Administrator-verified supervisor labels", xlabel="Model", ylabel="Verified labels", ylim=(0, 1750))
    ax.tick_params(axis="x", rotation=0)
    ax.text(0.5, -0.20, "All records were checked; the stored source field retains the initialization route.", transform=ax.transAxes, ha="center", fontsize=8)
    figure_manifest.append({"number": 19, "title": "Administrator-verified supervisor labels", "caption": "All 4,680 labels were checked by the research administrator, with records amended where needed. The database retains initialization-source metadata separately.", **save_figure(fig, figure_directory, 19, "supervisor-label-provenance")})

    fig, axes = plt.subplots(1, 2, figsize=(10.0, 3.8))
    sim_sorted = similarity_rankings.sort_values("evidenceBalancedRank", ascending=False)
    axes[0].barh(sim_sorted["modelLabel"], sim_sorted["evidenceBalancedMeanRank"], color=[MODEL_COLOURS[m] for m in sim_sorted["model"]])
    axes[0].invert_xaxis(); axes[0].set(title="Similarity evidence-balanced mean rank", xlabel="Lower is better")
    sup_sorted = supervisor_ranking.sort_values("inSampleRank", ascending=False)
    axes[1].barh(sup_sorted["modelLabel"], sup_sorted["inSampleMeanRank"], color=[MODEL_COLOURS[m] for m in sup_sorted["model"]])
    axes[1].invert_xaxis(); axes[1].set(title="Supervisor in-sample mean rank", xlabel="Lower is better")
    fig.suptitle("Model rankings must be interpreted with their evidence grade", y=1.03, fontsize=11)
    figure_manifest.append({"number": 20, "title": "Evidence-bounded model rankings", "caption": "Both rankings are internal and single-reviewer; supervisor labels were administrator verified, but no independent multi-rater or external test set is available.", **save_figure(fig, figure_directory, 20, "evidence-bounded-rankings")})

    dashboard_match = bool(reconciliation["withinRoundingTolerance"].all())
    output = {
        "generatedAt": pd.Timestamp.utcnow().isoformat(),
        "dataVersion": "project_dataset_v2_corrected_descriptions",
        "counts": {
            "projects": int(len(projects)),
            "projectPairsPerModel": int(pair_scores.groupby("model").size().min()),
            "projectPairScores": int(len(pair_scores)),
            "supervisors": int(len(supervisors)),
            "supervisorScoresPerModel": int(supervisor_scores.groupby("model").size().min()),
            "supervisorScores": int(len(supervisor_scores)),
            "assignments": int(len(assignments)),
            "similarityLabels": int(len(similarity_annotations)),
            "supervisorLabels": int(len(supervisor_labels)),
        },
        "similarity": {
            "metrics": similarity_metrics.to_dict(orient="records"),
            "rankings": similarity_rankings.to_dict(orient="records"),
            "bootstrapIntervals": similarity_interval_records,
            "evidenceGrade": "C",
            "limitation": "Thirty model-specific labels per model from one administrator; all consensus records are needs_more_labels with annotatorCount=1.",
        },
        "supervisorAssignment": {
            "metrics": supervisor_metrics.to_dict(orient="records"),
            "rankings": supervisor_ranking.to_dict(orient="records"),
            "humanReviewedOnly": supervisor_human_only.to_dict(orient="records"),
            "verification": supervisor_verification,
            "evidenceGrade": "C" if supervisor_labels_verified else "D",
            "limitation": "All labels were checked by the research administrator and amended where needed. The evaluation is single-reviewer and internal; it is not a blinded, adjudicated, held-out, multi-rater, or external test.",
        },
        "workload": workload_summary,
        "statisticalInference": {
            "similarityCrossModelTests": "NE — model-specific labels cover different pairs and are not a shared paired test set.",
            "supervisorCrossModelTests": "Withheld — labels are model-specific binary judgments rather than a shared independent ranked relevance test set.",
            "withinModelUncertainty": "Non-parametric percentile bootstrap intervals are reported for similarity metrics (1,000 resamples, fixed seeds).",
        },
        "dashboardReconciliationPassed": dashboard_match,
        "figureManifest": figure_manifest,
    }
    (output_directory / "verified-model-evaluation.json").write_text(
        json.dumps(output, indent=2, default=serialise), encoding="utf-8"
    )
    (figure_directory / "figure-manifest.json").write_text(
        json.dumps(figure_manifest, indent=2), encoding="utf-8"
    )
    print(json.dumps({"status": "passed" if dashboard_match else "failed", "output": str(output_directory), "counts": output["counts"], "workload": workload_summary}, indent=2))
    if not dashboard_match:
        raise SystemExit("Dashboard reconciliation failed")


if __name__ == "__main__":
    main()
