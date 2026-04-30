# P-Insight — Deployment Guide

This document covers everything needed to move P-Insight from a local development
setup to a hosted environment. Read it once before deploying.

---

## 1. Prerequisites

| Tool | Required version | Notes |
|------|-----------------|-------|
| Python | 3.11 + | Backend runtime |
| Poetry | 1.7 + | Dependency management |
| Node.js | 18 + | Frontend build |
| pnpm / npm | any | Package manager |
| PostgreSQL | 14 + | Production database (SQLite for dev only) |

---

## 2. Environment Variables

### Backend — `backend/.env`

Copy `backend/.env.example` to `backend/.env` and fill in every value.

| Variable | Default | Required in prod | Notes |
|----------|---------|-----------------|-------|
| `APP_ENV` | `development` | Yes — set `production` | Controls behaviour flags |
| `DEBUG` | `false` | Must be `false` | Exposes stack traces when true |
| `LOG_LEVEL` | `INFO` | Recommended | `DEBUG` / `INFO` / `WARNING` / `ERROR` |
| `DOCS_ENABLED` | `false` | Keep `false` | Enables `/docs` + `/redoc` Swagger UI |
| `FRONTEND_URL` | `http://localhost:3000` | Yes | Single allowed CORS origin |
| `ALLOWED_ORIGINS` | *(empty)* | Preferred | Comma-separated list; overrides `FRONTEND_URL` |
| `DATABASE_URL` | SQLite path | Yes — use PostgreSQL | See §4 below |
| `DEFAULT_DATA_MODE` | `uploaded` | Optional | `uploaded` / `live` / `broker` |
| `LIVE_API_ENABLED` | `true` | Optional | Enables yfinance live price fetching |
| `BROKER_SYNC_ENABLED` | `false` | Leave `false` | Scaffolded — not yet implemented |
| `AI_CHAT_ENABLED` | `false` | Leave `false` | Deprecated scaffold |
| `ANTHROPIC_API_KEY` | *(empty)* | Optional | Enables Claude-powered AI Advisor |
| `OPENAI_API_KEY` | *(empty)* | Optional | Enables OpenAI-powered AI Advisor |
| `NEWS_API_KEY` | *(empty)* | Optional | Enables live news feed |
| `ALPHA_VANTAGE_API_KEY` | *(empty)* | Optional | Alternative market data source |

**CORS in production:**
```
# Option A — single origin
FRONTEND_URL=https://app.your-domain.com

# Option B — multiple origins (overrides FRONTEND_URL)
ALLOWED_ORIGINS=https://app.your-domain.com,https://www.your-domain.com
```

### Frontend — `frontend/.env.local`

Copy `frontend/.env.local.example` to `frontend/.env.local`.

| Variable | Example value | Notes |
|----------|---------------|-------|
| `NEXT_PUBLIC_API_URL` | `https://api.your-domain.com` | Must point to the deployed FastAPI backend |

> **Never put secrets in `NEXT_PUBLIC_` variables** — they are embedded in the browser bundle.

---

## 3. Running Locally

```bash
# Backend
cd backend
poetry install
cp .env.example .env      # then edit .env
poetry run uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
pnpm install
cp .env.local.example .env.local   # then edit .env.local
pnpm dev
```

Verify the backend is healthy:
```bash
curl http://localhost:8000/health
curl http://localhost:8000/readiness
```

---

## 4. Database Setup

### Development (SQLite — default)
No setup required. The database file `backend/p_insight.db` is created automatically on first run.

### Production (PostgreSQL — recommended)

1. Create a database:
   ```sql
   CREATE DATABASE p_insight;
   CREATE USER p_insight_user WITH PASSWORD 'yourpassword';
   GRANT ALL PRIVILEGES ON DATABASE p_insight TO p_insight_user;
   ```

2. Install the driver:
   ```bash
   cd backend
   poetry add psycopg2-binary   # sync driver (current setup)
   # or: poetry add asyncpg     # if migrating to async SQLAlchemy later
   ```

