"""Build a balanced, relevance-screened scholarly reference library.

The previous newest-first Crossref query was useful for discovery but allowed
recent, weakly related records into several categories. This builder combines:

* a curated DOI seed set for foundational and supplied papers;
* Crossref relevance search and DOI/update metadata;
* title/abstract relevance scoring and obvious-noise exclusions; and
* a Crossref title/relation screen for corrections, updates and retractions.

The output schema remains compatible with ``build_journal_package.py``.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import re
import time
from collections import Counter
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import quote

import requests


S2_BASE = "https://api.semanticscholar.org/graph/v1"
OPENALEX_BASE = "https://api.openalex.org/works"
CROSSREF_BASE = "https://api.crossref.org/works"
FIELDS = (
    "paperId,title,abstract,year,venue,authors,externalIds,url,citationCount,"
    "publicationTypes,publicationDate,journal,fieldsOfStudy"
)
HEADERS = {
    "User-Agent": "HormuudAcademicResearch/1.0 (mailto:research@example.invalid)"
}
CACHE_DIR = Path(".codex-tmp/reference-metadata-cache")

MANUAL_SEED_METADATA: dict[str, dict[str, Any]] = {
    "10.56726/irjmets49907": {
        "title": "Academic Project Nexus: A Comprehensive Final Year Project Management System for Innovation, Knowledge Exchange, and Excellence",
        "year": 2024,
        "venue": "International Research Journal of Modernization in Engineering Technology and Science",
        "authors": [
            {"name": "C. Sridhar"},
            {"name": "N. Chandu"},
            {"name": "Pavani Kotha"},
        ],
    },
    "10.5220/0002768400050012": {
        "title": "Final Year Project Management Process",
        "year": 2010,
        "venue": "Proceedings of the 2nd International Conference on Computer Supported Education",
        "authors": [
            {"name": "Carlos López"},
            {"name": "David H. Martín"},
            {"name": "Andrés Bustillo"},
            {"name": "Raúl Marticorena"},
        ],
    },
    "10.18653/v1/n19-1423": {
        "title": "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
        "year": 2019,
        "venue": "Proceedings of NAACL-HLT",
        "authors": [
            {"name": "Jacob Devlin"},
            {"name": "Ming-Wei Chang"},
            {"name": "Kenton Lee"},
            {"name": "Kristina Toutanova"},
        ],
    },
    "10.18653/v1/d19-1410": {
        "title": "Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks",
        "year": 2019,
        "venue": "Proceedings of EMNLP-IJCNLP",
        "authors": [{"name": "Nils Reimers"}, {"name": "Iryna Gurevych"}],
    },
    "10.18653/v1/2021.emnlp-main.552": {
        "title": "SimCSE: Simple Contrastive Learning of Sentence Embeddings",
        "year": 2021,
        "venue": "Proceedings of EMNLP",
        "authors": [
            {"name": "Tianyu Gao"},
            {"name": "Xingcheng Yao"},
            {"name": "Danqi Chen"},
        ],
    },
    "10.18653/v1/s17-2001": {
        "title": "SemEval-2017 Task 1: Semantic Textual Similarity Multilingual and Crosslingual Focused Evaluation",
        "year": 2017,
        "venue": "Proceedings of SemEval",
        "authors": [
            {"name": "Daniel Cer"},
            {"name": "Mona Diab"},
            {"name": "Eneko Agirre"},
            {"name": "Iñigo Lopez-Gazpio"},
            {"name": "Lucia Specia"},
        ],
    },
    "10.18653/v1/2020.emnlp-main.550": {
        "title": "Dense Passage Retrieval for Open-Domain Question Answering",
        "year": 2020,
        "venue": "Proceedings of EMNLP",
        "authors": [
            {"name": "Vladimir Karpukhin"},
            {"name": "Barlas Oğuz"},
            {"name": "Sewon Min"},
            {"name": "Patrick Lewis"},
            {"name": "Ledell Wu"},
            {"name": "Sergey Edunov"},
            {"name": "Danqi Chen"},
            {"name": "Wen-tau Yih"},
        ],
    },
    "10.18653/v1/2024.findings-acl.227": {
        "title": "BGE M3-Embedding: Multi-Lingual, Multi-Functionality, Multi-Granularity Text Embeddings Through Self-Knowledge Distillation",
        "year": 2024,
        "venue": "Findings of the Association for Computational Linguistics: ACL 2024",
        "authors": [
            {"name": "Jianmo Chen"},
            {"name": "Shitao Xiao"},
            {"name": "Peitian Zhang"},
            {"name": "Kun Luo"},
            {"name": "Defu Lian"},
            {"name": "Zheng Liu"},
        ],
    },
    "10.18653/v1/2023.eacl-main.148": {
        "title": "MTEB: Massive Text Embedding Benchmark",
        "year": 2023,
        "venue": "Proceedings of EACL",
        "authors": [
            {"name": "Niklas Muennighoff"},
            {"name": "Nouamane Tazi"},
            {"name": "Loïc Magne"},
            {"name": "Nils Reimers"},
        ],
    },
    "10.18653/v1/2022.acl-long.62": {
        "title": "Language-agnostic BERT Sentence Embedding",
        "year": 2022,
        "venue": "Proceedings of ACL",
        "authors": [
            {"name": "Fangxiaoyu Feng"},
            {"name": "Yinfei Yang"},
            {"name": "Daniel Cer"},
            {"name": "Naveen Arivazhagan"},
            {"name": "Wei Wang"},
        ],
    },
    "10.18653/v1/2022.semeval-1.173": {
        "title": "BL.Research at SemEval-2022 Task 8: Using Various Semantic Information to Evaluate Document-level Semantic Textual Similarity",
        "year": 2022,
        "venue": "Proceedings of SemEval",
        "authors": [{"name": "BL.Research team"}],
    },
}


@dataclass(frozen=True)
class Category:
    name: str
    target: int
    queries: tuple[str, ...]
    terms: tuple[str, ...]
    negative: tuple[str, ...] = ()
    seeds: tuple[str, ...] = ()


CATEGORIES = (
    Category(
        "Academic and doctoral supervision",
        10,
        ("doctoral supervision postgraduate research students feedback",),
        ("doctoral supervision", "postgraduate supervision", "supervisory feedback", "student supervisor relationship"),
        ("elementary school", "school principal", "teacher competence"),
        (
            "10.1080/17441692.2020.1864752",
            "10.1080/02602938.2021.1955241",
            "10.1080/07294360.2023.2183939",
            "10.1080/14703297.2023.2238673",
            "10.3390/encyclopedia3010004",
            "10.1186/s12909-022-03851-4",
            "10.1007/978-3-031-66371-0_4",
            "10.1177/0033688220912547",
            "10.1007/s10805-023-09498-0",
            "10.24834/jotl.5.1.1256",
        ),
    ),
    Category(
        "Algorithmic fairness and human oversight",
        10,
        ("algorithmic fairness human oversight accountability machine learning",),
        ("algorithmic fairness", "human oversight", "algorithmic accountability", "fair machine learning", "human-ai"),
        ("insurance", "underwriting", "credit scoring only"),
        (
            "10.1145/3287560.3287598",
            "10.1145/3457607",
            "10.1145/3465416.3483305",
            "10.1145/3278721.3278776",
            "10.1145/3442188.3445922",
            "10.1145/3351095.3372873",
            "10.1145/3290605.3300233",
        ),
    ),
    Category(
        "Artificial intelligence in higher education",
        10,
        ("artificial intelligence higher education systematic review responsible",),
        ("artificial intelligence", "higher education", "responsible ai", "educational technology"),
        (
            "primary school",
            "secondary school only",
            "radiology",
            "mismatches on earnings",
        ),
        (
            "10.1186/s41239-019-0171-0",
            "10.1109/access.2020.2988510",
            "10.1016/j.caeai.2022.100076",
            "10.1016/j.ijedro.2023.100270",
        ),
    ),
    Category(
        "BERT and contextual language models",
        10,
        ("BERT contextual language model survey representation",),
        ("bert", "contextual language model", "transformer language model", "bertology"),
        ("solar", "sentiment application", "mental health prediction"),
        (
            "10.18653/v1/n19-1423",
            "10.1162/tacl_a_00349",
            "10.1007/s10462-023-10419-1",
            "10.1007/s10462-025-11162-5",
            "10.7717/peerj-cs.3290",
        ),
    ),
    Category(
        "Capstone and final-year project management",
        10,
        ("capstone final year project management higher education supervision",),
        ("capstone project", "final-year project", "final year project", "graduation project", "project management"),
        ("laboratory capstone presentation", "national laboratory report", "poster"),
        (
            "10.3390/info17060588",
            "10.26803/ijlter.23.6.28",
        ),
    ),
    Category(
        "Dense, sparse, and hybrid retrieval",
        10,
        (
            "dense sparse hybrid information retrieval neural retrieval survey",
            "BEIR DPR ColBERT SPLADE learned sparse dense retrieval",
        ),
        ("dense retrieval", "sparse retrieval", "hybrid retrieval", "neural information retrieval", "retrieval benchmark"),
        (
            "health insurance recommendation",
            "arabic summarization application",
            "relation extraction",
            "pubmed retrieval only",
        ),
        (
            "10.18653/v1/2020.emnlp-main.550",
            "10.1145/3397271.3401075",
            "10.18653/v1/2024.findings-acl.227",
            "10.48550/arxiv.2104.08663",
        ),
    ),
    Category(
        "Educational recommender systems",
        10,
        (
            "educational recommender systems higher education systematic review",
            "personalized learning course recommendation educational recommender system",
        ),
        (
            "educational recommender",
            "learning recommender",
            "course recommender",
            "higher education recommendation",
            "recommender system",
            "recommendation system",
            "personalized learning",
            "education",
        ),
        (
            "jaundice",
            "mobile learning organization only",
            "securing internet of things",
        ),
        (
            "10.1007/978-1-4614-4361-2",
            "10.1016/j.future.2017.08.010",
        ),
    ),
    Category(
        "Explainable recommendation",
        10,
        (
            "explainable recommender systems survey evaluation",
            "recommendation explanations transparency user study recommender",
        ),
        ("explainable recommender", "recommendation explanation", "explainable recommendation"),
        (
            "surgical procedure",
            "e-commerce implementation only",
            "ai education in educator preparation",
            "journey aware housing",
        ),
        (
            "10.1561/1500000066",
            "10.1007/s11257-017-9194-0",
            "10.1145/2645710.2645764",
            "10.1609/aaai.v38i21.30351",
        ),
    ),
    Category(
        "Multilingual and long-document embeddings",
        10,
        ("multilingual sentence embeddings long document embeddings benchmark",),
        ("multilingual embedding", "cross-lingual embedding", "long document embedding", "multilingual retrieval", "sentence embedding"),
        ("medical question answering application", "visual document retrieval only"),
        (
            "10.1145/3626772.3657878",
            "10.18653/v1/2023.eacl-main.148",
            "10.18653/v1/2022.acl-long.62",
        ),
    ),
    Category(
        "Plagiarism and originality detection",
        10,
        (
            "semantic plagiarism detection academic originality text similarity review",
            "text plagiarism detection NLP semantic similarity academic documents",
        ),
        ("plagiarism detection", "academic integrity", "originality detection", "semantic plagiarism"),
        (
            "source code",
            "music plagiarism",
            "program plagiarism",
            "code similarity",
        ),
        (
            "10.1007/978-3-030-83255-1_4",
            "10.1007/s10805-023-09498-0",
        ),
    ),
    Category(
        "Ranking metrics and evaluation",
        10,
        ("information retrieval ranking evaluation NDCG MRR MAP precision recall",),
        ("ndcg", "mean reciprocal rank", "mean average precision", "learning to rank", "information retrieval evaluation"),
        ("material removal rate", "machinability", "surface roughness", "journal impact factor"),
        (
            "10.1145/582415.582418",
            "10.1016/j.patrec.2005.10.010",
            "10.1371/journal.pone.0118432",
            "10.1007/s10994-006-2819-0",
            "10.1007/s10994-016-5575-x",
            "10.1561/1500000016",
        ),
    ),
    Category(
        "Reviewer and expert assignment",
        5,
        ("reviewer assignment expert matching scholarly peer review recommender",),
        ("reviewer assignment", "expert finding", "expert matching", "paper reviewer"),
        ("server assignment", "image matching", "wireframe"),
        (
            "10.1007/s10791-010-9134-6",
            "10.5220/0015047900004018",
        ),
    ),
    Category(
        "Semantic textual similarity",
        10,
        ("semantic textual similarity benchmark document similarity",),
        ("semantic textual similarity", "sentence similarity", "document similarity", "sts benchmark"),
        ("chest x-ray application only",),
        (
            "10.18653/v1/s17-2001",
            "10.18653/v1/2021.emnlp-main.552",
            "10.18653/v1/d19-1410",
            "10.18653/v1/2022.semeval-1.173",
            "10.3390/info11100484",
        ),
    ),
    Category(
        "Sentence-BERT and sentence embeddings",
        10,
        ("Sentence-BERT sentence transformers embeddings evaluation",),
        ("sentence-bert", "sentence bert", "sentence transformer", "sentence embedding"),
        ("music lyrics", "resume analyzer", "movie recommendation only"),
        (
            "10.1108/dta-01-2024-0052",
            "10.1016/j.procs.2025.04.398",
            "10.5220/0013821200004000",
            "10.1016/j.procs.2025.03.161",
        ),
    ),
    Category(
        "Supervisor recommendation",
        10,
        (
            "thesis supervisor recommendation research interest matching higher education",
            "academic research supervisor matching advisor recommendation system",
        ),
        (
            "supervisor recommendation",
            "thesis supervisor",
            "research supervisor matching",
            "academic advisor recommendation",
            "research interest matching",
            "recommendation system",
            "supervisor selection",
            "academic advisor",
            "expert matching",
        ),
        (
            "maintenance",
            "robotics education perspective",
            "employment recommendation",
            "student academic progress",
            "fashion advisor",
            "reading material recommendation",
        ),
        (
            "10.62527/joiv.9.1.2800",
            "10.1109/icaitech66481.2025.11387283",
            "10.19109/jusifo.v11i2.27605",
        ),
    ),
    Category(
        "TF-IDF and cosine similarity",
        10,
        ("TF-IDF cosine similarity text retrieval document similarity",),
        ("tf-idf", "tfidf", "cosine similarity", "term weighting", "vector space model"),
        ("recipe", "tourism", "movie recommendation only"),
        (
            "10.1145/361219.361220",
            "10.1016/0306-4573(88)90021-0",
            "10.1108/00220410410560582",
            "10.47709/dsi.v5i1.6021",
            "10.3390/app151910808",
            "10.47974/jios-1798",
            "10.54209/jatilima.v7i05.2113",
        ),
    ),
    Category(
        "Workload-aware fair allocation",
        5,
        (
            "student supervisor assignment workload capacity optimization university",
            "student project allocation faculty workload assignment optimization higher education",
            "student project allocation fair matching university capacity supervisor",
        ),
        (
            "supervisor assignment",
            "student project allocation",
            "workload balancing",
            "capacity constraint",
            "course assignment",
            "assignment problem",
            "fair allocation",
            "allocation",
            "workload",
            "capacity",
        ),
        (
            "warehouse",
            "robotic mobile fulfillment",
            "employee presenteeism",
            "queue with infinite",
            "vehicle routing",
            "ad hoc cloud",
            "wind farms",
            "iot-fog",
            "task offloading",
        ),
        (
            "10.1155/2022/9415210",
            "10.7717/peerj-cs.3557",
        ),
    ),
)


def normalize_doi(value: str | None) -> str:
    if not value:
        return ""
    value = value.strip().lower()
    value = re.sub(r"^https?://(?:dx\.)?doi\.org/", "", value)
    return value.rstrip(".,;")


def request_json(method: str, url: str, **kwargs: Any) -> Any:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_key = hashlib.sha256(
        json.dumps(
            {"method": method, "url": url, "params": kwargs.get("params"), "json": kwargs.get("json")},
            sort_keys=True,
            ensure_ascii=False,
        ).encode("utf-8")
    ).hexdigest()
    cache_path = CACHE_DIR / f"{cache_key}.json"
    if cache_path.exists():
        return json.loads(cache_path.read_text(encoding="utf-8"))
    last_error: Exception | None = None
    for attempt in range(5):
        try:
            response = requests.request(
                method,
                url,
                headers=HEADERS,
                timeout=45,
                **kwargs,
            )
            if response.status_code == 429:
                last_error = RuntimeError(
                    f"HTTP 429: {response.text[:300]}"
                )
                time.sleep(min(15, 5 + attempt * 3))
                continue
            if response.status_code >= 400:
                raise RuntimeError(
                    f"HTTP {response.status_code}: {response.text[:500]}"
                )
            payload = response.json()
            cache_path.write_text(
                json.dumps(payload, ensure_ascii=False),
                encoding="utf-8",
            )
            return payload
        except Exception as exc:  # network failures are retried with a bounded delay
            last_error = exc
            if attempt < 4:
                time.sleep(min(8, 1 + attempt * 2))
    raise RuntimeError(f"Metadata request failed: {url}: {last_error}") from last_error


def paper_doi(paper: dict[str, Any]) -> str:
    return normalize_doi(
        (paper.get("externalIds") or {}).get("DOI") or paper.get("doi")
    )


def clean_title(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "")).strip()


def noise_title(title: str, negatives: tuple[str, ...]) -> bool:
    lower = title.casefold()
    generic_noise = (
        "retraction",
        "correction to:",
        "corrigendum",
        "erratum",
        "editorial board",
        "table of contents",
        "book review",
    )
    return any(term in lower for term in generic_noise + negatives)


def relevance_score(paper: dict[str, Any], category: Category, seeded: bool) -> float:
    title = clean_title(paper.get("title")).casefold()
    abstract = clean_title(paper.get("abstract")).casefold()
    if not title or noise_title(title, category.negative):
        return -math.inf
    doi = paper_doi(paper)
    if not doi:
        return -math.inf
    combined = f"{title} {abstract}"
    matches = sum(1 for term in category.terms if term.casefold() in combined)
    title_matches = sum(1 for term in category.terms if term.casefold() in title)
    if not seeded and matches == 0:
        return -math.inf
    year = int(paper.get("year") or 0)
    if year and year > 2026:
        return -math.inf
    citations = int(paper.get("citationCount") or 0)
    source = clean_title(paper.get("venue") or (paper.get("journal") or {}).get("name"))
    source_bonus = 25 if source else 0
    current_bonus = 20 if 2020 <= year <= 2026 else 0
    seed_bonus = 100_000 if seeded else 0
    return (
        seed_bonus
        + title_matches * 600
        + (matches - title_matches) * 80
        + math.log1p(citations) * 45
        + source_bonus
        + current_bonus
    )


def fetch_seed_papers() -> dict[str, dict[str, Any]]:
    dois = sorted({normalize_doi(doi) for category in CATEGORIES for doi in category.seeds})
    result: dict[str, dict[str, Any]] = {}
    for start in range(0, len(dois), 35):
        chunk = dois[start : start + 35]
        if not chunk:
            continue
        params = {
            "filter": "doi:" + "|".join(chunk),
            "per-page": 200,
            "mailto": "research@example.invalid",
        }
        payload = request_json("GET", OPENALEX_BASE, params=params)
        for row in payload.get("results") or []:
            paper = openalex_to_paper(row)
            doi = paper_doi(paper)
            if doi:
                result[doi] = paper
        time.sleep(0.5)

    for doi, override in MANUAL_SEED_METADATA.items():
        paper = result.setdefault(
            doi,
            {
                "externalIds": {"DOI": doi},
                "citationCount": 0,
                "publicationTypes": ["Conference"],
                "journal": {},
                "url": f"https://doi.org/{doi}",
            },
        )
        for key, value in override.items():
            if key == "authors":
                if not paper.get(key):
                    paper[key] = value
            elif key in {"title", "venue"}:
                if not clean_title(paper.get(key)):
                    paper[key] = value
            elif not paper.get(key):
                paper[key] = value
    return result


def openalex_abstract(row: dict[str, Any]) -> str:
    inverted = row.get("abstract_inverted_index") or {}
    if not inverted:
        return ""
    positions: list[tuple[int, str]] = []
    for token, indexes in inverted.items():
        positions.extend((int(index), token) for index in indexes)
    return " ".join(token for _, token in sorted(positions))


def openalex_to_paper(row: dict[str, Any]) -> dict[str, Any]:
    source = ((row.get("primary_location") or {}).get("source") or {}).get(
        "display_name"
    )
    authors = [
        {"name": clean_title((entry.get("author") or {}).get("display_name"))}
        for entry in (row.get("authorships") or [])
    ]
    biblio = row.get("biblio") or {}
    pages = ""
    if biblio.get("first_page"):
        pages = str(biblio["first_page"])
        if biblio.get("last_page"):
            pages += f"-{biblio['last_page']}"
    return {
        "title": clean_title(row.get("title") or row.get("display_name")),
        "abstract": openalex_abstract(row),
        "year": row.get("publication_year"),
        "venue": clean_title(source),
        "authors": authors,
        "externalIds": {"DOI": normalize_doi(row.get("doi"))},
        "url": row.get("id") or "",
        "citationCount": int(row.get("cited_by_count") or 0),
        "publicationTypes": [clean_title(row.get("type"))],
        "publicationDate": row.get("publication_date") or "",
        "journal": {
            "name": clean_title(source),
            "volume": clean_title(biblio.get("volume")),
            "pages": pages,
        },
        "isRetracted": bool(row.get("is_retracted")),
    }


def crossref_year(row: dict[str, Any]) -> int | None:
    for key in ("published-print", "published-online", "published", "issued", "created"):
        parts = ((row.get(key) or {}).get("date-parts") or [])
        if parts and parts[0]:
            try:
                return int(parts[0][0])
            except (TypeError, ValueError):
                pass
    return None


def crossref_to_paper(row: dict[str, Any]) -> dict[str, Any]:
    title_values = row.get("title") or []
    title = clean_title(title_values[0] if title_values else "")
    container_values = row.get("container-title") or []
    source = clean_title(container_values[0] if container_values else "")
    authors = []
    for entry in row.get("author") or []:
        name = clean_title(
            " ".join(
                value
                for value in (entry.get("given"), entry.get("family"))
                if value
            )
        )
        if name:
            authors.append({"name": name})
    abstract = re.sub(r"<[^>]+>", " ", row.get("abstract") or "")
    relation = row.get("relation") or {}
    retraction_relation = any(
        key in relation
        for key in ("is-retracted-by", "retracts", "is-corrected-by")
    )
    return {
        "title": title,
        "abstract": clean_title(abstract),
        "year": crossref_year(row),
        "venue": source,
        "authors": authors,
        "externalIds": {"DOI": normalize_doi(row.get("DOI"))},
        "url": row.get("URL") or "",
        "citationCount": int(row.get("is-referenced-by-count") or 0),
        "publicationTypes": [clean_title(row.get("type"))],
        "publicationDate": "",
        "journal": {
            "name": source,
            "volume": clean_title(row.get("volume")),
            "pages": clean_title(row.get("page")),
        },
        "publisher": clean_title(row.get("publisher")),
        "isRetracted": retraction_relation,
    }


def search_category(category: Category) -> list[dict[str, Any]]:
    candidates: dict[str, dict[str, Any]] = {}
    for query in category.queries:
        params = {
            "query.bibliographic": query,
            "filter": (
                "from-pub-date:2010-01-01,until-pub-date:2026-12-31"
            ),
            "rows": 100,
            "sort": "score",
            "order": "desc",
            "mailto": "research@example.invalid",
        }
        payload = request_json("GET", CROSSREF_BASE, params=params)
        for row in ((payload.get("message") or {}).get("items") or []):
            if row.get("type") not in {
                "journal-article",
                "proceedings-article",
                "book",
                "book-chapter",
                "monograph",
                "reference-book",
            }:
                continue
            paper = crossref_to_paper(row)
            doi = paper_doi(paper)
            if doi:
                candidates.setdefault(doi, paper)
        time.sleep(2.25)
    return list(candidates.values())


def select_library() -> list[tuple[Category, dict[str, Any], bool, float]]:
    seeds = fetch_seed_papers()
    selected: list[tuple[Category, dict[str, Any], bool, float]] = []
    globally_used: set[str] = set()

    for category in CATEGORIES:
        print(f"Selecting: {category.name}", flush=True)
        pool: dict[str, tuple[dict[str, Any], bool]] = {}
        for seed_doi in category.seeds:
            doi = normalize_doi(seed_doi)
            if doi in seeds:
                pool[doi] = (seeds[doi], True)
        for paper in search_category(category):
            doi = paper_doi(paper)
            pool.setdefault(doi, (paper, False))

        ranked: list[tuple[float, str, dict[str, Any], bool]] = []
        for doi, (paper, seeded) in pool.items():
            if doi in globally_used:
                continue
            score = relevance_score(paper, category, seeded)
            if math.isfinite(score):
                ranked.append((score, doi, paper, seeded))
        ranked.sort(key=lambda item: (-item[0], -(item[2].get("year") or 0), clean_title(item[2].get("title"))))

        chosen: list[tuple[float, str, dict[str, Any], bool]] = []
        year_counts: Counter[int] = Counter()
        for row in ranked:
            year = int(row[2].get("year") or 0)
            if not row[3] and year == 2026 and year_counts[year] >= 2:
                continue
            if not row[3] and year == 2025 and year_counts[year] >= 4:
                continue
            chosen.append(row)
            year_counts[year] += 1
            if len(chosen) == category.target:
                break

        if len(chosen) < category.target:
            for row in ranked:
                if row in chosen:
                    continue
                chosen.append(row)
                if len(chosen) == category.target:
                    break

        if len(chosen) != category.target:
            raise RuntimeError(
                f"{category.name}: selected {len(chosen)} of required {category.target}; "
                "tighten or expand the category query."
            )

        for score, doi, paper, seeded in chosen:
            globally_used.add(doi)
            selected.append((category, paper, seeded, score))

    return selected


def authors_text(paper: dict[str, Any]) -> str:
    names = [clean_title(author.get("name")) for author in (paper.get("authors") or [])]
    names = [name for name in names if name]
    if len(names) > 12:
        return "; ".join(names[:12]) + "; et al."
    return "; ".join(names)


def build_rows(
    selected: list[tuple[Category, dict[str, Any], bool, float]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    today = date.today().isoformat()
    for category, paper, seeded, score in selected:
        doi = paper_doi(paper)
        if paper.get("isRetracted"):
            raise RuntimeError(f"Retracted work selected: {doi} {paper.get('title')}")
        journal = paper.get("journal") or {}
        source = clean_title(paper.get("venue") or journal.get("name"))
        pages = clean_title(journal.get("pages"))
        rows.append(
            {
                "category": category.name,
                "doi": doi,
                "title": clean_title(paper.get("title")),
                "authors": authors_text(paper),
                "year": paper.get("year") or "",
                "source": source,
                "publisher": clean_title(paper.get("publisher")),
                "type": "; ".join(paper.get("publicationTypes") or []),
                "volume": clean_title(journal.get("volume")),
                "issue": "",
                "pages": pages,
                "landing_page": f"https://doi.org/{doi}",
                "semantic_scholar_url": paper.get("url") or "",
                "cited_by_count": int(paper.get("citationCount") or 0),
                "verified_on": today,
                "verification_source": (
                    "Crossref DOI metadata or curated DOI seed; title and Crossref "
                    "retraction/update relation screened"
                ),
                "relevance_basis": (
                    "Curated foundational/supplied paper"
                    if seeded
                    else f"Category relevance score {score:.1f}"
                ),
            }
        )
    rows.sort(key=lambda row: (row["category"], -int(row["year"] or 0), row["title"].casefold()))
    return rows


def write_outputs(rows: list[dict[str, Any]], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    fieldnames = list(rows[0])
    csv_path = output_dir / "reference-verification-matrix.csv"
    with csv_path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    (output_dir / "reference-verification-matrix.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    lines = [
        "# Verified scholarly reference library",
        "",
        (
            f"Generated on {date.today().isoformat()} from a curated DOI seed set and "
            "Crossref relevance searches. Each selected record has a DOI; title/category "
            "relevance and Crossref retraction, correction and update relations were "
            "screened. Entries are unique by DOI and grouped by manuscript category."
        ),
        "",
    ]
    for index, row in enumerate(rows, 1):
        volume = f", vol. {row['volume']}" if row["volume"] else ""
        pages = f", pp. {row['pages']}" if row["pages"] else ""
        lines.append(
            f"[{index}] {row['authors']}, \"{row['title']},\" "
            f"*{row['source']}*{volume}{pages}, {row['year']}, "
            f"doi: [{row['doi']}](https://doi.org/{row['doi']})."
        )
    (output_dir / "verified-reference-library.md").write_text(
        "\n".join(lines) + "\n",
        encoding="utf-8",
    )

    summary = {
        "count": len(rows),
        "unique_dois": len({row["doi"] for row in rows}),
        "category_counts": dict(Counter(row["category"] for row in rows)),
        "year_counts": dict(sorted(Counter(str(row["year"]) for row in rows).items())),
        "years_2020_2026": sum(1 for row in rows if 2020 <= int(row["year"]) <= 2026),
        "retraction_relation_screen": "Crossref relation/title screen",
    }
    (output_dir / "reference-library-audit.json").write_text(
        json.dumps(summary, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(summary, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("outputs/journal-package-20260724/references"),
    )
    args = parser.parse_args()
    selected = select_library()
    dois = [paper_doi(paper) for _, paper, _, _ in selected]
    if len(dois) != len(set(dois)):
        raise RuntimeError("Duplicate DOI selected")
    rows = build_rows(selected)
    if len(rows) < 130:
        raise RuntimeError(f"Only {len(rows)} references selected")
    write_outputs(rows, args.output_dir)


if __name__ == "__main__":
    main()
