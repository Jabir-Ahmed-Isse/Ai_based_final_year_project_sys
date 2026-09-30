"""Multi-model, six-field project similarity comparison."""
from __future__ import annotations

import hashlib
import math
import statistics
import time
from typing import Any, Dict, Tuple

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from model_registry import registry
from project_field_builder import build_project_fields
from research_config import (
    DEFAULT_AGREEMENT_THRESHOLDS,
    DEFAULT_FIELD_WEIGHTS,
    DEFAULT_RISK_THRESHOLDS,
    MODEL_NAMES,
    PROJECT_FIELDS,
    validate_weights,
)
from text_preprocessing import preprocess_text

_embedding_cache: Dict[Tuple[str, str, str], np.ndarray] = {}


def _percent(value: float) -> float:
    return round(max(0.0, min(100.0, float(value))), 4)


def _tfidf(a: str, b: str) -> float:
    if not a and not b:
        return 0.0
    if not a or not b:
        return 0.0
    try:
        matrix = TfidfVectorizer(lowercase=False, token_pattern=r"(?u)\b[\w+#.-]+\b").fit_transform([a, b])
        return _percent(cosine_similarity(matrix[0:1], matrix[1:2])[0][0] * 100)
    except ValueError:
        return 0.0


def _semantic(key: str, a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    model = registry.get(key)
    if key == "bert_cross_encoder":
        raw = float(model.predict([(a, b)])[0])
        if raw < 0 or raw > 1:
            raw = 1 / (1 + math.exp(-raw))
        return _percent(raw * 100)
    vectors = []
    for text in (a, b):
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        cache_key = (key, MODEL_NAMES[key], digest)
        if cache_key not in _embedding_cache:
            _embedding_cache[cache_key] = np.asarray(
                model.encode(text, normalize_embeddings=True), dtype=float
            )
        vectors.append(_embedding_cache[cache_key])
    return _percent(float(np.dot(vectors[0], vectors[1])) * 100)


def _weighted(scores: Dict[str, float], states: Dict[str, str], weights: Dict[str, float]) -> float:
    active = [field for field in PROJECT_FIELDS if states[field] != "excluded_both_missing"]
    denominator = sum(weights[field] for field in active)
    if denominator <= 0:
        return 0.0
    return _percent(sum(scores[field] * weights[field] for field in active) / denominator)


def _risk(score: float, thresholds: Dict[str, float]) -> str:
    if score >= thresholds["high"]:
        return "High Risk"
    if score >= thresholds["medium"]:
        return "Medium Risk"
    return "Low Risk"


def compare_projects_multi_model(
    first: Dict[str, Any],
    second: Dict[str, Any],
    config: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    config = config or {}
    weights = validate_weights(config.get("field_weights", DEFAULT_FIELD_WEIGHTS))
    risk_thresholds = {**DEFAULT_RISK_THRESHOLDS, **config.get("risk_thresholds", {})}
    agreement_thresholds = {
        **DEFAULT_AGREEMENT_THRESHOLDS,
        **config.get("agreement_thresholds", {}),
    }
    if not 0 <= risk_thresholds["medium"] <= risk_thresholds["high"] <= 100:
        raise ValueError("Risk thresholds must satisfy 0 <= medium <= high <= 100")

    left = {key: preprocess_text(value) for key, value in build_project_fields(first).items()}
    right = {key: preprocess_text(value) for key, value in build_project_fields(second).items()}
    states = {
        field: (
            "excluded_both_missing"
            if not left[field] and not right[field]
            else "first_missing"
            if not left[field]
            else "second_missing"
            if not right[field]
            else "present"
        )
        for field in PROJECT_FIELDS
    }
    results: Dict[str, Any] = {}
    for key in ("tfidf", "bert_cross_encoder", "sentence_bert"):
        started = time.perf_counter()
        try:
            scores = {
                field: (
                    _tfidf(left[field], right[field])
                    if key == "tfidf"
                    else _semantic(key, left[field], right[field])
                )
                for field in PROJECT_FIELDS
            }
            overall = _weighted(scores, states, weights)
            results[key] = {
                "model_name": MODEL_NAMES[key],
                "model_version": MODEL_NAMES[key],
                "field_scores": scores,
                "overall_score": overall,
                "risk_level": _risk(overall, risk_thresholds),
                "processing_time_ms": round((time.perf_counter() - started) * 1000, 3),
                "model_loading_time_ms": round(registry.loading_times_ms.get(key, 0), 3),
                "fallback_used": False,
                "device": "model-default" if key != "tfidf" else "cpu",
                "available": True,
            }
        except Exception as exc:
            results[key] = {
                "model_name": MODEL_NAMES[key],
                "model_version": MODEL_NAMES[key],
                "field_scores": {},
                "overall_score": None,
                "risk_level": "Unavailable",
                "processing_time_ms": round((time.perf_counter() - started) * 1000, 3),
                "model_loading_time_ms": round(registry.loading_times_ms.get(key, 0), 3),
                "fallback_used": False,
                "device": "model-default",
                "available": False,
                "error": str(exc),
            }

    overall_scores = {
        key: value["overall_score"]
        for key, value in results.items()
        if value["overall_score"] is not None
    }
    values = list(overall_scores.values())
    max_difference = max(values) - min(values) if values else 0.0
    if len(values) < 2:
        category = "Insufficient Available Models"
    elif max_difference <= agreement_thresholds["strong"]:
        category = "Strong Agreement"
    elif max_difference <= agreement_thresholds["moderate"]:
        category = "Moderate Agreement"
    else:
        category = "Strong Disagreement"
    ordered = sorted(overall_scores, key=overall_scores.get)
    return {
        "models": results,
        "missing_fields": states,
        "field_weights": weights,
        "risk_thresholds": risk_thresholds,
        "agreement_thresholds": agreement_thresholds,
        "agreement": {
            "maximum_score_difference": round(max_difference, 4),
            "minimum_score_difference": round(
                min(abs(a - b) for index, a in enumerate(values) for b in values[index + 1:]), 4
            ) if len(values) > 1 else 0.0,
            "average_model_score": round(statistics.mean(values), 4),
            "standard_deviation": round(statistics.pstdev(values), 4),
            "category": category,
            "highest_scoring_model": ordered[-1],
            "lowest_scoring_model": ordered[0],
        },
        "compared_at": __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc
        ).isoformat(),
    }


def invalidate_project_embeddings(project_id: str) -> int:
    """Remove cached embeddings tagged by a caller-provided project key."""
    keys = [key for key in _embedding_cache if key[2] == project_id]
    for key in keys:
        del _embedding_cache[key]
    return len(keys)
