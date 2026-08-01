# WizFlow — Laptop Migration & Session Handoff

_Last updated: 2026-08-01. Written for a fresh Claude Code session on a new machine to pick up development seamlessly._

---

## 0. Read this first (new session)
1. Read this whole file.
2. If the memory dir was copied over (see §6), your `MEMORY.md` index loads automatically — trust it but **verify file/flag references against current code** before acting.
3. Bring the local stack up (§3) and confirm login works before continuing any task.
4. Resume from **§5 Pending work**.

---

## 1. What WizFlow is
Multi-tenant **workflow / approvals** platform.
- **Backend:** FastAPI + SQLAlchemy + Alembic, PostgreSQL, Redis. (`apps/api`)
- **Web:** React 18 + Vite + TypeScript + Tailwind. (`apps/web`)
- **Mobile:** Expo / React Native (Android APK built; iOS pending Apple dev account). (`apps/mobile`)
- **Repo:** `github.com/pj-nrb-ke/WizFlow`, default branch `main`.

## 2. Access & credentials
| What | Value |
|---|---|
| Git remote (SSH) | `git@github.com-pj-nrb-ke:pj-nrb-ke/WizFlow.git` |
| GitHub SSH alias | `~/.ssh/config` Host `github.com-pj-nrb-ke` → IdentityFile `~/.ssh/github_pj_nrb_ke` |
| VPS (prod) | `root@161.97.141.220`, key `~/.ssh/contabo_wizcrm` |
| Prod deploy | SSH in, run `bash /opt/wizflow/scripts/deploy-vps-wizflow.sh` (pulls `main`, `alembic upgrade head`, seeds, builds web, reloads Caddy) |
| Prod URLs | https://app.wizflow.biz (web) · https://api.wizflow.biz (API) |
| Prod DB | `wizflow_live` (**real Wise & Agile data**); `wizflow_prod` is old/unused |
| Prod admin | `pj@wizag.biz` (password is hashed — only the user has it; self-service reset is live) |
| Local demo login | `admin@demo.wizflow.biz` / `changeme` |

## 3. Local dev environment
**Start the stack (ALWAYS `-p wizflow`):**
```bash
docker compose -p wizflow -f infra/docker/docker-compose.yml --env-file infra/docker/.env up -d postgres redis api web
```
- **Ports:** web/Vite **5200**, API **8010**→8000, Postgres **5466**→5432, Redis **6381**, (nginx 8090 optional).
- **Env file:** `infra/docker/.env` (has host ports, JWT secret, `SCHEDULER_ENABLED=false` for dev). **Not in git — copy it (see §6).**
- **DB:** `wizflow_dev`. Apply schema: `docker compose -p wizflow -f infra/docker/docker-compose.yml --env-file infra/docker/.env exec -T api alembic upgrade head`. Seed demo data with the `seed_*.py` scripts in `apps/api/` (e.g. `seed_recurring_schedules_demo.py`).
- Web: http://localhost:5200 → sign in with the demo login.

## 4. Current state (all shipped & live on prod)
`main` = `ee24c1a`; prod deployed at `ee24c1a`, alembic `023_password_reset`.
Shipped features: **Recurring Schedules** (reusable "when" + linkable workflow/checklist/acknowledge targets, reminders, escalation, compliance), **Checklists**, **public/guest forms**, **self-service password reset** (forgot-password), **show/hide password toggle** on login, **visual workflow preview** (rendered form + step flowchart). Backend `pytest tests/api` green (except the pre-existing CI infra gap in §5).

## 5. Pending work (resume here)
**(A) ACTIVE — "Send the Feenote workflow to consultants on the 15th of every month."**
This is the Recurring Schedules use case. **Two blockers on prod before it works:**
1. **Consultants aren't users yet** — prod has only 2 users (`pj@wizag.biz`, `pj@tikone.biz`). Recurring-schedule/form recipients are internal users/groups. → Invite consultants (Admin → Users → Invite), ideally into a "Consultants" group; OR use a public form link if they must stay external. _Awaiting user decision: invite-as-users vs external._
2. **Prod scheduler is OFF** — `SCHEDULER_ENABLED=false` in `/opt/wizflow/infra/docker/.env.prod`. Nothing auto-fires on the 15th until it's `true` + api restarted. ⚠️ Enabling turns on ALL background automation (reminders, SLAs, scheduled sends). _Get user's OK before flipping._
Then: Recurring Schedules → New schedule (Monthly, day 15) → Add target = **Feenote Submission Workflow** → recipients = consultants group → reminders + escalation.

