"""Canonical mapping of database/API project fields into six research fields."""
from __future__ import annotations

from typing import Any, Dict
from text_preprocessing import as_text


def build_project_fields(project: Dict[str, Any]) -> Dict[str, str]:
    return {
        "title": as_text(project.get("title")),
        "description": as_text(project.get("description") or project.get("abstract")),
        "problem_statement": as_text(
            project.get("problem_statement") or project.get("problemStatement")
        ),
        "research_objectives": as_text(
            project.get("research_objectives") or project.get("objectives")
        ),
        "features": as_text(project.get("features") or project.get("expectedOutputs")),
        "technologies_tools": as_text(
            project.get("technologies_tools")
            or project.get("technologiesAndTools")
            or project.get("technologies")
            or project.get("toolsOrMethods")
        ),
    }
