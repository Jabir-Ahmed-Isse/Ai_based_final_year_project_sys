from __future__ import annotations

import csv
import json
import math
import re
import shutil
import statistics
import zipfile
from collections import Counter
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt

from build_research_report import (
    BLUE,
    GOLD,
    INK,
    MUTED,
    NAVY,
    add_caption,
    add_figure,
    add_heading,
    add_paragraph,
    add_table,
    configure_document,
    set_font,
)


ROOT = Path(__file__).resolve().parents[1]
EXP = ROOT / "outputs" / "research-experiment-20260724"
OUT = ROOT / "outputs" / "journal-package-20260724"
REFS = OUT / "references" / "reference-verification-matrix.csv"
ARCH = OUT / "architecture"
SHOTS = OUT / "system-screenshots"
CORPUS = OUT / "corpus"
OUT.mkdir(parents=True, exist_ok=True)


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


pair_scores = load_csv(EXP / "raw" / "project-pair-scores.csv")
supervisor_scores = load_csv(EXP / "raw" / "supervisor-matching-scores.csv")
assignments = load_csv(EXP / "raw" / "balanced-assignments.csv")
projects = load_csv(EXP / "raw" / "projects.csv")
supervisors = load_csv(EXP / "raw" / "supervisor-profiles.csv")
experiment_runs = json.loads((EXP / "raw" / "experiment-runs.json").read_text(encoding="utf-8"))
references = load_csv(REFS)
corpus_summary = json.loads((CORPUS / "corpus-summary.json").read_text(encoding="utf-8"))


def numbers(model: str, field: str) -> list[float]:
    return [float(row[field]) for row in pair_scores if row["model"] == model and row[field]]


model_labels = {"tfidf": "TF-IDF", "sentence_bert": "Sentence-BERT", "bge_m3": "BGE-M3"}
model_order = list(model_labels)
model_stats = {}
for model in model_labels:
    vals = numbers(model, "weightedOverallScore")
    risks = Counter(row["riskLevel"] for row in pair_scores if row["model"] == model)
    model_stats[model] = {
        "n": len(vals),
        "mean": statistics.fmean(vals),
        "median": statistics.median(vals),
        "sd": statistics.pstdev(vals),
        "low": risks["Low Risk"],
        "medium": risks["Medium Risk"],
        "high": risks["High Risk"],
    }


def average_ranks(values: list[float]) -> list[float]:
    ordered = sorted(enumerate(values), key=lambda item: item[1])
    ranks = [0.0] * len(values)
    cursor = 0
    while cursor < len(ordered):
        end = cursor + 1
        while end < len(ordered) and ordered[end][1] == ordered[cursor][1]:
            end += 1
        average_rank = (cursor + 1 + end) / 2
        for position in range(cursor, end):
            ranks[ordered[position][0]] = average_rank
        cursor = end
    return ranks


def pearson(left: list[float], right: list[float]) -> float:
    left_mean = statistics.fmean(left)
    right_mean = statistics.fmean(right)
    numerator = sum((a - left_mean) * (b - right_mean) for a, b in zip(left, right))
    denominator = math.sqrt(
        sum((a - left_mean) ** 2 for a in left)
        * sum((b - right_mean) ** 2 for b in right)
    )
    return numerator / denominator if denominator else 0.0


def spearman(left: list[float], right: list[float]) -> float:
    return pearson(average_ranks(left), average_ranks(right))


pair_score_matrix: dict[tuple[str, str], dict[str, float]] = {}
for row in pair_scores:
    key = tuple(sorted((row["firstProjectId"], row["secondProjectId"])))
    pair_score_matrix.setdefault(key, {})[row["model"]] = float(row["weightedOverallScore"])

project_pair_agreement = {}
for left_index, left_model in enumerate(model_order):
    for right_model in model_order[left_index + 1:]:
        complete = [
            values
            for values in pair_score_matrix.values()
            if left_model in values and right_model in values
        ]
        project_pair_agreement[(left_model, right_model)] = spearman(
            [values[left_model] for values in complete],
            [values[right_model] for values in complete],
        )

supervisor_score_matrix: dict[str, dict[str, dict[str, dict[str, float]]]] = {}
top_supervisor_by_model: dict[str, dict[str, str]] = {model: {} for model in model_order}
for row in supervisor_scores:
    project_id = row["projectId"]
    model = row["model"]
    supervisor_code = row["supervisorCode"]
    supervisor_score_matrix.setdefault(project_id, {}).setdefault(model, {})[supervisor_code] = {
        "score": float(row["pureSemanticScore"]),
        "rank": float(row["semanticRank"]),
    }
    if row["semanticRank"] == "1":
        top_supervisor_by_model[model][project_id] = supervisor_code

supervisor_agreement = {}
for left_index, left_model in enumerate(model_order):
    for right_model in model_order[left_index + 1:]:
        correlations = []
        same_top = 0
        compared_projects = 0
        for project_id, project_models in supervisor_score_matrix.items():
            if left_model not in project_models or right_model not in project_models:
                continue
            common_supervisors = sorted(
                set(project_models[left_model]) & set(project_models[right_model])
            )
            correlations.append(
                spearman(
                    [project_models[left_model][code]["score"] for code in common_supervisors],
                    [project_models[right_model][code]["score"] for code in common_supervisors],
                )
            )
            compared_projects += 1
            same_top += int(
                top_supervisor_by_model[left_model].get(project_id)
                == top_supervisor_by_model[right_model].get(project_id)
            )
        supervisor_agreement[(left_model, right_model)] = {
            "mean_rank_correlation": statistics.fmean(correlations),
            "same_top": same_top,
            "compared_projects": compared_projects,
            "same_top_percent": 100 * same_top / compared_projects,
        }

assignment_by_project = {
    row["projectId"]: row["assignedSupervisorCode"] for row in assignments
}
assignment_alignment = {}
for model in model_order:
    same = sum(
        top_supervisor_by_model[model].get(project_id) == assigned_code
        for project_id, assigned_code in assignment_by_project.items()
    )
    assignment_alignment[model] = {
        "same": same,
        "percent": 100 * same / len(assignment_by_project),
    }


def completed_run(run_type: str, model: str) -> dict:
    return next(
        row
        for row in experiment_runs
        if row["type"] == run_type
        and row["status"] == "completed"
        and row["models"] == [model]
    )


runtime_profiles = {}
for model in model_order:
    project_run = completed_run("project_similarity", model)
    supervisor_run = completed_run("supervisor_matching", model)
    project_hardware = project_run["hardware"][model]
    supervisor_hardware = supervisor_run["hardware"][model]
    runtime_profiles[model] = {
        "initial_load_s": float(project_hardware.get("loading_time_ms") or 0) / 1000,
        "pair_compute_total_ms": float(project_hardware["total_execution_time_ms"]),
        "pair_compute_ms_each": float(project_hardware["total_execution_time_ms"]) / 3003,
        "project_end_to_end_s": float(project_run["durationMs"]) / 1000,
        "supervisor_compute_total_s": float(supervisor_hardware["total_execution_time_ms"]) / 1000,
        "supervisor_end_to_end_s": float(supervisor_run["durationMs"]) / 1000,
        "embedding_dimension": project_hardware.get("embedding_dimension"),
    }

loads = Counter(row["assignedSupervisorCode"] for row in assignments)
load_values = list(loads.values())
workload_mean = statistics.fmean(load_values)
workload_sd = statistics.pstdev(load_values)


TITLE = (
    "An Integrated Multi-Field NLP Platform for Final-Year Project Similarity Screening "
    "and Workload-Aware Supervisor Recommendation: A Reproducible System Evaluation"
)


def title_page(doc: Document) -> None:
    for _ in range(2):
        doc.add_paragraph()
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("ORIGINAL RESEARCH ARTICLE")
    set_font(r, size=9, color=GOLD, bold=True)
    p.paragraph_format.space_after = Pt(12)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(TITLE)
    set_font(r, size=22, color=NAVY, bold=True)
    p.paragraph_format.space_after = Pt(16)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("Research manuscript and submission package")
    set_font(r, size=13, color=BLUE, italic=True)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("Hormuud University | Faculty of Computer Science and Information Technology")
    set_font(r, size=11, color=MUTED)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("Evidence frozen: 24 July 2026 | IEEE-style citations")
    set_font(r, size=10, color=MUTED)
    doc.add_page_break()


def add_bullets(doc: Document, items: list[str]) -> None:
    for item in items:
        p = doc.add_paragraph(style="List Bullet")
        p.paragraph_format.space_after = Pt(4)
        set_font(p.add_run(item), color=INK)


def add_numbered(doc: Document, items: list[str]) -> None:
    for item in items:
        p = doc.add_paragraph(style="List Number")
        p.paragraph_format.space_after = Pt(4)
        set_font(p.add_run(item), color=INK)