3. Update `backend/.env`:
   ```
   DATABASE_URL=postgresql+psycopg2://p_insight_user:yourpassword@localhost:5432/p_insight
   ```

4. Run migrations:
   ```bash
   # Alembic is not yet initialised — run init_db() for now:
   poetry run python -c "from app.db.init_db import init_db; init_db()"
   ```

   > **Note:** Alembic migration support is planned but not yet set up. The current
   > `init_db()` call runs `Base.metadata.create_all()`, which is safe for a fresh
   > database but will not apply schema changes to an existing one. For production
   > schema migrations, initialise Alembic: `alembic init alembic` and generate
   > your first migration with `alembic revision --autogenerate -m "initial"`.

---

## 5. Hosting Options

### Backend (FastAPI)

| Platform | Notes |
|----------|-------|
| **Render** | Free tier available; set start command to `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| **Railway** | Auto-detects Poetry; add env vars in dashboard |
| **Fly.io** | Good for persistent SQLite volumes; Postgres add-on available |
| **AWS / GCP / Azure** | Deploy via Docker (see §7); use managed Postgres |
| **Self-hosted VPS** | Use gunicorn + nginx; see §6 |

### Frontend (Next.js)

| Platform | Notes |
|----------|-------|
| **Vercel** | Recommended; zero-config Next.js deployment |
| **Netlify** | Works with `next export` or adapter |
| **Render** | Static export or Docker |

---

## 6. Production Server (VPS / bare metal)

```bash
# Install gunicorn
poetry add gunicorn

# Start with uvicorn workers
gunicorn -k uvicorn.workers.UvicornWorker \
         -b 0.0.0.0:8000 \
         -w 2 \
         --access-logfile - \
         app.main:app
```

Recommended nginx config (abbreviated):
```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

---

## 7. Docker (optional)

A `Dockerfile` is not yet included. Minimal starting point for the backend:

```dockerfile
FROM python:3.11-slim
WORKDIR /app
RUN pip install poetry
COPY pyproject.toml poetry.lock ./
RUN poetry install --no-dev
COPY . .
CMD ["poetry", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## 8. Health & Readiness Endpoints

| Endpoint | Purpose | Use for |
|----------|---------|---------|
| `GET /health` | Liveness — is the process running? | Uptime monitors, load balancer keep-alives |
| `GET /readiness` | Readiness — can it serve traffic? | Kubernetes readiness probe, deploy smoke test |

`/readiness` returns HTTP 503 if the database is unreachable, so it is the safer
endpoint to wire into deployment health checks.

---

## 9. Scaffolded Modules (not yet production-ready)

The following modules exist in the codebase but are intentionally incomplete.
Do not expose them to end users in production without additional implementation work.

| Module | Status | Notes |
|--------|--------|-------|
| `BrokerSyncProvider` | Scaffold | Broker API auth not implemented |
| `GET /api/v1/news/` | Scaffold | Requires `NEWS_API_KEY` — returns empty list otherwise |
| `GET /api/v1/news/events` | Scaffold | No corporate events feed wired |
| `GET /api/v1/frontier/` | Deprecated scaffold | Replaced by `/api/v1/optimize/` |
| Simulator (`/simulate`) | Beta | Monte Carlo logic is illustrative only |
| Optimizer efficient frontier | Beta | scipy/sklearn optional; results are illustrative |

Visit `/debug` (Diagnostics) in the app for a live view of which modules are
scaffolded vs fully wired in your current deployment.

---

## 10. Security Checklist

- [ ] `DEBUG=false` in production `.env`
- [ ] `DOCS_ENABLED=false` (Swagger UI disabled)
- [ ] `APP_ENV=production`
- [ ] `ALLOWED_ORIGINS` set to your actual domain(s) — no wildcards
- [ ] `DATABASE_URL` points to PostgreSQL, not SQLite
- [ ] No API keys committed to version control (`.env` in `.gitignore`)
- [ ] `NEXT_PUBLIC_API_URL` set to HTTPS backend URL
- [ ] HTTPS enforced on both frontend and backend
- [ ] Backend not publicly reachable on `/docs` or `/redoc`
