# WizFlow

AI-first workflow and approval platform for non-technical managers.

## Documentation

- [Agent handover & phase plan](docs/WIZFLOW_HANDOVER.md)
- [Phase gates](docs/PHASES.md)
- [ADRs](docs/adr/)
- [ERD (P0 core)](docs/erd.md)
- [UAT checklist (P0–P4)](docs/UAT-CHECKLIST.md)
- [OpenAPI contract](packages/openapi/wizflow.yaml)
- [SRS Draft 1.0](docs/Wiz%20Flow%20Srs%20Draft.docx)

## Monorepo layout

```
apps/api/          FastAPI + Alembic
apps/web/          React + Vite + Tailwind
packages/openapi/  API contract (source of truth)
packages/schemas/  workflow-definition.json, form-schema.json
infra/docker/      Docker Compose + nginx
tests/api/         pytest smoke tests
```

## Run locally (< 10 commands)

**Prerequisites:** Docker Desktop (or Docker Engine), Git.

```bash
# 1. Clone and enter repo
git clone https://github.com/pj-nrb-ke/WizFlow.git
cd WizFlow

# 2. Environment file for Compose
cp infra/docker/.env.example infra/docker/.env

# 3. Start stack (postgres, redis, api, web, nginx)
docker compose -f infra/docker/docker-compose.yml up -d --build

# 4. Run database migrations
docker compose -f infra/docker/docker-compose.yml exec api alembic upgrade head

# 5. Seed demo company and admin user
docker compose -f infra/docker/docker-compose.yml exec api python -m scripts.seed
```

**URLs** (WizFlow defaults — **5174 is reserved for WizInvest**)

| Service | URL |
|---------|-----|
| Web (via nginx) | http://localhost:8090 |
| Web (Vite direct) | http://localhost:5200 |
| API | http://localhost:8010 |
| API health | http://localhost:8010/api/v1/health |
| OpenAPI docs | http://localhost:8010/docs |

**Port already in use?** Edit `infra/docker/.env` and set `WEB_HOST_PORT`, `NGINX_HOST_PORT`, `API_HOST_PORT`. For Vite only: `npm run dev -- --port 3000` or `$env:VITE_PORT=3000; npm run dev` (PowerShell).

**Demo login:** `admin@demo.wizflow.biz` / `changeme` (after `alembic upgrade head` and `python -m scripts.seed`).

**Without Docker (API only):**

```bash
cd apps/api
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
alembic upgrade head
python -m scripts.seed
uvicorn app.main:app --reload
pytest ../../tests/api -q
```

```bash
cd apps/web
npm install
npm run dev
# Opens http://localhost:5200 by default
```

## Phase status

**P0–P4 (current):** foundation through approval loop — submit requests, inbox, approve/reject/return, timeline, notifications.

**Next — P5:** Manager UI polish, workflow preview/test/publish UX.

## Repository

https://github.com/pj-nrb-ke/WizFlow

**Clone (SSH, no account popup):**

```bash
git clone git@github.com-pj-nrb-ke:pj-nrb-ke/WizFlow.git
```

Agent setup: [docs/PARALLEL-AGENT-NOTE.md](docs/PARALLEL-AGENT-NOTE.md) · `scripts/setup-github-ssh.ps1`