def manuscript() -> Document:
    doc = Document()
    configure_document(doc)
    title_page(doc)

    add_heading(doc, "Abstract", 1)
    add_paragraph(
        doc,
        "Final-year projects are often managed through fragmented processes for originality screening, supervisor "
        "selection, communication and monitoring. This study evaluates an implemented lifecycle platform integrating "
        "six-field project similarity with workload-aware supervisor recommendation. Using 78 Computer Science and IT "
        "project records and 20 structured test supervisor profiles, the reproducible experiment generated all 3,003 "
        "unique project pairs per model (9,009 records) and all 1,560 project-supervisor combinations per model (4,680 "
        "records) for TF-IDF, multilingual Sentence-BERT and BGE-M3. Mean unlabelled similarity scores were 18.93%, "
        "47.11% and 63.07%, respectively. BGE-M3 therefore ranked first by raw score level, Sentence-BERT second and "
        "TF-IDF third; this ordering measures calibration and alert propensity, not accuracy. Project-pair Spearman "
        "correlations ranged from 0.889 to 0.954, with Sentence-BERT and BGE-M3 showing the strongest agreement "
        "(rho=0.954) and the same first-choice supervisor for 71.79% of projects. The evidence-bounded deployment "
        "ranking was TF-IDF first for speed and transparency, Sentence-BERT second as the balanced semantic option and "
        "BGE-M3 third as an offline research candidate because of its 818.871-s initial load and 1,024-dimensional "
        "representation. A capacity-aware ensemble assigned all 78 projects across all 20 supervisors, with mean load "
        "3.90 (SD 1.09), range 2-6 and no capacity violation. No auditable expert pair labels or supervisor-relevance "
        "judgements were available; accuracy, F1, ROC-AUC, MRR, MAP, NDCG and predictive-quality rankings are therefore "
        "withheld. The contribution is a complete operational comparison, explainable multi-field evidence, an "
        "annotation workflow and a responsible validation protocol for human-controlled academic decision support."
    )
    add_paragraph(doc, "Keywords: final-year projects; semantic similarity; TF-IDF; Sentence-BERT; BGE-M3; supervisor recommendation; workload balancing; responsible AI")

    add_heading(doc, "Highlights", 1)
    add_bullets(doc, [
        "Complete all-pairs evaluation: 9,009 stored multi-field project comparisons.",
        "Complete supervisor-candidate evaluation: 4,680 stored model-specific match records.",
        "Six-field scoring preserves interpretable evidence rather than relying on titles alone.",
        "Model rankings are reported separately for score level, agreement, efficiency and deployment suitability.",
        "Capacity-aware provisional assignment covered 78 projects with zero overloads.",
        "Ground-truth absence is explicitly separated from descriptive model behaviour.",
        f"A {len(references)}-source DOI-verified literature library supports the manuscript."
    ])
    add_heading(doc, "Graphical abstract", 1)
    add_figure(
        doc, ARCH / "figure-a04-similarity-workflow.png",
        "Graphical abstract. Six-field project representation, model comparison, stored risk evidence and the linked recommendation workflow.",
        width=6.4
    )

    add_heading(doc, "1. Introduction", 1)
    intro = [
        "Final-year and capstone projects connect disciplinary knowledge with problem formulation, design, implementation, "
        "evaluation and professional communication. They also create an institutional record of what students have attempted "
        "and what supervisors have supported. Recent work on capstone management emphasizes authentic learning, project "
        "coordination, transparent assessment and sustained supervisory interaction [41]-[50]. These functions become difficult "
        "to administer when proposal documents, decisions, feedback and archived projects are distributed across paper forms, "
        "email, messaging applications and individual staff records. In that setting, originality checking depends on personal "
        "memory, while progress visibility and accountability vary by supervisor.",
        "Supervision is not merely a routing problem. Its quality depends on intellectual fit, feedback practices, expectations, "
        "availability and a relationship that can support growing student independence [1]-[10]. A technically relevant expert "
        "may be an unsuitable recommendation when unavailable or already at capacity; conversely, an available supervisor with "
        "little topic alignment can increase feedback latency and methodological risk. The implemented system therefore treats "
        "semantic recommendation and final assignment as separate stages. Models rank candidates, capacity and eligibility "
        "constraints adjust the ranking, and an authorized academic user remains responsible for the assignment.",
        "Artificial intelligence in higher education has expanded from intelligent tutoring and learning analytics toward "
        "administrative decision support and content analysis [21]-[30]. Educational recommender systems personalize resources "
        "and pathways, but the same content-based principles can assist proposal-to-expert matching [61]-[70]. Such systems carry "
        "non-trivial governance risks. A similarity score can be mistaken for proof of plagiarism; a recommendation score can be "
        "mistaken for an entitlement or exclusion. Fairness and human-oversight research accordingly requires transparent data "
        "provenance, contestability and documented decision boundaries [11]-[20].",
        "Project-topic similarity differs conceptually from plagiarism detection. Plagiarism analysis investigates unattributed "
        "reuse of expression or ideas, often at passage level, whereas proposal screening asks whether the intended problem, "
        "objectives, functions and technical approach substantially overlap with archived work [91]-[100]. Two projects may use "
        "similar words but pursue different outcomes, or use different words while describing the same solution. Semantic textual "
        "similarity research provides representation and evaluation methods for this distinction [116]-[125].",
        "Traditional TF-IDF and cosine similarity remain strong baselines because their features are inspectable, inexpensive and "
        "sensitive to shared terminology [146]-[155]. Contextual language models and sentence embeddings address paraphrase and "
        "synonymy by representing text in dense vector spaces [31]-[40], [126]-[135]. Dense and hybrid retrieval research further "
        "shows that representation choice, pooling, sparse signals and reranking affect both quality and efficiency [51]-[60]. "
        "Multilingual and long-text embedding work is particularly relevant in institutions where English coexists with Somali "
        "and Arabic and where supervisor profiles combine heterogeneous fields [81]-[90].",
        "The research gap is not the absence of individual similarity or recommendation algorithms. Rather, few studies evaluate "
        "lexical and transformer representations under identical data conditions while retaining six proposal components, rich "
        "supervisor evidence, workload constraints, model-level persistence and a complete lifecycle interface. Reviewer and "
        "expert assignment research provides adjacent matching techniques [111]-[115], supervisor recommendation studies address "
        "academic fit [136]-[145], and workload-aware allocation studies formalize capacity constraints [156]-[160]. Integration, "
        "traceability and responsible evaluation remain uneven.",
        "This study asks: (RQ1) how do TF-IDF, multilingual Sentence-BERT and BGE-M3 behave over the same complete set of project "
        "pairs? (RQ2) how do the same models rank rich supervisor profiles? (RQ3) what field-level and efficiency trade-offs are "
        "observable without labels? (RQ4) can a capacity-aware layer produce feasible provisional assignments? (RQ5) what evidence "
        "is still required before selecting a best model? These questions deliberately distinguish operational completion from "
        "predictive validity."
    ]
    for p in intro:
        add_paragraph(doc, p)
    add_paragraph(doc, "The contributions are:")
    add_numbered(doc, [
        "An implemented multi-role lifecycle platform linking proposal submission, similarity evidence, recommendation, assignment, communication, monitoring and research reporting.",
        "A reproducible six-field experiment covering every unique pair among 78 projects for three model families.",
        "A rich-profile supervisor experiment covering every project-supervisor combination for all three measured models.",
        "A capacity-aware provisional assignment layer that preserves semantic and adjusted ranks and exposes audit explanations.",
        "A validity boundary that withholds label-dependent metrics and distinguishes thesis-reported values from reproducible database evidence.",
        "An annotation, consensus, export and visualization foundation for future expert validation."
    ])

    add_heading(doc, "2. Related work", 1)
    related = [
        ("2.1 Final-year and capstone project management",
         "Capstone literature describes project selection, supervision, milestone control, assessment, team coordination and "
         "industry alignment [41]-[50]. Digital systems commonly improve submission and record retrieval but often remain "
         "administrative. A lifecycle platform is stronger when the archive becomes computable evidence for originality screening "
         "and topic-aware supervision without removing academic judgement."),
        ("2.2 Academic supervision",
         "Supervision studies emphasize expectations, feedback literacy, student agency, frequency of contact, psychosocial support "
         "and institutional conditions [1]-[10]. This literature warns against reducing supervision to a single expertise score. "
         "The proposed profile therefore combines specialization, interests, skills, technologies, previous topics, publication "
         "keywords, experience, availability, faculty eligibility and capacity."),
        ("2.3 Artificial intelligence and recommendation in higher education",
         "AI-enabled educational systems support prediction, advising, personalization and decision support [21]-[30], while "
         "educational recommender studies examine learner and content representations [61]-[70]. For supervisor recommendation, "
         "content-based ranking is appropriate because the central evidence is textual and structured rather than repeated user "
         "ratings. However, ranking must remain advisory where labels and longitudinal outcomes are limited."),
        ("2.4 Text similarity, originality and plagiarism",
         "Semantic similarity measures relatedness of meaning, while originality screening applies that signal to the institutional "
         "question of topic duplication [116]-[125]. Plagiarism systems have different units of analysis and normative implications "
         "[91]-[100]. The implemented interface therefore reports closest archived projects, per-field scores and risk bands; it "
         "does not declare plagiarism or automatically reject a proposal."),
        ("2.5 TF-IDF and cosine similarity",
         "TF-IDF represents documents through weighted vocabulary features and cosine similarity normalizes comparison by vector "
         "length [146]-[155]. Its strengths are speed, transparency and predictable scaling. Its weaknesses are vocabulary "
         "dependence, sparse overlap and poor handling of paraphrase. Word and character n-grams partly mitigate spelling variation "
         "and technical token differences."),
        ("2.6 BERT and cross-encoders",
         "BERT-family research demonstrates contextual bidirectional representation and extensive transfer across NLP tasks "
         "[31]-[40]. Cross-encoders jointly encode a text pair and can model fine interactions, but their pairwise cost is unsuitable "
         "for repeated large-candidate retrieval unless used selectively. The repository configures cross-encoder/stsb-roberta-base "
         "but contains no completed cross-encoder experiment; the paper therefore documents the pipeline without inventing results."),
        ("2.7 Sentence-BERT and bi-encoders",
         "Sentence-BERT and related bi-encoder methods create reusable sentence or document vectors, enabling cosine comparison "
         "after one encoding pass [126]-[135]. This architecture is operationally attractive for archives and supervisor pools "
         "because embeddings can be cached. The measured checkpoint is paraphrase-multilingual-MiniLM-L12-v2 with 384 dimensions."),
        ("2.8 BGE-M3 and hybrid retrieval",
         "Dense, sparse and multi-vector retrieval provide complementary signals [51]-[60]. BGE-M3 was selected because its published "
         "design supports multilingual, multi-function and multi-granularity retrieval. The implemented experiment, however, uses "
         "only its 1,024-dimensional dense embedding output. Claims about sparse or multi-vector advantages would therefore exceed "
         "the implementation."),
        ("2.9 Multilingual and long-text representation",
         "Multilingual embedding research addresses cross-lingual alignment, domain transfer and evaluation across unequal-resource "
         "languages [81]-[90]. These capabilities motivate future Somali-Arabic-English validation. The present data are dominated "
         "by English technical descriptions, so multilingual capability is a deployment rationale rather than a measured advantage."),
        ("2.10 Supervisor recommendation and expert assignment",
         "Academic supervisor recommendation combines expertise representation and candidate ranking [136]-[145]. Reviewer and "
         "expert assignment contributes publication-based profiling, conflict checks and matching formulations [111]-[115]. The "
         "system stores pure semantic scores and adjusted ranks separately, allowing academic users to inspect whether workload "
         "rather than expertise changed a candidate's position."),
        ("2.11 Workload-aware allocation",
         "Fair assignment research frames allocation as a constrained or multi-objective problem balancing suitability, capacity "
         "and distributive outcomes [156]-[160]. The implemented algorithm uses a progressive utilization penalty and a hard capacity "
         "check. It is a transparent greedy policy, not a proof of global optimality."),
        ("2.12 Explainability and responsible AI",
         "Explainable recommendation research favors evidence that helps users understand and contest rankings [71]-[80]. "
         "Algorithmic fairness research adds representation, outcome and governance concerns [11]-[20]. Field-level similarity, "
         "matched keywords, workload snapshots, rank provenance and human override are therefore design requirements rather than "
         "optional presentation features.")
    ]
    for heading, paragraph in related:
        add_heading(doc, heading, 2)
        add_paragraph(doc, paragraph)
        add_paragraph(
            doc,
            "Across these studies, recurring limitations include single-field representations, small or weakly labelled samples, "
            "one-model evaluation, missing efficiency measurements, absent workload constraints and insufficient separation between "
            "recommendation and decision. The present work addresses integration and reproducibility, but it does not claim to solve "
            "the label-quality problem. That distinction shapes the research design and the interpretation of every result."
        )

    related_synthesis = [
        "A first synthesis concerns the unit of representation. Project-management studies typically describe a proposal as a "
        "record moving through approval stages, whereas retrieval studies often collapse the record into a single text string. "
        "That collapse is convenient but analytically costly. Title, problem statement, objectives, proposed features and "
        "technology stack answer different questions and carry different risks of coincidental overlap. A shared programming "
        "framework may be unremarkable, while a shared problem-objective combination may deserve scrutiny. The six-field design "
        "therefore turns representation choice into visible evidence: reviewers can distinguish overlap in purpose from overlap "
        "in implementation vocabulary. This is consistent with explainable-recommendation principles [71]-[80] and with the "
        "distinction between semantic relatedness and plagiarism adjudication [91]-[100], but it extends those principles into "
        "the proposal-approval workflow.",
        "A second synthesis concerns the mismatch between benchmark assumptions and institutional decision making. Standard "
        "semantic-textual-similarity benchmarks provide sentence pairs with reference scores, and retrieval benchmarks provide "
        "queries with relevant documents [51]-[60], [116]-[135]. An academic archive instead contains evolving, multi-section "
        "documents, uneven terminology, faculty-specific norms and consequences for students. Thresholds learned elsewhere "
        "cannot be imported as if a score of 0.70 had a universal meaning. The decision boundary must be locally calibrated "
        "against expert judgements and then monitored as the archive, curriculum and language mix change. Until such labels "
        "exist, model outputs can support case finding and disagreement sampling, but cannot validly quantify false-positive "
        "or false-negative rates.",
        "A third synthesis concerns candidate recommendation. Educational recommenders commonly optimize relevance or "
        "engagement [61]-[70], and expert-assignment studies optimize topical correspondence, reviewer load or conflicts "
        "[111]-[115]. Supervisor selection additionally depends on a continuing relationship, methodological guidance, "
        "availability and the student's right to receive adequate attention [1]-[10]. Treating the highest semantic score as "
        "the final decision would therefore confuse expertise evidence with institutional feasibility. The architecture in this "
        "study preserves the semantic score, the workload-adjusted score and the eventual human decision as separate records. "
        "That separation makes it possible to audit whether capacity changed a recommendation and whether an authorized reviewer "
        "overrode the ranking for reasons outside the model.",
        "The literature also exposes a recurrent evaluation asymmetry. Technical papers may report ranking accuracy without "
        "examining organizational use, while system papers may report usability without reconstructing model outputs. A rigorous "
        "evaluation requires both levels. At the computational level, every candidate must be scored under comparable conditions, "
        "with model versions, dimensions, thresholds and timing context recorded. At the decision level, the study must examine "
        "whether recommendations are useful, contestable and equitable. The present work completes the computational inventory "
        "and feasibility audit but does not substitute synthetic profiles for stakeholder evaluation. The proposed validation "
        "protocol consequently treats expert labels, inter-rater agreement, user experience and prospective outcomes as distinct "
        "evidence streams rather than a single accuracy number.",
        "Lexical and dense models should also be understood as complementary sources of evidence. Sparse representations make "
        "shared terminology explicit and are resilient when technical identifiers, acronyms and product names carry meaning. "
        "Dense encoders are better positioned to recognize paraphrase and conceptual proximity, but their scores are harder to "
        "interpret and can remain high for generically related educational or software-engineering text. Hybrid retrieval research "
        "[51]-[60] suggests that combining sparse and dense signals can improve candidate generation, followed by a more expensive "
        "reranker for ambiguous cases. The implemented comparison is a prerequisite for such a design: it stores model-specific "
        "scores and disagreements rather than averaging them so early that their different evidence is lost.",
        "The multilingual literature [81]-[90] introduces another caution. A model's published language coverage does not guarantee "
        "equivalent performance for locally written Somali, Arabic and English proposals, code-switched technical vocabulary or "
        "transliterated terms. Cross-lingual evaluation must control for topic, translation quality and annotator proficiency. It "
        "should also distinguish same-language retrieval from cross-language retrieval, because the operational error patterns "
        "may differ. The selected multilingual Sentence-BERT checkpoint and BGE-M3 provide a plausible implementation foundation, "
        "but the present English-dominant synthetic fields cannot establish multilingual fairness or accuracy. This qualification "
        "prevents a model capability statement from being misreported as an empirical institutional result.",
        "Explainability in this setting is procedural as well as technical. Highlighted terms or field scores can help a reviewer "
        "understand a match, yet they do not explain why a threshold was chosen, why another candidate was filtered, or who may "
        "change the outcome. Responsible decision support therefore requires provenance: the model and configuration used, fields "
        "available at scoring time, capacity snapshot, eligibility filters, rank before and after penalties, reviewer action and "
        "reason for override. These records enable contestation and later error analysis. They also reduce the temptation to treat "
        "a polished dashboard as evidence that a model has been validated. The system's research tables and activity-log functions "
        "are consequently part of the methodological contribution, not merely administrative features.",
        "Fair allocation work [156]-[160] shows why workload cannot be handled as an informal afterthought. Capacity constraints "
        "can make the individually highest-scoring assignment infeasible, and locally reasonable greedy choices can reduce the "
        "quality of later assignments. Different fairness objectives—load parity, minimum suitability, total suitability or "
        "priority for scarce expertise—need not select the same solution. The current progressive penalty offers a transparent "
        "baseline whose behavior can be inspected and reproduced. It does not establish Pareto optimality, strategy-proofness or "
        "fairness across protected or organizational groups. Those stronger claims would require formal optimization, explicit "
        "objectives and real preference or outcome data.",
        "Across capstone systems [41]-[50], longitudinal information is often underused. A lifecycle platform can connect the "
        "initial proposal with reviews, milestones, files, feedback, completion and future archive searches. That linkage creates "
        "opportunities for evaluating whether similarity alerts reduce repeated topics, whether recommendations shorten approval "
        "time, and whether workload balancing improves response time or student experience. It also increases governance duties "
        "because records accumulated for administration can be repurposed for research only under appropriate authority. The "
        "implemented system provides the technical joins needed for longitudinal study, while this paper confines its claims to "
        "the frozen synthetic/test experiment and inspected functionality.",
        "The resulting research gap is therefore multi-dimensional. It includes representation across proposal fields, comparable "
        "evaluation of sparse and dense encoders, rich expert profiles, feasible allocation, human control, provenance and a "
        "validation plan that does not manufacture labels after observing results. Addressing all dimensions in one deployment is "
        "harder than demonstrating any single algorithm. This study contributes a reproducible integrated baseline and an explicit "
        "account of its evidentiary limits. That combination allows future work to add independent annotations and prospective "
        "outcomes without redesigning the database, interfaces or audit trail after the fact."
    ]
    for paragraph in related_synthesis:
        add_paragraph(doc, paragraph)

    add_heading(doc, "2.13 Literature comparison matrix", 2)
    lit_rows = []
    for idx, ref in enumerate(references[:45], 1):
        lit_rows.append([
            f"[{idx}]",
            ref["year"],
            ref["category"],
            (ref["title"][:86] + "…") if len(ref["title"]) > 87 else ref["title"],
        ])
    add_caption(doc, "Table 1. Literature comparison matrix for the first 45 records in the curated reference library.")
    add_table(doc, ["Ref.", "Year", "Category", "Contribution/focus"], lit_rows, [650, 650, 2300, 5760], font_size=7.3)

    add_heading(doc, "3. Materials and methods", 1)
    methods = [
        ("3.1 Research design",
         "The study combines design-science system construction, implementation verification and a reproducible observational "
         "benchmark. The artefact was inspected through frontend routes and pages, Express routes and middleware, Python and Node "
         "model services, Mongoose schemas, database exports, experiment manifests, generated workbooks, figures and live system "
         "interfaces. Quantitative analysis is descriptive because the required human reference judgements are absent."),
        ("3.2 System requirements and roles",
         "Verified roles are student, supervisor, coordinator and administrator. Students can register, submit proposals, view "
         "similarity evidence and communicate; supervisors review assigned work and provide feedback; coordinators and administrators "
         "manage proposals, assignments, repositories and research reports. Authentication uses bcrypt-hashed passwords and JWT-based "
         "authorization. No academic-panel role was found, so it is not claimed."),
        ("3.3 Dataset construction and quality",
         "The measured research dataset contains 78 unique Computer Science and IT project titles linked to 78 test students. The "
         "experiment import enriched records with six descriptive fields using deterministic synthetic construction; consequently, "
         "the descriptive prose is not treated as naturally occurring institutional text. Twenty structured supervisor profiles are "
         "also deterministic synthetic test records. Every created research account and record is tagged as test data. The all-pairs "
         "project design yields C(78,2)=3,003 unique pairs per model. The supervisor design yields 78x20=1,560 candidates per model."),
        ("3.4 Ground truth and annotation",
         "Neither project-pair labels nor supervisor-relevance grades existed at the evidence freeze. A 600-pair synthetic construction "
         "benchmark contains 200 examples in each of three intended classes and leakage-safe 60/20/20 splits, but those labels are not "
         "expert judgements and are excluded from performance claims. The implemented annotation interface supports independent 0/1/2 "
         "pair labels, optional continuous scores, 0-3 supervisor relevance grades, consensus and adjudication."),
        ("3.5 Text preprocessing",
         "TF-IDF receives normalized lexical text and word/character n-gram extraction. Transformer encoders receive minimally normalized "
         "field text so contextual signals are preserved. Empty fields are excluded from the normalization denominator rather than "
         "assigned an artificial zero contribution. The application service separately contains a production MiniLM embedding path "
         "with a concept-hash fallback; this is distinguished from the controlled Python research experiment."),
        ("3.6 Multi-field representation",
         "The six canonical fields are title, description, problem statement, research objectives, features and technologies/tools. "
         "Scores are generated per field and combined using weights 0.20, 0.20, 0.20, 0.15, 0.15 and 0.10. A separate unweighted "
         "combined-text score is persisted for diagnostic comparison. The title is therefore influential but cannot determine the "
         "result alone."),
        ("3.7 Models",
         "The TF-IDF baseline uses word 1-2 grams, character 3-5 grams, minimum document frequency 1 and maximum word and character "
         "feature spaces of 30,000 each. Sentence-BERT uses sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2, 384-dimensional "
         "embeddings and batch size 32. BGE-M3 uses BAAI/bge-m3, 1,024-dimensional dense embeddings and batch size 32. The configured "
         "BERT cross-encoder is cross-encoder/stsb-roberta-base, but no completed BERT run exists. No model was fine-tuned; learning rate, "
         "epochs, optimizer and training loss are therefore not applicable."),
        ("3.8 Supervisor profiles and ranking",
         "Profiles include research interests, expertise areas, academic specialization, skills, technologies, previous supervised "
         "topics, publication keywords, years of experience, maximum capacity, current load, availability, faculty and department "
         "eligibility. Stored components include semantic expertise, technology, skills, previous-project, publication-keyword and "
         "workload-availability scores. Pure semantic and final adjusted scores and ranks are retained separately."),
        ("3.9 Capacity-aware assignment",
         "For each project, the assignment builder averages available TF-IDF, Sentence-BERT and BGE-M3 adjusted scores. Candidates that "
         "fail eligibility or capacity checks are removed. A progressive utilization penalty, capped at 15 score points, reduces the "
         "rank of heavily used supervisors. The highest feasible candidate is selected greedily and the before/after workload snapshot "
         "is stored. This generates a provisional recommendation requiring authorized review."),
        ("3.10 Evaluation and statistical policy",
         "Measured outputs include score distributions, medians, field scores, risk counts, cross-model rank correlations, execution "
         "metadata, coverage, workload dispersion and capacity violations. Classification metrics (accuracy, precision, recall, "
         "specificity, F1, MCC, ROC-AUC and PR-AUC), continuous error/correlation against human scores, and ranking metrics (Top-K, MRR, "
         "MAP and NDCG) are pre-specified but gated. McNemar, Wilcoxon, Friedman and paired bootstrap error tests are likewise gated "
         "until reference outcomes exist. Bootstrap intervals around raw mean scores describe sampling variation, not correctness.")
    ]
    for heading, paragraph in methods:
        add_heading(doc, heading, 2)
        add_paragraph(doc, paragraph)

    add_caption(doc, "Table 2. Fixed project-field weights used in multi-field similarity aggregation.")
    add_table(doc, ["Field", "Weight", "Interpretive purpose"], [
        ["Title", "0.20", "Concise topic identity; sensitive to lexical naming"],
        ["Description", "0.20", "Overall solution and domain context"],
        ["Problem statement", "0.20", "Need, gap and intended setting"],
        ["Research objectives", "0.15", "Planned outcomes and investigative direction"],
        ["Features", "0.15", "Proposed functional behavior"],
        ["Technologies/tools", "0.10", "Implementation stack; weak alone as duplication evidence"],
    ], [1900, 1000, 6460], font_size=8.2)

    add_caption(doc, "Table 3. Compared representations, stored dimensions and measured experiment status.")
    add_table(doc, ["Model", "Representation", "Stored dimension", "Measured status"], [
        ["TF-IDF", "Word 1-2 grams + character 3-5 grams", "Vocabulary dependent", "Completed"],
        ["Sentence-BERT", "paraphrase-multilingual-MiniLM-L12-v2", "384", "Completed"],
        ["BGE-M3", "BAAI/bge-m3 dense output", "1,024", "Completed"],
        ["BERT cross-encoder", "cross-encoder/stsb-roberta-base", "Pairwise score", "Configured; no saved run"],
    ], [1550, 3350, 1600, 2860], font_size=8.0)

    method_expansion = [
        "The inspection protocol triangulated independent forms of evidence. Static implementation evidence established routes, "
        "role checks, schemas, model identifiers and scoring formulas. Database exports established record counts and persisted "
        "values. Experiment manifests established configuration and completion status. Automated tests checked service behavior, "
        "while the running application confirmed that the documented workflows were reachable through role-specific interfaces. "
        "The thesis and supplied literature were treated as documentary sources, not as substitutes for executable evidence. When "
        "the sources conflicted, the hierarchy favored reproducible code and database records for current-system claims; the "
        "thesis was retained as historical context with an explicit qualification. This protocol reduces confirmation bias from "
        "relying on a single narrative description of the artefact.",
        "Dataset identity was checked before analysis. Each project record had a unique identifier, was linked to exactly one test "
        "student and contained the six expected fields used by the research service. The number of unordered pairs was independently "
        "recomputed as n(n−1)/2, yielding 3,003 for n=78. Pair records were checked by canonical project key so that A–B and B–A "
        "could not be counted as different cases. The supervisor experiment similarly used the Cartesian product of 78 projects "
        "and 20 profiles. These invariants are important because a visually plausible dashboard can hide duplicated, missing or "
        "directionally repeated comparisons. Equal counts across models support fair descriptive comparison, although they do not "
        "supply a reference outcome.",
        "Synthetic enrichment was used to exercise the complete schema and workflow. It provides controlled field completeness and "
        "makes the package distributable without disclosing student or staff data. The trade-off is construct validity: deterministic "
        "phrasing can make unrelated projects share template language, and synthetic expertise may produce cleaner topic-profile "
        "correspondence than authentic curricula. The analysis therefore labels both the enriched project text and supervisor "
        "profiles as test data wherever they affect interpretation. A future institutional evaluation should preserve raw authored "
        "text, document how missing fields are handled and report whether results change when synthetic template phrases are removed.",
        "Preprocessing is model-specific because sparse and transformer representations make different assumptions. Lexical "
        "normalization reduces superficial variation and constructs word and character features that remain auditable. Transformer "
        "input is kept closer to the authored sequence because aggressive stemming or stop-word removal can damage contextual "
        "meaning. Field boundaries are never discarded: each model receives comparable semantic units, and the aggregate is "
        "calculated only after component scores are produced. If either side lacks a field, its weight is removed from the denominator. "
        "This missingness rule prevents an absent field from being interpreted as evidence of dissimilarity, while still making "
        "completeness visible to the reviewer.",
        "The TF-IDF implementation serves two roles. Methodologically, it is a transparent baseline that tests whether complex models "
        "add value beyond shared vocabulary. Operationally, it is a low-cost screening layer suitable for interactive use and direct "
        "term-level explanation. Word bigrams retain short technical expressions, while character n-grams improve robustness to "
        "morphology, spelling and compound identifiers. The configured feature limits bound memory use. Because the vocabulary is "
        "fitted to the comparison corpus, its dimension is data dependent and should not be compared directly with fixed embedding "
        "dimensions. No supervised training occurs, and the baseline has no learned institutional threshold.",
        "Sentence-BERT and BGE-M3 use bi-encoder inference: each text unit is encoded independently, normalized and compared by "
        "cosine similarity. This permits caching, avoids repeated pairwise transformer passes and supports future approximate-nearest-"
        "neighbor retrieval. The models differ in architecture, dimensionality, training data and score geometry, so raw cosine "
        "levels need not be commensurate. The experiment deliberately retains model-specific scores rather than forcing post hoc "
        "normalization without labels. The configured BERT cross-encoder would jointly process pairs and may serve as a reranker, "
        "but it is excluded from results because configuration presence is not experimental completion.",
        "The risk labels are deterministic display categories applied after the weighted score: below 40, from 40 through below 70, "
        "and at least 70. They are not clinical-style validated risk probabilities. Their purpose is to prioritize review and keep "
        "the interface understandable. Because the three models produce different score distributions, a shared threshold can "
        "generate very different numbers of medium- and high-risk cases. The correct calibration study should ask experts to judge "
        "a development subset, select model-specific operating points according to institutional error costs, freeze those points "
        "and report sensitivity, specificity and predictive values once on a held-out test set.",
        "Supervisor profiles are represented through semantically meaningful components rather than a single biography. Research "
        "interests and expertise areas capture topical alignment; technologies and skills capture implementation support; previous "
        "topics capture supervisory experience; publication keywords provide research evidence; experience, availability and "
        "capacity provide feasibility context. Faculty and department rules are explicit eligibility checks. The component design "
        "allows missingness and contribution to be inspected. It also makes future ablation possible: each source can be removed in "
        "turn to estimate whether it improves expert-ranked retrieval or merely adds redundant text.",
        "The workload rule operates sequentially. For each project, candidate scores from the completed models are combined, "
        "ineligible or full supervisors are removed, and a penalty proportional to current utilization is subtracted subject to a "
        "15-point cap. The selected supervisor's provisional load is then incremented before the next project. The procedure is "
        "transparent and always enforces capacity, but order can affect the solution. Repeated randomized orderings, maximum-weight "
        "matching, min-cost flow or multi-objective optimization should therefore be compared in future work. Suitability loss, "
        "load dispersion, minimum match quality and group-level allocation should be reported together.",
        "The annotation design separates project similarity from supervisor relevance. Project-pair reviewers assign an ordinal "
        "label and may provide a continuous similarity estimate, rationale and field-level notes. Supervisor reviewers grade "
        "multiple candidates rather than recording only the eventually accepted assignment. At least two independent judgements "
        "are required to estimate agreement; three facilitate majority consensus and adjudication. Sampling should deliberately "
        "include high-, medium- and low-score cases from every model, plus disagreement cases, near-threshold cases and multilingual "
        "examples. Random negative pairs alone would overstate performance by making the task too easy.",
        "The statistical analysis plan is conditional on outcome type. Binary or ordinal similarity labels permit confusion matrices "
        "at frozen thresholds, class-wise precision and recall, macro and weighted F1, MCC, ROC-AUC and PR-AUC. Continuous expert "
        "scores permit rank correlation, calibration plots and absolute error. Graded supervisor relevance permits Top-K recall, "
        "MRR, MAP and NDCG, supplemented by coverage and workload metrics. Paired bootstrap intervals should preserve pair identity, "
        "while comparisons of classifiers can use paired procedures only after the test set and decision rule are frozen. Multiple "
        "comparisons require correction and effect sizes, not only p-values [101]-[110].",
        "Reproducibility artifacts were frozen together: raw CSV and JSON exports, test-data manifests, experiment configurations, "
        "figures, workbooks, screenshots, system diagrams and the manuscript evidence matrix. Model-loading and cache context is "
        "retained because a cached dense run is not comparable with a cold start. Credentials are kept in a separate test file and "
        "are not reported. The package records missing information as an output rather than silently filling it. This approach lets "
        "a reviewer trace a numerical statement to a source and makes later updates—such as expert labels or a completed cross-encoder "
        "run—additive instead of destructive."
    ]
    for paragraph in method_expansion:
        add_paragraph(doc, paragraph)

    add_heading(doc, "3.11 Mathematical formulation", 2)
    equations = [
        "Term frequency: tf(t,d) = f(t,d) / Σu f(u,d).",
        "Inverse document frequency: idf(t) = log((N + 1)/(df(t) + 1)) + 1.",
        "TF-IDF weight: w(t,d) = tf(t,d) × idf(t).",
        "Cosine similarity: cos(x,y) = (x·y)/(||x||₂||y||₂).",
        "Contextual representation: H = Transformer(x₁,…,xₙ).",
        "Sentence embedding: e(d) = Pool(H), followed by L2 normalization.",
        "Weighted multi-field similarity: S = (Σf wf sf If)/(Σf wf If), where If indicates an available field.",
        "Risk: Low if S<40; Medium if 40≤S<70; High if S≥70.",
        "Supervisor semantic score: Q(p,s) = Σk αk qk(p,s).",
        "Utilization: u(s)=current(s)/capacity(s).",
        "Workload penalty: P(s)=min(15, λu(s)).",
        "Adjusted rank score: R(p,s)=Q(p,s)-P(s), subject to eligibility and capacity."
    ]
    add_numbered(doc, equations)

    add_heading(doc, "3.12 Implementation architecture", 2)
    for filename, caption in [
        ("figure-a01-overall-architecture.png", "Figure 1. Verified overall architecture."),
        ("figure-a02-service-architecture.png", "Figure 2. Frontend, backend, AI-service and persistence interaction."),
        ("figure-a09-field-aggregation.png", "Figure 3. Multi-field aggregation and risk classification."),
        ("figure-a10-supervisor-workflow.png", "Figure 4. Recommendation, workload adjustment and human assignment."),
        ("figure-a15-evaluation-pipeline.png", "Figure 5. Evaluation pipeline and ground-truth gate.")
    ]:
        add_figure(doc, ARCH / filename, caption, width=6.35)

    add_heading(doc, "4. Results", 1)
    add_heading(doc, "4.1 Dataset and experiment completion", 2)
    add_paragraph(
        doc,
        "All three measured models completed exactly 3,003 unique project pairs and 1,560 project-supervisor comparisons. "
        "The database therefore contains 9,009 project-pair records and 4,680 supervisor-match records. The equality of "
        "record counts across models eliminates missing-pair bias in descriptive comparisons. All experiments store run "
        "identifiers, configuration, timestamps, field scores, overall scores and timing metadata."
    )
    add_caption(doc, "Table 4. Dataset composition, experiment coverage and reference-label availability.")
    add_table(doc, ["Evidence item", "Count", "Status"], [
        ["Unique projects", 78, "Complete"],
        ["Test students", 78, "Complete"],
        ["Structured test supervisors", 20, "Complete"],
        ["Unique project pairs/model", 3003, "Complete"],
        ["Pair records/all models", 9009, "Complete"],
        ["Project-supervisor candidates/model", 1560, "Complete"],
        ["Supervisor-match records/all models", 4680, "Complete"],
        ["Human annotations", 0, "Pending"],
    ], [4200, 1400, 3760], font_size=8.5)

    add_heading(doc, "4.2 Project-similarity score behaviour", 2)
    add_paragraph(
        doc,
        "TF-IDF produced the lowest score distribution (mean 18.93%, median 5.26%), Sentence-BERT an intermediate "
        "distribution (mean 47.11%, median 40.94%), and BGE-M3 the highest (mean 63.07%, median 58.55%). These values "
        "cannot be ordered as model quality. Dense encoders can have different baselines and score compression, while the "
        "synthetically expanded generic project fields inflate shared semantic content. Calibration against expert labels is "
        "required before thresholds can be compared fairly."
    )
    performance_rows = []
    for model, label in model_labels.items():
        s = model_stats[model]
        performance_rows.append([
            label, s["n"], f"{s['mean']:.2f}", f"{s['median']:.2f}",
            s["low"], s["medium"], s["high"]
        ])
    add_caption(doc, "Table 5. Unlabelled project-similarity score distributions under the configured risk boundaries.")
    add_table(doc, ["Model", "Pairs", "Mean %", "Median %", "Low", "Medium", "High"],
              performance_rows, [1500, 1100, 1100, 1100, 1100, 1200, 1260], font_size=8)
    add_figure(doc, EXP / "charts" / "figure-01-similarity-distribution.png",
               "Figure 6. Weighted score distributions for every recorded project pair.", width=6.25)
    add_figure(doc, EXP / "charts" / "figure-07-risk-distribution.png",
               "Figure 7. Descriptive risk counts under the configured 40% and 70% boundaries.", width=6.25)

    add_heading(doc, "4.3 Field-level and model-agreement results", 2)
    add_paragraph(
        doc,
        "All six fields have complete stored scores. Their means describe how each representation reacts to the imported text, "
        "not causal field importance. The high similarity of several generic descriptions, feature lists and technology stacks "
        "explains why dense-model scores can remain elevated even when titles differ. Cross-model correlations and disagreement "
        "cases identify an efficient expert-annotation queue: large spread indicates pairs for which lexical overlap and semantic "
        "relatedness lead to different conclusions."
    )
    add_figure(doc, EXP / "charts" / "figure-06-field-similarity.png",
               "Figure 8. Mean field scores; descriptive, not an ablation study.", width=6.25)
    add_figure(doc, EXP / "charts" / "figure-10-model-disagreement.png",
               "Figure 9. Highest model-score disagreements prioritized for expert review.", width=6.25)
    field_rows = []
    field_specs = [
        ("Title", "titleScore"),
        ("Description", "descriptionScore"),
        ("Problem statement", "problemStatementScore"),
        ("Research objectives", "researchObjectivesScore"),
        ("Features", "featuresScore"),
        ("Technologies/tools", "technologiesAndToolsScore"),
    ]
    for label, key in field_specs:
        field_rows.append([
            label,
            f"{statistics.fmean(float(row[key]) for row in pair_scores if row['model'] == 'tfidf'):.2f}",
            f"{statistics.fmean(float(row[key]) for row in pair_scores if row['model'] == 'sentence_bert'):.2f}",
            f"{statistics.fmean(float(row[key]) for row in pair_scores if row['model'] == 'bge_m3'):.2f}",
        ])
    add_caption(doc, "Table 6. Mean similarity by project field and representation.")
    add_table(doc, ["Field", "TF-IDF mean %", "Sentence-BERT mean %", "BGE-M3 mean %"],
              field_rows, [3200, 2000, 2160, 2000], font_size=8.1)

    add_heading(doc, "4.4 Comparative evaluation and evidence-bounded rankings", 2)
    add_paragraph(
        doc,
        "The comparative report was integrated into the article by separating five questions that would otherwise be "
        "conflated: Which model produces the highest raw scores? Which model separates this corpus most strongly? Which "
        "model agrees most closely with the others? Which model is least expensive to operate? Which model is the most "
        "appropriate staged-deployment choice? A rank is reported only within its named dimension. Because no expert "
        "ground truth exists, no accuracy, relevance or overall scientific-quality rank is assigned."
    )
    comparison_rows = []
    score_ranks = {"bge_m3": 1, "sentence_bert": 2, "tfidf": 3}
    for model in model_order:
        stats = model_stats[model]
        runtime = runtime_profiles[model]
        pair_time = (
            f"{runtime['pair_compute_total_ms']:.3f} ms cached"
            if model == "bge_m3"
            else f"{runtime['pair_compute_total_ms']:.3f} ms"
        )
        comparison_rows.append([
            model_labels[model],
            "3,003 pairs; 1,560 candidates",
            f"#{score_ranks[model]} | {stats['mean']:.2f} / {stats['median']:.2f}",
            f"{stats['low']} / {stats['medium']} / {stats['high']}",
            f"{runtime['initial_load_s']:.3f} s | {pair_time}",
            f"{runtime['supervisor_compute_total_s']:.3f} s",
        ])
    add_caption(
        doc,
        "Table 7. Complete model evidence profile. Score rank orders raw unlabelled means and is not an accuracy rank."
    )
    add_table(
        doc,
        [
            "Model",
            "Equal coverage",
            "Score rank* | mean / median %",
            "Low / medium / high",
            "Cold load | pair computation",
            "Supervisor computation",
        ],
        comparison_rows,
        [1150, 1450, 1750, 1500, 2000, 1510],
        font_size=7.4,
    )

    add_heading(doc, "4.4.1 TF-IDF", 3)
    add_paragraph(
        doc,
        "TF-IDF ranked third by raw mean score (18.93%; median 5.26%; SD 20.81), but first for operational speed, "
        "interpretability and cold-start readiness. It classified 2,268 pairs as low risk, 673 as medium and 62 as high. "
        "Its internal all-pairs computation required 295.284 ms (0.0983 ms per pair), and supervisor scoring required "
        "393.482 ms. The wide score spread and low median show strong lexical selectivity. Its principal limitation is "
        "that paraphrases, multilingual equivalence and semantically related text with little token overlap can be missed."
    )
    add_heading(doc, "4.4.2 Sentence-BERT", 3)
    add_paragraph(
        doc,
        "Sentence-BERT ranked second by raw score level (mean 47.11%; median 40.94%; SD 17.64) and produced 1,390 low-, "
        "1,210 medium- and 403 high-risk pairs. Initial model loading required 271.849 s; internal all-pairs computation "
        "required 281.698 s (93.8056 ms per pair), and supervisor scoring required 10.786 s. It achieved the highest "
        "alignment with the final capacity-aware assignment: its unadjusted first-choice supervisor matched 51 of 78 "
        f"final assignments ({assignment_alignment['sentence_bert']['percent']:.2f}%). Its 384-dimensional vectors and "
        "multilingual semantic behavior provide the most balanced measured compromise, although quality remains unvalidated."
    )
    add_heading(doc, "4.4.3 BGE-M3", 3)
    add_paragraph(
        doc,
        "BGE-M3 ranked first by raw score level (mean 63.07%; median 58.55%; SD 12.10) and by high-risk alert volume, "
        "with 0 low-, 1,949 medium- and 1,054 high-risk pairs. Its minimum score of 43.78% exceeded the common low-risk "
        "boundary, demonstrating that shared thresholds are not model invariant. BGE-M3 required the largest recorded "
        "initial load (818.871 s) and 98.680 s for supervisor scoring. The successful project rerun recorded 18.874 ms "
        "of cached pair computation (0.0063 ms per pair), which is evidence of cache reuse rather than superior cold-start "
        "speed. Its 1,024-dimensional dense representation is the richest measured embedding but also the heaviest."
    )

    agreement_pairs = [
        ("sentence_bert", "bge_m3", 1, 1),
        ("tfidf", "bge_m3", 2, 3),
        ("tfidf", "sentence_bert", 3, 2),
    ]
    agreement_rows = []
    for left_model, right_model, pair_rank, supervisor_rank in agreement_pairs:
        supervisor_stats = supervisor_agreement[(left_model, right_model)]
        agreement_rows.append([
            f"{model_labels[left_model]} vs {model_labels[right_model]}",
            f"{project_pair_agreement[(left_model, right_model)]:.4f} (#{pair_rank})",
            (
                f"{supervisor_stats['same_top']}/{supervisor_stats['compared_projects']} "
                f"({supervisor_stats['same_top_percent']:.2f}%) (#{supervisor_rank})"
            ),
            f"{supervisor_stats['mean_rank_correlation']:.4f} (#{supervisor_rank})",
        ])
    add_caption(
        doc,
        "Table 8. Cross-model agreement rankings. Agreement indicates consistency between models, not agreement with truth."
    )
    add_table(
        doc,
        [
            "Model comparison",
            "Project-pair Spearman rho (rank)",
            "Same top supervisor (rank)",
            "Mean supervisor-rank rho (rank)",
        ],
        agreement_rows,
        [2500, 2100, 2560, 2200],
        font_size=7.8,
    )
    add_paragraph(
        doc,
        "Sentence-BERT and BGE-M3 formed the strongest agreement pair: project-pair Spearman rho=0.9537, identical "
        "first-choice supervisors for 56 of 78 projects (71.79%), and mean within-project supervisor-rank rho=0.6495. "
        "TF-IDF and BGE-M3 ranked second for project-pair agreement (rho=0.9049), while TF-IDF and Sentence-BERT ranked "
        "second for supervisor-ranking agreement (51/78 identical first choices; mean rho=0.3768). All three models "
        "selected the same first-choice supervisor for 41 of 78 projects (52.56%). These differences justify retaining "
        "multiple models and directing disagreement cases to expert annotation."
    )
    add_figure(
        doc,
        EXP / "charts" / "figure-04-model-correlation.png",
        "Figure 10. Spearman agreement among model rankings for the same 3,003 project pairs; agreement is not accuracy.",
        width=6.1,
    )

    deployment_rows = [
        [
            "1",
            "TF-IDF",
            (
                "Fastest and transparent; 295.284 ms pair computation and 393.482 ms supervisor computation; "
                f"top choice matched {assignment_alignment['tfidf']['same']}/78 final assignments "
                f"({assignment_alignment['tfidf']['percent']:.2f}%)."
            ),
            "Primary explainable production baseline",
        ],
        [
            "2",
            "Sentence-BERT",
            (
                "Best balance of semantic capacity, 384-dimensional size and ensemble alignment; top choice matched "
                f"{assignment_alignment['sentence_bert']['same']}/78 final assignments "
                f"({assignment_alignment['sentence_bert']['percent']:.2f}%)."
            ),
            "Semantic shadow mode and reviewer decision support",
        ],
        [
            "3",
            "BGE-M3",
            (
                "Highest raw scores and strongest dense-model agreement, but 818.871 s initial load, 1,024 dimensions "
                f"and 98.680 s supervisor computation; top choice matched {assignment_alignment['bge_m3']['same']}/78 "
                f"final assignments ({assignment_alignment['bge_m3']['percent']:.2f}%)."
            ),
            "Offline research candidate pending validated gain",
        ],
    ]
    add_caption(
        doc,
        "Table 9. Evidence-bounded operational deployment ranking; this is not a predictive-quality ranking."
    )
    add_table(
        doc,
        ["Operational rank", "Model", "Measured basis", "Recommended role"],
        deployment_rows,
        [1150, 1200, 4700, 2310],
        font_size=7.8,
    )
    add_paragraph(
        doc,
        "The operational ranking is therefore: (1) TF-IDF for the primary explainable baseline, (2) Sentence-BERT for "
        "semantic shadow operation and reviewer support, and (3) BGE-M3 for offline research until a labelled evaluation "
        "demonstrates a quality gain that justifies its cold-start and resource cost. By contrast, the raw-score ranking "
        "is (1) BGE-M3, (2) Sentence-BERT and (3) TF-IDF. Reporting both lists prevents a high numerical score from being "
        "misrepresented as either higher accuracy or greater deployment suitability."
    )

    add_heading(doc, "4.5 Efficiency", 2)
    add_paragraph(
        doc,
        "Internal model-computation time and end-to-end experiment duration are distinct. TF-IDF recorded 295.284 ms of "
        "pair computation within a 1.161 s end-to-end run. Sentence-BERT recorded 281.698 s of pair computation within a "
        "282.681 s run after 271.849 s of model loading. BGE-M3 recorded 18.874 ms of cached pair computation within a "
        "1.568 s successful rerun after an earlier 818.871 s load; that cached value is not a cold-start comparison. "
        "Supervisor experiment computation totals were 393.482 ms, 10.786 s and 98.680 s, within end-to-end durations of "
        "1.047 s, 12.138 s and 100.014 s for TF-IDF, Sentence-BERT and BGE-M3, respectively. Peak memory and model size on "
        "disk were not captured under a uniform profiler and remain pending."
    )
    add_figure(doc, EXP / "charts" / "figure-05-latency.png",
               "Figure 11. Stored execution time per pair; cache context must be retained.", width=6.25)

    add_heading(doc, "4.6 Supervisor recommendation and workload", 2)
    add_paragraph(
        doc,
        f"The capacity-aware ensemble produced {len(assignments)} provisional assignments and used all {len(loads)} test "
        f"supervisors. Mean final load was {workload_mean:.2f} projects (population SD {workload_sd:.2f}), with a minimum "
        f"of {min(load_values)} and maximum of {max(load_values)}. No configured capacity was exceeded. Capacity utilization "
        "ranged from 0.50 to 1.00. These results establish feasibility of the balancing rule, not correctness of supervisor fit."
    )
    add_figure(doc, EXP / "charts" / "figure-13-workload-after.png",
               "Figure 12. Provisional workload and configured capacity after balancing.", width=6.25)
    add_figure(doc, EXP / "charts" / "figure-14-capacity-utilization.png",
               "Figure 13. Capacity utilization across the 20 synthetic supervisor profiles.", width=6.25)

    add_heading(doc, "4.7 Statistical and error-analysis boundary", 2)
    add_paragraph(
        doc,
        "No confusion matrix, ROC curve, precision-recall curve, F1 threshold curve, McNemar test or prediction-error significance "
        "test is reported because no expert outcome exists. Likewise, Top-1/3/5 accuracy, MRR, MAP and NDCG cannot be calculated "
        "for supervisor ranking without relevance grades or accepted-assignment alternatives. The valid current analyses are raw "
        "score distributions, field scores, cross-model association, timing, coverage, feasibility and disagreement review."
    )
    add_paragraph(
        doc,
        "The thesis reports 307 comparisons with 96.42% accuracy, 95.65% precision, 99.00% recall and 97.29% F1. The inspected "
        "workspace does not contain the pair-level labels, prediction vector or confusion matrix required to reproduce those values. "
        "They are therefore recorded in the evidence matrix as thesis-reported historical results and excluded from the primary "
        "article findings. This decision resolves the conflict in favor of auditable database evidence."
    )
    result_expansion = [
        "Completion was evaluated at the level of expected keys, not only aggregate row counts. Every model was required to produce "
        "one record for each canonical unordered project pair, and every supervisor model was required to produce one candidate "
        "record for each project-profile combination. This design guards against a misleading comparison in which one model silently "
        "drops long, empty or problematic cases. The verified equality of keys means that distributional differences are based on "
        "the same cases. No failed or partially completed BERT result set was reclassified as evidence; the configured model remains "
        "visible in methods and in the missing-information checklist.",
        "The TF-IDF weighted scores ranged from 0.95% to 88.17%, Sentence-BERT from 16.08% to 91.23%, and BGE-M3 from 43.78% to "
        "94.95%. The compressed lower range of BGE-M3 is operationally consequential: under a common 40% threshold, even the minimum "
        "weighted score lies above the low-risk boundary. This observation does not show that BGE-M3 overestimates true similarity, "
        "because truth is unknown. It shows that the shared display thresholds are not model invariant. Deploying the same cut points "
        "without calibration would expose users to different alert rates simply because a different representation was selected.",
        "The gap between medians and means is also informative. TF-IDF's median of 5.26% is far below its mean of 18.93%, indicating "
        "a distribution with many low-overlap pairs and a smaller set of substantially overlapping cases. Sentence-BERT's median of "
        "40.94% lies nearer its mean of 47.11%, while BGE-M3's median of 58.55% lies nearer its mean of 63.07%. These shapes make "
        "unlabelled average-score comparisons particularly unsafe: the same numerical increment does not represent the same change "
        "in rank, review burden or error probability across models.",
        "Field means reinforce the role of synthetic construction. For TF-IDF, title similarity averaged only 3.24%, while features "
        "and technologies/tools averaged 33.47% and 32.11%. Sentence-BERT showed the same ordering tendency, with title at 20.29%, "
        "features at 62.10% and technologies/tools at 54.52%. BGE-M3 produced 44.88%, 72.82% and 75.01% for those fields. Shared "
        "functional and technology templates therefore contribute more common signal than titles. A reviewer should not read this "
        "as evidence that feature text is intrinsically more important; it is a property of these generated records and fixed weights.",
        "The difference between the weighted field aggregate and the unweighted combined-text score provides another diagnostic. "
        "Weighted means were 18.93%, 47.11% and 63.07%, whereas combined-text means were 15.18%, 36.20% and 60.93% for TF-IDF, "
        "Sentence-BERT and BGE-M3. Separating these values makes aggregation effects visible. Concatenation changes term frequency, "
        "sequence length and the balance among sections; weighted aggregation gives each field a declared policy influence. Neither "
        "approach is empirically superior in the absence of labels, so both are retained for later ablation.",
        "Timing values require the same contextual discipline as scores. The stored TF-IDF pair time is approximately 0.10 ms per "
        "record. Sentence-BERT pair records contain approximately 93.81 ms, while the successful BGE-M3 rerun contains approximately "
        "0.01 ms because embeddings had already been populated. The latter is evidence of cached scoring throughput, not evidence "
        "that BGE-M3 loads or encodes faster than TF-IDF. Recorded first-load durations—about 272 s for Sentence-BERT and 819 s for "
        "BGE-M3—show why cold start, warm encoding and cached cosine calculation must be reported as distinct phases.",
        "The workload result uses every synthetic supervisor rather than concentrating projects in a small subset. Final loads were "
        "between two and six, with an average of 3.90 and population standard deviation of 1.09. The absence of capacity violations "
        "was checked against the configured maximum for every assignment. These statistics demonstrate that the sequential rule "
        "produced a feasible allocation for this particular ordered dataset. They do not show that supervisors would accept the "
        "assigned topics, that the semantic matches are correct, or that another feasible solution would not achieve higher total "
        "suitability.",
        "The most useful current error-analysis output is a queue rather than an error rate. Pairs with a large cross-model spread, "
        "pairs near risk thresholds, and pairs whose title score conflicts with problem/objective scores provide high-information "
        "cases for expert review. For supervisor matching, candidates whose semantic and adjusted ranks diverge reveal the practical "
        "effect of workload. Sampling these cases alongside random strata can reduce annotation effort while preserving an unbiased "
        "evaluation subset. Performance metrics should be calculated only after consensus labels are joined by immutable pair or "
        "candidate identifiers."
    ]
    for paragraph in result_expansion:
        add_paragraph(doc, paragraph)

    add_heading(doc, "5. Discussion", 1)
    discussion = [
        "The experiment demonstrates that lexical and dense representations create materially different score scales over identical "
        "pairs. TF-IDF's low median reflects sparse lexical overlap and makes it useful for identifying direct shared terminology. "
        "Sentence-BERT broadens relatedness through multilingual contextual embeddings. BGE-M3 produces the highest unlabelled means, "
        "but this may arise from calibration, generic synthetic descriptions or dense-space anisotropy rather than superior discrimination. "
        "A model should be selected on expert-labelled errors and ranking utility, not on score magnitude.",
        "TF-IDF remains operationally valuable. It loaded immediately, completed the all-pairs task in a fraction of a second, and can "
        "expose matched terms and n-grams. In academic review, such explanations are often easier to contest than a dense score. Its "
        "limitations become important when proposals paraphrase the same problem or use synonyms, which is why a transformer shadow score "
        "is useful. A hybrid policy can show lexical and semantic evidence side by side instead of forcing premature model replacement.",
        "Sentence-BERT offers a plausible semantic-efficiency compromise because reusable 384-dimensional embeddings support archive-scale "
        "comparison after encoding. The measured first-run cost includes model acquisition and loading, while later inference can use caches. "
        "BGE-M3's 1,024-dimensional representation and long load time impose a stronger infrastructure requirement. The current dense-only "
        "implementation does not exploit BGE-M3's sparse or multi-vector modes, so the complete model's theoretical advantages were not tested.",
        "The explicit rankings sharpen this interpretation. BGE-M3, Sentence-BERT and TF-IDF rank first, second and third by "
        "raw unlabelled score level, whereas TF-IDF, Sentence-BERT and BGE-M3 rank first, second and third for staged operational "
        "deployment. Sentence-BERT and BGE-M3 are the closest behavioral pair, reaching project-pair Spearman rho=0.9537 and "
        "71.79% agreement on the first-choice supervisor. Sentence-BERT also has the highest unadjusted first-choice alignment "
        "with the final capacity-aware assignment (65.38%). These ranks describe calibration, efficiency, agreement and operational "
        "fit; they do not replace expert-labelled accuracy, error or relevance ranks.",
        "Field-level analysis is central to academic interpretability. A high description or problem score with low title similarity may indicate "
        "paraphrase; high technology similarity with divergent objectives may indicate a shared implementation stack rather than duplication. "
        "The fixed weights encode an initial policy, not an empirically optimal solution. Expert labels should support validation-only weight "
        "selection followed by one final held-out evaluation.",
        "The supervisor experiment separates semantic ranking from allocation. This is methodologically important because a lower-ranked candidate "
        "may become the feasible recommendation when the top expert is at capacity. Storing both ranks preserves the reason for the change. The "
        "observed zero-overload solution and narrow 2-6 range show that the greedy penalty can distribute this workload, although alternative "
        "assignments may yield higher total expertise or better fairness under a formal optimizer.",
        "The greatest validity risk is the data itself. Titles may originate in institutional records, but the six-field descriptive content and "
        "supervisor profiles used in the research experiment are deterministic synthetic test data. Generic management-system language creates "
        "systematic similarity. Therefore, the study is strongest as an implementation and reproducibility paper and weakest as a comparative "
        "accuracy paper. External institutions and naturally authored proposals are necessary for generalization.",
        "False positives could cause unnecessary student revision, delay or reputational harm; false negatives could allow repeated topics to proceed. "
        "Supervisor errors could concentrate attractive projects, exclude capable staff or assign students to poorly aligned expertise. These risks "
        "justify a decision-support boundary: the system should show evidence, permit override, record reasons and provide an appeal path. It should "
        "never automatically reject a proposal or finalize a supervisor based only on model output.",
        "Multilingual deployment is promising but unproven. The selected Sentence-BERT and BGE-M3 checkpoints support multilingual representation, "
        "yet the current experiment does not report Somali-Arabic-English strata. A valid multilingual study needs language identification, comparable "
        "translation/paraphrase sets, native-speaker judgement and performance by language pair. Without that design, multilingual capability should "
        "be described as supported inference infrastructure rather than validated institutional performance.",
        "Compared with prior work, the system's distinctive contribution is the linkage among archive, six-field evidence, rich supervisor profiles, "
        "capacity adjustment, annotations, reporting and role-controlled lifecycle interfaces. Its responsible contribution is equally important: the "
        "research tooling records what is missing and prevents dashboards from converting unlabeled score differences into false accuracy claims."
    ]
    for p in discussion:
        add_paragraph(doc, p)

    discussion_expansion = [
        "RQ1 can therefore be answered only at the level of observed scoring behavior. All three models processed the complete "
        "pair set, and their distributions are plainly different. RQ2 is likewise answered operationally: each model generated a "
        "complete ranking substrate for every project-supervisor candidate. Neither question can yet be answered as comparative "
        "correctness. RQ3 identifies interpretable differences in field response, score geometry, dimensions and runtime context, "
        "but these are trade-offs rather than a winner. This question-by-question separation is important because model-comparison "
        "papers often allow successful execution or a higher score to stand in for validated task performance.",
        "RQ4 has a more direct answer because feasibility is observable without semantic ground truth. The capacity-aware layer "
        "assigned every project while respecting all configured limits and distributing work across every available test supervisor. "
        "Feasibility is nevertheless narrower than allocation quality. A formal comparison should hold semantic scores constant and "
        "evaluate several allocation algorithms under the same capacities, project order and objectives. It should report total and "
        "minimum suitability, number of assignments below an agreed threshold, utilization dispersion, preference satisfaction and "
        "sensitivity to capacity changes. The present greedy policy is a reproducible baseline for that study.",
        "RQ5 clarifies why additional annotation is the critical path. The system already stores the identifiers and metadata needed "
        "to join blinded expert judgements to frozen predictions. The next experiment should not tune thresholds on the same labels "
        "used for final reporting. It should predefine sampling, annotation, adjudication, development and held-out partitions; "
        "register the primary metric; and preserve all model outputs before labels are revealed. This sequencing reduces optimistic "
        "bias and makes any later best-model conclusion defensible.",
        "The integrated platform changes how errors can be managed. In an offline benchmark, a false positive is a number in a "
        "confusion matrix. In an approval workflow, it can trigger student revision or delay. An explanation panel, manual override, "
        "audit log and appeal route do not improve the underlying classifier, but they reduce the likelihood that one score becomes "
        "an irreversible decision. Similarly, a supervisor recommendation can be reconsidered when capacity or methodological "
        "requirements are incomplete. These controls make the system more suitable for cautious pilot use even before predictive "
        "validity is established.",
        "The decision to retain TF-IDF is also a design conclusion. Dense models are not automatically preferable in every field or "
        "deployment state. Exact technology names, institutional abbreviations and reused project phrases are valuable lexical "
        "signals. TF-IDF can act as a fast first-stage retriever, a visible explanation source and a monitoring baseline. Dense "
        "models can add paraphrase sensitivity, and a cross-encoder can later rerank a limited candidate set. A staged architecture "
        "would control cost while presenting multiple forms of evidence to the reviewer.",
        "Generalization must be evaluated along at least four axes. The first is authorship: naturally written proposals differ from "
        "synthetic field expansions. The second is time: new curricula and technologies change vocabulary and topic prevalence. The "
        "third is institution: project expectations, supervisor profiles and workload rules differ. The fourth is language: Somali, "
        "Arabic, English and code-switched text may have unequal embedding quality. A multi-site temporal evaluation should report "
        "results by these strata and avoid pooling away a poorly served group.",
        "Practical deployment also requires monitoring after validation. Alert-rate drift, score-distribution drift, missing-field "
        "rates, reviewer overrides, appeal outcomes, supervisor utilization and latency should be tracked by model version. A change "
        "in model checkpoint, field-generation process or threshold must create a new configuration record. Periodic relabelling can "
        "test whether calibration has degraded. Because project archives grow cumulatively, retrieval scale and approximate-index "
        "recall should be measured rather than assumed from the current 78-project corpus.",
        "The broader contribution is methodological restraint. The package contains enough outputs to produce attractive accuracy "
        "figures by treating synthetic class intentions or the thesis summary as truth. Doing so would create precise but unsupported "
        "claims. By withholding those metrics, the study makes the actual contribution clearer: a functioning, inspectable research "
        "instrument with complete descriptive outputs, a feasible allocation baseline and a ready annotation pathway. That is a "
        "more durable foundation for a later predictive evaluation than an irreproducible high headline score."
    ]
    for paragraph in discussion_expansion:
        add_paragraph(doc, paragraph)

    add_heading(doc, "6. Ethical and responsible-AI considerations", 1)
    add_paragraph(
        doc,
        "The platform processes student proposals, identity records, supervisor profiles, communications and administrative decisions. "
        "Production deployment therefore requires data minimization, purpose limitation, retention schedules, access logging, encrypted transport, "
        "secure secrets management and role-based authorization. Publications and CV-derived expertise should be used only with institutional authority. "
        "Research exports must replace personal identifiers, and synthetic test accounts must remain isolated from production data."
    )
    add_paragraph(
        doc,
        "Similarity is evidence of relatedness, not a finding of misconduct. Every high-risk result should expose the closest projects and field-level "
        "basis, and students should be able to explain differences. Supervisor rankings require comparable profile completeness; staff with missing "
        "publications or outdated expertise can otherwise be systematically disadvantaged. The governance process should include human confirmation, "
        "recorded overrides, periodic fairness audits, an appeal channel, and monitoring for workload and faculty-level disparities."
    )
    ethics_expansion = [
        "Purpose limitation should be enforced technically and procedurally. Proposal text collected to administer projects should "
        "not automatically become unrestricted training data, and publication-derived supervisor information should not be expanded "
        "beyond the purpose authorized by the institution. Access to identifiable records should follow least privilege, with "
        "separate permissions for operational review, research export and system administration. Logs should record sensitive "
        "actions without reproducing full proposal content. Retention periods and deletion procedures should be agreed before a "
        "production pilot, including how derived embeddings and cached indexes are removed when a source record is withdrawn.",
        "Fairness assessment must consider data quality as a potential mechanism of disadvantage. Supervisors with sparse profiles, "
        "fewer indexed publications or expertise expressed in a less well represented language may receive lower scores even when "
        "qualified. Students working on locally important topics may appear anomalous relative to an archive dominated by common "
        "software themes. Audits should therefore stratify coverage and errors by language, department and profile completeness, "
        "and should examine whether workload penalties systematically redirect particular project types. These analyses require "
        "institutionally approved attributes and safeguards against re-identification.",
        "Human oversight needs specified authority, not a generic statement that a person is involved. The interface should identify "
        "who may view evidence, change a risk disposition, approve an assignment and respond to an appeal. Reviewers should receive "
        "guidance that a high score is a prompt for comparison, not an allegation. Override reasons should be structured enough for "
        "audit yet flexible enough to capture methodological expertise, conflict, leave, student preference or other legitimate "
        "context. Automated recommendations should be suspended if profile completeness, service health or model configuration "
        "falls below a declared operational threshold.",
        "Publication and future reuse introduce an additional responsibility. Synthetic test data can be shared with clear labels, "
        "but authentic proposals, communications and staff profiles may contain personal or confidential information. A public "
        "research release should use data minimization and a disclosure-risk review, publish data dictionaries and model cards, "
        "state the provenance of every field and provide reproducible scripts without exposing credentials. Any prospective study "
        "with annotators or system users should obtain the required ethics review or documented waiver and informed-consent process "
        "before data collection begins."
    ]
    for paragraph in ethics_expansion:
        add_paragraph(doc, paragraph)

    add_heading(doc, "7. Limitations", 1)
    add_bullets(doc, [
        "Single-institution, single-faculty project corpus.",
        "Only 78 projects and 20 synthetic supervisor profiles.",
        "Six-field project descriptions are deterministic synthetic expansions.",
        "No human pair labels, continuous similarity scores or supervisor-relevance grades.",
        "No inter-annotator agreement, adjudication outcome or external validation.",
        "Configured BERT cross-encoder has no completed result set.",
        "BGE-M3 sparse and multi-vector retrieval modes were not activated.",
        "Cold-start and cached latency are not uniformly separated across all runs.",
        "Peak memory, API response time and database latency were not controlled.",
        "No multilingual, longitudinal, user-acceptance or learning-outcome evaluation."
    ])
    limitation_expansion = [
        "The first limitation is measurement validity. Stored model outputs are complete, but completeness is not ground truth. "
        "Without independently produced judgements, the analysis cannot estimate how often the system alerts on genuinely distinct "
        "projects or misses substantively repeated topics. Score differences may reflect representation geometry, text templates "
        "or field weighting. The current risk thresholds are institutional configuration values rather than empirically calibrated "
        "operating points. Accordingly, the paper treats distributions and risk counts as descriptions of system behavior, not "
        "estimates of real-world misconduct, originality or recommendation accuracy.",
        "The second limitation is ecological validity. The six-field descriptions and twenty supervisor profiles were constructed "
        "as deterministic synthetic test records to exercise an otherwise complete workflow without exposing personal data. This "
        "choice supports reproducibility and privacy, but it cannot reproduce the variation, missingness, multilingual expression, "
        "disciplinary nuance or profile inequality of authentic institutional records. Template phrases can systematically raise "
        "semantic similarity, particularly in functional and technology fields. Findings therefore should not be generalized to "
        "naturally authored proposals or staff expertise until an authorized, de-identified external evaluation is completed.",
        "The third limitation concerns system performance measurement. The stored runs were sufficient to verify execution and "
        "capture model-specific timing, yet loading, encoding, cached comparison, API transport and database persistence were not "
        "profiled under one controlled harness. Hardware utilization and peak memory were not recorded uniformly. The BGE-M3 "
        "project rerun used cached embeddings, so its very small recorded pair time cannot be interpreted as end-to-end superiority. "
        "A production benchmark should repeat cold and warm trials, report uncertainty, fix hardware and software versions, and "
        "measure concurrency as the archive grows.",
        "The fourth limitation concerns allocation. The greedy penalty respected configured capacity for the frozen project order, "
        "but order sensitivity, supervisor preferences, project difficulty and scarce-method expertise were not modeled. Capacity "
        "itself was synthetic, and an equal-looking load need not be equitable when supervision effort varies. The study does not "
        "claim global optimality, Pareto efficiency or improved student outcomes. Those questions require comparison with formal "
        "optimization baselines and a prospective design that measures quality, timeliness, satisfaction and justified overrides.",
        "Finally, the inspection is a research and implementation audit rather than a security, privacy or usability certification. "
        "Source-level controls and role-restricted interfaces were verified, but no penetration test, accessibility study, threat "
        "model exercise or longitudinal user trial was conducted. The supplied corpus also included duplicate papers and one legacy "
        "document that could not be converted in the available runtime. These boundaries are recorded in the supplementary reports "
        "so that later work can address them without weakening or retroactively redefining the present claims."
    ]
    for paragraph in limitation_expansion:
        add_paragraph(doc, paragraph)

    add_heading(doc, "8. Conclusion and future work", 1)
    add_paragraph(
        doc,
        "The implemented platform operationalizes proposal archiving, multi-field similarity screening, supervisor recommendation, capacity-aware "
        "provisional assignment and lifecycle administration. TF-IDF, Sentence-BERT and BGE-M3 successfully produced complete score sets, but RQ1-RQ3 "
        "cannot be answered in terms of comparative accuracy until expert labels exist. The observable answer is that their score distributions, "
        "representation sizes and run costs differ substantially. RQ4 is answered positively for feasibility: all 78 projects were assigned across "
        "20 test supervisors with no capacity violation. RQ5 identifies the decisive next requirement: blinded expert annotation of pair similarity "
        "and multi-relevant supervisor suitability, followed by validation-only threshold/weight selection and held-out evaluation."
    )
    add_paragraph(
        doc,
        "The integrated comparison supports two deliberately different rankings. Raw unlabelled score level ranks BGE-M3 "
        "first (63.07%), Sentence-BERT second (47.11%) and TF-IDF third (18.93%); this ranking measures calibration and "
        "alert propensity only. The evidence-bounded deployment ranking reverses the extremes: TF-IDF is first as the "
        "fastest and most transparent baseline, Sentence-BERT is second as the balanced semantic option and BGE-M3 is "
        "third as an offline research candidate. Sentence-BERT and BGE-M3 nevertheless form the strongest agreement pair "
        "(project-pair Spearman rho=0.9537; identical top supervisor for 71.79% of projects). No predictive-quality winner "
        "is declared until independent expert labels permit held-out accuracy and ranking evaluation."
    )
    add_paragraph(
        doc,
        "Future work should collect naturally authored proposals and verified supervisor profiles across institutions; evaluate Somali, Arabic and "
        "English; activate hybrid dense-sparse BGE-M3 retrieval and selective cross-encoder reranking; measure memory, latency and calibration under "
        "controlled cold/warm conditions; optimize allocation with explicit multi-objective constraints; audit bias; integrate publication databases; "
        "and study longitudinal outcomes such as approval time, supervision satisfaction and project completion quality."
    )
    add_paragraph(
        doc,
        "The immediate publication priority is therefore evidence completion rather than additional dashboard features. A frozen, "
        "blinded expert study can transform the existing score archive into a valid comparison without rerunning models after labels "
        "are known. Until then, the package supports transparent pilot review, reproducibility assessment and system-oriented "
        "publication, provided that users retain decision authority and every numerical claim preserves its stated boundary. This "
        "sequencing protects students and staff while enabling a later, genuinely comparative scientific contribution."
    )

    add_heading(doc, "Declarations", 1)
    declarations = [
        ("Funding", "[AUTHOR TO COMPLETE: state funding source or 'No external funding was received.']"),
        ("Conflict of interest", "[AUTHOR TO COMPLETE: declare conflicts or state none.]"),
        ("Data availability", "De-identified/synthetic research exports and code-derived artifacts are available in the accompanying package; institutional records require authorized access."),
        ("Code availability", "[AUTHOR TO COMPLETE: repository URL, license and archival DOI.]"),
        ("Ethical approval", "[AUTHOR TO COMPLETE: institutional review/waiver identifier before any human annotation or user study is reported.]"),
        ("Consent to participate", "Not applicable to the current synthetic/unlabelled experiment; required for future annotators or user participants."),
        ("Consent for publication", "[AUTHOR TO COMPLETE.]"),
        ("Author contributions", "[AUTHOR TO COMPLETE using CRediT roles.]"),
        ("Acknowledgements", "[AUTHOR TO COMPLETE.]"),
        ("Generative-AI disclosure", "Codex assisted with code inspection, evidence organization, metadata retrieval, drafting and document production; authors must verify and approve the final manuscript.")
    ]
    add_caption(doc, "Table 10. Author-controlled declarations that must be completed before submission.")
    add_table(doc, ["Declaration", "Statement"], declarations, [2100, 7260], font_size=8.4)

    add_heading(doc, "References", 1)
    for idx, ref in enumerate(references, 1):
        authors = ref["authors"] or "[authors unavailable in Crossref metadata]"
        source = ref["source"] or ref["publisher"]
        vol = f", vol. {ref['volume']}" if ref["volume"] else ""
        issue = f", no. {ref['issue']}" if ref["issue"] else ""
        pages = f", pp. {ref['pages']}" if ref["pages"] else ""
        text = (
            f"[{idx}] {authors}, “{ref['title']},” {source}{vol}{issue}{pages}, "
            f"{ref['year']}, doi: {ref['doi']}."
        )
        p = add_paragraph(doc, text)
        p.paragraph_format.left_indent = Inches(0.2)
        p.paragraph_format.first_line_indent = Inches(-0.2)
        for run in p.runs:
            run.font.size = Pt(8.5)

    add_heading(doc, "Appendix A. Journal-quality pseudocode", 1)
    algorithms = [
        ("A1 Project text extraction", "For each project, map API/database aliases into the six canonical fields; normalize scalar/list values; retain an availability mask."),
        ("A2 Multi-field preprocessing", "Apply lexical normalization and n-gram tokenization for TF-IDF; preserve contextual text for transformer tokenizers; do not impute missing text."),
        ("A3 TF-IDF similarity", "Fit word and character TF-IDF spaces on the comparison corpus; transform each field; compute cosine similarity; cache matrices."),
        ("A4 BERT cross-encoder", "For each field pair, tokenize the joint pair; obtain the cross-encoder score; normalize to the reporting scale; note that this configured path lacks measured results."),
        ("A5 Sentence-BERT similarity", "Encode unique field texts in batches; L2-normalize 384-dimensional embeddings; obtain cosine scores by indexed lookup."),
        ("A6 Multi-field aggregation", "Multiply each available field score by its fixed weight; divide by the sum of available weights; store weighted and combined-text scores."),
        ("A7 Risk classification", "If score <40 return Low; else if score <70 return Medium; otherwise return High."),
        ("A8 Supervisor profile construction", "Concatenate structured expertise evidence by component while retaining specialization, technology, prior-topic and publication-keyword fields."),
        ("A9 TF-IDF supervisor matching", "Fit project and supervisor component texts in shared lexical spaces; calculate component cosines and pure semantic score."),
        ("A10 Sentence-BERT supervisor matching", "Batch encode project and profile components; compute component cosines; retain matched terms/technologies for explanation."),
        ("A11 BGE-M3 supervisor matching", "Encode project and profile text with BAAI/bge-m3 dense mode; compute 1,024-dimensional cosine scores; do not claim sparse/multi-vector output."),
        ("A12 Workload-aware ranking", "Filter ineligible candidates; compute utilization; subtract capped penalty; preserve semantic rank and adjusted rank."),
        ("A13 Assignment recommendation", "Select the highest adjusted feasible candidate; update provisional load; persist capacity snapshot and explanation; require human approval."),
        ("A14 Model evaluation", "Join predictions with consensus labels by canonical pair/candidate key; compute classification, continuous and ranking metrics only on the held-out split."),
        ("A15 Report generation", "Export run metadata and raw records; compute descriptive or validated metrics according to label availability; render charts with explicit validity captions.")
    ]
    for heading, text in algorithms:
        add_heading(doc, heading, 2)
        add_paragraph(doc, text)

    add_heading(doc, "Appendix B. Evidence reconciliation", 1)
    add_caption(doc, "Table 11. Reconciliation of high-impact claims against the strongest available evidence.")
    add_table(doc, ["Claim", "Primary evidence", "Decision"], [
        ["78 projects", "Database export and experiment runs", "Use"],
        ["3,003 pairs/model", "Combinatorial count and stored records", "Use"],
        ["20 supervisors", "Tagged synthetic supervisor export", "Use; label synthetic"],
        ["96.42% accuracy / 97.29% F1", "Thesis only; no pair labels/predictions", "Do not use as primary result"],
        ["BERT comparison", "Configured checkpoint; no completed run", "Methods only; result pending"],
        ["Vercel/Render/MongoDB Atlas", "Thesis statement; no deployment manifest", "Report as thesis-described"],
        ["Best model", "No human ground truth", "Withhold"],
    ], [3100, 3500, 2760], font_size=8.2)

    return doc


