# Research Experiment Implementation Plan

## 1. Current architecture

The existing system is a single integrated application:

- **Frontend:** React 19, React Router, Tailwind-style utility classes, Recharts, and a shared React store.
- **Backend:** Node.js/Express with JWT authentication, role middleware, validation, and Mongoose models.
- **AI service:** Flask/Python with scikit-learn and Sentence Transformers. Large models are held in a process-wide registry.
- **Database:** MongoDB database `hormuud-gpms`.
- **Existing roles:** student, supervisor, and administrator. A coordinator role will be added without changing the existing role behavior.
- **Existing research foundation:** configurable six-field project weights, project model-comparison records, labels, experiments, and generated-report records.

The Excel workbook contains 78 project rows in `Project Test Dataset`. The `Notes` worksheet is not project data and is excluded. The workbook notes state that descriptions, problems, objectives, features, and technologies are synthetic test content inferred from titles. Imported records therefore carry explicit test/synthetic provenance.

## 2. Files and structures changed

### Data, backup, and import

- `backend/data/research/cleaned-projects.json`
- `backend/scripts/backupResearchDatabase.js`
- `backend/scripts/importResearchDataset.js`
- `backend/scripts/seedResearchUsers.js`
- `backend/scripts/runSimilarityExperiment.js`
- `backend/scripts/runSupervisorExperiment.js`
- `backend/scripts/verifyResearchExperiment.js`
- `outputs/research-experiment-20260724/`

### Backend models and APIs

- Extend `User` with test provenance, coordinator support, supervisor research fields, experience, and assigned-project reference.
- Extend `Project` with test provenance, import run, normalized title, content hash, and source-row metadata.
- Add `ResearchImportRun`, `ActivityLog`, `ResearchExperimentRun`, `ProjectPairScore`, `SupervisorMatchScore`, and `SupervisorAssignment`.
- Extend protected research routes for imports, experiments, progress, annotations, results, exports, and activity logs.

### Python AI service

- Use exactly six project fields for comparison.
- Add TF-IDF word/character n-gram configuration.
- Use multilingual Sentence-BERT and BGE-M3 through the model registry.
- Batch and cache field and combined-text embeddings.
- Store weighted field-level and unweighted combined-text scores.
- Add supervisor matching over the seven structured supervisor fields.

### Frontend

- Add research data-import, test-user, supervisor-profile, experiment-progress, pair-result, recommendation, annotation, visualization, report, and activity-log views under the existing administrator dashboard.
- Preserve the current navigation, authentication, styling, and unrelated pages.

## 3. Proposed MongoDB schema

### Existing `projects` additions

- `isTestData: Boolean`
- `testDataTag: "RESEARCH_EXPERIMENT"`
- `importRunId: ObjectId`
- `sourceFile`, `sourceWorksheet`, `sourceRow`
- `normalizedTitle`, `contentHash`
- `syntheticContent: Boolean`

### Existing `users` additions

- `isTestAccount`, `testDataTag`, `accountStatus`
- `assignedProjectId`
- `researchSupervisorId`, `yearsOfExperience`
- Seven structured supervisor matching fields already supported by the profile UI.

### `research_import_runs`

- Run ID, source checksum, dry-run flag, status, timestamps, counts, preserved/deleted/imported IDs, errors, warnings, and backup reference.

### `activity_logs`

- User and role, action, project/supervisor/model/run references, IP, timestamp, status, error, and JSON metadata.

### `research_experiment_runs`

- Experiment type, random seed, dataset split, model configuration, field weights, risk thresholds, progress, hardware, status, timestamps, and failure details.

### `project_pair_scores`

- Canonically ordered project pair, run, model, field scores, weighted overall score, unweighted combined score, risk, timing, embedding metadata, model version, and date.
- Unique index: `(experimentRunId, modelName, firstProjectId, secondProjectId)`.

### `supervisor_match_scores`

- Project, supervisor, run, model, semantic/technology/skills/previous-project/publication/workload scores, semantic and adjusted rank, explanations, timing, model metadata.
- Unique index: `(experimentRunId, modelName, projectId, supervisorId)`.

### `supervisor_assignments`

- Project, recommended/assigned supervisor, semantic rank, adjusted rank, manual override, capacity snapshot, run, and audit timestamps.

### Ground-truth collections

- Existing human evaluation records will be extended to three classes (`0`, `1`, `2`) with a continuous 0–100 score and consensus metadata.
- Supervisor relevance labels use grades `0`–`3`, allow multiple annotators, and retain annotation reasons.

## 4. Experiment design

1. Preserve the original workbook and exclude `Notes`.
2. Normalize Unicode and whitespace without rewriting academic content.
3. Detect duplicates using normalized title plus SHA-256 content hash.
4. Back up all MongoDB collections and indexes before mutation.
5. Run the importer in dry-run mode; only dedicated test records are eligible for replacement.
6. Import 78 projects, 78 deterministic students, one administrator, one coordinator, and 20 supervisors. Passwords are bcrypt hashes and accounts cannot be seeded in production.
7. Assign one student to each project and distribute students deterministically across five CSIT programs.
8. Generate every unique project pair (`n(n-1)/2`; 3,003 when `n=78`).
9. Evaluate TF-IDF, multilingual Sentence-BERT, and BGE-M3 using field-level weighted scores and unweighted combined-text scores.
10. Compare every project with all 20 supervisors for every model and store all rankings.
11. Apply capacity-aware workload adjustment separately from pure semantic ranking.
12. Keep human annotation, validation-threshold tuning, and final testing separate. Do not report classification performance without ground truth.
13. Use a fixed seed and immutable experiment configuration for reproducibility.
14. Generate metrics, charts, exports, and reports only from stored measured results. Synthetic labels remain explicitly identified.

## 5. Safety and reproducibility

- The import is blocked when `NODE_ENV=production`.
- Only records tagged `RESEARCH_EXPERIMENT` are automatically replaceable.
- Existing untagged projects/users and all system configuration are preserved.
- A dry-run report precedes any mutation.
- Transactions are used when MongoDB supports them; standalone MongoDB uses backup-first, idempotent bulk operations with a recorded warning.
- Every run records source checksums, model identifiers, weights, thresholds, seed, timings, and errors.
