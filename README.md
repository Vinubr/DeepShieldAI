# DeepShieldAI

**Explainable Multimodal AI Framework for Deepfake Detection and Digital Content Authenticity Verification.**

DeepShieldAI is a full-stack application that classifies uploaded images, audio clips, video clips, news/text articles, and product/service reviews as genuine or fake (deepfake / AI-generated / synthetic), and — for image and text-based content — explains *why* a verdict was reached, via Grad-CAM (image) and SHAP (text/review) attributions.

---

## Architecture

- **Backend** — FastAPI (Python), PostgreSQL via SQLAlchemy + Alembic migrations, JWT auth with role-based access control.
- **Frontend** — React 18 + Vite, Tailwind CSS, with a dark/light theme toggle.
- **ML** — 5 independently trained detectors behind one `ModelRegistry`:

  | Modality | Model | Status |
  |---|---|---|
  | Image | MobileNetV2 (Keras 3, PyTorch backend) | Live |
  | Audio | wav2vec2-base (fine-tuned) | Live — best-performing model (F1 0.98) |
  | Video | R3D-18 (fine-tuned) | Live |
  | Text / News | DistilBERT (fine-tuned) | Live |
  | Review | DistilBERT (fine-tuned) | Live |

  Bot-account detection has no trained model yet. See [`docs/MODELS.md`](docs/MODELS.md) for full per-model architecture, training data, metrics, and known limitations of each model — read this before quoting any accuracy number in a report.

- **Explainability** — Grad-CAM for Image, SHAP for Text, Review, and Audio (`backend/xai/`). Features visual heatmaps, per-token attribution tags, and temporal audio waveform segment attribution.
- **RAG & Knowledge Base** — ChromaDB vector store, semantic document chunking (text/PDF), `sentence-transformers` embeddings, and grounded citation synthesis (`rag/` & `backend/rag/`).
- **Not yet built** — async job processing (Celery/Redis), bot-account detection, an automated test suite, and Docker packaging (the `docker/`, `training/`, `notebooks/`, `tests/` folders are placeholders for this future work).

---

## Repository layout

```
DeepShieldAI/
├── backend/              FastAPI app
│   ├── app/               routes → services → repositories → models
│   ├── alembic/           DB migrations (the real ones — see note below)
│   ├── xai/                Grad-CAM / SHAP implementations
│   ├── rag/                RAG chunking, embeddings, ChromaDB vector store & engine
│   ├── scripts/            seeders + admin-user creation
│   ├── models/             trained model weights (NOT in git — see below)
│   ├── requirements/       base.txt / ml.txt / dev.txt
│   └── .env.example        copy to .env and fill in
├── rag/                  RAG pipeline package
├── frontend/              React + Vite app
├── docs/MODELS.md         per-model training details, metrics, caveats
└── docker/ training/ notebooks/ tests/ datasets/   placeholders for future phases
```

> There is a `backend/alembic.ini` and a `backend/alembic/` — that's the one that's actually used and kept up to date. Always run Alembic commands from inside `backend/`.

---

## Prerequisites

- Python 3.11+ (developed and tested on 3.14)
- Node.js 18+ and npm
- PostgreSQL 14+ (running locally, or reachable via `DATABASE_URL`)

---

## Backend setup

```bash
cd backend

# 1. Create and activate a virtual environment
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux

# 2. Install dependencies
pip install -r requirements/ml.txt     # full app: API + all 5 ML detectors + explainability
# pip install -r requirements/base.txt # API only (auth, CRUD, dashboard) — no ML endpoints
# pip install -r requirements/dev.txt  # base.txt + pytest/ruff/black/mypy tooling

# 3. Configure environment
copy .env.example .env        # Windows
# cp .env.example .env        # macOS/Linux
# then edit .env: set a real SECRET_KEY (see the comment in the file) and
# a DATABASE_URL that points at a database you've already created, e.g.:
#   createdb deepshieldai

# 4. Run migrations
python -m alembic upgrade head

# 5. Seed reference data (roles, document types) and create your first admin user
python -m scripts.seed_all
python -m scripts.create_admin

# 6. Run the API
uvicorn app.main:app --reload --port 8000
```

The API is now at `http://localhost:8000`. Interactive docs (Swagger UI) are at `http://localhost:8000/docs` — only available while `DEBUG=true` in `.env`. To check which of the 5 detectors actually loaded (i.e. their weight files were found and are valid), hit `GET /api/predictions/models` once logged in.

> Run `python -m scripts.xxx`, not `python scripts/xxx.py` — the `-m` form is required so the script can import the `app` package. Running the `.py` file directly fails with `ModuleNotFoundError: No module named 'app'`.

### Model weights

Trained model weights are **not stored in git** (they total roughly 800 MB+ and GitHub rejects anything over 100 MB per file). You'll need to get them separately from whoever shared this project with you, and place them so the layout matches:

```
backend/models/
├── image/  best_model.keras
├── audio/  config.json, model.safetensors, preprocessor_config.json
├── video/  video_model_finetuned.pth, class_names.pkl
├── text/   config.json, model.safetensors, tokenizer files
└── review/ config.json, model.safetensors, tokenizer files
```

The app still starts without them — any detector whose weights are missing just reports itself unavailable (`/api/predictions/models`) instead of crashing the whole API.

---

## Frontend setup

```bash
cd frontend
npm install
npm run dev          # starts the Vite dev server, default http://localhost:5173
```

Other scripts: `npm run build` (production build to `frontend/dist/`), `npm run preview` (serve that build locally), `npm run lint`.

The frontend talks to `/api` (and `/docs`) as relative paths — the Vite dev server proxies them to the backend, per `API_TARGET` in `frontend/vite.config.js` (defaults to `http://localhost:8000`). If you run the backend on a different port, update `API_TARGET` there. For a production build (`npm run build`), there's no dev-server proxy, so make sure the backend's `.env` `CORS_ORIGINS` includes wherever the built frontend is served from.

---

## Typical local run

Two terminals:

```bash
# terminal 1
cd backend && .venv\Scripts\activate && uvicorn app.main:app --reload --port 8000

# terminal 2
cd frontend && npm run dev
```

Then open `http://localhost:5173`, register an account (or log in with the admin user from `scripts/create_admin.py`), and upload a file to try detection.

---

## Environment variables

See `backend/.env.example` for the full list with defaults and comments. The two that have no default and must be set are `DATABASE_URL` and `SECRET_KEY`. Never commit a real `.env` — it's already git-ignored.

---

## Known limitations

Full detail (per-model metrics, dataset sizes, and honest caveats — e.g. the Review model fails on obvious out-of-distribution spam, and the Video model was validated on only 12 clips) lives in [`docs/MODELS.md`](docs/MODELS.md). Read it before citing any number from this project in a report or demo.
