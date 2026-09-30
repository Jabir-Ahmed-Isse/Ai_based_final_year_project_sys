"""Lazy, process-wide model registry. Large models are loaded at most once."""
from __future__ import annotations

import logging
import threading
import time
from typing import Any, Dict

from research_config import MODEL_NAMES

LOGGER = logging.getLogger(__name__)


class ModelRegistry:
    def __init__(self) -> None:
        self.models: Dict[str, Any] = {}
        self.loading_times_ms: Dict[str, float] = {"tfidf": 0.0}
        self.errors: Dict[str, str] = {}
        self._locks: Dict[str, threading.Lock] = {}

    def get(self, key: str) -> Any:
        if key in self.models:
            return self.models[key]
        lock = self._locks.setdefault(key, threading.Lock())
        with lock:
            if key in self.models:
                return self.models[key]
            if key in self.errors:
                raise RuntimeError(f"{key} failed to load: {self.errors[key]}")
            started = time.perf_counter()
            try:
                from sentence_transformers import CrossEncoder, SentenceTransformer

                if key == "bert_cross_encoder":
                    model = CrossEncoder(MODEL_NAMES[key])
                elif key in ("sentence_bert", "bge_m3"):
                    model = SentenceTransformer(MODEL_NAMES[key])
                else:
                    raise KeyError(key)
                self.models[key] = model
                return model
            except Exception as exc:
                self.errors[key] = str(exc)
                LOGGER.exception("Unable to load %s", key)
                raise RuntimeError(f"{key} failed to load: {exc}") from exc
            finally:
                self.loading_times_ms[key] = (time.perf_counter() - started) * 1000

    def status(self) -> Dict[str, Dict[str, Any]]:
        return {
            key: {
                "model_name": MODEL_NAMES[key],
                "loaded": key in self.models,
                "loading_time_ms": round(self.loading_times_ms.get(key, 0.0), 3),
                "error": self.errors.get(key),
            }
            for key in ("bert_cross_encoder", "sentence_bert", "bge_m3")
        }

    def warm_up(self, keys: tuple[str, ...] = ("bert_cross_encoder", "sentence_bert")) -> None:
        """Load production research models once in a background startup thread."""
        for key in keys:
            try:
                self.get(key)
                LOGGER.info("Research model ready: %s", key)
            except RuntimeError:
                # The error is retained and exposed by the model-status endpoint.
                pass


registry = ModelRegistry()
