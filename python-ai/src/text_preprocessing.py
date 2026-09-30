"""Conservative preprocessing that retains technical tokens."""
from __future__ import annotations

import re
from typing import Any


def as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple, set)):
        return " ".join(str(item) for item in value if item is not None)
    return str(value)


def preprocess_text(value: Any) -> str:
    text = as_text(value).lower()
    text = re.sub(r"[^\w+#.\-/\s]", " ", text, flags=re.UNICODE)
    return re.sub(r"\s+", " ", text).strip()
