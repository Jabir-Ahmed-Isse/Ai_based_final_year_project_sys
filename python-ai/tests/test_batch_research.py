import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
from openpyxl import Workbook

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "scripts")))

from batch_research_service import (
    _risk,
    compare_proposal_to_recorded_projects,
    run_project_pair_experiment,
    run_supervisor_matching_experiment,
)
from clean_research_dataset import HEADERS, WORKSHEET, clean_workbook
from generate_synthetic_benchmark import build_records, validate


class FakeEmbeddingModel:
    def encode(self, texts, batch_size=32, normalize_embeddings=True):
        vectors = []
        for text in texts:
            lowered = text.casefold()
            vector = np.array([
                lowered.count("health") + lowered.count("hospital"),
                lowered.count("network") + lowered.count("security"),
                lowered.count("react") + lowered.count("web"),
                max(1, len(lowered.split()) / 10),
            ], dtype=float)
            if normalize_embeddings:
                vector = vector / max(np.linalg.norm(vector), 1e-12)
            vectors.append(vector)
        return np.vstack(vectors)


PROJECTS = [
    {"_id": "p1", "title": "Hospital Health System", "abstract": "Hospital health records", "problemStatement": "slow health records", "objectives": ["improve hospital care"], "features": ["patient records"], "technologies": ["React"]},
    {"_id": "p2", "title": "Health Clinic Platform", "abstract": "Clinic health records", "problemStatement": "lost health files", "objectives": ["improve clinic care"], "features": ["patient files"], "technologies": ["React"]},
    {"_id": "p3", "title": "Network Security Monitor", "abstract": "Detect network attacks", "problemStatement": "network threats", "objectives": ["secure network"], "features": ["alerts"], "technologies": ["Python"]},
]

SUPERVISORS = [
    {"_id": "s1", "areasOfExpertise": ["health informatics"], "academicSpecialization": "Health Informatics", "skills": ["patient systems"], "supervisorTechnologies": ["React"], "previousSupervisedProjectTopics": ["hospital records"], "publicationKeywords": ["digital health"], "maxProjects": 3, "currentProjects": 0, "availableForAssignment": True},
    {"_id": "s2", "areasOfExpertise": ["network security"], "academicSpecialization": "Cybersecurity", "skills": ["intrusion detection"], "supervisorTechnologies": ["Python"], "previousSupervisedProjectTopics": ["network monitoring"], "publicationKeywords": ["security"], "maxProjects": 1, "currentProjects": 1, "availableForAssignment": True},
]


class BatchResearchTests(unittest.TestCase):
    def test_excel_cleaning_removes_duplicates_and_excludes_notes(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "dataset.xlsx"
            workbook = Workbook()
            sheet = workbook.active
            sheet.title = WORKSHEET
            sheet.append(HEADERS)
            sheet.append([1, "  Health   System ", "A\r\nsystem", "Problem", "Objectives", "Features", "Python"])
            sheet.append([2, "health system", "Duplicate", "Problem", "Objectives", "Features", "Python"])
            notes = workbook.create_sheet("Notes")
            notes.append(["must", "not import"])
            workbook.save(path)
            result = clean_workbook(path)
            self.assertEqual(len(result["projects"]), 1)
            self.assertEqual(len(result["duplicates"]), 1)
            self.assertTrue(result["notesExcluded"])
            self.assertEqual(result["projects"][0]["title"], "Health System")

    def test_all_unique_pairs_and_all_three_model_code_paths(self):
        fake = FakeEmbeddingModel()
        with patch("batch_research_service.registry.get", return_value=fake):
            result = run_project_pair_experiment(PROJECTS, {"models": ["tfidf", "sentence_bert", "bge_m3"]})
        self.assertEqual(result["unique_pair_count"], 3)
        self.assertEqual(result["record_count"], 9)
        pairs = {(row["model_name"], row["first_project_id"], row["second_project_id"]) for row in result["records"]}
        self.assertEqual(len(pairs), 9)
        self.assertTrue(all(left != right for _, left, right in pairs))
        self.assertTrue(all(0 <= row["weighted_overall_score"] <= 100 for row in result["records"]))

    def test_proposal_comparison_uses_only_recorded_projects_and_all_models(self):
        fake = FakeEmbeddingModel()
        with patch("batch_research_service.registry.get", return_value=fake):
            result = compare_proposal_to_recorded_projects(
                PROJECTS[0],
                PROJECTS[1:],
                {"models": ["tfidf", "sentence_bert", "bge_m3"]},
            )
        self.assertEqual(result["recorded_project_count"], 2)
        self.assertEqual(result["record_count"], 6)
        self.assertEqual(set(result["top_by_model"]), {"tfidf", "sentence_bert", "bge_m3"})
        self.assertTrue(all(row["recorded_project_id"] in {"p2", "p3"} for row in result["records"]))
        self.assertTrue(all(0 <= row["weighted_overall_score"] <= 100 for row in result["records"]))

    def test_risk_boundaries(self):
        thresholds = {"medium": 40, "high": 70}
        self.assertEqual(_risk(39.999, thresholds), "Low Risk")
        self.assertEqual(_risk(40, thresholds), "Medium Risk")
        self.assertEqual(_risk(70, thresholds), "High Risk")

    def test_supervisor_capacity_is_enforced(self):
        fake = FakeEmbeddingModel()
        with patch("batch_research_service.registry.get", return_value=fake):
            result = run_supervisor_matching_experiment(PROJECTS[:2], SUPERVISORS, {"models": ["tfidf", "sentence_bert", "bge_m3"]})
        self.assertEqual(result["record_count"], 12)
        full_rows = [row for row in result["records"] if row["supervisor_id"] == "s2"]
        self.assertTrue(full_rows)
        self.assertTrue(all(not row["eligible"] and row["final_adjusted_score"] == 0 for row in full_rows))

    def test_synthetic_benchmark_is_balanced_and_grouped(self):
        projects = []
        for index in range(78):
            projects.append({
                "_id": f"project-{index}",
                "title": f"Project {index}",
                "description": f"Description topic {index}",
                "problemStatement": f"Problem {index}",
                "objectives": f"Objective {index}",
                "features": f"Feature {index}",
                "technologiesAndTools": "Python React" if index % 2 else "Java MongoDB",
            })
        manifest = validate(build_records(projects))
        self.assertEqual(manifest["recordCount"], 600)
        self.assertEqual(manifest["classCounts"], {"0": 200, "1": 200, "2": 200})
        self.assertFalse(manifest["projectLevelLeakage"])


if __name__ == "__main__":
    unittest.main()
