"""Supervisor-ranking metrics with graded expert relevance."""
from __future__ import annotations

import math
from typing import Dict, List


def evaluate_ranking(predicted_ids: List[str], relevance: Dict[str, int]) -> Dict[str, float]:
    relevant = {key for key, value in relevance.items() if value > 0}
    def precision_at(k: int) -> float:
        top = predicted_ids[:k]
        return sum(item in relevant for item in top) / k if k else 0.0
    def recall_at(k: int) -> float:
        return sum(item in relevant for item in predicted_ids[:k]) / len(relevant) if relevant else 0.0
    reciprocal = next((1 / (index + 1) for index, item in enumerate(predicted_ids) if item in relevant), 0.0)
    def ndcg(k: int) -> float:
        gains = [relevance.get(item, 0) for item in predicted_ids[:k]]
        dcg = sum((2**gain - 1) / math.log2(index + 2) for index, gain in enumerate(gains))
        ideal = sorted(relevance.values(), reverse=True)[:k]
        idcg = sum((2**gain - 1) / math.log2(index + 2) for index, gain in enumerate(ideal))
        return dcg / idcg if idcg else 0.0
    precisions = []
    hits = 0
    for index, item in enumerate(predicted_ids):
        if item in relevant:
            hits += 1
            precisions.append(hits / (index + 1))
    return {
        "precision_at_1": precision_at(1),
        "precision_at_3": precision_at(3),
        "precision_at_5": precision_at(5),
        "recall_at_3": recall_at(3),
        "recall_at_5": recall_at(5),
        "mean_reciprocal_rank": reciprocal,
        "mean_average_precision": sum(precisions) / len(relevant) if relevant else 0.0,
        "ndcg_at_3": ndcg(3),
        "ndcg_at_5": ndcg(5),
        "top_1_accuracy": float(bool(predicted_ids and relevance.get(predicted_ids[0], 0) > 0)),
        "top_3_accuracy": float(any(relevance.get(item, 0) > 0 for item in predicted_ids[:3])),
    }
