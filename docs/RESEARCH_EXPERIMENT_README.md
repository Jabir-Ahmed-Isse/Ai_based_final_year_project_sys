# Research experiment reproduction guide

This experiment extends the existing React, Express, Flask and MongoDB system. It does not create a second application. All research data is marked with `testDataTag=RESEARCH_EXPERIMENT`; untagged application data is preserved.

## Safety boundary

- Run only against a local development or dedicated test database.
- The import command refuses production mode.
- Create and inspect a backup before applying an import.
- The shared local password `12345678` is for the generated test accounts only. Passwords are stored as bcrypt hashes.
- The workbook's descriptive fields are synthetic test content inferred from the supplied titles. They are not presented as human-authored ground truth.
- The workbook has no true similarity or supervisor-relevance labels. Accuracy, precision, recall, F1, ROC-AUC, PR-AUC, MRR, MAP and NDCG must remain unreported until expert labels and consensus exist.

## Required services

1. MongoDB on `mongodb://localhost:27017/hormuud-gpms`.
2. Express backend on port 5000.
3. Python AI service on port 5001.
4. React frontend on port 5173.

Copy `.env.research.example` values into local environment files as appropriate. Do not commit secrets.

## Reproduce the data preparation

From the repository root, use the project Python environment:

```powershell
.\.venv-local\Scripts\python.exe .\python-ai\scripts\clean_research_dataset.py `
  --input "C:\Users\YoGa\Downloads\Hormuud_Projects_Test_Dataset.xlsx" `
  --output-json .\backend\data\research\cleaned-projects.json `
  --output-csv .\outputs\research-experiment-20260724\cleaned-project-dataset.csv `
  --report .\outputs\research-experiment-20260724\data-cleaning-report.json
```

The script imports only `Project Test Dataset`, normalizes Unicode and whitespace, requires a title, and removes duplicates using normalized titles and SHA-256 content hashes.

## Backup, dry run and import

```powershell
cd .\backend
npm run research:backup
npm run research:dry-run
npm run research:import
npm run research:verify
```

Review the dry-run JSON before applying the import. A MongoDB standalone server cannot provide multi-document transactions; the importer records that limitation and uses backup-first, idempotent, tag-scoped replacement.

## Run measured experiments

Start the Python AI service before these commands:

```powershell
cd .\backend
node .\scripts\runSimilarityExperiment.js --models=tfidf
node .\scripts\runSimilarityExperiment.js --models=sentence_bert
node .\scripts\runSimilarityExperiment.js --models=bge_m3
node .\scripts\runSupervisorExperiment.js --models=tfidf
node .\scripts\runSupervisorExperiment.js --models=sentence_bert
node .\scripts\runSupervisorExperiment.js --models=bge_m3
node .\scripts\buildBalancedAssignments.js --models=tfidf,sentence_bert,bge_m3
```

Each model must store exactly 3,003 unique project-pair rows and 1,560 project-supervisor rows. BGE-M3 is large and may require several minutes to download and run on CPU. The runners use a two-hour request limit and never replace a failed model with fabricated or fallback scores.

The assignment command creates a provisional capacity-balanced ensemble assignment. It is operational decision support, not evidence that the ensemble or any constituent model is best.

## Expert annotation

Sign in to the administrator dashboard and open **Research > Annotations**. Each expert independently assigns:

- 0: Different
- 1: Partially related
- 2: Highly similar
- Optional continuous similarity from 0 to 100

Consensus tracking begins at two annotators. Prefer three. Use project-level grouped 60/20/20 development, validation and final-test splits. Tune thresholds and field weights only on validation data.

Supervisor relevance annotations support grades 0 to 3 and multiple correct supervisors per project through the secured research API.

## Test commands

```powershell
cd .\python-ai
..\.venv-local\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v

cd ..\backend
npm run test:similarity
npm run research:verify

cd ..\frontend
npm run build
```

## Configuration and reproducibility

- Random seed: 42.
- Configuration: `config/research-experiment.json`.
- Python dependencies: `python-ai/requirements.txt`.
- Node dependency locks: `backend/package-lock.json`, `frontend/package-lock.json`.
- Exact run IDs, model names, timings and hardware metadata are stored in `researchexperimentruns`.
- Raw JSON and CSV results are written under `outputs/research-experiment-20260724`.
- The current workspace contains no usable Git commit metadata, so generated reports record the Git revision as unavailable rather than inventing one.

## Administrator research pages

The existing dashboard now contains Research Dataset, Data Import Results, Test Users, Supervisor Profiles, Similarity Experiments, Similarity Pair Results, Supervisor Matching Experiments, Supervisor Recommendations, Model Comparison, Research Visualizations, Annotation Management, Generated Reports and Activity Logs.