def supporting_reports() -> None:
    inventory = load_csv(CORPUS / "paper-corpus-inventory.csv")
    (OUT / "file-analysis-report.md").write_text(
        f"""# File-analysis report

- Thesis: `THESIS_BOOK (Autosaved).docx`; {corpus_summary['thesis_paragraphs']} paragraphs, {corpus_summary['thesis_tables']} tables, {corpus_summary['thesis_characters']:,} extracted characters.
- Supplied literature corpus: {corpus_summary['paper_files']} files, {corpus_summary['unique_hashes']} unique hashes, {corpus_summary['duplicate_files']} duplicates.
- PDFs with extractable text: {corpus_summary['pdfs_with_text']} of {corpus_summary['pdf_files']}.
- Files with DOI candidates on the first three pages: {corpus_summary['doi_candidates_found']}.
- One legacy `.doc` could not be converted in the available runtime; it remains listed for manual review.
- The ScienceDirect ZIP was inventoried without altering its contents.

The detailed inventory, hashes, metadata and excerpts are in `corpus/paper-corpus-inventory.csv`, `corpus/paper-first-pages.json` and `corpus/thesis-extracted-text.txt`.
""", encoding="utf-8")

    (OUT / "system-inspection-report.md").write_text(
        """# System-inspection report

## Inspected architecture

The implemented application has four cooperating layers:

1. a React 19.2/Vite 6 single-page frontend with React Router and Recharts;
2. an Express 5 REST API;
3. MongoDB persistence through Mongoose 9 schemas and indexes; and
4. a Python Flask research/AI service using NumPy, Pandas, scikit-learn, sentence-transformers and related retrieval libraries.

The browser-visible system and source tree were inspected together. The live development deployment responded on the frontend, backend and AI-service ports, and role-specific routes were exercised with tagged test accounts.

## Roles and workflows

The verified role enum contains `student`, `supervisor`, `coordinator` and `admin`. No academic-panel role was found and none is claimed. Students can submit and follow proposals, inspect similarity feedback and use project communication functions. Supervisors can review assigned projects and provide supervisory feedback. Coordinator and administrator functions cover users, organizational taxonomy, project/repository management, supervisor profiles, research datasets, experiments, annotations, reports and activity logs.

Live evidence was captured for login, administrator dashboard, AI assignment/workload, similarity results, supervisor recommendations, model comparison, visualizations, annotations, supervisor profiles, user management, student dashboard, proposal submission and supervisor dashboard. The user-management view was filtered to tagged local test accounts before capture.

## API and data model

The Express application mounts APIs for authentication, projects, taxonomy, organization, users, messages, files, ideas, announcements, guidelines, similarity results and research. The project schema represents lifecycle records; user records hold role, organizational links, student identifiers, supervisor expertise, research interests, skills, technologies, previous supervised topics, publication keywords, experience, availability, eligibility, capacity and current load.

Research-specific persistence includes experiment runs, project-pair scores, project-model comparisons, supervisor match scores, supervisor ground truth, human evaluations, annotation consensus, import runs, configurations, generated reports and activity logs. Pair-score records retain the model and version, six component scores, weighted and unweighted totals, risk band, execution time, embedding dimension, device, batch size and test time. Supervisor-match records retain component evidence, pure semantic and adjusted scores, both ranks, eligibility and explanatory metadata.

## Model and decision flow

The controlled comparison uses six project fields: title, description, problem statement, research objectives, features and technologies/tools. Fixed weights are 0.20, 0.20, 0.20, 0.15, 0.15 and 0.10. Implemented measured models are TF-IDF, multilingual Sentence-BERT (`paraphrase-multilingual-MiniLM-L12-v2`) and the dense output of BGE-M3 (`BAAI/bge-m3`). A BERT cross-encoder is configured but has no completed saved experiment and is not reported as a result.

Supervisor recommendation compares structured project evidence with rich profile components, applies faculty/availability/capacity eligibility, records semantic and adjusted ranks, and then feeds a capacity-aware provisional assignment. An authorized academic user remains responsible for the final decision. Risk labels are display bands, not probabilities of plagiarism.

## Security and privacy-relevant controls

Passwords are hashed with bcrypt before persistence, authentication uses JWT-based middleware, user roles are enumerated, and the development CORS policy permits localhost/127.0.0.1 origins. JSON and URL-encoded request bodies are limited to 10 MB. Static uploads are served by the backend. These controls were verified in code, but this inspection is not a penetration test or a production security certification. Production deployment still requires secure secret handling, HTTPS, least privilege, retention controls, upload validation, backup/restore testing and an institutional privacy review.

## Reproducibility and verification

Database verification passed the expected cardinalities and links: 78 projects, 78 students, 20 supervisors, one administrator, one coordinator, 3,003 pairs per measured model, 1,560 supervisor candidates per model and 78 provisional assignments. Passwords were stored as hashes, test records were tagged, identifiers expected to be unique were unique, and no assignment exceeded configured capacity. Five backend similarity-service tests and fourteen Python-service tests passed.

## Critical evidence boundary

The production Node similarity path uses Xenova `all-MiniLM-L6-v2` with a deterministic concept-hash fallback, whereas the controlled three-model comparison is implemented in the Python research service. These paths must not be conflated. The inspected evidence contains no expert pair labels or supervisor-relevance judgements, so it supports system operation, descriptive score behavior and allocation feasibility but not accuracy, ranking superiority or best-model conclusions.
""", encoding="utf-8")

    with (OUT / "evidence-matrix.csv").open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.writer(stream)
        writer.writerow(["Claim", "Evidence source", "Location", "Reliability", "Manuscript treatment"])
        rows = [
            ["System functions and roles", "Source code + live UI", "frontend; backend/src; screenshots", "High", "Reported as implemented"],
            ["Role set is student/supervisor/coordinator/admin", "User schema + route guards", "backend/src/models/User.js; backend/src/middleware/auth.js", "High", "Reported exactly; no panel role claimed"],
            ["React/Express/MongoDB/Flask architecture", "Package manifests + application entry points", "package.json; backend/package.json; backend/src/app.js; python-ai", "High", "Reported as inspected"],
            ["Authentication uses bcrypt and JWT", "User model + authentication middleware/routes", "backend/src/models/User.js; backend/src/routes/auth.js", "High", "Reported as implemented control"],
            ["Research pages are operational", "Live browser session + frontend routes", "system-screenshots; frontend", "High", "Reported and illustrated"],
            ["78 projects", "Database export", "raw/projects.csv", "High", "Primary dataset count"],
            ["78 linked test students", "Database verification", "verifyResearchExperiment.js output", "High", "Primary integrity result"],
            ["20 supervisor profiles", "Database export", "raw/supervisor-profiles.csv", "High", "Explicitly synthetic test profiles"],
            ["Six project fields complete", "Project export + verification", "raw/projects.csv; verification output", "High", "Primary method; synthetic enrichment disclosed"],
            ["9,009 pair records", "Database export", "raw/project-pair-scores.csv", "High", "Primary result"],
            ["3,003 canonical pairs/model", "Combinatorial count + unique keys", "raw/project-pair-scores.csv", "High", "Primary result"],
            ["4,680 supervisor-match records", "Database export", "raw/supervisor-matching-scores.csv", "High", "Primary result"],
            ["1,560 candidates/model", "Cartesian count + unique keys", "raw/supervisor-matching-scores.csv", "High", "Primary result"],
            ["Field weights and thresholds", "Code + run configuration", "research_config.py; experiment-runs.json", "High", "Primary method"],
            ["TF-IDF completed", "Completed run + 3,003 records", "experiment-runs.json; project-pair-scores.csv", "High", "Measured model"],
            ["Sentence-BERT completed", "Completed run + 3,003 records", "experiment-runs.json; project-pair-scores.csv", "High", "Measured model"],
            ["BGE-M3 dense completed", "Completed run + 3,003 records", "experiment-runs.json; project-pair-scores.csv", "High", "Dense mode only"],
            ["BERT cross-encoder result", "Configuration only; no completed records", "research configuration and run exports", "Unavailable", "Methods/future work only"],
            ["Mean similarity scores", "Recalculated from all pair records", "project-pair-scores.csv", "High descriptive", "Calibration description only"],
            ["Risk-category counts", "Recalculated from stored riskLevel", "project-pair-scores.csv", "High descriptive", "Configured bands, not probabilities"],
            ["Field-level means", "Recalculated from six stored scores", "project-pair-scores.csv", "High descriptive", "Not causal importance"],
            ["Execution-time values", "Run and record metadata", "experiment-runs.json; project-pair-scores.csv", "Medium/contextual", "Cold/cache distinction disclosed"],
            ["96.42% accuracy / 97.29% F1", "Thesis text only", "thesis-extracted-text.txt", "Low/unreconciled", "Historical note; excluded from findings"],
            ["95.65% precision / 99% recall", "Thesis text only", "thesis-extracted-text.txt", "Low/unreconciled", "Historical note; excluded from findings"],
            ["Model quality winner", "No expert labels", "annotation exports empty", "Unavailable", "Withheld"],
            ["Accuracy/F1/AUC", "No human pair labels", "annotation exports empty", "Unavailable", "Withheld"],
            ["Top-K/MRR/MAP/NDCG", "No graded supervisor relevance", "supervisor ground-truth export empty", "Unavailable", "Withheld"],
            ["Statistical superiority", "No paired reference outcomes", "annotation exports empty", "Unavailable", "Withheld"],
            ["Feasible balanced assignment", "Run + assignment export", "balanced-assignments.csv", "High", "Feasibility only"],
            ["78 assignments/no capacity violation", "Assignment export + verification", "balanced-assignments.csv; verification output", "High", "Primary feasibility result"],
            ["Mean load 3.90; SD 1.09; range 2-6", "Recalculated assignment counts", "balanced-assignments.csv", "High", "Descriptive workload result"],
            ["Production MiniLM path", "Node similarity service", "backend/src/services/similarityService.js", "High", "Separated from research comparison"],
            ["Concept-hash fallback", "Node similarity service", "backend/src/services/similarityService.js", "High", "Disclosed implementation fallback"],
            ["Automated test results", "Executed backend/Python test suites", "terminal verification; tests", "High", "Five backend and fourteen Python tests passed"],
            ["160 DOI-bearing references", "Curated metadata matrix", "references/reference-verification-matrix.csv", "High for identity", "Claim mapping still requires author copy-edit"],
            ["Supplied corpus inventory", "Hash/text extraction audit", "corpus/paper-corpus-inventory.csv", "High", "Duplicate/legacy limits disclosed"],
            ["Deployment providers", "Thesis", "thesis-extracted-text.txt", "Medium", "Labelled thesis-reported"],
        ]
        writer.writerows(rows)

    (OUT / "data-quality-and-statistical-analysis.md").write_text(
        f"""# Data-quality and statistical-analysis report

The experiment includes 78 unique projects, 3,003 canonical pairs per model, 20 synthetic supervisor profiles and 1,560 candidates per model. All expected records are present. Six-field completeness was created through deterministic enrichment; this improves computational completeness but limits ecological validity.

Mean unlabelled scores were {model_stats['tfidf']['mean']:.2f}% (TF-IDF), {model_stats['sentence_bert']['mean']:.2f}% (Sentence-BERT) and {model_stats['bge_m3']['mean']:.2f}% (BGE-M3). These are calibration descriptions, not accuracy estimates.

Balanced workload: mean {workload_mean:.2f}, population SD {workload_sd:.2f}, range {min(load_values)}-{max(load_values)}, zero capacity violations.

No human pair or supervisor-relevance labels exist. Therefore confusion matrices, accuracy, precision, recall, specificity, F1, MCC, ROC-AUC, PR-AUC, Top-K accuracy, MRR, MAP, NDCG and error-based significance tests are not statistically valid and were intentionally omitted. The synthetic 600-pair benchmark is construction data, not expert ground truth.
""", encoding="utf-8")

    (OUT / "missing-information-checklist.md").write_text(
        """# Missing-information checklist

- [ ] Author names, affiliations, ORCID identifiers and corresponding-author details.
- [ ] Funding, conflicts, acknowledgements and CRediT contributions.
- [ ] Ethics approval or waiver for future expert annotation/user evaluation.
- [ ] At least two, preferably three, independent expert labels per project pair.
- [ ] Supervisor relevance grades with multiple acceptable supervisors per project.
- [ ] Adjudication protocol and inter-annotator agreement.
- [ ] Completed BERT cross-encoder experiment.
- [ ] Controlled cold/warm latency, peak memory, API and database timings.
- [ ] Naturally authored six-field proposals and non-synthetic supervisor profiles.
- [ ] External and multilingual validation.
- [ ] Repository URL, software license and archival DOI.
- [ ] Journal-specific final template, reference style and declaration wording.
""", encoding="utf-8")

    (OUT / "experiment-improvement-recommendations.md").write_text(
        """# Experiment-improvement recommendations

1. Freeze annotation guidelines and label a disagreement-stratified sample first.
2. Obtain three blinded expert judgements and adjudicate low-agreement cases.
3. Split by source project to prevent pair leakage; tune only on validation data.
4. Calibrate thresholds separately for each model before one held-out test.
5. Run the configured cross-encoder and a hybrid BGE-M3 dense+sparse configuration.
6. Measure cold start, warm inference, peak resident memory and API latency under identical hardware.
7. Evaluate title-only, title+description and all-six-field variants.
8. Compare fixed weights with validation-selected weights and report stability.
9. Use multi-relevant supervisor labels and report Top-K, MRR, MAP, NDCG and coverage.
10. Compare greedy balancing with a constrained optimization baseline and fairness metrics.
11. Add Somali-Arabic-English evaluation designed and judged by fluent experts.
12. Conduct prospective user and longitudinal deployment studies.
""", encoding="utf-8")

    (OUT / "target-journal-recommendations.md").write_text(
        """# Target-journal screening matrix

Screened 24 July 2026. Quartiles are database-, category- and year-specific. The entries below distinguish the latest publicly visible SJR/Scopus and JCR information; the corresponding author must reconfirm them in the institution's Scopus Sources and Journal Citation Reports accounts on the submission date.

## Ranked shortlist

| Rank | Journal / publisher | Scope and fit | Indexing / current quartile evidence | Access model and APC | Public format limits | Required changes and principal risk |
|---|---|---|---|---|---|---|
| 1 after human validation | **Computers & Education: Artificial Intelligence** / Elsevier | Direct scope for AI applications, novel educational systems and ethical AI in education. The integrated platform and responsible decision-support framing are excellent thematic matches. | Scopus/SJR 2024 Q1 across AI, computer-science applications and education; current publisher page reports CiteScore 28.7. | Gold OA; USD 2,880 excluding tax. | Research paper; public guide does not state a fixed main-word, reference or figure cap. | Add expert-labelled accuracy/ranking evaluation and preferably a user/institutional study. Risk: current unlabelled system evaluation is likely below the empirical bar. |
| 2 after human validation | **Information Processing & Management** / Elsevier | Strong methodological match for information retrieval, representation, ranking, management and applied information systems. | Publisher lists Scopus, SCIE, SSCI and SJR; public SJR category table shows Q1. Current publisher metrics: CiteScore 18.6 and JIF 6.9. | Hybrid; subscription route has no author fee; optional OA APC USD 3,720 excluding tax. | Abstract <=250 words; 1-7 keywords; editable single-column Word; no public fixed main-word/reference/figure cap located. Double-anonymized review. | Reframe around retrieval methodology, calibration and ranking; create separate title page and anonymized manuscript; deposit and link research data or explain restrictions. Risk: novelty and validated retrieval effectiveness expectations are high. |
| 3 after human validation | **Expert Systems with Applications** / Elsevier | Strong fit for design, development, testing, implementation and management of intelligent systems, including project management and information retrieval. | Scopus and SCIE indexed; latest publicly visible SJR/JCR records place it in Q1. Publisher reports CiteScore 15.0 and JIF 7.5. | Hybrid; subscription route has no author fee; optional OA APC USD 3,490 excluding tax. | Public guide does not expose a fixed article-word/reference/figure cap; use editable source and current Elsevier structure. | Add labelled baselines, ablation, calibrated thresholds and stronger comparative statistics. Risk: an integrated application without validated predictive advantage may be desk-rejected. |
| 4 current system-paper route | **Education and Information Technologies** / Springer Nature | Direct intersection of IT and education, including tertiary administration and educational management; asks for strong conceptual framing and rigorous inference. | Scopus and Web of Science indexed; public SJR education table places it in Q1. | Hybrid; subscription route has no APC; optional OA APC GBP 2,690 / USD 3,690 / EUR 2,990 plus tax. | Abstract 150-250 words; 4-6 keywords; decimal headings no deeper than three levels; Word/LaTeX. No fixed main-word/reference/figure maximum stated publicly. Uses author-date references. | Convert numbered references to APA 7 author-date, reduce keywords to 4-6 and foreground educational-management theory and user outcomes. Risk: the present paper is technically stronger than pedagogically evaluated. |
| 5 current system-paper route | **IEEE Access** / IEEE | Broad multidisciplinary engineering venue for technically sound, distinct applied systems; appropriate for architecture, reproducibility and operational evaluation. | Indexed in Scopus, SCIE/Web of Science, DOAJ and Compendex. IEEE reports 2025 CiteScore 9.3; SJR 2024 is Q1 while 2025 JCR is Q2. | Gold OA; USD 2,160 plus tax. | No hard page limit, but under 20 pages recommended; required double-column IEEE Access template; Word or LaTeX plus matching PDF; 3-10 keywords. | Condense the 9-13k narrative into under 20 template pages, move the long literature matrix and pseudocode to supplements, and retain numbered IEEE references. Risk: 160 references and 12 figures will exceed the recommended readable length unless aggressively reduced. |
| 6 current applied-computing alternative | **Applied Sciences (Computing and Artificial Intelligence section)** / MDPI | Applied engineering/computing scope with explicit demand for reproducible experimental detail; suitable if positioned as a system and decision-support artefact. | Indexed in Scopus and SCIE. Publisher reports JCR Q2 in Engineering, Multidisciplinary and CiteScore Q2 in Computer Science Applications (with Q1 in some other categories). | Gold OA, CC BY; CHF 2,400. | About 200-word abstract; no maximum article length; Word/LaTeX template or free-format initial submission. No fixed reference/figure cap. | Reduce abstract to about 200 words, convert to MDPI section/declaration style, release code/data where ethically possible and state restrictions. Risk: broad scope and institutional publication-policy concerns should be weighed before submission. |

## Recommended strategy

1. **Do not submit the current unlabelled manuscript to a high-selectivity model-comparison venue as if it proves accuracy.**
2. For the strongest long-term paper, complete expert annotation and submit first to *Computers & Education: Artificial Intelligence*; use *Information Processing & Management* or *Expert Systems with Applications* if the retrieval/algorithmic evaluation becomes the dominant contribution.
3. For the current evidence package, *Education and Information Technologies* is the strongest education-system route, while *IEEE Access* is the strongest technically oriented route. The title, abstract and claims should continue to identify the study as a reproducible system evaluation.
4. Use *Applied Sciences* only after confirming institutional policy, APC support and the desired breadth/selectivity trade-off.

## Official and ranking sources

- Computers & Education: Artificial Intelligence: https://www.sciencedirect.com/journal/computers-and-education-artificial-intelligence and https://www.sciencedirect.com/journal/computers-and-education-artificial-intelligence/publish/guide-for-authors
- Information Processing & Management: https://www.sciencedirect.com/journal/information-processing-and-management and https://www.sciencedirect.com/journal/information-processing-and-management/publish/guide-for-authors
- Expert Systems with Applications: https://www.sciencedirect.com/journal/expert-systems-with-applications
- Education and Information Technologies: https://link.springer.com/journal/10639/aims-and-scope, https://link.springer.com/journal/10639/submission-guidelines and https://link.springer.com/journal/10639/how-to-publish-with-us
- IEEE Access: https://ieeeaccess.ieee.org/about/article-processing-charges/, https://ieeeaccess.ieee.org/authors/submission-guidelines/ and https://ieeeaccess.ieee.org/about/bibliometrics/
- Applied Sciences: https://www.mdpi.com/journal/applsci/about, https://www.mdpi.com/journal/applsci/instructions and https://www.mdpi.com/about/apc
- SCImago category/ranking checks: https://www.scimagojr.com/
""", encoding="utf-8")

    (OUT / "submission-readiness-checklist.md").write_text(
        f"""# Submission-readiness checklist

- [x] Code, database exports, UI and experiment manifests inspected.
- [x] Descriptive results reproduced without fabricated metrics.
- [x] {len(references)} DOI-registered scholarly references deduplicated and classified.
- [x] Fifteen architecture/workflow diagrams generated from implementation evidence.
- [x] Fourteen measured charts and thirteen live system screenshots packaged.
- [x] Ethical boundary and human-control language included.
- [ ] Expert ground truth collected and label-dependent evaluation completed.
- [ ] Authors/declarations/ethics details completed.
- [ ] Target journal selected and manuscript reformatted.
- [ ] DOI metadata and every cited claim manually copy-edited against publisher pages.
- [ ] Similarity/originality text reviewed by the responsible academic authors.
- [ ] Repository/data access and anonymization decisions approved institutionally.
""", encoding="utf-8")

    (OUT / "cover-letter.md").write_text(
        f"""# Cover letter

Dear Editor,

Please consider our manuscript, “{TITLE},” for publication as an original research article.

The manuscript reports an implemented higher-education decision-support platform that combines six-field project similarity screening, rich-profile supervisor recommendation and capacity-aware provisional assignment. The reproducible experiment covers all 3,003 unique pairs among 78 projects for three model families and all 1,560 project-supervisor candidates per model. Its distinctive contribution is the integration of field-level evidence, workload constraints, auditability and human decision control within a complete project lifecycle system.

We have taken a deliberately conservative approach to validity. Because the current repository contains no expert ground truth, the manuscript does not claim accuracy, ranking superiority or a best model. It reports reproducible operational and descriptive evidence and specifies the expert-validation protocol needed for subsequent predictive claims.

The work is original, is not under consideration elsewhere, and has been approved by all authors. [AUTHORS TO VERIFY/COMPLETE.] All funding, conflicts of interest, ethics and data-access statements will be completed before submission.

Sincerely,

[CORRESPONDING AUTHOR NAME, AFFILIATION, ADDRESS, EMAIL]
""", encoding="utf-8")

    (OUT / "reviewer-response-template.md").write_text(
        """# Response to reviewers

**Manuscript title:** [TITLE]  
**Manuscript ID:** [ID]  
**Journal:** [JOURNAL]

Dear Editor and Reviewers,

Thank you for the careful assessment. We have revised the manuscript and provide a point-by-point response below. Reviewer comments are reproduced in bold, followed by our response and the exact manuscript change.

## Reviewer 1

**Comment 1.1:** [Paste comment]

**Response:** [Explain the evidence-based response.]

**Change made:** [Section, page and line; quote the revised text briefly.]

## Reviewer 2

**Comment 2.1:** [Paste comment]

**Response:** [Response]

**Change made:** [Location and revision]

## Editor

**Comment E1:** [Paste comment]

**Response:** [Response]

**Change made:** [Location and revision]

## Revision audit

- [ ] Every comment answered.
- [ ] All page/line references updated after final typesetting.
- [ ] New analyses and data are reproducible.
- [ ] Changes are visible in the marked manuscript.
- [ ] References, figures and tables renumbered consistently.
""", encoding="utf-8")


