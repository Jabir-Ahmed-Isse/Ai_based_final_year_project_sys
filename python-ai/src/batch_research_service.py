"""Batch research experiments for project pairs and supervisor rankings."""
from __future__ import annotations

import hashlib
import time
from itertools import combinations
from typing import Any, Dict, Iterable, List, Sequence, Tuple

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from model_registry import registry
from project_field_builder import build_project_fields
from research_config import DEFAULT_FIELD_WEIGHTS, MODEL_NAMES, PROJECT_FIELDS, validate_weights
from text_preprocessing import as_text, preprocess_text

EXPERIMENT_MODELS = ("tfidf", "sentence_bert", "bge_m3")
DEFAULT_BATCH_SIZE = 32
_batch_embedding_cache: Dict[Tuple[str, str], np.ndarray] = {}


def _clip(value: float) -> float:
    return round(max(0.0, min(100.0, float(value))), 4)


def _risk(score: float, thresholds: Dict[str, float]) -> str:
    if score >= thresholds["high"]:
        return "High Risk"
    if score >= thresholds["medium"]:
        return "Medium Risk"
    return "Low Risk"


def _tfidf_similarity_matrix(texts: Sequence[str], config: Dict[str, Any]) -> np.ndarray:
    if not any(texts):
        return np.zeros((len(texts), len(texts)))
    word = TfidfVectorizer(
        lowercase=True,
        ngram_range=(1, int(config.get("word_ngram_max", 2))),
        min_df=int(config.get("min_document_frequency", 1)),
        max_features=int(config.get("max_word_features", 30000)),
        norm="l2",
        token_pattern=r"(?u)\b[\w+#.-]+\b",
    ).fit_transform(texts)
    char = TfidfVectorizer(
        analyzer="char_wb",
        lowercase=True,
        ngram_range=(int(config.get("char_ngram_min", 3)), int(config.get("char_ngram_max", 5))),
        min_df=int(config.get("min_document_frequency", 1)),
        max_features=int(config.get("max_char_features", 30000)),
        norm="l2",
    ).fit_transform(texts)
    return (0.7 * cosine_similarity(word)) + (0.3 * cosine_similarity(char))


def _semantic_embeddings(model_key: str, texts: Sequence[str], batch_size: int) -> Tuple[np.ndarray, int]:
    model = registry.get(model_key)
    missing = [index for index, text in enumerate(texts) if (model_key, hashlib.sha256(text.encode()).hexdigest()) not in _batch_embedding_cache]
    if missing:
        new_texts = [texts[index] or " " for index in missing]
        vectors = np.asarray(model.encode(new_texts, batch_size=batch_size, normalize_embeddings=True), dtype=float)
        for index, vector in zip(missing, vectors):
            digest = hashlib.sha256(texts[index].encode()).hexdigest()
            _batch_embedding_cache[(model_key, digest)] = vector
    matrix = np.vstack([
        _batch_embedding_cache[(model_key, hashlib.sha256(text.encode()).hexdigest())]
        for text in texts
    ])
    return matrix, int(matrix.shape[1])


def _semantic_similarity_matrix(model_key: str, texts: Sequence[str], batch_size: int) -> Tuple[np.ndarray, int]:
    embeddings, dimension = _semantic_embeddings(model_key, texts, batch_size)
    return np.clip(embeddings @ embeddings.T, 0.0, 1.0), dimension


