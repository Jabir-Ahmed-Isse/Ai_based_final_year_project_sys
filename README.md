# AI_Based_final_year_project_life_cycle_management_system

AI-powered Graduation Project Management System (GPMS) for Hormuud University. It covers the full final-year project life cycle: idea generation, proposal submission, AI similarity detection, supervisor recommendation and review, and admin analytics.

## Features

- **Students** – AI idea generator, proposal submission, progress tracking (Proposal → Review → Development → Defense), past-project repository, messaging with supervisors.
- **Supervisors** – dashboard, assigned students, proposal review inbox, expertise profile.
- **Admins** – overview dashboard, AI supervisor assignments, reports & ranking, similarity results, supervisor model evaluation, user management.
- **Research hub** – dataset import, similarity experiments (TF-IDF, Sentence-BERT, BGE-M3), supervisor recommendation experiments, model comparison, visualizations and annotations.

## Tech stack

| Part | Stack |
| --- | --- |
| `frontend/` | React 19, TypeScript, Vite, Recharts |
| `backend/` | Node.js, Express 5, MongoDB (Mongoose), JWT auth |
| `python-ai/` | Python AI service (semantic similarity, embeddings, ranking metrics) |

## Screenshots

### Authentication
| Login | Register |
| --- | --- |
| ![Login](docs/screenshots/01-login.png) | ![Register](docs/screenshots/02-register.png) |

### Student
| Student portal | Idea generator |
| --- | --- |
| ![Student portal](docs/screenshots/10-student-portal.png) | ![Idea generator](docs/screenshots/11-student-idea-generator.png) |
| **Submit proposal** | **Project repository** |
| ![Submit proposal](docs/screenshots/12-student-submit-proposal.png) | ![Repository](docs/screenshots/13-repository.png) |
| **Guidelines** | |
| ![Guidelines](docs/screenshots/14-guidelines.png) | |

### Supervisor
| Dashboard | My students |
| --- | --- |
| ![Supervisor dashboard](docs/screenshots/20-supervisor-dashboard.png) | ![Supervisor students](docs/screenshots/21-supervisor-students.png) |
| **Project reviews** | **Profile** |
| ![Supervisor reviews](docs/screenshots/22-supervisor-reviews.png) | ![Supervisor profile](docs/screenshots/23-supervisor-profile.png) |

### Admin
| Overview | AI assignments |
| --- | --- |
| ![Admin overview](docs/screenshots/30-admin-overview.png) | ![Admin assignments](docs/screenshots/31-admin-assignments.png) |
| **Reports & ranking** | **Similarity results** |
| ![Admin reports](docs/screenshots/32-admin-reports.png) | ![Similarity results](docs/screenshots/33-admin-similarity-results.png) |
| **Supervisor model evaluation** | **Users** |
| ![Supervisor model evaluation](docs/screenshots/34-admin-supervisor-model-evaluation.png) | ![Users](docs/screenshots/35-admin-users.png) |
| **Research visualizations** | **Model comparison** |
| ![Research visualizations](docs/screenshots/36-research-visualizations.png) | ![Model comparison](docs/screenshots/37-research-model-comparison.png) |

## Run locally

**Prerequisites:** Node.js, Python 3, and MongoDB running on `localhost:27017`.

1. **Backend** – copy `.env.research.example` to `backend/.env` and adjust values, then:
   ```bash
   cd backend
   npm install
   npm run dev
   ```
   The API runs on `http://localhost:5000`.
2. **Python AI service**
   ```bash
   cd python-ai
   pip install -r requirements.txt
   cd src
   python app.py
   ```
3. **Frontend** – copy `frontend/.env.example` to `frontend/.env.local` and set `GEMINI_API_KEY`, then:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Open `http://localhost:3001`.

On Windows you can also use `scripts/start-backend.bat`, `scripts/start-frontend.bat` and `scripts/start-python-ai.bat`.

See [docs/RESEARCH_EXPERIMENT_README.md](docs/RESEARCH_EXPERIMENT_README.md) for the research experiment workflow.

## Author

**Eng. Jabir Ahmed Isse**