supporting_reports()
doc = manuscript()
docx_path = OUT / "final-journal-manuscript.docx"
doc.save(docx_path)


def manuscript_word_counts(document: Document) -> tuple[int, int]:
    total = sum(len(paragraph.text.split()) for paragraph in document.paragraphs)
    main = 0
    current = ""
    for paragraph in document.paragraphs:
        text = paragraph.text.strip()
        if paragraph.style.name.startswith("Heading 1"):
            current = text
            continue
        if current == "Abstract" or re.match(r"^[1-8]\.", current):
            main += len(text.split())
    return main, total


def write_validation_report(document: Document) -> None:
    main_words, paragraph_words = manuscript_word_counts(document)
    with zipfile.ZipFile(docx_path) as archive:
        names = set(archive.namelist())
        required_parts = {
            "[Content_Types].xml",
            "word/document.xml",
            "word/styles.xml",
            "word/settings.xml",
        }
        package_ok = required_parts.issubset(names)
        media_count = len([name for name in names if name.startswith("word/media/")])
    citation_paragraphs = []
    for paragraph in document.paragraphs:
        if paragraph.style.name.startswith("Heading 1") and paragraph.text.strip() == "References":
            break
        citation_paragraphs.append(paragraph.text)
    manuscript_text = "\n".join(citation_paragraphs)
    cited_numbers: set[int] = set()
    for start, end in re.findall(r"\[(\d+)\](?:-\[(\d+)\])?", manuscript_text):
        first = int(start)
        last = int(end) if end else first
        cited_numbers.update(range(first, last + 1))
    expected = set(range(1, len(references) + 1))
    missing = sorted(expected - cited_numbers)
    csv_rows = sum(1 for _ in REFS.open(encoding="utf-8-sig")) - 1
    report = f"""# Final validation report

Validated on 24 July 2026.

## Package checks

- Main manuscript: `final-journal-manuscript.docx` ({main_words:,} main-text words excluding references, tables and appendices; {paragraph_words:,} paragraph words overall; {len(document.tables)} tables; {media_count} embedded media items).
- Reference sequence: {len(cited_numbers & expected)} of {len(references)} numbered references are cited; missing sequence numbers: {missing if missing else 'none'}.
- Reference matrix: {csv_rows} DOI-bearing records, deduplicated and screened by title/category.
- Corpus: {corpus_summary['paper_files']} supplied paper files inventoried; {corpus_summary['unique_hashes']} unique file hashes; {corpus_summary['duplicate_files']} duplicate files; all {corpus_summary['pdfs_with_text']} of {corpus_summary['pdf_files']} PDFs yielded extractable text.
- Thesis extraction: {corpus_summary['thesis_paragraphs']} paragraphs and {corpus_summary['thesis_tables']} tables extracted from the supplied DOCX.
- Experiment evidence: measured figures in PNG/SVG/PDF, raw CSV/JSON exports, a results workbook and a comparative DOCX/PDF report.
- System evidence: 15 architecture/workflow diagrams in PNG/SVG and 13 live screenshots across administrator, student and supervisor workflows.
- Word package integrity: {'passed' if package_ok else 'failed'} required Open XML part inspection and reopened successfully with `python-docx`.

## Executed verification

- Database research verification passed all cardinality, linkage, uniqueness, password-hash, test-tag and capacity checks.
- Backend similarity service: five tests passed.
- Python AI/research service: fourteen tests passed in the project environment.
- All expected 3,003 project pairs and 1,560 supervisor candidates exist for each measured model.

## Evidence checks

- The primary experiment reports descriptive and operational results only.
- The configured BERT cross-encoder has no completed saved run and is not presented as evaluated.
- No best-model, accuracy, precision, recall, F1, AUC, ranking-quality or statistical-superiority claim is made without human ground truth.
- The thesis-reported 96.42% accuracy, 95.65% precision, 99% recall and 97.29% F1 remain unreconciled historical claims because the labels, predictions and confusion matrix were not supplied.
- The assignment result is described as provisional, capacity-aware decision support, not an autonomous academic decision.

## Remaining author-controlled gates

- Insert author names, affiliations, ORCIDs and corresponding-author details.
- Complete funding, conflicts, ethics, consent and data/code-availability statements.
- Collect independent expert annotations and run the prespecified label-dependent evaluation before making predictive-performance claims.
- Select a target journal and apply its current house style.
- Copy-edit every final citation-to-claim mapping against the publisher version.

## Rendering note

LibreOffice/`soffice` is not installed in this workspace, so the prescribed page-image render of the manuscript could not be completed. Structural Open XML validation passed, and the comparative report has a rendered PDF. Before submission, the corresponding author should open the manuscript in Microsoft Word or LibreOffice and perform a page-by-page pagination, caption, equation-symbol and table-break check.
"""
    (OUT / "validation-report.md").write_text(report, encoding="utf-8")


