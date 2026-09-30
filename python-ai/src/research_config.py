"""Central, validated configuration for research model comparisons."""
from __future__ import annotations

import os
from typing import Dict

PROJECT_FIELDS = (
    "title",
    "description",
    "problem_statement",
    "research_objectives",
    "features",
    "technologies_tools",
)

DEFAULT_FIELD_WEIGHTS: Dict[str, float] = {
    "title": 0.20,
    "description": 0.20,
    "problem_statement": 0.20,
    "research_objectives": 0.15,
    "features": 0.15,
    "technologies_tools": 0.10,
}

DEFAULT_RISK_THRESHOLDS = {"medium": 40.0, "high": 70.0}
DEFAULT_AGREEMENT_THRESHOLDS = {"strong": 5.0, "moderate": 15.0}
DEFAULT_CLASSIFICATION_THRESHOLDS = {
    "tfidf": 70.0,
    "bert_cross_encoder": 70.0,
    "sentence_bert": 70.0,
}
DEFAULT_THRESHOLD_EXPERIMENTS = (50.0, 55.0, 60.0, 65.0, 70.0, 75.0, 80.0)
DEFAULT_SIGNIFICANCE_LEVEL = float(os.getenv("RESEARCH_SIGNIFICANCE_LEVEL", "0.05"))

MODEL_NAMES = {
    "tfidf": "scikit-learn/TfidfVectorizer",
    "bert_cross_encoder": os.getenv(
        "BERT_CROSS_ENCODER_MODEL", "cross-encoder/stsb-roberta-base"
    ),
    "sentence_bert": os.getenv(
        "SENTENCE_TRANSFORMER_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    ),
    "bge_m3": os.getenv("BGE_M3_MODEL", "BAAI/bge-m3"),
}


def validate_weights(weights: Dict[str, float]) -> Dict[str, float]:
    """Validate a complete six-field weight map whose sum is exactly one."""
    missing = set(PROJECT_FIELDS) - set(weights)
    extra = set(weights) - set(PROJECT_FIELDS)
    if missing or extra:
        raise ValueError(f"Invalid field weights; missing={sorted(missing)}, extra={sorted(extra)}")
    normalized = {key: float(value) for key, value in weights.items()}
    if any(value < 0 for value in normalized.values()):
        raise ValueError("Field weights cannot be negative")
    if abs(sum(normalized.values()) - 1.0) > 1e-6:
        raise ValueError("Field weights must total 100%")
    return normalized
