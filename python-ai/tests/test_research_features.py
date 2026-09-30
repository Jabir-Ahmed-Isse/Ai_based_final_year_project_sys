import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from project_similarity_service import compare_projects_multi_model
from research_config import validate_weights
from research_metrics import classification_metrics, optimal_thresholds, regression_metrics, statistical_tests, threshold_analysis
from ranking_metrics import evaluate_ranking


class ResearchFeatureTests(unittest.TestCase):
    def setUp(self):
        import model_registry
        model_registry.registry.errors["bert_cross_encoder"] = "test fallback"
        model_registry.registry.errors["sentence_bert"] = "test fallback"
        model_registry.registry.models["bert_cross_encoder"] = None
        model_registry.registry.models["sentence_bert"] = None

    def test_identical_six_fields_and_missing_handling(self):
        project = {
            "title": "AI Health System",
            "abstract": "Diagnosis support",
            "problemStatement": "Late diagnosis",
            "objectives": ["Improve diagnosis"],
            "features": ["Prediction"],
            "technologies": ["Python", "C++"],
        }
        result = compare_projects_multi_model(project, project)
        self.assertEqual(result["models"]["tfidf"]["overall_score"], 100)
        missing = compare_projects_multi_model({"title": "A"}, {"title": "A"})
        self.assertEqual(missing["missing_fields"]["description"], "excluded_both_missing")
        self.assertEqual(missing["models"]["tfidf"]["overall_score"], 100)

    def test_weight_validation(self):
        with self.assertRaises(ValueError):
            validate_weights({"title": 1.0})

    def test_classification_and_regression_metrics(self):
        metrics = classification_metrics([1, 1, 0, 0], [90, 80, 20, 10], 70)
        self.assertEqual(metrics["accuracy"], 1)
        self.assertEqual(metrics["macro_f1_score"], 1)
        self.assertEqual(metrics["weighted_f1_score"], 1)
        self.assertAlmostEqual(metrics["brier_score"], 0.025)
        self.assertEqual(metrics["confusion_matrix"]["true_positive"], 2)
        regression = regression_metrics([90, 50], [80, 60])
        self.assertEqual(regression["mean_absolute_error"], 10)
        thresholds = threshold_analysis([0, 1], [20, 80], [50, 70])
        self.assertEqual(len(thresholds), 2)
        self.assertEqual(optimal_thresholds(thresholds)["f1_optimal"]["threshold"], 50)
        tests = statistical_tests(
            [1, 1, 0, 0],
            {
                "tfidf": [90, 80, 20, 10],
                "sentence_bert": [90, 20, 80, 10],
                "bge_m3": [80, 75, 30, 25],
            },
            {"tfidf": 70, "sentence_bert": 70, "bge_m3": 70},
        )
        self.assertTrue(any(row["test_name"] == "McNemar exact test" for row in tests))
        self.assertTrue(any(row["test_name"] == "Friedman test" for row in tests))

    def test_supervisor_ranking_metrics(self):
        result = evaluate_ranking(["b", "a", "c"], {"a": 3, "b": 1, "c": 0})
        self.assertEqual(result["precision_at_1"], 1)
        self.assertGreater(result["ndcg_at_3"], 0)


if __name__ == "__main__":
    unittest.main()