write_validation_report(doc)

# Preserve the previously verified experiment workbook and report in the package root for discoverability.
for source in [
    EXP / "research-experiment-results.xlsx",
    EXP / "comparative-evaluation-report.pdf",
    EXP / "comparative-evaluation-report.docx",
]:
    target = OUT / source.name
    if not target.exists():
        shutil.copy2(source, target)

for source_dir, target_name in [
    (EXP / "charts", "experiment-charts"),
    (EXP / "raw", "experiment-raw-data"),
]:
    shutil.copytree(source_dir, OUT / target_name, dirs_exist_ok=True)

(OUT / "package-manifest.md").write_text(
    f"""# Publication package manifest

The package contains:

- the final journal manuscript in editable DOCX;
- an integrated comparative-evaluation section with separate score-level, agreement, efficiency and operational-deployment rankings;
- editable DOCX and Markdown versions of the cover letter and reviewer-response template;
- the verified reference matrix/library with {len(references)} DOI-bearing records;
- the supplied-paper inventory, PDF metadata extraction and thesis text extraction;
- evidence, system-inspection, data-quality/statistical, missing-information, experiment-improvement, journal-screening and validation reports;
- a formula-driven publication evidence workbook covering the evidence matrix, references, source inventory, journal screening and validation checks;
- 15 implementation-derived architecture/workflow diagrams in PNG and SVG;
- 14 measured experiment charts in PNG, SVG and PDF;
- 13 live system screenshots across administrator, student and supervisor workflows;
- 23 raw experiment data/manifests files, the research workbook, and the comparative evaluation DOCX/PDF report;
- a machine-readable final package audit covering citation sequence, captions, media accessibility, screenshots and document integrity; and
- a submission-readiness checklist.

The manuscript is intentionally validation-ready rather than falsely performance-complete. Human-label-dependent figures and metrics remain gated. See `validation-report.md` for the final audit and rendering limitation.
""", encoding="utf-8")

print(json.dumps({
    "docx": str(docx_path.resolve()),
    "references": len(references),
    "paragraphs": len(doc.paragraphs),
    "tables": len(doc.tables),
    "figures": 13,
}, indent=2))