def run_project_pair_experiment(
    projects: List[Dict[str, Any]],
    configuration: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    configuration = configuration or {}
    weights = validate_weights(configuration.get("field_weights", DEFAULT_FIELD_WEIGHTS))
    thresholds = {"medium": 40.0, "high": 70.0, **configuration.get("risk_thresholds", {})}
    batch_size = int(configuration.get("batch_size", DEFAULT_BATCH_SIZE))
    models = tuple(configuration.get("models", EXPERIMENT_MODELS))
    if any(model not in EXPERIMENT_MODELS for model in models):
        raise ValueError("Supported experiment models are tfidf, sentence_bert, and bge_m3")
    project_fields = [
        {key: preprocess_text(value) for key, value in build_project_fields(project).items()}
        for project in projects
    ]
    combined = [" ".join(fields[field] for field in PROJECT_FIELDS if fields[field]) for fields in project_fields]
    pairs = list(combinations(range(len(projects)), 2))
    results: List[Dict[str, Any]] = []
    model_metadata: Dict[str, Any] = {}

    for model_key in models:
        started = time.perf_counter()
        field_matrices: Dict[str, np.ndarray] = {}
        dimension = 0
        for field in PROJECT_FIELDS:
            texts = [fields[field] for fields in project_fields]
            if model_key == "tfidf":
                field_matrices[field] = _tfidf_similarity_matrix(texts, configuration.get("tfidf", {}))
            else:
                field_matrices[field], dimension = _semantic_similarity_matrix(model_key, texts, batch_size)
        if model_key == "tfidf":
            combined_matrix = _tfidf_similarity_matrix(combined, configuration.get("tfidf", {}))
        else:
            combined_matrix, dimension = _semantic_similarity_matrix(model_key, combined, batch_size)
        elapsed_ms = (time.perf_counter() - started) * 1000
        per_pair_ms = elapsed_ms / max(1, len(pairs))

        for left, right in pairs:
            field_scores = {
                field: _clip(field_matrices[field][left, right] * 100)
                for field in PROJECT_FIELDS
            }
            active = [
                field for field in PROJECT_FIELDS
                if project_fields[left][field] or project_fields[right][field]
            ]
            denominator = sum(weights[field] for field in active)
            weighted = _clip(
                sum(field_scores[field] * weights[field] for field in active) / denominator
                if denominator else 0
            )
            results.append({
                "first_project_id": str(projects[left].get("_id") or projects[left].get("id")),
                "first_project_title": projects[left].get("title", ""),
                "second_project_id": str(projects[right].get("_id") or projects[right].get("id")),
                "second_project_title": projects[right].get("title", ""),
                "model_name": model_key,
                "model_version": MODEL_NAMES[model_key],
                "field_scores": field_scores,
                "weighted_overall_score": weighted,
                "unweighted_combined_score": _clip(combined_matrix[left, right] * 100),
                "risk_level": _risk(weighted, thresholds),
                "execution_time_ms": round(per_pair_ms, 4),
                "embedding_dimension": dimension or None,
                "device": "cpu" if model_key == "tfidf" else "model-default",
                "batch_size": batch_size if model_key != "tfidf" else None,
            })
        model_metadata[model_key] = {
            "model_name": MODEL_NAMES[model_key],
            "loading_time_ms": registry.loading_times_ms.get(model_key, 0.0),
            "total_execution_time_ms": round(elapsed_ms, 3),
            "embedding_dimension": dimension or None,
            "batch_size": batch_size if model_key != "tfidf" else None,
        }
    return {
        "project_count": len(projects),
        "unique_pair_count": len(pairs),
        "record_count": len(results),
        "field_weights": weights,
        "risk_thresholds": thresholds,
        "models": model_metadata,
        "records": results,
    }


def _supervisor_fields(supervisor: Dict[str, Any]) -> Dict[str, str]:
    return {
        "semantic": preprocess_text(" ".join([
            as_text(supervisor.get("researchInterests")),
            as_text(supervisor.get("areasOfExpertise") or supervisor.get("expertise")),
            as_text(supervisor.get("academicSpecialization")),
        ])),
        "technology": preprocess_text(supervisor.get("supervisorTechnologies")),
        "skills": preprocess_text(supervisor.get("skills")),
        "previous": preprocess_text(supervisor.get("previousSupervisedProjectTopics")),
        "publications": preprocess_text(supervisor.get("publicationKeywords")),
    }


def _cross_matrix(
    model_key: str,
    left: Sequence[str],
    right: Sequence[str],
    batch_size: int,
    tfidf_config: Dict[str, Any],
) -> Tuple[np.ndarray, int]:
    texts = list(left) + list(right)
    if model_key == "tfidf":
        matrix = _tfidf_similarity_matrix(texts, tfidf_config)
        return matrix[: len(left), len(left):], 0
    embeddings, dimension = _semantic_embeddings(model_key, texts, batch_size)
    return np.clip(embeddings[: len(left)] @ embeddings[len(left):].T, 0.0, 1.0), dimension


def compare_proposal_to_recorded_projects(
    proposal: Dict[str, Any],
    recorded_projects: List[Dict[str, Any]],
    configuration: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """Compare one unsaved proposal only with persisted research-dataset projects."""
    if not recorded_projects:
        raise ValueError("At least one recorded project is required")

    configuration = configuration or {}
    weights = validate_weights(configuration.get("field_weights", DEFAULT_FIELD_WEIGHTS))
    thresholds = {"medium": 40.0, "high": 70.0, **configuration.get("risk_thresholds", {})}
    batch_size = int(configuration.get("batch_size", DEFAULT_BATCH_SIZE))
    models = tuple(configuration.get("models", EXPERIMENT_MODELS))
    if any(model not in EXPERIMENT_MODELS for model in models):
        raise ValueError("Supported experiment models are tfidf, sentence_bert, and bge_m3")

    proposal_fields = {
        key: preprocess_text(value)
        for key, value in build_project_fields(proposal).items()
    }
    recorded_fields = [
        {
            key: preprocess_text(value)
            for key, value in build_project_fields(project).items()
        }
        for project in recorded_projects
    ]
    proposal_combined = " ".join(
        proposal_fields[field] for field in PROJECT_FIELDS if proposal_fields[field]
    )
    recorded_combined = [
        " ".join(fields[field] for field in PROJECT_FIELDS if fields[field])
        for fields in recorded_fields
    ]

    results: List[Dict[str, Any]] = []
    model_metadata: Dict[str, Any] = {}
    top_by_model: Dict[str, Any] = {}

    for model_key in models:
        started = time.perf_counter()
        field_matrices: Dict[str, np.ndarray] = {}
        dimension = 0
        for field in PROJECT_FIELDS:
            field_matrices[field], dimension = _cross_matrix(
                model_key,
                [proposal_fields[field]],
                [fields[field] for fields in recorded_fields],
                batch_size,
                configuration.get("tfidf", {}),
            )
        combined_matrix, combined_dimension = _cross_matrix(
            model_key,
            [proposal_combined],
            recorded_combined,
            batch_size,
            configuration.get("tfidf", {}),
        )
        dimension = dimension or combined_dimension
        elapsed_ms = (time.perf_counter() - started) * 1000
        per_candidate_ms = elapsed_ms / max(1, len(recorded_projects))
        model_rows: List[Dict[str, Any]] = []

        for index, recorded_project in enumerate(recorded_projects):
            field_scores = {
                field: _clip(field_matrices[field][0, index] * 100)
                for field in PROJECT_FIELDS
            }
            active = [
                field for field in PROJECT_FIELDS
                if proposal_fields[field] or recorded_fields[index][field]
            ]
            denominator = sum(weights[field] for field in active)
            weighted = _clip(
                sum(field_scores[field] * weights[field] for field in active) / denominator
                if denominator else 0
            )
            row = {
                "recorded_project_id": str(
                    recorded_project.get("_id") or recorded_project.get("id")
                ),
                "recorded_project_title": recorded_project.get("title", ""),
                "recorded_source_row": recorded_project.get("sourceRow"),
                "model_name": model_key,
                "model_version": MODEL_NAMES[model_key],
                "field_scores": field_scores,
                "weighted_overall_score": weighted,
                "unweighted_combined_score": _clip(combined_matrix[0, index] * 100),
                "risk_level": _risk(weighted, thresholds),
                "execution_time_ms": round(per_candidate_ms, 4),
                "embedding_dimension": dimension or None,
                "device": "cpu" if model_key == "tfidf" else "model-default",
                "batch_size": batch_size if model_key != "tfidf" else None,
            }
            model_rows.append(row)
            results.append(row)

        model_rows.sort(
            key=lambda row: row["weighted_overall_score"],
            reverse=True,
        )
        top_by_model[model_key] = model_rows[0]
        model_metadata[model_key] = {
            "model_name": MODEL_NAMES[model_key],
            "loading_time_ms": registry.loading_times_ms.get(model_key, 0.0),
            "total_execution_time_ms": round(elapsed_ms, 3),
            "embedding_dimension": dimension or None,
            "batch_size": batch_size if model_key != "tfidf" else None,
        }

    return {
        "recorded_project_count": len(recorded_projects),
        "record_count": len(results),
        "field_weights": weights,
        "risk_thresholds": thresholds,
        "models": model_metadata,
        "top_by_model": top_by_model,
        "records": results,
    }


def run_supervisor_matching_experiment(
    projects: List[Dict[str, Any]],
    supervisors: List[Dict[str, Any]],
    configuration: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    configuration = configuration or {}
    batch_size = int(configuration.get("batch_size", DEFAULT_BATCH_SIZE))
    models = tuple(configuration.get("models", EXPERIMENT_MODELS))
    project_profiles = [
        {key: preprocess_text(value) for key, value in build_project_fields(project).items()}
        for project in projects
    ]
    project_combined = [" ".join(profile.values()) for profile in project_profiles]
    project_tech = [" ".join([profile["features"], profile["technologies_tools"]]) for profile in project_profiles]
    project_skills = [" ".join([profile["problem_statement"], profile["research_objectives"]]) for profile in project_profiles]
    supervisor_profiles = [_supervisor_fields(supervisor) for supervisor in supervisors]
    results: List[Dict[str, Any]] = []
    model_metadata: Dict[str, Any] = {}

    for model_key in models:
        started = time.perf_counter()
        semantic, dimension = _cross_matrix(model_key, project_combined, [p["semantic"] for p in supervisor_profiles], batch_size, configuration.get("tfidf", {}))
        technology, _ = _cross_matrix(model_key, project_tech, [p["technology"] for p in supervisor_profiles], batch_size, configuration.get("tfidf", {}))
        skills, _ = _cross_matrix(model_key, project_skills, [p["skills"] for p in supervisor_profiles], batch_size, configuration.get("tfidf", {}))
        previous, _ = _cross_matrix(model_key, project_combined, [p["previous"] for p in supervisor_profiles], batch_size, configuration.get("tfidf", {}))
        publications, _ = _cross_matrix(model_key, project_combined, [p["publications"] for p in supervisor_profiles], batch_size, configuration.get("tfidf", {}))
        elapsed_ms = (time.perf_counter() - started) * 1000
        model_rows = []
        for project_index, project in enumerate(projects):
            for supervisor_index, supervisor in enumerate(supervisors):
                maximum = max(1, int(supervisor.get("maxProjects") or 1))
                workload = max(0, int(supervisor.get("currentProjects") or 0))
                availability = _clip(max(0, maximum - workload) / maximum * 100)
                semantic_score = _clip(semantic[project_index, supervisor_index] * 100)
                technology_score = _clip(technology[project_index, supervisor_index] * 100)
                skills_score = _clip(skills[project_index, supervisor_index] * 100)
                previous_score = _clip(previous[project_index, supervisor_index] * 100)
                publication_score = _clip(publications[project_index, supervisor_index] * 100)
                pure = _clip(
                    semantic_score * 0.80
                    + ((technology_score + skills_score) / 2) * 0.10
                    + ((previous_score + publication_score) / 2) * 0.05
                    + availability * 0.05
                )
                eligible = workload < maximum and bool(supervisor.get("availableForAssignment", True))
                adjusted = pure if eligible else 0.0
                model_rows.append({
                    "project_id": str(project.get("_id") or project.get("id")),
                    "supervisor_id": str(supervisor.get("_id") or supervisor.get("id")),
                    "model_name": model_key,
                    "model_version": MODEL_NAMES[model_key],
                    "semantic_expertise_score": semantic_score,
                    "technology_score": technology_score,
                    "skills_score": skills_score,
                    "previous_project_score": previous_score,
                    "publication_keyword_score": publication_score,
                    "workload_availability_score": availability,
                    "pure_semantic_score": pure,
                    "final_adjusted_score": adjusted,
                    "eligible": eligible,
                    "execution_time_ms": round(elapsed_ms / max(1, len(projects) * len(supervisors)), 4),
                    "embedding_dimension": dimension or None,
                })
        for project in projects:
            project_id = str(project.get("_id") or project.get("id"))
            project_rows = [row for row in model_rows if row["project_id"] == project_id]
            semantic_order = sorted(project_rows, key=lambda row: row["pure_semantic_score"], reverse=True)
            adjusted_order = sorted(project_rows, key=lambda row: row["final_adjusted_score"], reverse=True)
            semantic_ranks = {row["supervisor_id"]: rank + 1 for rank, row in enumerate(semantic_order)}
            adjusted_ranks = {row["supervisor_id"]: rank + 1 for rank, row in enumerate(adjusted_order)}
            for row in project_rows:
                row["semantic_rank"] = semantic_ranks[row["supervisor_id"]]
                row["adjusted_rank"] = adjusted_ranks[row["supervisor_id"]]
                row["explanation"] = (
                    f"Structured expertise {row['semantic_expertise_score']:.2f}%; "
                    f"technology {row['technology_score']:.2f}%; skills {row['skills_score']:.2f}%; "
                    f"availability {row['workload_availability_score']:.2f}%."
                )
        results.extend(model_rows)
        model_metadata[model_key] = {
            "model_name": MODEL_NAMES[model_key],
            "total_execution_time_ms": round(elapsed_ms, 3),
            "embedding_dimension": dimension or None,
        }
    return {
        "project_count": len(projects),
        "supervisor_count": len(supervisors),
        "record_count": len(results),
        "models": model_metadata,
        "records": results,
    }
