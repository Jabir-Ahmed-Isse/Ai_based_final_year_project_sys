"""Generate publication-quality charts supported by the currently available labels."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

MODEL_ORDER = ["tfidf", "sentence_bert", "bge_m3"]
MODEL_LABELS = {"tfidf": "TF-IDF", "sentence_bert": "Sentence-BERT", "bge_m3": "BGE-M3"}
COLORS = {"tfidf": "#0072B2", "sentence_bert": "#009E73", "bge_m3": "#D55E00"}
FIELD_LABELS = {
    "titleScore": "Title",
    "descriptionScore": "Description",
    "problemStatementScore": "Problem statement",
    "researchObjectivesScore": "Research objectives",
    "featuresScore": "Features",
    "technologiesAndToolsScore": "Technologies and tools",
}


def save_figure(fig: plt.Figure, output_dir: Path, number: int, slug: str, title: str, caption: str, manifest: list[dict]) -> None:
    stem = f"figure-{number:02d}-{slug}"
    fig.savefig(output_dir / f"{stem}.png", dpi=300, bbox_inches="tight", facecolor="white")
    fig.savefig(output_dir / f"{stem}.svg", bbox_inches="tight", facecolor="white")
    fig.savefig(output_dir / f"{stem}.pdf", bbox_inches="tight", facecolor="white")
    plt.close(fig)
    manifest.append({"figure": number, "title": title, "caption": caption, "files": [f"{stem}.png", f"{stem}.svg", f"{stem}.pdf"]})


def bootstrap_mean_ci(values: np.ndarray, seed: int = 42, resamples: int = 2000) -> tuple[float, float, float]:
    values = values[np.isfinite(values)]
    if not len(values):
        return 0.0, 0.0, 0.0
    random = np.random.default_rng(seed)
    means = np.array([random.choice(values, len(values), replace=True).mean() for _ in range(resamples)])
    return float(values.mean()), float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))


def build_charts(raw_dir: Path, output_dir: Path) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    sns.set_theme(style="whitegrid", context="notebook")
    pair_scores = pd.read_csv(raw_dir / "project-pair-scores.csv")
    supervisor_scores = pd.read_csv(raw_dir / "supervisor-matching-scores.csv")
    supervisors = pd.read_csv(raw_dir / "supervisor-profiles.csv")
    assignments_path = raw_dir / "balanced-assignments.csv"
    assignments = pd.read_csv(assignments_path) if assignments_path.exists() and assignments_path.stat().st_size > 10 else pd.DataFrame()
    present_models = [model for model in MODEL_ORDER if model in set(pair_scores["model"])]
    manifest: list[dict] = []

    title = "Similarity score distribution by model"
    fig, ax = plt.subplots(figsize=(10, 6))
    for model in present_models:
        values = pair_scores.loc[pair_scores["model"] == model, "weightedOverallScore"]
        ax.hist(values, bins=25, alpha=0.5, label=MODEL_LABELS[model], color=COLORS[model])
    ax.set(title=title, xlabel="Weighted similarity score (%)", ylabel="Number of unique project pairs")
    ax.legend(title="Model")
    save_figure(fig, output_dir, 1, "similarity-distribution", title, "Distribution of measured weighted scores across all 3,003 recorded project pairs per completed model.", manifest)

    title = "Box plots of project-pair similarity"
    fig, ax = plt.subplots(figsize=(9, 6))
    sns.boxplot(data=pair_scores, x="model", y="weightedOverallScore", order=present_models, palette=[COLORS[m] for m in present_models], ax=ax)
    ax.set(title=title, xlabel="Model", ylabel="Weighted similarity score (%)")
    ax.set_xticklabels([MODEL_LABELS[m] for m in present_models])
    save_figure(fig, output_dir, 2, "similarity-boxplots", title, "Median, interquartile range and outliers of unlabelled similarity scores.", manifest)

    title = "Violin plots of project-pair similarity"
    fig, ax = plt.subplots(figsize=(9, 6))
    sns.violinplot(data=pair_scores, x="model", y="weightedOverallScore", order=present_models, palette=[COLORS[m] for m in present_models], inner="quartile", cut=0, ax=ax)
    ax.set(title=title, xlabel="Model", ylabel="Weighted similarity score (%)")
    ax.set_xticklabels([MODEL_LABELS[m] for m in present_models])
    save_figure(fig, output_dir, 3, "similarity-violins", title, "Kernel-density view of the unlabelled score distributions; quartile lines are shown inside each violin.", manifest)

    title = "Pairwise model-score correlation"
    pivot = pair_scores.assign(pairKey=pair_scores["firstProjectId"].astype(str) + ":" + pair_scores["secondProjectId"].astype(str)).pivot_table(index="pairKey", columns="model", values="weightedOverallScore")
    correlation = pivot[present_models].corr(method="spearman")
    fig, ax = plt.subplots(figsize=(7, 6))
    sns.heatmap(correlation, annot=True, fmt=".3f", vmin=-1, vmax=1, cmap="vlag", square=True, ax=ax)
    ax.set_title(title)
    ax.set_xticklabels([MODEL_LABELS[m] for m in present_models], rotation=20)
    ax.set_yticklabels([MODEL_LABELS[m] for m in present_models], rotation=0)
    save_figure(fig, output_dir, 4, "model-correlation", title, "Spearman correlation of scores for the same recorded project pairs.", manifest)

    title = "Model inference-time comparison"
    fig, ax = plt.subplots(figsize=(9, 6))
    sns.barplot(data=pair_scores, x="model", y="executionTimeMs", order=present_models, palette=[COLORS[m] for m in present_models], errorbar=("ci", 95), ax=ax)
    ax.set(title=title, xlabel="Model", ylabel="Average execution time per pair (ms)")
    ax.set_xticklabels([MODEL_LABELS[m] for m in present_models])
    save_figure(fig, output_dir, 5, "latency", title, "Mean stored execution time per pair with 95% confidence intervals.", manifest)

    title = "Average field-level similarity by model"
    field_means = pair_scores.groupby("model")[list(FIELD_LABELS)].mean().loc[present_models]
    fig, ax = plt.subplots(figsize=(12, 6))
    field_means.T.plot(kind="bar", ax=ax, color=[COLORS[m] for m in present_models])
    ax.set(title=title, xlabel="Project field", ylabel="Average field similarity (%)")
    ax.set_xticklabels([FIELD_LABELS[field] for field in field_means.columns], rotation=25, ha="right")
    ax.legend([MODEL_LABELS[m] for m in present_models], title="Model")
    save_figure(fig, output_dir, 6, "field-similarity", title, "Descriptive field-level means; these are not field importance estimates or ablation results.", manifest)

    title = "Similarity-risk distribution"
    risk = pair_scores.groupby(["model", "riskLevel"]).size().unstack(fill_value=0).reindex(present_models)
    risk = risk.reindex(columns=["Low Risk", "Medium Risk", "High Risk"], fill_value=0)
    fig, ax = plt.subplots(figsize=(10, 6))
    risk.plot(kind="bar", stacked=True, color=["#56B4E9", "#E69F00", "#D55E00"], ax=ax)
    ax.set(title=title, xlabel="Model", ylabel="Number of recorded project pairs")
    ax.set_xticklabels([MODEL_LABELS[m] for m in present_models], rotation=0)
    ax.legend(title="Configured risk category")
    save_figure(fig, output_dir, 7, "risk-distribution", title, "Counts under the configured 0-39, 40-69 and 70-100 descriptive risk thresholds.", manifest)

    preferred_model = "bge_m3" if "bge_m3" in set(supervisor_scores["model"]) else present_models[-1]
    heat = supervisor_scores[supervisor_scores["model"] == preferred_model].pivot_table(index="projectTitle", columns="supervisorCode", values="finalAdjustedScore")
    fig, ax = plt.subplots(figsize=(15, 18))
    sns.heatmap(heat, cmap="viridis", vmin=0, vmax=100, cbar_kws={"label": "Adjusted match (%)"}, ax=ax)
    ax.set(title=f"Project-to-supervisor match heatmap ({MODEL_LABELS[preferred_model]})", xlabel="Supervisor", ylabel="Recorded project")
    ax.tick_params(axis="y", labelsize=5)
    save_figure(fig, output_dir, 8, "supervisor-heatmap", "Project-to-supervisor match heatmap", f"All 78 x 20 measured adjusted scores for {MODEL_LABELS[preferred_model]}; no relevance labels are implied.", manifest)

    title = "Model ranking stability for supervisors"
    rank_pivot = supervisor_scores.assign(key=supervisor_scores["projectId"].astype(str) + ":" + supervisor_scores["supervisorId"].astype(str)).pivot_table(index="key", columns="model", values="adjustedRank")
    rank_models = [model for model in MODEL_ORDER if model in rank_pivot]
    fig, ax = plt.subplots(figsize=(7, 6))
    sns.heatmap(rank_pivot[rank_models].corr(method="spearman"), annot=True, fmt=".3f", vmin=-1, vmax=1, cmap="vlag", square=True, ax=ax)
    ax.set_title(title)
    ax.set_xticklabels([MODEL_LABELS[m] for m in rank_models], rotation=20)
    ax.set_yticklabels([MODEL_LABELS[m] for m in rank_models], rotation=0)
    save_figure(fig, output_dir, 9, "ranking-stability", title, "Spearman correlation of supervisor ranks for the same project-supervisor candidates.", manifest)

    title = "Strongest per-pair model disagreements"
    disagreement = pivot[present_models].dropna().assign(disagreement=lambda frame: frame.max(axis=1) - frame.min(axis=1)).nlargest(30, "disagreement")
    fig, ax = plt.subplots(figsize=(12, 7))
    ax.barh(range(len(disagreement)), disagreement["disagreement"], color="#CC79A7")
    ax.set_yticks(range(len(disagreement)), [key[-17:] for key in disagreement.index], fontsize=7)
    ax.invert_yaxis()
    ax.set(title=title, xlabel="Maximum score difference (percentage points)", ylabel="Project-pair identifier")
    save_figure(fig, output_dir, 10, "model-disagreement", title, "The 30 recorded pairs with the largest score spread among completed models.", manifest)

    title = "Mean similarity with bootstrap confidence intervals"
    ci_rows = [bootstrap_mean_ci(pair_scores.loc[pair_scores["model"] == model, "weightedOverallScore"].to_numpy(dtype=float), 42 + index) for index, model in enumerate(present_models)]
    means = [row[0] for row in ci_rows]
    lower = [row[0] - row[1] for row in ci_rows]
    upper = [row[2] - row[0] for row in ci_rows]
    fig, ax = plt.subplots(figsize=(9, 6))
    ax.errorbar([MODEL_LABELS[m] for m in present_models], means, yerr=[lower, upper], fmt="o", capsize=6, color="#0072B2")
    ax.set(title=title, xlabel="Model", ylabel="Mean weighted similarity score (%)")
    save_figure(fig, output_dir, 11, "score-confidence-intervals", title, "Nonparametric 95% bootstrap confidence intervals for descriptive mean scores; not model-accuracy intervals.", manifest)

    if not assignments.empty:
        workload = assignments.groupby(["assignedSupervisorCode", "maximumCapacity"], as_index=False).size().rename(columns={"size": "assigned"})
        supervisors_indexed = supervisors.set_index("supervisorCode")
        codes = supervisors["supervisorCode"].tolist()
        after = workload.set_index("assignedSupervisorCode")["assigned"].reindex(codes, fill_value=0)
        capacity = supervisors_indexed["maximumCapacity"].reindex(codes)

        title = "Supervisor workload before balancing"
        fig, ax = plt.subplots(figsize=(12, 6))
        ax.bar(codes, np.zeros(len(codes)), color="#56B4E9")
        ax.set(title=title, xlabel="Supervisor", ylabel="Assigned research projects")
        ax.tick_params(axis="x", rotation=45)
        save_figure(fig, output_dir, 12, "workload-before", title, "All synthetic supervisors started the experiment with zero assigned research projects.", manifest)

        title = "Supervisor workload after balancing"
        fig, ax = plt.subplots(figsize=(12, 6))
        ax.bar(codes, after, color="#009E73", label="Assigned")
        ax.plot(codes, capacity, color="#D55E00", marker="o", label="Maximum capacity")
        ax.set(title=title, xlabel="Supervisor", ylabel="Number of projects")
        ax.tick_params(axis="x", rotation=45)
        ax.legend()
        save_figure(fig, output_dir, 13, "workload-after", title, "Provisional ensemble assignments compared with each test supervisor's configured capacity.", manifest)

        title = "Supervisor capacity utilization"
        utilization = (after / capacity * 100).fillna(0)
        fig, ax = plt.subplots(figsize=(12, 6))
        ax.bar(codes, utilization, color="#0072B2")
        ax.axhline(100, color="#D55E00", linestyle="--", label="Capacity limit")
        ax.set(title=title, xlabel="Supervisor", ylabel="Capacity utilized (%)", ylim=(0, max(110, utilization.max() + 10)))
        ax.tick_params(axis="x", rotation=45)
        ax.legend()
        save_figure(fig, output_dir, 14, "capacity-utilization", title, "Assigned projects divided by configured maximum supervision capacity.", manifest)

    omitted = [
        "Confusion matrices", "normalized confusion matrices", "ROC curves", "precision-recall curves",
        "threshold-versus-F1", "threshold-versus-precision/recall", "classification metric bars",
        "macro/weighted-F1", "accuracy-versus-time", "F1-versus-memory", "field-weight ablation",
        "performance by domain", "human-versus-model scatter", "prediction-error distribution",
        "calibration curves", "Top-1/Top-3 supervisor evaluation", "MRR/MAP/NDCG",
        "statistical significance of prediction errors", "error-analysis charts"
    ]
    result = {
        "generatedAt": pd.Timestamp.utcnow().isoformat(),
        "figures": manifest,
        "omittedUntilHumanGroundTruth": omitted,
        "groundTruthWarning": "No human-validated labels were available. Label-dependent figures were intentionally not fabricated."
    }
    (output_dir / "chart-manifest.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    result = build_charts(args.raw_dir, args.output_dir)
    print(json.dumps({"figuresGenerated": len(result["figures"]), "omitted": len(result["omittedUntilHumanGroundTruth"])}))


if __name__ == "__main__":
    main()