**(B) Housekeeping (low priority, WizFlow-only):**
- CI `api` job in `.github/workflows/ci.yml` has **no Postgres service** → errors on every commit (pre-existing infra gap, not a feature bug). Web job passes.
- Dev-DB QA residue on the old laptop: a "PenTest Co" company + `wizflow_test` database (safe to drop). Won't exist on the new laptop if you re-seed fresh.
- Add `name: wizflow` to `infra/docker/docker-compose.yml` so the compose project name can't collide (see §7).

## 6. Files to copy to the new laptop (NOT recoverable via `git clone`)
Everything else comes from `git clone`. Copy these:

**Must-have (secrets & keys):**
- `infra/docker/.env` — local dev env/ports/secrets.
- `config/secrets/brevo.local.txt` — Brevo email API key (transactional email). _(`brevo.local.example.txt` is just the template.)_
- `~/.ssh/contabo_wizcrm` (+ `.pub`) — VPS deploy key.
- `~/.ssh/github_pj_nrb_ke` (+ `.pub`) — GitHub push key.
- The matching **Host entries from `~/.ssh/config`** (`github.com-pj-nrb-ke`, plus any VPS alias).

**Strongly recommended (context for the new session):**
- The **Claude memory folder**: `~/.claude/projects/C--Users-pj-WizFlow/memory/` (13 `.md` files incl. `MEMORY.md`). On the new laptop this dir is named from the project path; drop the `.md` files into the new session's memory dir once it exists, or rely on this file + `git`.

**Untracked docs worth keeping (would be lost — consider `git add`-ing them):**
- `docs/Wiz Flow Srs Draft.md` / `.docx` / `.pdf`, `docs/feature-catalog.md`, `docs/ios-build-setup.md` / `.pdf`, `docs/wizflow-ios-build-handoff.md`.

**Optional / regenerable (skip unless you want them):**
- `WizFlow.apk` (Android build — rebuildable via Expo), `apps/mobile/.expo/`, `docs/qa-reports/**` (historical QA artifacts), `WizFlow-Male.mp3`.

**Dev database:** don't copy Docker volumes. Either re-create clean (`alembic upgrade head` + seed scripts), OR carry an exact snapshot:
```bash
docker exec wizflow-postgres-1 pg_dump -U wizflow -d wizflow_dev -Fc -f /tmp/wizflow_dev.dump
docker cp wizflow-postgres-1:/tmp/wizflow_dev.dump ./wizflow_dev.dump    # copy this file over, then on the new machine:
# docker exec -i wizflow-postgres-1 pg_restore -U wizflow -d wizflow_dev --clean --if-exists < wizflow_dev.dump
```

**Do NOT copy:** `node_modules/` (run `npm install`), `.venv/` / Python envs, Docker images/volumes.

## 7. Gotchas learned (save yourself the pain)
- **ALWAYS pass `-p wizflow`.** The compose dir is `infra/docker`, so the default project name is `docker`, which collides with the user's other apps. (Fix pending: add `name: wizflow` to the compose file.)
- **Native Postgres squats host 5433** → the dev container is remapped to **5466**. Migrate/seed via the container, or point `DATABASE_URL` at 5466.
- **Vite HMR misses host edits through the Docker bind mount on Windows.** After editing `apps/web`, run `docker compose -p wizflow -f infra/docker/docker-compose.yml --env-file infra/docker/.env restart web` or you'll keep seeing the old bundle.
- **Git Bash mangles container paths.** Prefix `docker exec ... <container-path>` with `MSYS_NO_PATHCONV=1`.
- **`UID` is a readonly bash variable** — use another name in scripts.
- **Prod DB is real company data** → `pg_dump` a backup before any migration (all migrations so far are additive; verify new ones).
- **Docker Desktop can stop mid-session** (it did once here) → relaunch it and bring the stack back up before diagnosing "server down".
- Stale browser cache can hide new deploys — `index.html` is `no-store` and there's **no service worker**, so use a private window / clear site data to confirm.

## 8. First run on the new laptop (quick checklist)
```bash
# 1. Put the copied ~/.ssh keys + config in place, then:
git clone git@github.com-pj-nrb-ke:pj-nrb-ke/WizFlow.git && cd WizFlow
# 2. Copy infra/docker/.env and config/secrets/brevo.local.txt into place.
# 3. Start:
docker compose -p wizflow -f infra/docker/docker-compose.yml --env-file infra/docker/.env up -d postgres redis api web
docker compose -p wizflow -f infra/docker/docker-compose.yml --env-file infra/docker/.env exec -T api alembic upgrade head
# 4. Seed demo data (or restore wizflow_dev.dump), then open http://localhost:5200
# 5. cd apps/web && npm install   (first time, for tsc/local tooling)
# 6. Sanity-check prod access:  ssh -i ~/.ssh/contabo_wizcrm root@161.97.141.220 'echo ok'
```
