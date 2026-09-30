"""Extend the relevance-screened reference library to 210 sources.

The base builder contains 160 DOI-verified sources in seventeen domains.  This
wrapper adds five domains that are required by the revised experimental report:
statistical comparison, annotation reliability, reproducible ML, constrained
matching, and privacy/governance.  It deliberately reuses the base builder's
Crossref metadata, duplicate-DOI, title-relevance, and retraction/update checks.
"""

from __future__ import annotations

import build_curated_reference_library as base


EXTRA_CATEGORIES = (
    base.Category(
        "Statistical comparison and uncertainty in machine learning",
        10,
        (
            "paired statistical comparison machine learning classifiers bootstrap confidence interval",
            "McNemar Wilcoxon Friedman test machine learning model comparison",
        ),
        (
            "classifier comparison",
            "statistical comparison",
            "bootstrap confidence interval",
            "mcnemar",
            "wilcoxon",
            "friedman test",
            "effect size",
        ),
        (
            "clinical trial",
            "ecology only",
            "agricultural experiment",
            "genome-wide association",
        ),
        (
            "10.1162/089976698300017197",
            "10.1016/j.patcog.2012.01.011",
            "10.1007/s10994-006-2819-0",
        ),
    ),
    base.Category(
        "Human annotation and label reliability",
        10,
        (
            "human annotation reliability natural language processing inter annotator agreement",
            "data labeling quality consensus crowdsourcing NLP annotation",
        ),
        (
            "inter-annotator agreement",
            "annotation reliability",
            "data labeling",
            "label quality",
            "annotator disagreement",
            "human annotation",
        ),
        (
            "medical image segmentation only",
            "animal behavior",
            "radiology report only",
        ),
        (
            "10.1162/COLI_a_00227",
            "10.18653/v1/2021.acl-long.107",
            "10.1145/2675133.2675283",
        ),
    ),
    base.Category(
        "Reproducible machine learning and dataset documentation",
        10,
        (
            "reproducible machine learning reporting checklist dataset documentation model cards",
            "machine learning reproducibility benchmark documentation data statements",
        ),
        (
            "reproducibility",
            "reproducible machine learning",
            "model cards",
            "datasheets for datasets",
            "data statements",
            "reporting checklist",
            "dataset documentation",
        ),
        (
            "reproducible laboratory protocol",
            "wet lab",
            "chemical synthesis",
        ),
        (
            "10.1145/3287560.3287596",
            "10.1145/3458723",
            "10.18653/v1/Q18-1041",
            "10.1038/s42256-020-0186-1",
        ),
    ),
    base.Category(
        "Matching theory and constrained assignment optimization",
        10,
        (
            "stable matching assignment optimization capacity constraints students supervisors",
            "many to one matching allocation fairness capacity university assignment",
        ),
        (
            "stable matching",
            "assignment problem",
            "matching market",
            "capacity constraint",
            "many-to-one matching",
            "fair assignment",
            "allocation algorithm",
        ),
        (
            "vehicle routing",
            "warehouse picking",
            "radio resource allocation",
            "organ transplant only",
        ),
        (
            "10.2307/2312726",
            "10.1016/0022-0531(90)90028-5",
            "10.1007/978-3-662-43552-1",
        ),
    ),
    base.Category(
        "Educational data privacy and responsible AI governance",
        10,
        (
            "educational data privacy responsible artificial intelligence governance higher education",
            "student data privacy ethics learning analytics artificial intelligence education",
        ),
        (
            "educational data privacy",
            "student privacy",
            "responsible ai",
            "ai governance",
            "learning analytics ethics",
            "education data ethics",
            "human oversight",
        ),
        (
            "health insurance",
            "autonomous vehicle",
            "military",
            "facial recognition only",
        ),
        (
            "10.1080/17439884.2016.1222639",
            "10.1186/s41239-019-0171-0",
            "10.1016/j.caeai.2022.100076",
        ),
    ),
)


base.CATEGORIES = base.CATEGORIES + EXTRA_CATEGORIES


if __name__ == "__main__":
    base.main()
