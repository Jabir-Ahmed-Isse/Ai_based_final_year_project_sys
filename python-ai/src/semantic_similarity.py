import os
import re
from typing import Any, Callable, Dict, List, Optional

import numpy as np


MODEL_NAME = os.environ.get(
    "SENTENCE_TRANSFORMER_MODEL",
    "sentence-transformers/all-MiniLM-L6-v2",
)

_sentence_model = None
_embedding_provider_for_testing: Optional[Callable[[str], List[float]]] = None


def preprocess_text(text: str = "") -> str:
    """Normalize text consistently without removing meaningful technical words."""
    text = str(text).lower()
    text = text.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")
    text = re.sub(r"[^a-z0-9+#.\s-]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _as_list(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value]
    return [str(value)]


def build_combined_text(title: str = "", description: str = "", features: Any = None) -> str:
    return preprocess_text(" ".join([title or "", description or "", *_as_list(features)]))


def get_sentence_model():
    global _sentence_model
    if _sentence_model is None:
        from sentence_transformers import SentenceTransformer

        _sentence_model = SentenceTransformer(MODEL_NAME)
    return _sentence_model


def set_embedding_provider_for_testing(provider: Optional[Callable[[str], List[float]]]) -> None:
    global _embedding_provider_for_testing
    _embedding_provider_for_testing = provider


def normalize_vector(vector: Any) -> np.ndarray:
    values = np.asarray(vector, dtype=float)
    norm = np.linalg.norm(values)
    if norm == 0:
        return values
    return values / norm


def generate_embedding(text: str) -> np.ndarray:
    normalized = preprocess_text(text)
    if _embedding_provider_for_testing is not None:
        return normalize_vector(_embedding_provider_for_testing(normalized))

    model = get_sentence_model()
    return normalize_vector(model.encode(normalized))


def cosine_similarity(query_embedding: np.ndarray, stored_embedding: np.ndarray) -> float:
    if query_embedding.size == 0 or stored_embedding.size == 0:
        return 0.0
    if query_embedding.shape != stored_embedding.shape:
        return 0.0

    query_norm = np.linalg.norm(query_embedding)
    stored_norm = np.linalg.norm(stored_embedding)
    if query_norm == 0 or stored_norm == 0:
        return 0.0

    return float(np.dot(query_embedding, stored_embedding) / (query_norm * stored_norm))


def similarity_percentage(raw_cosine: float) -> float:
    return max(0.0, min(100.0, raw_cosine * 100.0))


def similarity_label(percentage: float) -> str:
    if percentage >= 85:
        return "Very high similarity"
    if percentage >= 70:
        return "High similarity"
    if percentage >= 40:
        return "Moderate similarity"
    return "Low similarity"


def compare_texts(
    submitted_text: str,
    stored_text: str,
    *,
    project_id: Optional[str] = None,
    debug: bool = False,
) -> Dict[str, Any]:
    submitted_combined = preprocess_text(submitted_text)
    stored_combined = preprocess_text(stored_text)
    submitted_embedding = generate_embedding(submitted_combined)
    stored_embedding = generate_embedding(stored_combined)
    raw_cosine = cosine_similarity(submitted_embedding, stored_embedding)
    percentage = similarity_percentage(raw_cosine)

    if debug:
        print("[similarity] Project ID being compared:", project_id or "unsaved")
        print("[similarity] Submitted combined text:", submitted_combined)
        print("[similarity] Stored project combined text:", stored_combined)
        print("[similarity] Submitted embedding dimensions:", int(submitted_embedding.shape[0]))
        print("[similarity] Stored embedding dimensions:", int(stored_embedding.shape[0]))
        print("[similarity] Submitted embedding first five:", submitted_embedding[:5].tolist())
        print("[similarity] Stored embedding first five:", stored_embedding[:5].tolist())
        print("[similarity] Raw cosine similarity:", raw_cosine)
        print("[similarity] Final percentage:", percentage)

    return {
        "status": "success",
        "model": MODEL_NAME,
        "project_id": project_id,
        "raw_cosine_similarity": raw_cosine,
        "similarity_score": raw_cosine,
        "similarity_percentage": percentage,
        "displayed_percentage": round(percentage, 2),
        "similarity_label": similarity_label(percentage),
        "embedding_dimensions": int(submitted_embedding.shape[0]),
        "submitted_combined_text": submitted_combined,
        "stored_combined_text": stored_combined,
        "submitted_embedding_preview": submitted_embedding[:5].tolist(),
        "stored_embedding_preview": stored_embedding[:5].tolist(),
    }


def compare_projects(
    submitted: Dict[str, Any],
    stored: Dict[str, Any],
    *,
    debug: bool = False,
) -> Dict[str, Any]:
    submitted_text = build_combined_text(
        submitted.get("title", ""),
        submitted.get("description") or submitted.get("abstract", ""),
        submitted.get("features", []),
    )
    stored_text = build_combined_text(
        stored.get("title", ""),
        stored.get("description") or stored.get("abstract", ""),
        stored.get("features", []),
    )
    return compare_texts(
        submitted_text,
        stored_text,
        project_id=stored.get("id") or stored.get("_id") or stored.get("projectId"),
        debug=debug,
    )
