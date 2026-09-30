"""Safe academic evaluation metrics and threshold experiments."""
from __future__ import annotations

import math
import statistics
from typing import Any, Dict, Iterable, List
from itertools import combinations

import numpy as np
from sklearn.calibration import calibration_curve
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    cohen_kappa_score,
    f1_score,
    matthews_corrcoef,
    mean_absolute_error,
    mean_squared_error,
    precision_recall_curve,
    r2_score,
    roc_auc_score,
    roc_curve,
)


def safe_div(numerator: float, denominator: float) -> float:
    return float(numerator / denominator) if denominator else 0.0


def classification_metrics(labels: Iterable[int], scores: Iterable[float], threshold: float) -> Dict[str, Any]:
    y = np.asarray(list(labels), dtype=int)
    s = np.asarray(list(scores), dtype=float)
    predicted = (s >= threshold).astype(int)
    tp = int(np.sum((y == 1) & (predicted == 1)))
    tn = int(np.sum((y == 0) & (predicted == 0)))
    fp = int(np.sum((y == 0) & (predicted == 1)))
    fn = int(np.sum((y == 1) & (predicted == 0)))
    precision = safe_div(tp, tp + fp)
    recall = safe_div(tp, tp + fn)
    specificity = safe_div(tn, tn + fp)
    npv = safe_div(tn, tn + fn)
    accuracy = safe_div(tp + tn, len(y))
    f1 = safe_div(2 * precision * recall, precision + recall)
    result: Dict[str, Any] = {
        "threshold": threshold,
        "confusion_matrix": {"true_positive": tp, "true_negative": tn, "false_positive": fp, "false_negative": fn},
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall,
        "sensitivity": recall,
        "specificity": specificity,
        "negative_predictive_value": npv,
        "false_positive_rate": safe_div(fp, fp + tn),
        "false_negative_rate": safe_div(fn, fn + tp),
        "false_discovery_rate": safe_div(fp, fp + tp),
        "balanced_accuracy": (recall + specificity) / 2,
        "f1_score": f1,
        "macro_f1_score": float(f1_score(y, predicted, average="macro", zero_division=0)) if len(y) else 0.0,
        "weighted_f1_score": float(f1_score(y, predicted, average="weighted", zero_division=0)) if len(y) else 0.0,
        "matthews_correlation_coefficient": float(matthews_corrcoef(y, predicted)) if len(y) else 0.0,
        "cohens_kappa": float(cohen_kappa_score(y, predicted)) if len(y) else 0.0,
        "notes": [],
    }
    if len(set(y.tolist())) > 1:
        normalized = s / 100.0
        result["roc_auc"] = float(roc_auc_score(y, normalized))
        result["average_precision"] = float(average_precision_score(y, normalized))
        result["brier_score"] = float(brier_score_loss(y, normalized))
        fpr, tpr, roc_thresholds = roc_curve(y, normalized)
        precision_curve, recall_curve_values, pr_thresholds = precision_recall_curve(y, normalized)
        observed, predicted_probability = calibration_curve(y, normalized, n_bins=min(10, len(y)), strategy="uniform")
        result["roc_curve"] = {"fpr": fpr.tolist(), "tpr": tpr.tolist(), "thresholds": (roc_thresholds * 100).tolist()}
        result["precision_recall_curve"] = {
            "precision": precision_curve.tolist(),
            "recall": recall_curve_values.tolist(),
            "thresholds": (pr_thresholds * 100).tolist(),
        }
        result["calibration_curve"] = {
            "mean_predicted_probability": predicted_probability.tolist(),
            "observed_positive_rate": observed.tolist(),
        }
        j = tpr - fpr
        result["youden_optimal_threshold"] = float(roc_thresholds[int(np.argmax(j))] * 100)
        result["youden_j"] = float(np.max(j))
    else:
        result.update({"roc_auc": None, "average_precision": None, "brier_score": None, "calibration_curve": None})
        result["notes"].append("ROC-AUC and Average Precision require both human classes.")
    return result


def regression_metrics(human_scores: Iterable[float], model_scores: Iterable[float]) -> Dict[str, Any]:
    human = np.asarray(list(human_scores), dtype=float)
    model = np.asarray(list(model_scores), dtype=float)
    differences = model - human
    if not len(human):
        return {}
    pearson = float(np.corrcoef(human, model)[0, 1]) if len(human) > 1 and np.std(human) and np.std(model) else None
    try:
        from scipy.stats import spearmanr
        spearman = float(spearmanr(human, model).statistic) if len(human) > 1 else None
    except Exception:
        spearman = None
    mse = float(mean_squared_error(human, model))
    return {
        "mean_absolute_error": float(mean_absolute_error(human, model)),
        "mean_squared_error": mse,
        "root_mean_squared_error": math.sqrt(mse),
        "median_absolute_error": float(np.median(np.abs(differences))),
        "r_squared": float(r2_score(human, model)) if len(human) > 1 else None,
        "pearson_correlation": pearson,
        "spearman_correlation": spearman,
        "average_score_difference": float(np.mean(differences)),
        "standard_deviation_score_differences": float(np.std(differences)),
    }


def threshold_analysis(labels: List[int], scores: List[float], thresholds: Iterable[float]) -> List[Dict[str, Any]]:
    return [classification_metrics(labels, scores, float(threshold)) for threshold in thresholds]


