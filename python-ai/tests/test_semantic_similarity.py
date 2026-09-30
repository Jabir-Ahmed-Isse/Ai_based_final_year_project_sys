import os
import sys
import unittest


sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src")))

from semantic_similarity import compare_texts, set_embedding_provider_for_testing


ORIGINAL = (
    "A web-based system that helps universities manage graduation project submissions and "
    "prevent duplicate project ideas. Students submit proposals, the system checks them "
    "against previous projects using AI, supervisors review and approve them, and "
    "administrators manage users and assignments."
)

PARAPHRASE = (
    "A university platform that coordinates final-year project proposals and evaluates "
    "whether new ideas resemble previously approved work. Learners upload proposals, "
    "automated semantic analysis performs the comparison, academic supervisors provide "
    "feedback and approval, and administrators control accounts and project allocation."
)

SAME_DOMAIN = (
    "A university system for scheduling project presentations, assigning examination "
    "panels, reserving rooms, and recording defense marks."
)

UNRELATED = (
    "An online food delivery platform that allows customers to order meals, track "
    "drivers, and pay restaurants electronically."
)


CONCEPT_GROUPS = [
    ["university", "universities", "academic", "students", "learners", "system"],
    ["graduation", "project", "projects", "proposal", "proposals", "academic", "supervisors", "administrators", "presentations", "examination", "defense", "marks"],
    ["graduation", "final-year", "final", "project", "projects", "proposal", "proposals"],
    ["submission", "submissions", "submit", "upload", "coordinates"],
    ["duplicate", "resemble", "previous", "approved", "ideas", "comparison", "checks"],
    ["ai", "semantic", "analysis", "automated", "evaluates"],
    ["supervisors", "supervisor", "feedback", "review", "approve", "approval"],
    ["administrators", "admin", "accounts", "users", "assignments", "assigning", "allocation", "control"],
    ["scheduling", "presentations", "examination", "panels", "rooms", "defense", "marks"],
    ["food", "delivery", "customers", "meals", "drivers", "restaurants", "order"],
]


def deterministic_embedding(text):
    return [
        sum(1 for token in group if token in text)
        for group in CONCEPT_GROUPS
    ]


class SemanticSimilarityTests(unittest.TestCase):
    def setUp(self):
        set_embedding_provider_for_testing(deterministic_embedding)

    def tearDown(self):
        set_embedding_provider_for_testing(None)

    def test_exact_copy_is_very_high(self):
        result = compare_texts(ORIGINAL, ORIGINAL)
        self.assertEqual(result["similarity_label"], "Very high similarity")
        self.assertGreaterEqual(result["displayed_percentage"], 99)

    def test_strong_paraphrase_is_high(self):
        result = compare_texts(PARAPHRASE, ORIGINAL)
        self.assertIn(result["similarity_label"], ["High similarity", "Very high similarity"])
        self.assertGreaterEqual(result["displayed_percentage"], 70)

    def test_same_domain_different_purpose_is_moderate(self):
        result = compare_texts(SAME_DOMAIN, ORIGINAL)
        self.assertEqual(result["similarity_label"], "Moderate similarity")
        self.assertGreaterEqual(result["displayed_percentage"], 40)
        self.assertLess(result["displayed_percentage"], 70)

    def test_unrelated_project_is_low(self):
        result = compare_texts(UNRELATED, ORIGINAL)
        self.assertEqual(result["similarity_label"], "Low similarity")
        self.assertLess(result["displayed_percentage"], 40)


if __name__ == "__main__":
    unittest.main()