def optimal_thresholds(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not rows:
        return {}
    choose = lambda metric: max(rows, key=lambda row: (float(row.get(metric) or 0), -float(row["threshold"])))
    return {
        "accuracy_optimal": {
            "threshold": choose("accuracy")["threshold"],
            "value": choose("accuracy")["accuracy"],
        },
        "f1_optimal": {
            "threshold": choose("f1_score")["threshold"],
            "value": choose("f1_score")["f1_score"],
        },
        "recall_optimal": {
            "threshold": choose("recall")["threshold"],
            "value": choose("recall")["recall"],
        },
        "balanced_accuracy_optimal": {
            "threshold": choose("balanced_accuracy")["threshold"],
            "value": choose("balanced_accuracy")["balanced_accuracy"],
        },
    }


def statistical_tests(
    labels: Iterable[int],
    model_scores: Dict[str, Iterable[float]],
    classification_thresholds: Dict[str, float],
    human_scores: Iterable[float] | None = None,
    significance_level: float = 0.05,
) -> List[Dict[str, Any]]:
    from scipy.stats import binomtest, friedmanchisquare, ttest_rel, wilcoxon

    y = np.asarray(list(labels), dtype=int)
    scores = {model: np.asarray(list(values), dtype=float) for model, values in model_scores.items()}
    predictions = {
        model: (values >= float(classification_thresholds.get(model, 70))).astype(int)
        for model, values in scores.items()
    }
    correctness = {model: (prediction == y).astype(int) for model, prediction in predictions.items()}
    results: List[Dict[str, Any]] = []

    for first, second in combinations(scores, 2):
        first_only = int(np.sum((correctness[first] == 1) & (correctness[second] == 0)))
        second_only = int(np.sum((correctness[first] == 0) & (correctness[second] == 1)))
        discordant = first_only + second_only
        p_value = float(binomtest(first_only, discordant, 0.5).pvalue) if discordant else 1.0
        results.append({
            "test_name": "McNemar exact test",
            "models": [first, second],
            "test_statistic": abs(first_only - second_only),
            "p_value": p_value,
            "significance_level": significance_level,
            "significant": p_value < significance_level,
            "sample_size": int(len(y)),
            "details": {
                "first_correct_second_wrong": first_only,
                "first_wrong_second_correct": second_only,
            },
            "interpretation": "Significant difference in paired classification errors."
            if p_value < significance_level else "No statistically significant difference in paired classification errors.",
        })

    if len(correctness) >= 3 and len(y) >= 2:
        try:
            statistic, p_value = friedmanchisquare(*(values for values in correctness.values()))
            if math.isnan(float(statistic)) or math.isnan(float(p_value)):
                raise ValueError("Identical correctness vectors")
            results.append({
                "test_name": "Friedman test",
                "models": list(correctness),
                "test_statistic": float(statistic),
                "p_value": float(p_value),
                "significance_level": significance_level,
                "significant": float(p_value) < significance_level,
                "sample_size": int(len(y)),
                "interpretation": "Significant overall difference among model correctness ranks."
                if float(p_value) < significance_level else "No statistically significant overall difference among model correctness ranks.",
            })
        except ValueError as exc:
            results.append({
                "test_name": "Friedman test",
                "models": list(correctness),
                "test_statistic": None,
                "p_value": None,
                "significance_level": significance_level,
                "significant": False,
                "sample_size": int(len(y)),
                "interpretation": f"Test not estimable: {exc}.",
            })

    human = np.asarray(list(human_scores), dtype=float) if human_scores is not None else np.asarray([])
    if len(human) == len(y) and len(human) >= 2:
        errors = {model: np.abs(values - human) for model, values in scores.items()}
        for first, second in combinations(errors, 2):
            t_result = ttest_rel(errors[first], errors[second])
            results.append({
                "test_name": "Paired t-test of absolute errors",
                "models": [first, second],
                "test_statistic": float(t_result.statistic) if not math.isnan(float(t_result.statistic)) else None,
                "p_value": float(t_result.pvalue) if not math.isnan(float(t_result.pvalue)) else None,
                "significance_level": significance_level,
                "significant": bool(not math.isnan(float(t_result.pvalue)) and float(t_result.pvalue) < significance_level),
                "sample_size": int(len(human)),
                "interpretation": "Compares mean absolute model errors against human similarity scores.",
            })
            try:
                w_result = wilcoxon(errors[first], errors[second], zero_method="zsplit")
                results.append({
                    "test_name": "Wilcoxon signed-rank test of absolute errors",
                    "models": [first, second],
                    "test_statistic": float(w_result.statistic),
                    "p_value": float(w_result.pvalue),
                    "significance_level": significance_level,
                    "significant": float(w_result.pvalue) < significance_level,
                    "sample_size": int(len(human)),
                    "interpretation": "Non-parametric paired comparison of absolute model errors.",
                })
            except ValueError as exc:
                results.append({
                    "test_name": "Wilcoxon signed-rank test of absolute errors",
                    "models": [first, second],
                    "test_statistic": None,
                    "p_value": None,
                    "significance_level": significance_level,
                    "significant": False,
                    "sample_size": int(len(human)),
                    "interpretation": f"Test not estimable: {exc}.",
                })
    return results


def processing_metrics(times_ms: Iterable[float]) -> Dict[str, float]:
    values = list(map(float, times_ms))
    if not values:
        return {}
    total_seconds = sum(values) / 1000
    return {
        "average_ms": statistics.mean(values),
        "minimum_ms": min(values),
        "maximum_ms": max(values),
        "median_ms": statistics.median(values),
        "standard_deviation_ms": statistics.pstdev(values),
        "comparisons_per_second": safe_div(len(values), total_seconds),
    }
